/**
 * POST /api/remotion/creative-director
 *
 * Creative Director — selects catalog layout family + copy + visual overrides
 * before SpecStory / legacy Remotion render.
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { serverConfig } from '@/lib/server-config';
import { getAiModelProfile, resolveAiModelTier } from '@/lib/ai-model-tier';
import type { ProductionProfileTier } from '@/lib/production-profile';
import type { StoryCompositionId } from '@/remotion/types';
import type { ContentIntent } from '@/lib/brand-motion-profile';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import {
  LAYOUT_FAMILY_IDS,
  clampLayoutOverrides,
  compositionToLayoutFamily,
  type CreativeDirectorLayoutOverrides,
} from '@/lib/creative-director-routing';
import {
  applyPremiumDirectorDefaults,
  enforceDisplayHeadline,
  refineCategoryLabel,
  refineLayoutFamilyForContent,
} from '@/lib/remotion-quality';
import {
  buildPosterCreativeDirectorPrompt,
  buildPosterCreativeDirectorUserHints,
  type PremiumCompositionHint,
} from '@/lib/poster-creative-director-prompt';
import {
  buildStoryCreativeDirectorPrompt,
  buildStoryCreativeDirectorUserHints,
} from '@/lib/story-creative-director-prompt';
import {
  storySequenceCategoryLabel,
  resolveSectorCtaHint,
  type StorySequenceRole,
} from '@/lib/story-sequence-rules';
import {
  resolveSectorLayoutHints,
  resolveMotionLane,
  clampOverlayToSectorFloor,
  resolveHeadlineMaxChars,
  MOTION_LANE_SPECS,
} from '@/lib/sector-premium-presets';
import { isAgencySector, isLogisticsSector, normalizePosterCopy } from '@/lib/poster-quality';

export type { StoryCompositionId };

export const runtime = 'nodejs';
export const maxDuration = 30;

export interface CreativeDirectorSpec {
  layoutFamily: RemotionLayoutFamily;
  variantIndex: number;
  compositionId: StoryCompositionId;
  categoryLabel: string;
  displayHeadline: string;
  displaySubtitle: string;
  overlayOpacity: number;
  headlineWeight: number;
  headlineScale: number;
  layoutOverrides: CreativeDirectorLayoutOverrides;
  rationale: string;
  designScore: number;
}

const STORY_COMPOSITIONS: StoryCompositionId[] = [
  'EditorialStory',
  'LuxurySplitStory',
  'CinematicStory',
  'CampaignHeroStory',
  'MagazineCoverStory',
  'GallerySeriesStory',
];

const FAMILY_TO_COMPOSITION: Partial<Record<RemotionLayoutFamily, StoryCompositionId>> = {
  editorial_bottom: 'EditorialStory',
  frosted_glass: 'EditorialStory',
  editorial_left: 'MagazineCoverStory',
  magazine_cover: 'MagazineCoverStory',
  asymmetric_editorial: 'MagazineCoverStory',
  split_panel: 'LuxurySplitStory',
  minimal_luxury: 'LuxurySplitStory',
  cinematic_center: 'CinematicStory',
  noir_editorial: 'CinematicStory',
  vibe_fullscreen: 'CinematicStory',
  campaign_hero: 'CampaignHeroStory',
  bold_impact: 'CampaignHeroStory',
  gallery_series: 'GallerySeriesStory',
  mosaic_pinterest: 'GallerySeriesStory',
  bento_story: 'GallerySeriesStory',
  diptych_collage: 'GallerySeriesStory',
  polaroid_single: 'SpecStory',
  polaroid_stack: 'GallerySeriesStory',
  event_ticket: 'EventAnnouncementStory',
  neon_night: 'EventAnnouncementStory',
  quote_card: 'EditorialStory',
  location_pin: 'EditorialStory',
};

function buildCreativeDirectorPrompt(): string {
  return buildStoryCreativeDirectorPrompt();
}

const PREMIUM_FALLBACK_FAMILIES: RemotionLayoutFamily[] = [
  'split_panel',
  'frosted_glass',
  'magazine_cover',
  'minimal_luxury',
  'cinematic_center',
  'gallery_series',
  'quote_card',
];

function pickFallbackFamily(input: {
  preferredLayoutFamily?: RemotionLayoutFamily;
  sector?: string;
  allowedFamilies: RemotionLayoutFamily[];
  recentLayoutFamilies?: RemotionLayoutFamily[];
}): RemotionLayoutFamily {
  const recent = new Set(input.recentLayoutFamilies ?? []);
  const sector = String(input.sector ?? '').toLowerCase();
  const sectorFavs: RemotionLayoutFamily[] =
    /beauty|spa|wellness|salon/.test(sector) ? ['frosted_glass', 'magazine_cover', 'diptych_collage']
      : /hotel|resort|fine_dining|restaurant/.test(sector) ? ['split_panel', 'minimal_luxury', 'magazine_cover']
      : /beach|marina|pool|rooftop/.test(sector) ? ['cinematic_center', 'vibe_fullscreen', 'split_panel']
      : /night|club|dj|event/.test(sector) ? ['neon_night', 'event_ticket', 'bold_impact']
      : [];
  const candidates = [
    input.preferredLayoutFamily,
    ...sectorFavs,
    ...PREMIUM_FALLBACK_FAMILIES,
    ...input.allowedFamilies,
  ].filter((family): family is RemotionLayoutFamily => Boolean(family))
    .filter((family) => input.allowedFamilies.includes(family));
  return candidates.find((family) => !recent.has(family)) ?? input.allowedFamilies[0] ?? 'frosted_glass';
}

function avoidRepeatedLayoutFamily(input: {
  layoutFamily: RemotionLayoutFamily;
  preferredLayoutFamily?: RemotionLayoutFamily;
  allowedFamilies: RemotionLayoutFamily[];
  recentLayoutFamilies?: RemotionLayoutFamily[];
  sector?: string;
}): RemotionLayoutFamily {
  const recent = input.recentLayoutFamilies ?? [];
  if (!recent.includes(input.layoutFamily)) return input.layoutFamily;
  return pickFallbackFamily({
    preferredLayoutFamily: input.preferredLayoutFamily,
    sector: input.sector,
    allowedFamilies: input.allowedFamilies,
    recentLayoutFamilies: recent,
  });
}

function fallbackSpec(
  headline: string,
  caption: string,
  opts: {
    templateId?: string;
    preferredLayoutFamily?: RemotionLayoutFamily;
    sector?: string;
    allowedFamilies?: RemotionLayoutFamily[];
    storySequenceRole?: StorySequenceRole;
    recentLayoutFamilies?: RemotionLayoutFamily[];
    ctaText?: string;
  } = {},
): CreativeDirectorSpec {
  const fallbackFamily = pickFallbackFamily({
    preferredLayoutFamily: opts.preferredLayoutFamily,
    sector: opts.sector,
    allowedFamilies: opts.allowedFamilies?.length ? opts.allowedFamilies : LAYOUT_FAMILY_IDS,
    recentLayoutFamilies: opts.recentLayoutFamilies,
  });
  const fallbackSubtitle = String(
    opts.storySequenceRole === 'cta'
      ? (opts.ctaText || caption || '')
      : caption || '',
  ).slice(0, opts.storySequenceRole === 'cta' ? 32 : 40);
  return {
    layoutFamily: fallbackFamily,
    variantIndex: opts.storySequenceRole === 'cta' ? 6 : 3,
    compositionId: FAMILY_TO_COMPOSITION[fallbackFamily] ?? 'EditorialStory',
    categoryLabel: storySequenceCategoryLabel(opts.storySequenceRole ?? 'hook', opts.sector),
    displayHeadline: headline.toUpperCase().slice(0, 28),
    displaySubtitle: fallbackSubtitle,
    overlayOpacity: 0.68,
    headlineWeight: 800,
    headlineScale: 1.0,
    layoutOverrides: {},
    rationale: opts.templateId ? `Fallback — premium safe keep ${opts.templateId}` : 'Fallback premium-safe defaults',
    designScore: 8,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
  }

  let body: {
    headline: string;
    caption: string;
    mood?: string;
    brandName: string;
    businessType?: string;
    location?: string;
    primaryColor?: string;
    accentColor?: string;
    allowedCompositions?: StoryCompositionId[];
    motionStyle?: string;
    locale?: string;
    preferredCompositionId?: StoryCompositionId;
    templateId?: string;
    currentLayoutFamily?: RemotionLayoutFamily;
    contentIntent?: ContentIntent;
    sector?: string;
    galleryPhotoCount?: number;
    sceneBrief?: string;
    preferredLayoutFamily?: RemotionLayoutFamily;
    storySequenceRole?: StorySequenceRole;
    storySequenceIndex?: number;
    storySequenceTotal?: number;
    recentLayoutFamilies?: RemotionLayoutFamily[];
    ctaText?: string;
    /** Set on Grafiker retry — steer CD toward legible layout */
    grafikerFeedback?: string;
    grafikerScore?: number;
    retryAttempt?: number;
    /** Sprint 6 — Luxury photo gate: photo quality below luxury floor → prefer overlay-safe families. */
    preferSafeOverlay?: boolean;
    /** Premium Creative Composition metadata from content ideation */
    premiumComposition?: PremiumCompositionHint | null;
    /** Faz 2.3 — production tier; premium uses full gpt-4o */
    profileTier?: 'economy' | 'agency' | 'premium';
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    headline,
    caption,
    mood,
    brandName,
    businessType,
    location,
    allowedCompositions,
    motionStyle,
    locale,
    preferredCompositionId,
    templateId,
    currentLayoutFamily,
    contentIntent,
    sector,
    galleryPhotoCount,
    sceneBrief,
    preferredLayoutFamily,
    storySequenceRole,
    storySequenceIndex,
    storySequenceTotal,
    recentLayoutFamilies,
    ctaText,
    grafikerFeedback,
    grafikerScore,
    retryAttempt,
    preferSafeOverlay,
    premiumComposition,
    profileTier,
  } = body;

  const cdProfile = getAiModelProfile(resolveAiModelTier({
    productionTier: profileTier as ProductionProfileTier | undefined,
  }));
  const cdModel = cdProfile.chatCreative;

  if (!headline || !brandName) {
    return NextResponse.json({ error: 'headline and brandName required' }, { status: 400 });
  }

  const allowedPool = (allowedCompositions?.length
    ? allowedCompositions.filter((id) => STORY_COMPOSITIONS.includes(id))
    : STORY_COMPOSITIONS) as StoryCompositionId[];

  const allowedFamilies = allowedPool.length
    ? [...new Set(allowedPool.map((id) => compositionToLayoutFamily(id)).filter(Boolean) as RemotionLayoutFamily[])]
    : LAYOUT_FAMILY_IDS;

  const isPosterRender = (templateId ?? '').startsWith('poster_')
    || (preferredCompositionId ?? '').startsWith('SpecPoster');

  try {
    const openai = new OpenAI({ apiKey });

    // Sector premium presets — inject before the LLM call so the CD can make
    // sector-aware layout decisions without relying on generic fallbacks.
    const effectiveSector = String(sector ?? businessType ?? '');
    const sectorMotionLane = !isPosterRender
      ? resolveMotionLane(effectiveSector, storySequenceRole)
      : null;
    const sectorLayoutHints = (!isPosterRender && storySequenceRole)
      ? resolveSectorLayoutHints(effectiveSector, storySequenceRole).filter(f => allowedFamilies.includes(f))
      : [];
    const sectorHeadlineMax = resolveHeadlineMaxChars(effectiveSector);

    const userPrompt = [
      `Brand: ${brandName}${businessType ? ` (${businessType})` : ''}${location ? ` — ${location}` : ''}`,
      motionStyle ? `Motion style: ${motionStyle}` : '',
      locale ? `Locale: ${locale}` : '',
      contentIntent ? `Content intent: ${contentIntent}` : '',
      sector ? `Sector: ${sector}` : '',
      templateId ? `Pre-selected template (override if better fit): ${templateId}` : '',
      currentLayoutFamily ? `Current layout family: ${currentLayoutFamily}` : '',
      preferredCompositionId ? `Legacy composition hint: ${preferredCompositionId}` : '',
      typeof galleryPhotoCount === 'number' ? `Gallery photos available: ${galleryPhotoCount}` : '',
      sceneBrief ? `Product Scene Director brief: ${sceneBrief}` : '',
      preferredLayoutFamily ? `Preferred layout family (strong hint): ${preferredLayoutFamily}` : '',
      !isPosterRender && sectorMotionLane
        ? `Motion lane: ${sectorMotionLane} — ${MOTION_LANE_SPECS[sectorMotionLane].label}`
        : '',
      !isPosterRender && sectorLayoutHints.length
        ? `SECTOR LAYOUT PREFERENCE (ordered): ${sectorLayoutHints.slice(0, 3).join(', ')} — pick first available that avoids repetition`
        : '',
      !isPosterRender && sectorHeadlineMax
        ? `Headline max ${sectorHeadlineMax} chars for this sector — truncate tighter`
        : '',
      !isPosterRender && storySequenceRole
        ? `Story sequence role: ${storySequenceRole.toUpperCase()} (${storySequenceIndex ?? '?'} / ${storySequenceTotal ?? '?'})`
        : '',
      !isPosterRender && recentLayoutFamilies?.length
        ? `Avoid repeating recent layout families: ${recentLayoutFamilies.join(', ')}`
        : '',
      !isPosterRender && storySequenceRole === 'hook'
        ? 'This is the FIRST story card. Prioritize curiosity, immediate visual tension, and zero hard CTA language.'
        : '',
      !isPosterRender && storySequenceRole === 'proof'
        ? 'This is the MIDDLE story card. Prioritize proof, detail, texture, process, or social proof. No final CTA behavior.'
        : '',
      !isPosterRender && storySequenceRole === 'cta'
        ? `This is the FINAL story card. Clear action is allowed, but only after value is visually established. CTA: ${resolveSectorCtaHint(String(sector ?? businessType ?? ''), locale, ctaText)}.`
        : '',
      allowedFamilies.length < LAYOUT_FAMILY_IDS.length
        ? `ALLOWED layout families ONLY: ${allowedFamilies.join(', ')}`
        : '',
      // Sprint 6 — Luxury photo gate: low-quality photo → steer away from full-bleed.
      !isPosterRender && preferSafeOverlay
        ? 'PHOTO QUALITY ALERT: The reference photo has a low gallery match score. AVOID full-bleed luxury families (magazine_cover, cinematic_center, noir_editorial, vibe_fullscreen). Prefer frosted_glass, split_panel, or minimal_luxury with a solid overlay panel that conceals photo imperfections.'
        : '',
      `Headline: "${headline}"`,
      `Caption: "${caption?.slice(0, 220) ?? ''}"`,
      `Mood: ${mood || 'neutral'}`,
      isPosterRender
        ? buildPosterCreativeDirectorUserHints({
            sector,
            businessType,
            headline,
            caption: caption ?? '',
            templateId,
            grafikerFeedback,
            retryAttempt,
            grafikerScore,
            premiumComposition: premiumComposition ?? null,
          })
        : '',
      !isPosterRender && isAgencySector(String(sector ?? businessType ?? ''))
        ? 'B2B/SaaS: story layouts split_panel | magazine_cover | frosted_glass — NOT campaign_hero unless real %/offer copy.'
        : '',
      !isPosterRender && isLogisticsSector(String(sector ?? businessType ?? ''))
        ? 'LOGISTICS: prefer location_pin, split_panel, campaign_hero stories; designed posts → editorial_date not promo_split.'
        : '',
      !isPosterRender
        ? buildStoryCreativeDirectorUserHints(String(sector ?? businessType ?? ''), premiumComposition ?? null)
        : '',
      '',
      isPosterRender
        ? 'Pick poster layout family for agency-grade feed still — photo leads, no flat template slab.'
        : 'Pick a DISTINCT layout family — avoid editorial_bottom unless this is plain daily filler.',
      grafikerFeedback
        ? [
            '',
            `GRAFIKER RETRY (attempt ${retryAttempt ?? 1}, prior score ${grafikerScore ?? '?'}/10):`,
            grafikerFeedback,
            'Fix: split_panel or frosted_glass, overlayOpacity ≥0.72, headline ≤24 chars, no text overlap. designScore must be ≥9.',
          ].join('\n')
        : '',
    ].filter(Boolean).join('\n');

    const response = await openai.chat.completions.create({
      model: cdModel,
      max_tokens: 450,
      temperature: 0.45,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: isPosterRender
            ? buildPosterCreativeDirectorPrompt()
            : buildCreativeDirectorPrompt(),
        },
        { role: 'user', content: userPrompt },
      ],
    });

    const { emitOpenAiCostLine } = await import('@/lib/ai-cost-telemetry');
    emitOpenAiCostLine({
      callType: 'creative_director',
      model: cdModel,
      usage: response.usage,
      attempt: retryAttempt ?? 0,
      detail: `${isPosterRender ? 'poster' : 'story'}:${brandName}${cdModel.endsWith('mini') ? ':lite' : ''}`,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as Partial<CreativeDirectorSpec> & { compositionId?: StoryCompositionId };

    let layoutFamily = parsed.layoutFamily as RemotionLayoutFamily | undefined;
    if (!layoutFamily || !LAYOUT_FAMILY_IDS.includes(layoutFamily)) {
      layoutFamily = preferredLayoutFamily
        ?? compositionToLayoutFamily(parsed.compositionId)
        ?? currentLayoutFamily
        ?? pickFallbackFamily({
          preferredLayoutFamily,
          sector: String(sector ?? businessType ?? ''),
          allowedFamilies,
          recentLayoutFamilies,
        });
    }
    layoutFamily = refineLayoutFamilyForContent(
      layoutFamily,
      String(parsed.displayHeadline ?? headline),
      caption ?? '',
    );
    if (!allowedFamilies.includes(layoutFamily)) {
      layoutFamily = allowedFamilies[0] ?? layoutFamily;
    }
    if (!isPosterRender) {
      layoutFamily = avoidRepeatedLayoutFamily({
        layoutFamily,
        preferredLayoutFamily,
        allowedFamilies,
        recentLayoutFamilies,
        sector: String(sector ?? businessType ?? ''),
      });
    }

    const minimumVariant = storySequenceRole === 'cta' ? 5 : storySequenceRole === 'hook' ? 2 : 3;
    const variantIndex = Math.max(minimumVariant, Math.min(9, Number(parsed.variantIndex) || 0));
    const compositionId = FAMILY_TO_COMPOSITION[layoutFamily]
      ?? (allowedPool.includes(parsed.compositionId as StoryCompositionId)
        ? parsed.compositionId!
        : 'EditorialStory');

    // Apply sector overlay floor — prevents the CD from going too transparent
    // on sectors where legibility is critical (nightlife, retail, agency).
    const rawOpacityFromLLM = Math.max(0.20, Math.min(0.82, Number(parsed.overlayOpacity) || 0.72));
    const rawOpacity = !isPosterRender
      ? clampOverlayToSectorFloor(effectiveSector, rawOpacityFromLLM)
      : rawOpacityFromLLM;
    const rawOverrides = clampLayoutOverrides(parsed.layoutOverrides as Record<string, unknown>);
    const premium = applyPremiumDirectorDefaults(layoutFamily, rawOpacity, rawOverrides);

    const posterCopy = isPosterRender
      ? normalizePosterCopy({
          headline: String(parsed.displayHeadline ?? headline),
          subtitle: String(parsed.displaySubtitle ?? caption ?? ''),
          brandName,
          location,
          caption: caption ?? '',
          sector: String(sector ?? businessType ?? ''),
        })
      : null;

    let resolvedHeadlineScale = Math.max(0.75, Math.min(1.2, Number(parsed.headlineScale) || 1.0));
    let resolvedHeadlineWeight: number = [700, 800, 900].includes(Number(parsed.headlineWeight))
      ? Number(parsed.headlineWeight)
      : 800;
    const resolvedOverrides = { ...premium.layoutOverrides };

    if (premiumComposition) {
      if (premiumComposition.compositionType === 'oversized_typography') {
        resolvedHeadlineScale = Math.max(resolvedHeadlineScale, 1.15);
        resolvedHeadlineWeight = 900;
        resolvedOverrides.heroUppercase = true;
        resolvedOverrides.heroTracking = Math.max(Number(resolvedOverrides.heroTracking) || 0, 0.08);
      }
      if (premiumComposition.compositionType === 'luxury_minimalism') {
        resolvedOverrides.fontPersonality = resolvedOverrides.fontPersonality || 'serif_editorial';
        resolvedOverrides.vignette = resolvedOverrides.vignette || 'soft';
      }
      if (premiumComposition.compositionType === 'editorial_layout') {
        resolvedOverrides.fontPersonality = resolvedOverrides.fontPersonality || 'serif_editorial';
        resolvedOverrides.accentLine = resolvedOverrides.accentLine || 'above';
      }
      if (premiumComposition.compositionType === 'poster_design') {
        resolvedHeadlineWeight = 900;
        resolvedOverrides.heroUppercase = true;
      }
      if (premiumComposition.compositionType === 'graphic_layering') {
        resolvedOverrides.frame = resolvedOverrides.frame || 'thin';
      }
    }

    const spec: CreativeDirectorSpec = {
      layoutFamily,
      variantIndex,
      compositionId,
      categoryLabel: refineCategoryLabel(
        String(parsed.categoryLabel ?? storySequenceCategoryLabel(storySequenceRole ?? 'hook', String(sector ?? businessType ?? ''), locale)),
        posterCopy?.headline ?? enforceDisplayHeadline(String(parsed.displayHeadline ?? headline)),
        location,
      ),
      displayHeadline: posterCopy?.headline
        ?? enforceDisplayHeadline(String(parsed.displayHeadline ?? headline)).slice(0, sectorHeadlineMax),
      displaySubtitle: posterCopy?.subtitle
        ?? String(parsed.displaySubtitle ?? caption?.slice(0, 60) ?? ''),
      overlayOpacity: premium.overlayOpacity,
      headlineWeight: resolvedHeadlineWeight,
      headlineScale: resolvedHeadlineScale,
      layoutOverrides: resolvedOverrides,
      rationale: String(parsed.rationale ?? '').slice(0, 240),
      designScore: Math.max(1, Math.min(10, Number(parsed.designScore) || 8)),
    };

    console.log(
      `[creative-director] ${brandName} → ${spec.layoutFamily}[${spec.variantIndex}] | ` +
      `lane=${sectorMotionLane ?? 'n/a'} | score=${spec.designScore} | ` +
      `opacity=${spec.overlayOpacity.toFixed(2)} | "${spec.displayHeadline}" | ${spec.rationale.slice(0, 70)}`,
    );

    return NextResponse.json(spec);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[creative-director] error:', msg);
    return NextResponse.json(fallbackSpec(headline, caption ?? '', {
      templateId,
      preferredLayoutFamily,
      sector: String(sector ?? businessType ?? ''),
      allowedFamilies,
      storySequenceRole,
      recentLayoutFamilies,
      ctaText,
    }));
  }
}

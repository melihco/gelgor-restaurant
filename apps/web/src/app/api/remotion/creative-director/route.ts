/**
 * POST /api/remotion/creative-director
 *
 * Creative Director — selects catalog layout family + copy + visual overrides
 * before SpecStory / legacy Remotion render.
 */
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { StoryCompositionId } from '@/remotion/types';
import type { ContentIntent } from '@/lib/brand-motion-profile';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import {
  LAYOUT_FAMILY_IDS,
  buildFamilyCatalogForPrompt,
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
import { isAgencySector, normalizePosterCopy } from '@/lib/poster-quality';

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
  polaroid_stack: 'GallerySeriesStory',
  event_ticket: 'EventAnnouncementStory',
  neon_night: 'EventAnnouncementStory',
  quote_card: 'EditorialStory',
  location_pin: 'EditorialStory',
};

function buildCreativeDirectorPrompt(): string {
  return `You are the creative director at an Awwwards-caliber social agency.
PRIME DIRECTIVE: Each story must look DISTINCT — never default to editorial_bottom unless content is truly mundane daily filler.
Target Grafiker score ≥9/10. Logo is automatic top-center.
NEVER ship legibility risk — bright venue photos need overlayOpacity ≥0.64 and vignette soft/noir.

━━━ QUALITY RULES (mandatory) ━━━
- displayHeadline ≤28 chars, no orphan words, ALL CAPS for editorial families
- overlayOpacity: 0.64–0.78 for photo-overlay layouts (never below 0.58)
- Prefer split_panel or frosted_glass when photo is busy / high-contrast
- variantIndex 5–8 for campaigns; 2–4 for soft daily moments
- layoutOverrides: always set vignette (soft) OR frostedCard for frosted_glass family

━━━ LAYOUT FAMILY CATALOG (pick ONE — this drives the visual design) ━━━
${buildFamilyCatalogForPrompt()}

━━━ ROUTING (first strong match — prefer dramatic fit over safe default) ━━━
campaign / offer / promo / discount / % / launch → campaign_hero OR bold_impact
chef / feature / spotlight / editorial / magazine → magazine_cover OR editorial_left OR asymmetric_editorial
luxury / premium / hotel / spa / fine dining → split_panel OR minimal_luxury
event / ticket / lineup / DJ / party date → event_ticket OR neon_night
menu / gallery / portfolio / social proof / 2+ photos → gallery_series OR bento_story OR mosaic_pinterest
quote / testimonial / manifesto → quote_card
location / travel / map / venue pin → location_pin
empty horizon / sky / sea + ≤3 word headline → cinematic_center OR vibe_fullscreen
nightlife / club / neon → neon_night
daily food / cafe / lifestyle (only if nothing else matches) → editorial_bottom OR frosted_glass

━━━ VARIANT INDEX (0–9) ━━━
Pick variantIndex for visual spice within the family:
0 = classic/safe, 3–5 = mid drama, 7–9 = bold (wide tracking, noir wash, double frame, deep fade)
Use higher variants for campaigns and features; lower for soft daily moments.

━━━ COPY RULES ━━━
- categoryLabel: 1–2 WORDS CAPS, editorial (not generic "BRAND" or "FEATURE" unless truly apt)
- displayHeadline: punchy, ≤28 chars, ALL CAPS for serif/editorial families
- displaySubtitle: max 5 words mood tagline from caption, or empty
- Match locale tone (TR content → Turkish subtitle ok)

━━━ layoutOverrides (optional visual patches) ━━━
duotoneWash: none|warm|cool|primary
vignette: none|soft|noir|radial
heroUppercase, heroTracking (0–0.18), heroScale (0.85–1.25)
gradientStart (0.35–0.65), gradientEnd (0.7–0.92)
accentLine: none|above|left_bar|both|underline
frame: none|thin|double|inset
fontPersonality: brand|serif_editorial|sans_modern|display_bold

━━━ RESPONSE JSON ONLY ━━━
{
  "layoutFamily": "<one of catalog families>",
  "variantIndex": 0,
  "categoryLabel": "TASTE",
  "displayHeadline": "SHORT HEADLINE",
  "displaySubtitle": "mood line or empty",
  "overlayOpacity": 0.68,
  "headlineWeight": 900,
  "headlineScale": 1.05,
  "layoutOverrides": { "duotoneWash": "warm", "vignette": "soft" },
  "rationale": "1 sentence why this family fits",
  "designScore": 9
}`;
}

function fallbackSpec(headline: string, caption: string, templateId?: string): CreativeDirectorSpec {
  return {
    layoutFamily: 'editorial_bottom',
    variantIndex: 0,
    compositionId: 'EditorialStory',
    categoryLabel: 'MOMENT',
    displayHeadline: headline.toUpperCase().slice(0, 28),
    displaySubtitle: caption?.slice(0, 40) ?? '',
    overlayOpacity: 0.68,
    headlineWeight: 800,
    headlineScale: 1.0,
    layoutOverrides: {},
    rationale: templateId ? `Fallback — kept ${templateId}` : 'Fallback defaults',
    designScore: 7,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
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
  } = body;

  if (!headline || !brandName) {
    return NextResponse.json({ error: 'headline and brandName required' }, { status: 400 });
  }

  const allowedPool = (allowedCompositions?.length
    ? allowedCompositions.filter((id) => STORY_COMPOSITIONS.includes(id))
    : STORY_COMPOSITIONS) as StoryCompositionId[];

  const allowedFamilies = allowedPool.length
    ? [...new Set(allowedPool.map((id) => compositionToLayoutFamily(id)).filter(Boolean) as RemotionLayoutFamily[])]
    : LAYOUT_FAMILY_IDS;

  try {
    const openai = new OpenAI({ apiKey });

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
      allowedFamilies.length < LAYOUT_FAMILY_IDS.length
        ? `ALLOWED layout families ONLY: ${allowedFamilies.join(', ')}`
        : '',
      `Headline: "${headline}"`,
      `Caption: "${caption?.slice(0, 220) ?? ''}"`,
      `Mood: ${mood || 'neutral'}`,
      isAgencySector(String(sector ?? businessType ?? ''))
        ? 'B2B/SaaS: poster layouts editorial_date | split_panel | magazine_cover — NOT promo_split unless real %/offer copy. Never use country-only location (Türkiye). Stack: headline + short support + CTA.'
        : '',
      '',
      'Pick a DISTINCT layout family — avoid editorial_bottom unless this is plain daily filler.',
    ].filter(Boolean).join('\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 450,
      temperature: 0.45,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildCreativeDirectorPrompt() },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
    const parsed = JSON.parse(raw) as Partial<CreativeDirectorSpec> & { compositionId?: StoryCompositionId };

    let layoutFamily = parsed.layoutFamily as RemotionLayoutFamily | undefined;
    if (!layoutFamily || !LAYOUT_FAMILY_IDS.includes(layoutFamily)) {
      layoutFamily = preferredLayoutFamily
        ?? compositionToLayoutFamily(parsed.compositionId)
        ?? currentLayoutFamily
        ?? 'editorial_bottom';
    }
    layoutFamily = refineLayoutFamilyForContent(
      layoutFamily,
      String(parsed.displayHeadline ?? headline),
      caption ?? '',
    );
    if (!allowedFamilies.includes(layoutFamily)) {
      layoutFamily = allowedFamilies[0] ?? layoutFamily;
    }

    const variantIndex = Math.max(0, Math.min(9, Number(parsed.variantIndex) || 0));
    const compositionId = FAMILY_TO_COMPOSITION[layoutFamily]
      ?? (allowedPool.includes(parsed.compositionId as StoryCompositionId)
        ? parsed.compositionId!
        : 'EditorialStory');

    const rawOpacity = Math.max(0.20, Math.min(0.82, Number(parsed.overlayOpacity) || 0.72));
    const rawOverrides = clampLayoutOverrides(parsed.layoutOverrides as Record<string, unknown>);
    const premium = applyPremiumDirectorDefaults(layoutFamily, rawOpacity, rawOverrides);

    const isPosterRender = (templateId ?? '').startsWith('poster_')
      || (preferredCompositionId ?? '').startsWith('SpecPoster');
    const posterCopy = isPosterRender
      ? normalizePosterCopy({
          headline: String(parsed.displayHeadline ?? headline),
          subtitle: String(parsed.displaySubtitle ?? caption ?? ''),
          brandName,
          location,
          caption: caption ?? '',
        })
      : null;

    const spec: CreativeDirectorSpec = {
      layoutFamily,
      variantIndex,
      compositionId,
      categoryLabel: refineCategoryLabel(
        String(parsed.categoryLabel ?? 'MOMENT'),
        posterCopy?.headline ?? enforceDisplayHeadline(String(parsed.displayHeadline ?? headline)),
        location,
      ),
      displayHeadline: posterCopy?.headline
        ?? enforceDisplayHeadline(String(parsed.displayHeadline ?? headline)),
      displaySubtitle: posterCopy?.subtitle
        ?? String(parsed.displaySubtitle ?? caption?.slice(0, 60) ?? ''),
      overlayOpacity: premium.overlayOpacity,
      headlineWeight: [700, 800, 900].includes(Number(parsed.headlineWeight))
        ? Number(parsed.headlineWeight)
        : 800,
      headlineScale: Math.max(0.75, Math.min(1.2, Number(parsed.headlineScale) || 1.0)),
      layoutOverrides: premium.layoutOverrides,
      rationale: String(parsed.rationale ?? '').slice(0, 240),
      designScore: Math.max(1, Math.min(10, Number(parsed.designScore) || 8)),
    };

    console.log(
      `[creative-director] ${brandName} → ${spec.layoutFamily}[${spec.variantIndex}] | ` +
      `score=${spec.designScore} | "${spec.displayHeadline}" | ${spec.rationale.slice(0, 80)}`,
    );

    return NextResponse.json(spec);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[creative-director] error:', msg);
    return NextResponse.json(fallbackSpec(headline, caption ?? '', templateId));
  }
}

/**
 * Production bridge — onboarding fal.ai brand design templates → mission slots.
 *
 * Locks layout/vibe/colors from the brand's approved template set while swapping
 * mission gallery photos and headline/copy (DJ nightly post, campaign, etc.).
 */

import type { TypographyVibe } from '@/types/brand-theme';
import type { ContentIntent } from '@/lib/brand-motion-profile';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { GRAFIKER_PASS_THRESHOLD } from '@/lib/grafiker-quality';
import {
  matchDesignTemplateToSlot,
  recordDesignTemplateUsage,
  type MatchedDesignTemplate,
} from '@/lib/brand-design-template-matcher';
import type { BrandActiveSlotSet } from '@/lib/brand-active-slot-resolver';
import { collectTemplatePlaceholderTexts } from '@/lib/template-placeholder-guard';

export interface BrandTemplateFalBinding {
  matched: MatchedDesignTemplate | null;
  /** Locked typography vibe from onboarding template (overrides caption heuristics). */
  lockedVibe: TypographyVibe | null;
  /** Gallery photo for the content zone — mission match preferred. */
  referencePhotoUrl: string | null;
  /** Approved template preview — second GPT-image ref for layout skeleton. */
  styleReferenceUrl: string | null;
  brandDirectives: string[];
  brandColors: { primary: string; accent: string } | null;
  logoUrl: string | undefined;
  occasion: { name: string; mood?: string } | undefined;
}

/** Phase 1 — fal slot count unchanged; stronger lock when onboarding template matches. */
export interface FalTemplateLockOptions {
  /** Mission headline verbatim — no caption-aware rewrite. */
  captionAwareHeadline: boolean;
  /** Extra Grafiker retries when a brand template is locked (cap 2). */
  grafikerMaxRetries: number;
  /** Template preview should appear in the reference set. */
  requireTemplateStyleRef: boolean;
}

export function resolveFalTemplateLockOptions(input: {
  binding: BrandTemplateFalBinding | null | undefined;
  baseGrafikerMaxRetries?: number | null;
  adHocBrief?: boolean;
  /** Default caption-aware behaviour when no template is matched. */
  defaultCaptionAwareHeadline?: boolean;
}): FalTemplateLockOptions {
  const base = Math.max(0, Math.min(2, Math.floor(input.baseGrafikerMaxRetries ?? 0)));
  if (input.adHocBrief || !input.binding?.matched) {
    return {
      captionAwareHeadline: input.adHocBrief ? false : (input.defaultCaptionAwareHeadline ?? false),
      grafikerMaxRetries: base,
      requireTemplateStyleRef: false,
    };
  }
  return {
    captionAwareHeadline: input.defaultCaptionAwareHeadline ?? true,
    grafikerMaxRetries: Math.min(2, Math.max(base, 1)),
    requireTemplateStyleRef: false,
  };
}

export function templateLockUsesGrafikerPass(score: number | null, pass: boolean | undefined): boolean {
  return pass === true || (score != null && score >= GRAFIKER_PASS_THRESHOLD);
}

export interface TemplateMissionCopy {
  headline?: string;
  subtitle?: string;
}

export function buildTemplateLayoutDirectives(
  matched: MatchedDesignTemplate,
  mission?: TemplateMissionCopy,
): string[] {
  const out: string[] = [matched.directive];
  const layoutRecipe: string[] = [];

  if (matched.canvaArchetypeName || matched.canvaArchetypeId) {
    layoutRecipe.push(
      `Canva layout archetype: ${matched.canvaArchetypeName ?? matched.canvaArchetypeId}`,
    );
  }
  if (matched.layoutPattern) {
    layoutRecipe.push(`Layout pattern: ${String(matched.layoutPattern).slice(0, 220)}`);
  }
  if (matched.designBriefDirectives?.length) {
    layoutRecipe.push(...matched.designBriefDirectives.slice(0, 8));
  }

  const forbidden = collectTemplatePlaceholderTexts(matched);
  const missionHeadline = mission?.headline?.trim() ?? '';
  const missionSubtitle = mission?.subtitle?.trim() ?? '';

  out.unshift(
    `BRAND LAYOUT TEMPLATE "${matched.templateName}" (${matched.templateType}): ` +
      'This onboarding template is a reusable LAYOUT RECIPE only — not final publish copy. ' +
      'Reuse the same panel geometry, typographic hierarchy, color-block placement, and decorative rhythm. ' +
      'ONLY swap: (1) the photo/content zone with the mission gallery photo, (2) ALL on-canvas text with the mission copy below. ' +
      'Never reuse sample placeholder text from the template library preview.',
  );

  if (layoutRecipe.length > 0) {
    out.push(`Layout system: ${layoutRecipe.join(' | ')}`);
  }

  if (missionHeadline) {
    out.push(`MISSION HEADLINE (render exactly, Turkish diacritics preserved): "${missionHeadline}"`);
  }
  if (missionSubtitle) {
    out.push(`MISSION SUBTITLE (render exactly): "${missionSubtitle}"`);
  }

  if (forbidden.length > 0) {
    out.push(
      `FORBIDDEN ON-CANVAS TEXT (template preview placeholders — never render): ${forbidden.map((t) => `"${t}"`).join(', ')}`,
    );
  }

  out.push(
    'TEXT LOCK: Render ONLY the mission headline and supporting line above. ' +
      'Typography style, weight, and placement must follow the locked layout recipe — not the preview image text.',
  );
  return out;
}

/**
 * One layout authority: when a brand template is locked, mission-level Canva
 * archetype rotation and grid-surface rotation directives must not fight the
 * template's layout recipe. Without a match, rotation directives pass through
 * so per-mission variety still applies.
 */
export function dropConflictingLayoutDirectives(
  extraDirectives: string[],
  matched: MatchedDesignTemplate | null | undefined,
): string[] {
  if (!matched) return extraDirectives;
  return extraDirectives.filter(
    (d) => !/^(CANVA ARCHETYPE:|GRID ROTATION:|FORBIDDEN: )/.test(d.trim()),
  );
}

/** Mission gallery photo only — template preview PNGs carry sample copy and must not be edit refs. */
export function pickTemplateReferenceUrls(input: {
  missionPhotoUrl: string | null | undefined;
  matched: MatchedDesignTemplate | null;
  brandReferenceImageUrls?: string[];
}): string[] {
  const mission =
    input.missionPhotoUrl && isUsableGalleryPhotoUrl(input.missionPhotoUrl)
      ? input.missionPhotoUrl
      : null;
  const templateGallery =
    input.matched?.galleryRef && isUsableGalleryPhotoUrl(input.matched.galleryRef)
      ? input.matched.galleryRef
      : null;

  if (mission) return [mission];

  if (templateGallery) return [templateGallery];

  const extra = (input.brandReferenceImageUrls ?? []).find(
    (u) => u && isUsableGalleryPhotoUrl(u),
  );
  return extra ? [extra] : [];
}

/** Phase 1 — template preview must not be used as a production edit reference. */
export function assertTemplateStyleReference(
  binding: BrandTemplateFalBinding | null | undefined,
  referenceUrls: string[],
): void {
  const preview = binding?.styleReferenceUrl;
  if (!binding?.matched || !preview || !isUsableGalleryPhotoUrl(preview)) return;
  if (referenceUrls.includes(preview)) {
    console.warn(
      `[fal-template-lock] template preview must not be used as edit ref for "${binding.matched.templateName}" — sample copy leak risk`,
    );
  }
}

export async function bindBrandTemplateForFalProduction(input: {
  workspaceId: string;
  slotRole: string;
  librarySlotKey: string | null | undefined;
  format: 'story' | 'post' | 'reel';
  caption?: string;
  headline?: string;
  subtitle?: string;
  announcementType?: string | null;
  templateUseCase?: string | null;
  /** Catalog slot key when production knows the mission slot (Faz 5). */
  catalogSlotKey?: string | null;
  /** Tenant-enabled catalog snapshot — excludes disabled slot templates. */
  brandActiveSlots?: BrandActiveSlotSet | null;
  /** True only for ad-hoc New Brief — skips onboarding template lock. */
  adHocBrief?: boolean;
  missionReferenceUrl: string | null;
  baseDirectives: string[];
  brandColors: { primary: string; accent: string };
  logoUrl?: string;
  brandVibe: TypographyVibe | null;
}): Promise<BrandTemplateFalBinding> {
  const empty: BrandTemplateFalBinding = {
    matched: null,
    lockedVibe: null,
    referencePhotoUrl: input.missionReferenceUrl,
    styleReferenceUrl: null,
    brandDirectives: [...input.baseDirectives],
    brandColors: null,
    logoUrl: input.logoUrl,
    occasion: undefined,
  };
  if (input.adHocBrief) return empty;

  try {
    const matched = await matchDesignTemplateToSlot(input.workspaceId, {
      slotRole: input.slotRole,
      librarySlotKey: input.librarySlotKey,
      format: input.format,
      caption: input.caption,
      headline: input.headline,
      announcementType: input.announcementType,
      templateUseCase: input.templateUseCase,
      catalogSlotKey: input.catalogSlotKey,
      brandActiveSlots: input.brandActiveSlots,
    });
    if (!matched) {
      console.warn(
        `[design-matcher] no template match workspace=${input.workspaceId} ` +
        `role=${input.slotRole} library=${input.librarySlotKey ?? '-'} ` +
        `announcement=${input.announcementType ?? '-'} format=${input.format}`,
      );
      return empty;
    }

    console.log(
      `[design-matcher] locked "${matched.templateName}" (${matched.templateType}) ` +
      `role=${input.slotRole} announcement=${input.announcementType ?? '-'}`,
    );

    void recordDesignTemplateUsage(input.workspaceId, matched.id);

    const specialDay = matched.specialDay;
    const referencePhotoUrl =
      (input.missionReferenceUrl && isUsableGalleryPhotoUrl(input.missionReferenceUrl)
        ? input.missionReferenceUrl
        : null) ??
      (matched.galleryRef && isUsableGalleryPhotoUrl(matched.galleryRef) ? matched.galleryRef : null);

    return {
      matched,
      lockedVibe: input.brandVibe ?? matched.vibe ?? null,
      referencePhotoUrl,
      styleReferenceUrl: matched.thumbnailUrl ?? null,
      brandDirectives: [
        ...buildTemplateLayoutDirectives(matched, {
          headline: input.headline,
          subtitle: input.subtitle ?? input.caption,
        }),
        ...dropConflictingLayoutDirectives(input.baseDirectives, matched),
      ],
      brandColors: matched.brandColors ?? null,
      logoUrl: matched.prominentLogo ? (input.logoUrl ?? matched.logoUrl) : input.logoUrl,
      occasion: specialDay?.name
        ? { name: specialDay.name, mood: specialDay.category }
        : undefined,
    };
  } catch {
    return empty;
  }
}

/** Phase 2 — Remotion poster slots inherit fal onboarding template colors + CD hints. */
export interface RemotionFalTemplateAlignment {
  matched: MatchedDesignTemplate;
  primaryColor: string;
  accentColor: string;
  contentIntent?: ContentIntent;
  sceneBrief: string;
  typographyVibe?: TypographyVibe;
}

const DESIGN_TEMPLATE_CONTENT_INTENT: Partial<Record<string, ContentIntent>> = {
  campaign_announcement: 'campaign_offer',
  seasonal_promo: 'campaign_offer',
  event_special: 'event',
  menu_highlight: 'product_spotlight',
  venue_showcase: 'product_spotlight',
  social_proof: 'social_proof',
  daily_story: 'daily_moment',
  announcement_formal: 'announcement',
  brand_identity: 'announcement',
  reel_cover: 'event',
};

export function mapDesignTemplateTypeToContentIntent(
  templateType: string,
): ContentIntent | undefined {
  return DESIGN_TEMPLATE_CONTENT_INTENT[templateType];
}

/** fal.ai designed post slots that receive brand template alignment hints. */
export function isRemotionFalAlignedSlot(assignment: {
  pipeline: string;
  slot_role: string;
}): boolean {
  return (
    (assignment.pipeline === 'fal_design' || assignment.pipeline === 'remotion_poster')
    && (assignment.slot_role === 'designed_post' || assignment.slot_role === 'designed_typography')
  );
}

/**
 * Feed fal onboarding template colors/vibe/layout hints into Remotion poster renders
 * without replacing Remotion template selection (variety preserved).
 */
export async function alignRemotionPosterWithFalTemplate(input: {
  workspaceId: string;
  slotRole: string;
  librarySlotKey?: string | null;
  caption?: string;
  brandColors: { primary: string; accent: string };
  brandVibe: TypographyVibe | null;
  logoUrl?: string;
  adHocBrief?: boolean;
}): Promise<RemotionFalTemplateAlignment | null> {
  if (input.adHocBrief) return null;

  const binding = await bindBrandTemplateForFalProduction({
    workspaceId: input.workspaceId,
    slotRole: input.slotRole,
    librarySlotKey: input.librarySlotKey,
    format: 'post',
    caption: input.caption,
    adHocBrief: false,
    missionReferenceUrl: null,
    baseDirectives: [],
    brandColors: input.brandColors,
    logoUrl: input.logoUrl,
    brandVibe: input.brandVibe,
  });

  if (!binding.matched) return null;

  const layoutHint = binding.brandDirectives
    .filter((d) => d.includes('LAYOUT TEMPLATE') || d.includes('TEXT LOCK'))
    .slice(0, 2)
    .join(' ')
    .slice(0, 420);

  return {
    matched: binding.matched,
    primaryColor: input.brandColors.primary,
    accentColor: input.brandColors.accent,
    contentIntent: mapDesignTemplateTypeToContentIntent(binding.matched.templateType),
    sceneBrief:
      `Align with fal brand template "${binding.matched.templateName}" (${binding.matched.templateType}). ` +
      `${layoutHint || binding.matched.directive}`,
    typographyVibe: binding.lockedVibe ?? undefined,
  };
}

/** Extra brand refs for fal designer — never include template preview (sample copy). */
export function templateStyleReferenceUrls(
  binding: BrandTemplateFalBinding,
  brandReferenceImageUrls: string[],
): string[] {
  const out: string[] = [];
  for (const u of brandReferenceImageUrls) {
    if (!u || !isUsableGalleryPhotoUrl(u)) continue;
    if (u === binding.referencePhotoUrl) continue;
    if (u === binding.styleReferenceUrl) continue;
    out.push(u);
  }
  return out.slice(0, 1);
}

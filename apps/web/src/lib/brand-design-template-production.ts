/**
 * Production bridge — onboarding fal.ai brand design templates → mission slots.
 *
 * Locks layout/vibe/colors from the brand's approved template set while swapping
 * mission gallery photos and headline/copy (DJ nightly post, campaign, etc.).
 */

import type { TypographyVibe } from '@/types/brand-theme';
import type { ContentIntent } from '@/lib/brand-motion-profile';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { GRAFIKER_PASS_THRESHOLD } from '@/lib/remotion-quality';
import {
  matchDesignTemplateToSlot,
  recordDesignTemplateUsage,
  type MatchedDesignTemplate,
} from '@/lib/brand-design-template-matcher';

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
      captionAwareHeadline: input.adHocBrief ? false : (input.defaultCaptionAwareHeadline ?? true),
      grafikerMaxRetries: base,
      requireTemplateStyleRef: false,
    };
  }
  return {
    captionAwareHeadline: false,
    grafikerMaxRetries: Math.min(2, Math.max(base, 1)),
    requireTemplateStyleRef: Boolean(input.binding.matched.thumbnailUrl),
  };
}

export function templateLockUsesGrafikerPass(score: number | null, pass: boolean | undefined): boolean {
  return pass === true || (score != null && score >= GRAFIKER_PASS_THRESHOLD);
}

export function buildTemplateLayoutDirectives(matched: MatchedDesignTemplate): string[] {
  const out: string[] = [matched.directive];
  if (matched.designSpecPrompt) {
    out.unshift(
      `BRAND LOCKED TEMPLATE "${matched.templateName}" (${matched.templateType}): ` +
        'Reuse the EXACT same layout system as the onboarding-approved preview — ' +
        'same panel geometry, typographic hierarchy, color-block placement, decorative rhythm. ' +
        'ONLY swap: (1) photo/content zone with this mission subject, (2) headline and supporting copy from THIS mission brief. ' +
        'Never reuse onboarding sample placeholder text visible in the template preview. ' +
        `Layout recipe: ${matched.designSpecPrompt.slice(0, 950)}`,
    );
  } else {
    out.unshift(
      `BRAND LOCKED TEMPLATE "${matched.templateName}" (${matched.templateType}): ` +
        'Keep the same typographic hierarchy, color blocks and decorative rhythm as the brand onboarding set. ' +
        'ONLY swap mission photo and mission copy — never reuse sample placeholder text.',
    );
  }
  if (matched.thumbnailUrl) {
    out.push(
      `The second reference image is the approved "${matched.templateName}" template preview — ` +
        'match its composition skeleton exactly; change only photo fill and text content.',
    );
  }
  out.push(
    'TEXT LOCK: Render ONLY the mission headline and supporting line provided in this prompt. ' +
    'Typography style, weight and placement must match the locked template preview.',
  );
  return out;
}

/** Up to two refs for GPT-image grounded edit: mission photo + template style lock. */
export function pickTemplateReferenceUrls(input: {
  missionPhotoUrl: string | null | undefined;
  matched: MatchedDesignTemplate | null;
  brandReferenceImageUrls?: string[];
}): string[] {
  const urls: string[] = [];
  const mission =
    input.missionPhotoUrl && isUsableGalleryPhotoUrl(input.missionPhotoUrl)
      ? input.missionPhotoUrl
      : null;
  const templateGallery =
    input.matched?.galleryRef && isUsableGalleryPhotoUrl(input.matched.galleryRef)
      ? input.matched.galleryRef
      : null;
  const styleRef =
    input.matched?.thumbnailUrl && isUsableGalleryPhotoUrl(input.matched.thumbnailUrl)
      ? input.matched.thumbnailUrl
      : null;

  if (mission) urls.push(mission);
  else if (templateGallery) urls.push(templateGallery);

  if (styleRef && styleRef !== urls[0]) urls.push(styleRef);
  else if (urls.length < 2) {
    const extra = (input.brandReferenceImageUrls ?? []).find(
      (u) => u && isUsableGalleryPhotoUrl(u) && !urls.includes(u),
    );
    if (extra) urls.push(extra);
  }

  return urls.slice(0, 2);
}

/** Phase 1 — warn when a matched template has a preview but it is missing from refs. */
export function assertTemplateStyleReference(
  binding: BrandTemplateFalBinding | null | undefined,
  referenceUrls: string[],
): void {
  const preview = binding?.styleReferenceUrl;
  if (!binding?.matched || !preview || !isUsableGalleryPhotoUrl(preview)) return;
  if (!referenceUrls.includes(preview)) {
    console.warn(
      `[fal-template-lock] missing style ref for "${binding.matched.templateName}" — layout lock weakened`,
    );
  }
}

export async function bindBrandTemplateForFalProduction(input: {
  workspaceId: string;
  slotRole: string;
  librarySlotKey: string | null | undefined;
  format: 'story' | 'post' | 'reel';
  caption?: string;
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
    });
    if (!matched) return empty;

    void recordDesignTemplateUsage(input.workspaceId, matched.id);

    const specialDay = matched.specialDay;
    const referencePhotoUrl =
      (input.missionReferenceUrl && isUsableGalleryPhotoUrl(input.missionReferenceUrl)
        ? input.missionReferenceUrl
        : null) ??
      (matched.galleryRef && isUsableGalleryPhotoUrl(matched.galleryRef) ? matched.galleryRef : null);

    return {
      matched,
      lockedVibe: matched.vibe ?? input.brandVibe,
      referencePhotoUrl,
      styleReferenceUrl: matched.thumbnailUrl ?? null,
      brandDirectives: [...buildTemplateLayoutDirectives(matched), ...input.baseDirectives],
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

/** Remotion poster slots that receive fal template alignment hints (Phase 2). */
export function isRemotionFalAlignedSlot(assignment: {
  pipeline: string;
  slot_role: string;
}): boolean {
  return (
    assignment.pipeline === 'remotion_poster'
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
    .filter((d) => d.includes('LOCKED TEMPLATE') || d.includes('TEXT LOCK'))
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

/** Extra brand refs for fal designer — template preview first for layout lock. */
export function templateStyleReferenceUrls(
  binding: BrandTemplateFalBinding,
  brandReferenceImageUrls: string[],
): string[] {
  const out: string[] = [];
  if (binding.styleReferenceUrl && isUsableGalleryPhotoUrl(binding.styleReferenceUrl)) {
    out.push(binding.styleReferenceUrl);
  }
  for (const u of brandReferenceImageUrls) {
    if (u && !out.includes(u) && u !== binding.referencePhotoUrl) out.push(u);
  }
  return out.slice(0, 2);
}

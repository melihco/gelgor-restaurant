/**
 * Remotion story quality — premium defaults, headline safety, Grafiker retry patches.
 */
import type { CreativeDirectorLayoutOverrides } from './creative-director-routing';
import type { RemotionLayoutFamily } from './remotion-template-types';
import { sanitizePosterText } from './announcement-text-fit';

export const GRAFIKER_PASS_THRESHOLD = 8;
export const GRAFIKER_HARD_FLOOR = 4;   // Below this: discard render, fall back to gallery still
export const GRAFIKER_MAX_RETRIES = 2;

export function resolveGrafikerMaxRetries(profileMax?: number | null): number {
  if (profileMax == null || !Number.isFinite(profileMax)) return GRAFIKER_MAX_RETRIES;
  return Math.max(0, Math.min(2, Math.floor(profileMax)));
}

const PHOTO_OVERLAY_FAMILIES: RemotionLayoutFamily[] = [
  'editorial_bottom',
  'frosted_glass',
  'magazine_cover',
  'editorial_left',
  'asymmetric_editorial',
  'cinematic_center',
  'campaign_hero',
  'bold_impact',
  'vibe_fullscreen',
  'noir_editorial',
  'quote_card',
  'location_pin',
];

export interface GrafikerReviewResult {
  score: number | null;
  pass: boolean;
  text_overlap?: boolean;
  text_legibility?: string;
  overlay_sufficient?: boolean;
  hierarchy_ok?: boolean;
  issues?: string[];
  verdict?: string;
}

/** Punchy display copy — word-safe truncation for story frames. */
export function enforceDisplayHeadline(headline: string, maxChars = 28): string {
  const trimmed = sanitizePosterText(headline);
  if (trimmed.length <= maxChars) return trimmed;
  const wordSafe = trimmed.slice(0, maxChars + 1).replace(/\s+\S*$/, '').trim();
  return (wordSafe || trimmed.slice(0, maxChars)).trim();
}

const PROMO_KEYWORDS = /\b(%|off|discount|promo|launch|offer|sale|indirim|fırsat|kampanya|save|deal)\b/i;
const LIFESTYLE_KEYWORDS = /\b(taste|lemon|cocktail|aperitif|menu|drink|sip|yemek|içecek|sunset|golden)\b/i;

/** Avoid categoryLabel repeating words already in the headline (e.g. TASTE + TASTE OF BODRUM). */
export function refineCategoryLabel(
  categoryLabel: string,
  headline: string,
  location?: string,
): string {
  const cat = categoryLabel.trim().toUpperCase();
  const head = headline.trim().toUpperCase();
  if (!cat) return location ? location.split(/[,·]/)[0]!.trim().slice(0, 12).toUpperCase() : '';
  if (head.includes(cat) || cat.length >= Math.min(head.length, 14)) {
    if (location) return location.split(/[,·]/)[0]!.trim().slice(0, 12).toUpperCase();
    return '';
  }
  return cat.slice(0, 24);
}

/** campaign_hero orange blocks only for real promos — food/lifestyle → editorial layouts. */
export function refineLayoutFamilyForContent(
  family: RemotionLayoutFamily,
  headline: string,
  caption: string,
): RemotionLayoutFamily {
  const text = `${headline} ${caption}`.toLowerCase();
  const isPromo = PROMO_KEYWORDS.test(text);
  if ((family === 'campaign_hero' || family === 'bold_impact') && !isPromo) {
    if (LIFESTYLE_KEYWORDS.test(text)) return 'magazine_cover';
    return 'frosted_glass';
  }
  return family;
}

export function applyPremiumDirectorDefaults(
  layoutFamily: RemotionLayoutFamily,
  overlayOpacity: number,
  layoutOverrides: CreativeDirectorLayoutOverrides,
): { overlayOpacity: number; layoutOverrides: CreativeDirectorLayoutOverrides } {
  const overrides: CreativeDirectorLayoutOverrides = { ...layoutOverrides };
  let opacity = overlayOpacity;

  if (PHOTO_OVERLAY_FAMILIES.includes(layoutFamily)) {
    opacity = Math.max(opacity, 0.64);
    if (overrides.gradientStart === undefined) overrides.gradientStart = 0.46;
    if (overrides.gradientEnd === undefined) overrides.gradientEnd = 0.88;
    if (!overrides.vignette || overrides.vignette === 'none') {
      overrides.vignette = 'soft';
    }
  }

  if (layoutFamily === 'magazine_cover' || layoutFamily === 'noir_editorial') {
    if (!overrides.duotoneWash || overrides.duotoneWash === 'none') {
      overrides.duotoneWash = 'warm';
    }
  }

  if (layoutFamily === 'split_panel' || layoutFamily === 'minimal_luxury') {
    opacity = Math.max(opacity, 0.55);
    if (!overrides.accentLine || overrides.accentLine === 'none') {
      overrides.accentLine = 'above';
    }
  }

  if (layoutFamily === 'campaign_hero' || layoutFamily === 'bold_impact') {
    if (overrides.heroScale === undefined) overrides.heroScale = 1.02;
    if (!overrides.accentLine || overrides.accentLine === 'none') overrides.accentLine = 'above';
  }

  return {
    overlayOpacity: Math.min(0.82, opacity),
    layoutOverrides: overrides,
  };
}

export function buildDirectorLayoutSpecPatch(input: {
  layoutOverrides?: CreativeDirectorLayoutOverrides;
  overlayOpacity: number;
  headlineWeight: number;
  headlineScale: number;
}): Record<string, unknown> {
  return {
    ...(input.layoutOverrides ?? {}),
    overlayOpacity: input.overlayOpacity,
    heroWeight: input.headlineWeight,
    heroScale: input.headlineScale,
  };
}

/** Patch props for a Grafiker-guided re-render (returns null if no safe fix). */
export function buildGrafikerRetryPatch(
  props: Record<string, unknown>,
  review: GrafikerReviewResult,
  attempt: number,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {
    ...((props.layoutSpecPatch as Record<string, unknown> | undefined) ?? {}),
  };
  let changed = false;

  const currentOverlay = Number(props.overlayOpacity ?? patch.overlayOpacity ?? 0.62);
  const currentScale = Number(props.headlineScale ?? patch.heroScale ?? 1);

  const legibilityBad = review.text_legibility === 'partial' || review.text_legibility === 'poor';
  if (review.overlay_sufficient === false || legibilityBad) {
    const bump = 0.12 + attempt * 0.05;
    const nextOverlay = Math.min(0.82, currentOverlay + bump);
    patch.overlayOpacity = nextOverlay;
    patch.gradientStart = Math.min(Number(patch.gradientStart ?? 0.5), 0.4 - attempt * 0.03);
    patch.gradientEnd = Math.max(Number(patch.gradientEnd ?? 0.82), 0.92);
    if (!patch.vignette || patch.vignette === 'none') {
      patch.vignette = attempt >= 1 ? 'noir' : 'soft';
    }
    changed = true;
  }

  if (review.text_overlap) {
    const nextScale = Math.max(0.75, currentScale - 0.08 - attempt * 0.04);
    patch.heroScale = nextScale;
    changed = true;
  }

  if (!review.hierarchy_ok && !review.text_overlap) {
    patch.heroWeight = 900;
    patch.accentLine = patch.accentLine === 'none' ? 'left_bar' : patch.accentLine;
    changed = true;
  }

  const score = review.score ?? 0;
  if (!changed && (score < GRAFIKER_PASS_THRESHOLD || !review.pass)) {
    patch.overlayOpacity = Math.min(0.82, currentOverlay + 0.1);
    if (!patch.vignette || patch.vignette === 'none') patch.vignette = 'soft';
    changed = true;
  }

  if (!changed) return null;

  return {
    ...props,
    overlayOpacity: patch.overlayOpacity ?? props.overlayOpacity,
    headlineScale: patch.heroScale ?? props.headlineScale,
    headlineWeight: patch.heroWeight ?? props.headlineWeight,
    layoutSpecPatch: patch,
  };
}

export function grafikerMeetsBar(review: GrafikerReviewResult): boolean {
  if (review.pass && (review.score ?? 0) >= GRAFIKER_PASS_THRESHOLD) return true;
  return (review.score ?? 0) >= GRAFIKER_PASS_THRESHOLD
    && review.text_legibility !== 'poor'
    && !review.text_overlap;
}

/** Vision QA on a rendered PNG/JPEG still (feed posts, agency posters). */
export async function runGrafikerReviewOnImageBuffer(
  imageBuffer: Buffer,
  label: string,
  telemetry?: { attempt?: number; missionId?: string | null; slotKey?: string | null },
  tier?: string,
): Promise<GrafikerReviewResult | null> {
  const { runGrafikerVisionReview } = await import('./grafiker-review-service');
  return runGrafikerVisionReview(imageBuffer, label, 'poster', telemetry, tier);
}

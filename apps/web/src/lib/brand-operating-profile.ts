/**
 * Brand operating profile — tenant-scoped daypart / service model isolation.
 *
 * Prevents generic temporal signals (e.g. "Cumartesi gece yoğunluğu") from
 * leaking into breakfast/daytime-only venues. Derived from brand context only —
 * no hardcoded tenant UUIDs.
 */

import { detectHeadlineThemeClusters } from '@/lib/headline-theme-clusters';

export type BrandDaypartProfile =
  | 'breakfast_daytime'
  | 'all_day_dining'
  | 'evening_dining'
  | 'nightlife'
  | 'neutral';

export interface BrandOperatingProfile {
  daypart: BrandDaypartProfile;
  /** Night / DJ / late-evening themes must not appear in copy or overlays. */
  rejectsNightlifeThemes: boolean;
  /** Brunch / kahvaltı angles are primary for temporal signals. */
  prefersBreakfastBrunch: boolean;
  /** Prompt block for ideation + fal designer paths. */
  isolationDirective?: string;
  forbiddenThemeClusterIds: string[];
}

const BREAKFAST_RX =
  /\b(kahvalt[ıi]|serpme|breakfast|brunch|sabah\s*servis|köy\s*kahvalt|koy\s*kahvalt|yöresel\s*kahvalt|yoresel\s*kahvalt)\b/i;
const NIGHTLIFE_RX =
  /\b(nightclub|gece\s*kulüb|gece\s*kulub|night\s*club|nightlife|after\s*dark|dj\b|live\s*dj|gece\s*açık|gece\s*acik|gece\s*servis|bar\s*menü|bar\s*menu|lineup|afterparty|after\s*party)\b/i;
const DAYTIME_ONLY_RX =
  /\b(sadece\s*(kahvalt|sabah)|kahvaltı\s*ağırl|kahvalti\s*agir|breakfast\s*only|gündüz\s*servis|gunduz\s*servis|akşam\s*kapalı|aksam\s*kapali|gece\s*kapalı|gece\s*kapali|gece\s*açık\s*değil|gece\s*acik\s*degil|night\s*closed|closes?\s*(at|by)\s*(1[0-7]|18)(?::|\b))\b/i;
const EVENING_DINING_RX =
  /\b(akşam\s*yemeği|aksam\s*yemegi|dinner\s*service|fine\s*dining|gece\s*menü|gece\s*menu)\b/i;

const NIGHTLIFE_BUSINESS_TYPES = new Set([
  'nightclub',
  'night_club',
  'bar',
  'lounge_bar',
  'beach_club',
  'beach_bar',
]);

const NIGHT_HEADLINE_RX =
  /\b(gece|night|after\s*dark|dj\b|lineup|nightlife|gece\s*yoğun|gece\s*yogun|cumartesi\s*gece|cuma\s*akşam|cuma\s*aksam)\b/i;

const BREAKFAST_HEADLINE_RX =
  /\b(kahvalt[ıi]|serpme|breakfast|brunch|sabah|köy\s*kahvalt|yöresel)\b/i;

function mergeText(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function readAntiPatterns(theme: Record<string, unknown> | null | undefined): string[] {
  const raw = theme?.anti_patterns ?? theme?.antiPatterns;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

function antiPatternsRejectNight(antiPatterns: string[]): boolean {
  const blob = antiPatterns.join(' ').toLowerCase();
  return /\b(gece|night|dj|nightlife|after\s*dark|sahil|deniz|waterfront)\b/.test(blob);
}

export function resolveBrandOperatingProfile(input: {
  businessType?: string;
  brandName?: string;
  brandDescription?: string;
  visualDna?: string;
  brandTone?: string;
  brandTheme?: Record<string, unknown> | null;
}): BrandOperatingProfile {
  const businessType = (input.businessType ?? '').trim().toLowerCase();
  const antiPatterns = readAntiPatterns(input.brandTheme);
  const blob = mergeText([
    input.brandName,
    input.brandDescription,
    input.visualDna,
    input.brandTone,
  ]);

  const hasBreakfast = BREAKFAST_RX.test(blob);
  const hasNightlifeText = NIGHTLIFE_RX.test(blob);
  const explicitDaytimeOnly = DAYTIME_ONLY_RX.test(blob);
  const hasEveningDining = EVENING_DINING_RX.test(blob);
  const isNightlifeSector = [...NIGHTLIFE_BUSINESS_TYPES].some(
    (slug) => businessType === slug || businessType.startsWith(`${slug}_`),
  );

  let daypart: BrandDaypartProfile = 'neutral';
  let rejectsNightlifeThemes = false;
  let prefersBreakfastBrunch = false;

  if (isNightlifeSector || (hasNightlifeText && !hasBreakfast)) {
    daypart = 'nightlife';
  } else if (hasBreakfast && (explicitDaytimeOnly || !hasNightlifeText)) {
    daypart = 'breakfast_daytime';
    prefersBreakfastBrunch = true;
    rejectsNightlifeThemes = true;
  } else if (hasBreakfast && hasNightlifeText) {
    daypart = 'all_day_dining';
  } else if (hasEveningDining) {
    daypart = 'evening_dining';
  }

  if (antiPatternsRejectNight(antiPatterns) && hasBreakfast) {
    rejectsNightlifeThemes = true;
    if (daypart === 'neutral') daypart = 'breakfast_daytime';
    prefersBreakfastBrunch = true;
  }

  const forbiddenThemeClusterIds = rejectsNightlifeThemes
    ? ['dj_nightlife', 'night_weekend']
    : [];

  const isolationDirective = rejectsNightlifeThemes
    ? 'BRAND OPERATING MODEL: This venue is breakfast / daytime-focused — NOT open for nightlife, DJ, or late-evening service. '
      + 'Never use gece, akşam yoğunluğu, DJ, party, or nightclub framing. '
      + 'Prefer sabah, kahvaltı, serpme, bahçe, aile masası, hafta sonu brunch angles.'
    : prefersBreakfastBrunch
      ? 'BRAND OPERATING MODEL: Kahvaltı / brunch is a primary service — lead with daytime breakfast storytelling when timing hooks apply.'
      : undefined;

  return {
    daypart,
    rejectsNightlifeThemes,
    prefersBreakfastBrunch,
    isolationDirective,
    forbiddenThemeClusterIds,
  };
}

/** Signal meta rhythm keys that conflict with a breakfast/daytime brand. */
const NIGHT_RHYTHM_KEYS = new Set(['friday_night', 'saturday_night']);

export function signalConflictsWithOperatingProfile(
  signal: { title?: string; contentHooks?: string[]; meta?: Record<string, unknown> },
  profile: BrandOperatingProfile,
): boolean {
  if (!profile.rejectsNightlifeThemes) return false;

  const rhythm = String(signal.meta?.rhythm ?? '');
  if (NIGHT_RHYTHM_KEYS.has(rhythm)) return true;

  const blob = mergeText([signal.title, ...(signal.contentHooks ?? [])]);
  if (NIGHT_HEADLINE_RX.test(blob)) return true;

  const clusters = detectHeadlineThemeClusters(blob);
  return clusters.some((id) => profile.forbiddenThemeClusterIds.includes(id));
}

export function headlineViolatesBrandOperatingProfile(
  headline: string,
  profile: BrandOperatingProfile,
): boolean {
  if (!profile.rejectsNightlifeThemes) return false;
  const text = headline.trim();
  if (!text) return false;
  if (NIGHT_HEADLINE_RX.test(text)) return true;
  const clusters = detectHeadlineThemeClusters(text);
  return clusters.some((id) => profile.forbiddenThemeClusterIds.includes(id));
}

/** Caption says breakfast but headline says night — rewrite even before brand profile. */
export function hasDaypartCopyConflict(caption: string, headline: string): boolean {
  const cap = caption.trim();
  const head = headline.trim();
  if (!cap || !head) return false;
  return BREAKFAST_HEADLINE_RX.test(cap) && NIGHT_HEADLINE_RX.test(head);
}

export function buildBrandOperatingProfileDirective(
  profile: BrandOperatingProfile,
): string | undefined {
  return profile.isolationDirective;
}

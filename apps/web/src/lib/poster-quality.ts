/**
 * Poster / promo_split quality bar — copy discipline + layout routing (Grafiker ≥8 target).
 */
import type { PosterLayoutFamily } from './poster-template-types';
import type { TemplateLayoutSpec } from './announcement-template-types';
import type { TextOverlayDensity } from './brand-text-overlay-prefs';
import { enforceDisplayHeadline, refineCategoryLabel } from './remotion-quality';

export const POSTER_GRAFIKER_PASS = 8;

const PROMO_KEYWORDS = /\b(%|off|discount|promo|launch|offer|sale|indirim|fırsat|kampanya|save|deal|indirimi)\b/i;
const GENERIC_GEO = /^(türkiye|turkey|tüm türkiye|global|worldwide)$/i;

export function isGenericGeoLocation(location: string | undefined | null): boolean {
  const t = (location ?? '').trim();
  return !t || GENERIC_GEO.test(t);
}

export function isPromoOfferCopy(headline: string, caption = ''): boolean {
  return PROMO_KEYWORDS.test(`${headline} ${caption}`);
}

export function isAgencySector(sector: string): boolean {
  const s = sector.toLowerCase();
  return s.includes('agency')
    || s === 'agency_services'
    || s === 'professional_service'
    || s.includes('saas')
    || s.includes('software');
}

/** Prefer editorial / luxury layouts for B2B & service brands unless real promo copy. */
export function rankPosterFamiliesForSector(
  sector: string,
  families: PosterLayoutFamily[],
  headline: string,
  caption = '',
  textOverlayDensity?: TextOverlayDensity,
): PosterLayoutFamily[] {
  const promo = isPromoOfferCopy(headline, caption);

  if (textOverlayDensity === 'minimal') {
    const photoDominant: PosterLayoutFamily[] = [
      'restaurant_feature',
      'editorial_date',
      'gala_invite',
      'event_masthead',
      'art_deco',
      'promo_split',
      'lineup_tiered',
      'festival_grid',
      'dj_night',
      'neon_club',
    ];
    const ordered = photoDominant.filter((f) => families.includes(f));
    const rest = families.filter((f) => !ordered.includes(f));
    return [...ordered, ...rest];
  }

  if (isAgencySector(sector) && !promo) {
    const preferred: PosterLayoutFamily[] = [
      'editorial_date',
      'restaurant_feature',
      'gala_invite',
      'event_masthead',
      'art_deco',
      'promo_split',
    ];
    const ordered = preferred.filter((f) => families.includes(f));
    const rest = families.filter((f) => !ordered.includes(f));
    return [...ordered, ...rest];
  }
  if (promo) {
    const withPromo = ['promo_split', ...families.filter((f) => f !== 'promo_split')] as PosterLayoutFamily[];
    return withPromo;
  }
  return families;
}

function normalizeKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Max 5-word support line; never duplicate hero or date line. */
export function extractPosterSupportLine(
  subtitle: string | undefined,
  eventDate?: string,
  eventTime?: string,
  maxWords = 5,
): string {
  const dateLine = [eventDate, eventTime].filter(Boolean).join(' · ');
  const raw = (subtitle ?? '').trim();
  if (!raw) return '';

  const firstSentence = raw.split(/[.!?]\s/)[0]?.trim() ?? raw;
  const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, maxWords);
  let line = words.join(' ');
  if (line.length > 52) line = line.slice(0, 51).trim() + '…';

  const lineKey = normalizeKey(line);
  const dateKey = normalizeKey(dateLine);
  if (dateKey && (lineKey === dateKey || lineKey.includes(dateKey) || dateKey.includes(lineKey))) {
    return '';
  }
  return line;
}

export interface NormalizedPosterCopy {
  headline: string;
  subtitle: string;
  venueArea?: string;
  categoryLabel: string;
  cta?: string;
}

export function normalizePosterCopy(input: {
  headline: string;
  subtitle?: string;
  brandName: string;
  location?: string;
  eventDate?: string;
  eventTime?: string;
  cta?: string;
  caption?: string;
  sector?: string;
}): NormalizedPosterCopy {
  const brand = input.brandName.trim() || 'BRAND';
  const caption = (input.caption ?? input.subtitle ?? '').trim();
  const rawHeadline = input.headline.trim() || caption.split(/[.!?]/)[0]?.trim() || brand;

  const agency = isAgencySector(input.sector ?? '');
  const maxHeadlineChars = isPromoOfferCopy(rawHeadline, caption)
    ? 32
    : agency
      ? 30
      : 38;

  const headline = enforceDisplayHeadline(
    isPromoOfferCopy(rawHeadline, caption)
      ? rawHeadline
      : extractHookFromLongHeadline(rawHeadline, caption, brand, maxHeadlineChars),
    maxHeadlineChars,
  );

  const subtitle = extractPosterSupportLine(
    input.subtitle ?? caption,
    input.eventDate,
    input.eventTime,
  );

  const loc = (input.location ?? '').trim();
  const venueArea = isGenericGeoLocation(loc) ? undefined : loc;

  const categoryLabel = refineCategoryLabel('', headline, loc || undefined);

  const cta = (input.cta ?? '').trim()
    || (isPromoOfferCopy(headline, caption) ? 'Hemen Katıl' : 'Keşfet');

  return { headline, subtitle, venueArea, categoryLabel, cta };
}

function extractHookFromLongHeadline(
  headline: string,
  caption: string,
  brandName: string,
  maxLen = 38,
): string {
  const h = headline.trim();
  if (h.length <= maxLen) return h;
  const words = h.split(/\s+/);
  let acc = '';
  for (const w of words) {
    const next = acc ? `${acc} ${w}` : w;
    if (next.length > maxLen) break;
    acc = next;
  }
  if (acc.length >= 10) return acc;
  const cap = caption.trim();
  if (cap) {
    const first = cap.split(/[.!?]\s/)[0]?.trim() ?? cap;
    return first.length <= maxLen ? first : first.slice(0, maxLen - 1).trim() + '…';
  }
  return brandName;
}

/** Premium defaults for promo_banner / split panels (Awwwards-tier hierarchy). */
export function applyPremiumPosterLayoutPatch(
  spec: TemplateLayoutSpec,
  sector?: string,
): TemplateLayoutSpec {
  if (spec.family !== 'promo_banner' && spec.posterMode !== 'promo_split') {
    return spec;
  }

  const agency = isAgencySector(sector ?? '');

  return {
    ...spec,
    colorBlockSize: Math.max(spec.colorBlockSize, 0.42),
    colorBlockOpacity: Math.min(spec.colorBlockOpacity, agency ? 0.88 : 0.9),
    gradientStart: Math.max(spec.gradientStart, 0.48),
    gradientEnd: Math.max(spec.gradientEnd, 0.82),
    accentLine: spec.accentLine === 'none' ? 'above' : spec.accentLine,
    ornamentDivider: spec.ornamentDivider === 'none' ? 'double_rule' : spec.ornamentDivider,
    duotoneWash: spec.duotoneWash === 'none' ? 'primary' : spec.duotoneWash,
    duotoneOpacity: Math.max(spec.duotoneOpacity ?? 0, 0.2),
    posterFooter: spec.posterFooter === 'solid_bar' ? 'pill_row' : spec.posterFooter,
    showBrand: agency ? false : spec.showBrand,
    heroTracking: Math.min(spec.heroTracking, 0.06),
    heroScale: agency ? Math.min(spec.heroScale, 1.08) : spec.heroScale,
  };
}

export function textsAreDuplicate(a: string, b: string): boolean {
  const ka = normalizeKey(a);
  const kb = normalizeKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/** APO-4 — lightweight poster QA (0–10) for logs and future Grafiker retry. */
export interface PosterQaResult {
  score: number;
  issues: string[];
  pass: boolean;
}

/** Shorter headline for Grafiker retry when type is clipped or illegible. */
export function buildPosterGrafikerRetryHeadline(
  headline: string,
  attempt: number,
): string {
  const limits = [28, 22, 18];
  const max = limits[Math.min(attempt, limits.length - 1)] ?? 18;
  return enforceDisplayHeadline(headline, max);
}

export function scorePosterQa(input: {
  headline: string;
  subtitle?: string;
  venueArea?: string;
  sector?: string;
  layoutFamily?: string;
}): PosterQaResult {
  const issues: string[] = [];
  let score = 10;
  const headline = (input.headline ?? '').trim();
  const subtitle = (input.subtitle ?? '').trim();
  const sector = input.sector ?? '';

  if (headline.length < 4) {
    issues.push('headline_too_short');
    score -= 3;
  }
  if (headline.length > 42) {
    issues.push('headline_too_long');
    score -= 1;
  }
  if (headline.length > 32 && isAgencySector(sector)) {
    issues.push('agency_headline_wrap_risk');
    score -= 2;
  }
  if (textsAreDuplicate(headline, subtitle)) {
    issues.push('headline_subtitle_duplicate');
    score -= 3;
  }
  if (!isAgencySector(sector) && isGenericGeoLocation(input.venueArea)) {
    issues.push('generic_venue_only');
    score -= 1;
  }
  if (GENERIC_GEO.test(headline) || GENERIC_GEO.test(subtitle)) {
    issues.push('generic_geo_in_copy');
    score -= 2;
  }
  if (isPromoOfferCopy(headline, subtitle) && input.layoutFamily === 'editorial_date') {
    issues.push('promo_copy_editorial_layout_mismatch');
    score -= 1;
  }

  const clamped = Math.max(0, Math.min(10, score));
  return {
    score: clamped,
    issues,
    pass: clamped >= POSTER_GRAFIKER_PASS,
  };
}

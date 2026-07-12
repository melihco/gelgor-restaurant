/**
 * Poster / promo_split quality bar — copy discipline + layout routing (Grafiker ≥8 target).
 */
import type { PosterLayoutFamily } from './poster-template-types';
import type { TemplateLayoutSpec } from './announcement-template-types';
import type { TextOverlayDensity } from './brand-text-overlay-prefs';
import { sanitizePosterText } from './announcement-text-fit';
import { enforceDisplayHeadline, refineCategoryLabel } from './grafiker-quality';
import {
  isMeaninglessBrandEchoHeadline,
  resolveMeaningfulProductionHeadline,
} from './production-headline-quality';

export const POSTER_GRAFIKER_PASS = 8;

/** Hard promo — layout may use promo_split */
const HARD_PROMO_KEYWORDS = /\b(%|off|discount|indirim|kampanya|save|deal|indirimi|launch|sale)\b/i;
/** Soft seasonal — does not force promo_split */
const SOFT_PROMO_KEYWORDS = /\b(promo|offer|fırsat|firsat)\b/i;
const PROMO_KEYWORDS = new RegExp(
  `${HARD_PROMO_KEYWORDS.source}|${SOFT_PROMO_KEYWORDS.source}`,
  'i',
);
const GENERIC_GEO = /^(türkiye|turkey|tüm türkiye|global|worldwide)$/i;

export function isGenericGeoLocation(location: string | undefined | null): boolean {
  const t = (location ?? '').trim();
  return !t || GENERIC_GEO.test(t);
}

export function isPromoOfferCopy(headline: string, caption = ''): boolean {
  return PROMO_KEYWORDS.test(`${headline} ${caption}`);
}

/** True only for discount / campaign copy — drives promo_split layout routing */
export function isHardPromoOfferCopy(headline: string, caption = ''): boolean {
  return HARD_PROMO_KEYWORDS.test(`${headline} ${caption}`);
}

export function isLogisticsSector(sector: string): boolean {
  const s = sector.toLowerCase();
  return /nakliyat|nakliye|lojistik|logistics|freight|taşımac|tasimac|transport|kargo|evden.eve|moving/.test(s);
}

export function isServiceSector(sector: string): boolean {
  return isAgencySector(sector) || isLogisticsSector(sector) || /professional|consulting|b2b|kurumsal/.test(sector.toLowerCase());
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
  const hardPromo = isHardPromoOfferCopy(headline, caption);
  const service = isServiceSector(sector);

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

  if (service && !hardPromo) {
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
  if (isLogisticsSector(sector) && !hardPromo) {
    const preferred: PosterLayoutFamily[] = [
      'restaurant_feature',
      'editorial_date',
      'event_masthead',
      'gala_invite',
      'promo_split',
    ];
    const ordered = preferred.filter((f) => families.includes(f));
    const rest = families.filter((f) => !ordered.includes(f));
    return [...ordered, ...rest];
  }
  if (hardPromo) {
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
  const raw = sanitizePosterText(subtitle ?? '');
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
  ideationHeadline?: string;
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
  const caption = sanitizePosterText(input.caption ?? input.subtitle ?? '');
  const ideationRaw = sanitizePosterText((input.ideationHeadline ?? input.headline).trim());
  const hasIdeationTitle = Boolean(
    ideationRaw && !isMeaninglessBrandEchoHeadline(ideationRaw, brand),
  );
  const headlineResolved = hasIdeationTitle
    ? { headline: ideationRaw, replaced: false as const }
    : resolveMeaningfulProductionHeadline({
        headline: sanitizePosterText(input.headline.trim()),
        caption,
        brandName: brand,
        conceptTitle: ideationRaw,
        maxLen: 38,
      });
  const rawHeadline = headlineResolved.headline
    || caption.split(/[.!?]/)[0]?.trim()
    || 'YENİ PAYLAŞIM';

  const agency = isAgencySector(input.sector ?? '');
  const promoFromHeadlineOnly = isPromoOfferCopy(rawHeadline, '');
  const maxHeadlineChars = promoFromHeadlineOnly
    ? 32
    : agency
      ? 30
      : 38;

  const headline = enforceDisplayHeadline(
    hasIdeationTitle
      ? rawHeadline
      : promoFromHeadlineOnly
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
    || resolvePosterCta({ headline, caption, sector: input.sector ?? '' });

  return { headline, subtitle, venueArea, categoryLabel, cta };
}

function resolvePosterCta(input: { headline: string; caption: string; sector: string }): string {
  if (isHardPromoOfferCopy(input.headline, input.caption)) return 'Hemen Katıl';
  if (isLogisticsSector(input.sector)) return 'Teklif Al';
  if (isAgencySector(input.sector)) return 'Detayları İncele';
  if (isPromoOfferCopy(input.headline, input.caption)) return 'Fırsatı Yakala';
  return 'Keşfet';
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

/** Photo-first legibility — küçük alt bant, görseli kapatmayan tipografi. */
export function applyPhotoLegibilityLayoutPatch(
  spec: TemplateLayoutSpec,
  opts?: { hasLineup?: boolean },
): TemplateLayoutSpec {
  const hasLineup = Boolean(opts?.hasLineup);
  const centerHeavy = spec.textZone === 'center'
    || spec.posterMode === 'gala_centered'
    || spec.posterMode === 'promo_split'
    || spec.family === 'impact_vignette'
    || spec.family === 'dj_night';

  if (!centerHeavy || hasLineup) return spec;

  return {
    ...spec,
    posterMode: spec.posterMode === 'gala_centered' ? 'none' : spec.posterMode,
    textZone: 'bottom_center',
    align: 'center',
    heroScale: Math.min(spec.heroScale, 0.9),
    gradientStart: Math.max(spec.gradientStart, 0.54),
    gradientEnd: Math.min(Math.max(spec.gradientEnd, 0.86), 0.94),
    colorBlock: spec.colorBlock === 'none' ? 'bottom_panel' : spec.colorBlock,
    colorBlockSize: spec.colorBlock === 'none'
      ? 0.3
      : Math.min(spec.colorBlockSize || 0.42, 0.34),
    colorBlockOpacity: Math.max(spec.colorBlockOpacity ?? 0, 0.84),
    vignetteDeep: false,
    duotoneOpacity: Math.min(spec.duotoneOpacity ?? 0.35, 0.22),
    photoFirst: true,
  };
}

/** Premium defaults for promo_banner / split panels (Awwwards-tier hierarchy). */
export function applyPremiumPosterLayoutPatch(
  spec: TemplateLayoutSpec,
  sector?: string,
): TemplateLayoutSpec {
  if (spec.family !== 'promo_banner' && spec.posterMode !== 'promo_split') {
    return spec;
  }

  const sectorKey = sector ?? '';
  const agency = isAgencySector(sectorKey);
  const logistics = isLogisticsSector(sectorKey);
  const service = isServiceSector(sectorKey);

  // B2B / logistics: photo-first bottom scrim — not stock 50/50 beige slab
  if (service || logistics) {
    return {
      ...spec,
      photoFirst: true,
      textZone: 'bottom_center',
      align: 'center',
      colorBlock: spec.colorBlock === 'none' ? 'bottom_panel' : spec.colorBlock,
      colorBlockSize: Math.min(spec.colorBlockSize || 0.38, 0.3),
      colorBlockOpacity: Math.min(spec.colorBlockOpacity, 0.86),
      gradientStart: Math.max(spec.gradientStart, 0.56),
      gradientEnd: Math.min(Math.max(spec.gradientEnd, 0.88), 0.94),
      duotoneWash: spec.duotoneWash === 'none' ? 'primary' : spec.duotoneWash,
      duotoneOpacity: Math.max(spec.duotoneOpacity ?? 0, 0.18),
      vignetteDeep: false,
      accentLine: spec.accentLine === 'none' ? 'above' : spec.accentLine,
      heroTracking: Math.min(spec.heroTracking, 0.05),
      heroScale: Math.min(spec.heroScale, 1.02),
      showBrand: agency || logistics ? false : spec.showBrand,
    };
  }

  return {
    ...spec,
    colorBlockSize: Math.max(spec.colorBlockSize, 0.36),
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
  if (isHardPromoOfferCopy(headline, subtitle) && input.layoutFamily === 'editorial_date') {
    issues.push('promo_copy_editorial_layout_mismatch');
    score -= 1;
  }
  if (
    isServiceSector(sector)
    && !isHardPromoOfferCopy(headline, subtitle)
    && input.layoutFamily === 'promo_split'
  ) {
    issues.push('service_brand_promo_split_mismatch');
    score -= 2;
  }

  const clamped = Math.max(0, Math.min(10, score));
  return {
    score: clamped,
    issues,
    pass: clamped >= POSTER_GRAFIKER_PASS,
  };
}

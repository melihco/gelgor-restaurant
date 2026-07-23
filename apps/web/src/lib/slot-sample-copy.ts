/**
 * Slot-fit sample copy for template library previews.
 *
 * Short punchlines (2–3 words) that sit inside designed type zones —
 * not long captions or quoted review paragraphs.
 * Multi-tenant: catalog_slot_key + templateType — never brand UUIDs.
 */

import type { DesignTemplateFormat, DesignTemplateType } from '@/lib/brand-design-template-presets';

export type SlotSampleCopy = {
  headline: string;
  /** Supporting line — omit when showSubline is false. */
  subtitle?: string;
};

const MAX_HEADLINE_WORDS = 3;
const MAX_HEADLINE_CHARS = 28;
const MAX_SUBTITLE_WORDS = 3;
const MAX_SUBTITLE_CHARS = 24;

/** Trim to word + char budget without mid-word cuts when possible. */
export function fitSlotPunchline(
  text: string,
  maxWords: number,
  maxChars: number,
): string {
  const cleaned = String(text ?? '')
    .replace(/[«»"'„“‘’]/g, '')
    .replace(/^[\s—–-]+|[\s—–-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, maxWords);
  let out = words.join(' ');
  if (out.length > maxChars) {
    out = out.slice(0, maxChars).replace(/\s+\S*$/, '').trim();
  }
  return out;
}

function pair(headline: string, subtitle?: string): SlotSampleCopy {
  const h = fitSlotPunchline(headline, MAX_HEADLINE_WORDS, MAX_HEADLINE_CHARS);
  const s = subtitle
    ? fitSlotPunchline(subtitle, MAX_SUBTITLE_WORDS, MAX_SUBTITLE_CHARS)
    : '';
  return s ? { headline: h || headline, subtitle: s } : { headline: h || headline };
}

/**
 * Keyword cues on catalog_slot_key / labels beat generic templateType defaults.
 */
export function resolveSlotSampleCopy(input: {
  catalogSlotKey?: string | null;
  templateType?: DesignTemplateType | string | null;
  format?: DesignTemplateFormat | string | null;
  /** When false, never return a subtitle. When true, ensure a short support line if type has one. */
  showSubline?: boolean | null;
  sector?: string | null;
}): SlotSampleCopy {
  const key = String(input.catalogSlotKey ?? '').toLowerCase();
  const type = String(input.templateType ?? '').toLowerCase();
  const blob = `${key} ${type}`;

  let copy: SlotSampleCopy;

  if (/social_proof|yorum|review|testimonial|misafir/.test(blob)) {
    copy = pair('Harika', 'Misafir');
  } else if (/daybed|book|rezerv/.test(blob)) {
    copy = pair('Daybed', 'Rezervasyon');
  } else if (/cocktail|kokteyl|drink|bar|wine|şarap/.test(blob)) {
    copy = pair('İmza Kokteyl', 'Menü');
  } else if (/dj|night|gece|party|event_ticket/.test(blob)) {
    copy = pair('DJ Night', 'Bu Gece');
  } else if (/event_announcement|etkinlik.?duyuru|live_music_event|private_event/.test(blob)) {
    // Venue event poster — not national-holiday greeting cards.
    copy = pair('Bu Gece', 'Etkinlik');
  } else if (/sunset|gün.?bat|golden/.test(blob)) {
    copy = pair('Gün Batımı', 'Altın Saat');
  } else if (/aerial|havadan|drone/.test(blob)) {
    copy = pair('Atmosfer');
  } else if (/venue|mekan|ambiance|atmosphere|showcase/.test(blob)) {
    copy = pair('Seni Bekliyoruz');
  } else if (/menu|menü|food|brunch|seafood|harvest|product/.test(blob)) {
    copy = pair('Öne Çıkan', 'Taze');
  } else if (/campaign|kampanya|offer|promo|seasonal|sezon/.test(blob)) {
    copy = pair('Özel Kampanya', 'Sınırlı Süre');
  } else if (/bayram|özel.?gün/.test(blob)) {
    copy = pair('Mutlu Bayramlar', 'Kutlama');
  } else if (type === 'event_special' && /event/.test(blob)) {
    copy = pair('Bu Gece', 'Etkinlik');
  } else if (/daily|günaydın|story/.test(blob) && type === 'daily_story') {
    copy = pair('Günaydın');
  } else if (/announcement|duyuru|formal/.test(blob)) {
    copy = pair('Duyuru', 'Bilgi');
  } else if (/reel|kapak/.test(blob)) {
    copy = pair('İzle');
  } else if (/brand_identity|kimlik/.test(blob)) {
    copy = pair('Marka');
  } else {
    copy = sampleCopyForTemplateType(type);
  }

  if (input.showSubline === false) {
    return { headline: copy.headline };
  }
  if (input.showSubline === true && !copy.subtitle) {
    // Explicit on — only add support when type typically has one.
    const withSupport = sampleCopyForTemplateType(type);
    if (withSupport.subtitle) {
      return {
        headline: copy.headline,
        subtitle: fitSlotPunchline(withSupport.subtitle, MAX_SUBTITLE_WORDS, MAX_SUBTITLE_CHARS),
      };
    }
  }
  return copy;
}

function sampleCopyForTemplateType(templateType: string): SlotSampleCopy {
  switch (templateType) {
    case 'social_proof':
      return pair('Harika', 'Misafir');
    case 'venue_showcase':
      return pair('Seni Bekliyoruz');
    case 'menu_highlight':
      return pair('Öne Çıkan', 'Taze');
    case 'campaign_announcement':
      return pair('Özel Kampanya', 'Sınırlı Süre');
    case 'seasonal_promo':
      return pair('Yeni Sezon', 'Özel');
    case 'event_special':
      return pair('Mutlu Bayramlar', 'Kutlama');
    case 'daily_story':
      return pair('Günaydın');
    case 'announcement_formal':
      return pair('Duyuru', 'Bilgi');
    case 'reel_cover':
      return pair('İzle');
    case 'brand_identity':
      return pair('Marka');
    default:
      return pair('Keşfet');
  }
}

/** Prompt block — short punchlines + no overflow in reserved type zones. */
export function buildSlotCopyFitDirective(copy: SlotSampleCopy): string {
  const sub = copy.subtitle?.trim();
  // Budget-only — brand type energy lives in BRAND SOUL / FONT·VIBE / recipe locks.
  return [
    '═══ COPY FIT (TEMPLATE LIBRARY) ═══',
    'Paint ONLY the ON-CANVAS TEXT CONTRACT — short punchline lockup, not a caption paragraph.',
    `HEADLINE budget: max ${MAX_HEADLINE_WORDS} words / ~${MAX_HEADLINE_CHARS} chars — already contracted.`,
    sub
      ? `SUBLINE budget: max ${MAX_SUBTITLE_WORDS} words — support line in its reserved zone only.`
      : 'SUBLINE: OFF — do NOT invent a supporting line, tagline, or quote attribution.',
    'TYPE ZONE: every letter stays inside the reserved type area with ≥8% padding — NEVER clip, overflow, or spill onto busy photo mid.',
  ].join(' ');
}

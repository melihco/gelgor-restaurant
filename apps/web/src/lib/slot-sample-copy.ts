/**
 * Slot-fit sample copy for template library previews.
 *
 * Short punchlines (2–3 words) that sit inside designed type zones —
 * not long captions or quoted review paragraphs.
 * Multi-tenant: catalog_slot_key + templateType + sector — never brand UUIDs.
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
 * Prefer a short, punchy slot label over generic type defaults
 * ("Şef özel" → "Şef Özel", not "Özel Kampanya").
 */
function punchlineFromSlotLabel(label?: string | null): SlotSampleCopy | null {
  const raw = String(label ?? '').trim();
  if (!raw) return null;
  // Drop trailing format noise: "… post", "… story", "… reel"
  const cleaned = raw
    .replace(/\s+(post|story|reel|carousel|kapak|afişi?)$/i, '')
    .trim();
  const fitted = fitSlotPunchline(cleaned, MAX_HEADLINE_WORDS, MAX_HEADLINE_CHARS);
  if (!fitted || fitted.length < 3) return null;
  // Reject labels that are still meta ("Premium Editorial Campaign").
  if (/premium|editorial|campaign|template|şablon/i.test(fitted) && fitted.split(/\s+/).length >= 2) {
    return null;
  }
  return { headline: fitted };
}

/**
 * Keyword cues on catalog_slot_key / labels beat generic templateType defaults.
 */
export function resolveSlotSampleCopy(input: {
  catalogSlotKey?: string | null;
  templateType?: DesignTemplateType | string | null;
  format?: DesignTemplateFormat | string | null;
  /** Human slot label (TR) — preferred when short and specific. */
  slotLabel?: string | null;
  /** When false, never return a subtitle. When true, ensure a short support line if type has one. */
  showSubline?: boolean | null;
  sector?: string | null;
}): SlotSampleCopy {
  const key = String(input.catalogSlotKey ?? '').toLowerCase();
  const type = String(input.templateType ?? '').toLowerCase();
  const sector = String(input.sector ?? '').toLowerCase();
  const blob = `${key} ${type}`;
  const isHospitalityFood =
    /restaurant|cafe|hotel|local_products/.test(sector) || /restaurant_cafe|local_products/.test(key);

  let copy: SlotSampleCopy | null = null;

  // ── Slot-key specifics first (before templateType catch-alls) ─────────────
  if (/social_proof|yorum|review|testimonial|misafir/.test(blob)) {
    copy = pair('Harika', 'Misafir');
  } else if (/daybed/.test(blob)) {
    copy = pair('Daybed', 'Rezervasyon');
  } else if (/weekend|hafta.?sonu/.test(blob) && /book|rezerv|booking/.test(blob)) {
    copy = isHospitalityFood
      ? pair('Hafta Sonu', 'Rezervasyon')
      : pair('Hafta Sonu', 'Gel');
  } else if (/(^|_)(book|booking|rezerv)/.test(key) || /reservation_cta|rezervasyon/.test(blob)) {
    copy = pair('Rezervasyon', isHospitalityFood ? 'Masa' : 'Gel');
  } else if (/chef_special|şef.?özel|sef.?ozel/.test(blob)) {
    copy = pair('Şef Özel', 'Bugün');
  } else if (/signature|imza.?tabak|imza.?yemek/.test(blob)) {
    copy = pair('İmza Tabak', 'Menü');
  } else if (/brunch|kahvalt|serpme/.test(blob)) {
    copy = pair('Kahvaltı', 'Bahçe');
  } else if (/farm.?to.?table|çiftlik|bahçeden|bahceden/.test(blob)) {
    copy = pair('Bahçeden', 'Sofraya');
  } else if (/seasonal.?ingredient|mevsimsel.?malzeme|harvest/.test(blob)) {
    copy = pair('Mevsim', 'Taze');
  } else if (/happy.?hour/.test(blob)) {
    copy = pair('Happy Hour', 'Bugün');
  } else if (/private.?dining|özel.?yemek|ozel.?yemek/.test(blob)) {
    copy = pair('Özel Masa', 'Davet');
  } else if (/kitchen|mutfak|plating|bts/.test(blob)) {
    copy = pair('Mutfak', 'Kulis');
  } else if (/dining.?ambiance|yemek.?atmosfer|ambiance|atmosphere/.test(blob) && /venue|showcase|dining/.test(blob)) {
    copy = pair(isHospitalityFood ? 'Bahçe Sofrası' : 'Seni Bekliyoruz');
  } else if (/new.?menu|yeni.?menü|yeni.?menu|menu.?tasting|tadım/.test(blob)) {
    copy = pair('Yeni Menü', 'Tat');
  } else if (/menu.?highlight|menü.?öne|menu_highlight/.test(blob)) {
    copy = pair(isHospitalityFood ? 'Sofrada' : 'Öne Çıkan', isHospitalityFood ? 'Taze' : 'Taze');
  } else if (/cocktail|kokteyl|drink|bar|wine|şarap/.test(blob)) {
    copy = pair('İmza Kokteyl', 'Menü');
  } else if (/dj|night|gece|party|event_ticket/.test(blob) && !/restaurant_cafe/.test(key)) {
    copy = pair('DJ Night', 'Bu Gece');
  } else if (/event_announcement|etkinlik.?duyuru|live_music_event|private_event/.test(blob)) {
    copy = pair('Bu Gece', 'Etkinlik');
  } else if (/sunset|gün.?bat|golden/.test(blob)) {
    copy = pair('Gün Batımı', 'Altın Saat');
  } else if (/aerial|havadan|drone/.test(blob)) {
    copy = pair('Atmosfer');
  } else if (/venue|mekan|showcase/.test(blob)) {
    copy = pair(isHospitalityFood ? 'Bahçede' : 'Seni Bekliyoruz');
  } else if (/menu|menü|food|seafood|product|dish|tabak/.test(blob)) {
    copy = pair(isHospitalityFood ? 'Sofrada' : 'Öne Çıkan', 'Taze');
  } else if (/typography.?poster|tipografi/.test(blob)) {
    copy = pair(isHospitalityFood ? 'Lezzet' : 'Tipografi');
  } else if (/campaign|kampanya|offer|promo|seasonal|sezon/.test(blob)) {
    // Hospitality: never default to "Özel Kampanya" flyer language.
    copy = isHospitalityFood
      ? pair('Davet', 'Bugün')
      : pair('Özel Kampanya', 'Sınırlı Süre');
  } else if (/bayram|özel.?gün/.test(blob)) {
    copy = pair('Mutlu Bayramlar', 'Kutlama');
  } else if (type === 'event_special' && /event/.test(blob)) {
    copy = pair('Bu Gece', 'Etkinlik');
  } else if (/daily|günaydın|kitchen_bts/.test(blob) && (type === 'daily_story' || /story/.test(blob))) {
    copy = pair(isHospitalityFood ? 'Bugün' : 'Günaydın');
  } else if (/announcement|duyuru|formal/.test(blob)) {
    copy = pair('Duyuru', 'Bilgi');
  } else if (/reel|kapak/.test(blob)) {
    copy = pair(isHospitalityFood ? 'Lezzet' : 'İzle');
  } else if (/brand_identity|kimlik/.test(blob)) {
    copy = pair('Marka');
  }

  // Slot label beats still-generic type defaults when key matching was soft.
  const fromLabel = punchlineFromSlotLabel(input.slotLabel);
  if (
    fromLabel
    && (
      !copy
      || /^(Özel Kampanya|Öne Çıkan|İzle|Keşfet|Davet)$/i.test(copy.headline)
    )
  ) {
    copy = fromLabel.subtitle || !copy?.subtitle
      ? fromLabel
      : { headline: fromLabel.headline, subtitle: copy.subtitle };
  }

  if (!copy) {
    copy = sampleCopyForTemplateType(type, isHospitalityFood);
  }

  if (input.showSubline === false) {
    return { headline: copy.headline };
  }
  if (input.showSubline === true && !copy.subtitle) {
    const withSupport = sampleCopyForTemplateType(type, isHospitalityFood);
    if (withSupport.subtitle) {
      return {
        headline: copy.headline,
        subtitle: fitSlotPunchline(withSupport.subtitle, MAX_SUBTITLE_WORDS, MAX_SUBTITLE_CHARS),
      };
    }
  }
  return copy;
}

function sampleCopyForTemplateType(templateType: string, hospitalityFood = false): SlotSampleCopy {
  switch (templateType) {
    case 'social_proof':
      return pair('Harika', 'Misafir');
    case 'venue_showcase':
      return pair(hospitalityFood ? 'Bahçede' : 'Seni Bekliyoruz');
    case 'menu_highlight':
      return pair(hospitalityFood ? 'Sofrada' : 'Öne Çıkan', 'Taze');
    case 'campaign_announcement':
      return hospitalityFood
        ? pair('Davet', 'Bugün')
        : pair('Özel Kampanya', 'Sınırlı Süre');
    case 'seasonal_promo':
      return pair(hospitalityFood ? 'Mevsim' : 'Yeni Sezon', hospitalityFood ? 'Taze' : 'Özel');
    case 'event_special':
      return pair('Mutlu Bayramlar', 'Kutlama');
    case 'daily_story':
      return pair(hospitalityFood ? 'Bugün' : 'Günaydın');
    case 'announcement_formal':
      return pair('Duyuru', 'Bilgi');
    case 'reel_cover':
      return pair(hospitalityFood ? 'Lezzet' : 'İzle');
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

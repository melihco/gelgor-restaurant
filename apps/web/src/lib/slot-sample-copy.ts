/**
 * Slot-fit sample copy for template library previews.
 *
 * Short punchlines (2–3 words) that sit inside designed type zones —
 * not long captions or quoted review paragraphs.
 * Multi-tenant: catalog_slot_key + templateType + sector — never brand UUIDs.
 */

import type { DesignTemplateFormat, DesignTemplateType } from '@/lib/brand-design-template-presets';
import { resolveBrandLanguageCode } from '@/lib/cta-localization';
import { overlayMatchesBrandLanguage } from '@/lib/fal-caption-headline';

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

function loc(
  trH: string,
  enH: string,
  language?: string | null,
  trS?: string,
  enS?: string,
): SlotSampleCopy {
  return resolveBrandLanguageCode(language) === 'en'
    ? pair(enH, enS)
    : pair(trH, trS);
}

/**
 * Prefer a short, punchy slot label over generic type defaults
 * ("Şef özel" → "Şef Özel", not "Özel Kampanya").
 */
function punchlineFromSlotLabel(
  label?: string | null,
  language?: string | null,
): SlotSampleCopy | null {
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
  if (language && !overlayMatchesBrandLanguage(fitted, language)) return null;
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
  /** Brand content language — EN brands must not get TR library samples. */
  language?: string | null;
}): SlotSampleCopy {
  const key = String(input.catalogSlotKey ?? '').toLowerCase();
  const type = String(input.templateType ?? '').toLowerCase();
  const sector = String(input.sector ?? '').toLowerCase();
  const lang = input.language;
  const blob = `${key} ${type}`;
  const isHospitalityFood =
    /restaurant|cafe|hotel|local_products/.test(sector) || /restaurant_cafe|local_products/.test(key);

  let copy: SlotSampleCopy | null = null;

  // ── Slot-key specifics first (before templateType catch-alls) ─────────────
  if (/social_proof|yorum|review|testimonial|misafir/.test(blob)) {
    copy = loc('Harika', 'Great', lang, 'Misafir', 'Guests');
  } else if (/daybed/.test(blob)) {
    copy = loc('Daybed', 'Daybed', lang, 'Rezervasyon', 'Reserve');
  } else if (/weekend|hafta.?sonu/.test(blob) && /book|rezerv|booking/.test(blob)) {
    copy = isHospitalityFood
      ? loc('Hafta Sonu', 'Weekend', lang, 'Rezervasyon', 'Reserve')
      : loc('Hafta Sonu', 'Weekend', lang, 'Gel', 'Come');
  } else if (/(^|_)(book|booking|rezerv)/.test(key) || /reservation_cta|rezervasyon/.test(blob)) {
    copy = loc('Rezervasyon', 'Reserve', lang, isHospitalityFood ? 'Masa' : 'Gel', isHospitalityFood ? 'Table' : 'Come');
  } else if (/chef_special|şef.?özel|sef.?ozel/.test(blob)) {
    copy = loc('Şef Özel', 'Chef Special', lang, 'Bugün', 'Today');
  } else if (/signature|imza.?tabak|imza.?yemek/.test(blob)) {
    copy = loc('İmza Tabak', 'Signature Dish', lang, 'Menü', 'Menu');
  } else if (/brunch|kahvalt|serpme/.test(blob)) {
    copy = loc('Kahvaltı', 'Breakfast', lang, 'Bahçe', 'Garden');
  } else if (/farm.?to.?table|çiftlik|bahçeden|bahceden/.test(blob)) {
    copy = loc('Bahçeden', 'Garden', lang, 'Sofraya', 'Table');
  } else if (/seasonal.?ingredient|mevsimsel.?malzeme|harvest/.test(blob)) {
    copy = loc('Mevsim', 'Season', lang, 'Taze', 'Fresh');
  } else if (/happy.?hour/.test(blob)) {
    copy = loc('Happy Hour', 'Happy Hour', lang, 'Bugün', 'Today');
  } else if (/private.?dining|özel.?yemek|ozel.?yemek/.test(blob)) {
    copy = loc('Özel Masa', 'Private Table', lang, 'Davet', 'Invite');
  } else if (/kitchen|mutfak|plating|bts/.test(blob)) {
    copy = loc('Mutfak', 'Kitchen', lang, 'Kulis', 'Backstage');
  } else if (/dining.?ambiance|yemek.?atmosfer|ambiance|atmosphere/.test(blob) && /venue|showcase|dining/.test(blob)) {
    copy = isHospitalityFood
      ? loc('Bahçe Sofrası', 'Garden Table', lang)
      : loc('Seni Bekliyoruz', 'Waiting For You', lang);
  } else if (/new.?menu|yeni.?menü|yeni.?menu|menu.?tasting|tadım/.test(blob)) {
    copy = loc('Yeni Menü', 'New Menu', lang, 'Tat', 'Taste');
  } else if (/menu.?highlight|menü.?öne|menu_highlight/.test(blob)) {
    copy = loc(
      isHospitalityFood ? 'Sofrada' : 'Öne Çıkan',
      isHospitalityFood ? 'On The Table' : 'Featured',
      lang,
      'Taze',
      'Fresh',
    );
  } else if (/cocktail|kokteyl|drink|bar|wine|şarap/.test(blob)) {
    copy = loc('İmza Kokteyl', 'Signature Cocktail', lang, 'Menü', 'Menu');
  } else if (/dj|night|gece|party|event_ticket/.test(blob) && !/restaurant_cafe/.test(key)) {
    copy = loc('DJ Night', 'DJ Night', lang, 'Bu Gece', 'Tonight');
  } else if (/live_music_event|canlı.?müzik|canli.?muzik/.test(blob)) {
    copy = loc('Canlı Müzik', 'Live Music', lang, 'Bu Gece', 'Tonight');
  } else if (/event_announcement|etkinlik.?duyuru|private_event/.test(blob)) {
    copy = loc('Bu Gece', 'Tonight', lang, 'Etkinlik', 'Event');
  } else if (/sunset|gün.?bat|golden/.test(blob)) {
    copy = loc('Gün Batımı', 'Sunset', lang, 'Altın Saat', 'Golden Hour');
  } else if (/aerial|havadan|drone/.test(blob)) {
    copy = loc('Atmosfer', 'Atmosphere', lang);
  } else if (/venue|mekan|showcase/.test(blob)) {
    copy = isHospitalityFood
      ? loc('Bahçede', 'In The Garden', lang)
      : loc('Seni Bekliyoruz', 'Waiting For You', lang);
  } else if (/menu|menü|food|seafood|product|dish|tabak/.test(blob)) {
    copy = loc(
      isHospitalityFood ? 'Sofrada' : 'Öne Çıkan',
      isHospitalityFood ? 'On The Table' : 'Featured',
      lang,
      'Taze',
      'Fresh',
    );
  } else if (/typography.?poster|tipografi/.test(blob)) {
    copy = loc(isHospitalityFood ? 'Lezzet' : 'Tipografi', isHospitalityFood ? 'Flavor' : 'Type', lang);
  } else if (/campaign|kampanya|offer|promo|seasonal|sezon/.test(blob)) {
    // Hospitality: never default to "Özel Kampanya" flyer language.
    copy = isHospitalityFood
      ? loc('Davet', 'Invite', lang, 'Bugün', 'Today')
      : loc('Özel Kampanya', 'Special Offer', lang, 'Sınırlı Süre', 'Limited');
  } else if (/bayram|özel.?gün/.test(blob)) {
    copy = loc('Mutlu Bayramlar', 'Happy Holidays', lang, 'Kutlama', 'Celebrate');
  } else if (type === 'event_special' && /event/.test(blob)) {
    copy = loc('Bu Gece', 'Tonight', lang, 'Etkinlik', 'Event');
  } else if (/daily|günaydın|kitchen_bts/.test(blob) && (type === 'daily_story' || /story/.test(blob))) {
    copy = loc(isHospitalityFood ? 'Bugün' : 'Günaydın', isHospitalityFood ? 'Today' : 'Good Morning', lang);
  } else if (/announcement|duyuru|formal/.test(blob)) {
    copy = loc('Duyuru', 'Notice', lang, 'Bilgi', 'Info');
  } else if (/reel|kapak/.test(blob)) {
    copy = loc(isHospitalityFood ? 'Lezzet' : 'İzle', isHospitalityFood ? 'Flavor' : 'Watch', lang);
  } else if (/brand_identity|kimlik/.test(blob)) {
    copy = loc('Marka', 'Brand', lang);
  }

  // Slot label beats still-generic type defaults when key matching was soft.
  const fromLabel = punchlineFromSlotLabel(input.slotLabel, lang);
  if (
    fromLabel
    && (
      !copy
      || /^(Özel Kampanya|Öne Çıkan|İzle|Keşfet|Davet|Special Offer|Featured|Watch|Discover|Invite)$/i.test(copy.headline)
    )
  ) {
    copy = fromLabel.subtitle || !copy?.subtitle
      ? fromLabel
      : { headline: fromLabel.headline, subtitle: copy.subtitle };
  }

  if (!copy) {
    copy = sampleCopyForTemplateType(type, isHospitalityFood, lang);
  }

  if (input.showSubline === false) {
    return { headline: copy.headline };
  }
  if (input.showSubline === true && !copy.subtitle) {
    const withSupport = sampleCopyForTemplateType(type, isHospitalityFood, lang);
    if (withSupport.subtitle) {
      return {
        headline: copy.headline,
        subtitle: fitSlotPunchline(withSupport.subtitle, MAX_SUBTITLE_WORDS, MAX_SUBTITLE_CHARS),
      };
    }
  }
  return copy;
}

function sampleCopyForTemplateType(
  templateType: string,
  hospitalityFood = false,
  language?: string | null,
): SlotSampleCopy {
  switch (templateType) {
    case 'social_proof':
      return loc('Harika', 'Great', language, 'Misafir', 'Guests');
    case 'venue_showcase':
      return hospitalityFood
        ? loc('Bahçede', 'In The Garden', language)
        : loc('Seni Bekliyoruz', 'Waiting For You', language);
    case 'menu_highlight':
      return loc(
        hospitalityFood ? 'Sofrada' : 'Öne Çıkan',
        hospitalityFood ? 'On The Table' : 'Featured',
        language,
        'Taze',
        'Fresh',
      );
    case 'campaign_announcement':
      return hospitalityFood
        ? loc('Davet', 'Invite', language, 'Bugün', 'Today')
        : loc('Özel Kampanya', 'Special Offer', language, 'Sınırlı Süre', 'Limited');
    case 'seasonal_promo':
      return loc(
        hospitalityFood ? 'Mevsim' : 'Yeni Sezon',
        hospitalityFood ? 'Season' : 'New Season',
        language,
        hospitalityFood ? 'Taze' : 'Özel',
        hospitalityFood ? 'Fresh' : 'Special',
      );
    case 'event_special':
      return loc('Mutlu Bayramlar', 'Happy Holidays', language, 'Kutlama', 'Celebrate');
    case 'daily_story':
      return loc(
        hospitalityFood ? 'Bugün' : 'Günaydın',
        hospitalityFood ? 'Today' : 'Good Morning',
        language,
      );
    case 'announcement_formal':
      return loc('Duyuru', 'Notice', language, 'Bilgi', 'Info');
    case 'reel_cover':
      return loc(hospitalityFood ? 'Lezzet' : 'İzle', hospitalityFood ? 'Flavor' : 'Watch', language);
    case 'brand_identity':
      return loc('Marka', 'Brand', language);
    default:
      return loc('Keşfet', 'Discover', language);
  }
}

function isCompleteOverlaySentence(headline: string): boolean {
  const words = headline.trim().split(/\s+/).filter(Boolean);
  return words.length >= 4 || /[!?.…]/.test(headline);
}

/** Prompt block — contracted headline + no overflow in reserved type zones. */
export function buildSlotCopyFitDirective(copy: SlotSampleCopy): string {
  const headline = String(copy.headline ?? '').trim();
  const words = headline.split(/\s+/).filter(Boolean);
  const complete = isCompleteOverlaySentence(headline);
  const sub = copy.subtitle?.trim();
  // Budget-only — brand type energy lives in BRAND SOUL / FONT·VIBE / recipe locks.
  return [
    '═══ COPY FIT (TEMPLATE LIBRARY) ═══',
    complete
      ? 'Paint ONLY the ON-CANVAS TEXT CONTRACT — the contracted headline as one complete line, not a caption paragraph.'
      : 'Paint ONLY the ON-CANVAS TEXT CONTRACT — short punchline lockup, not a caption paragraph.',
    complete
      ? `HEADLINE: paint every contracted word in order (${words.length} words). If the zone is tight, shrink type — NEVER drop the subject or keep only the last two words.`
      : `HEADLINE budget: max ${MAX_HEADLINE_WORDS} words / ~${MAX_HEADLINE_CHARS} chars — already contracted.`,
    sub
      ? `SUBLINE budget: max ${MAX_SUBTITLE_WORDS} words — support line in its reserved zone only.`
      : 'SUBLINE: OFF — do NOT invent a supporting line, tagline, or quote attribution.',
    'TYPE ZONE: every letter stays inside the reserved type area with ≥8% padding — NEVER clip, overflow, or spill onto busy photo mid.',
  ].join(' ');
}

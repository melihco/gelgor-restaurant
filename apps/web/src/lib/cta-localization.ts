/**
 * Caption / CTA language harmonization (safety net for auto-produce).
 * Mirrors backend/app/crew/cta_localization.py — keep in sync for key CTAs.
 */

const CTA_TR_TO_EN: Record<string, string> = {
  'hemen incele': 'Explore now',
  'detaylari incele': 'See details',
  'detayları incele': 'See details',
  detaylar: 'See details',
  'rezervasyon yap': 'Book now',
  'hemen rezervasyon': 'Book now',
  'masani ayir': 'Reserve a table',
  'masanı ayır': 'Reserve a table',
  'randevu al': 'Book an appointment',
  'yerini ayir': 'Save your spot',
  'yerini ayır': 'Save your spot',
  'yerini ayirt': 'Reserve your spot',
  'yerini ayırt': 'Reserve your spot',
  'hemen siparis ver': 'Order now',
  'hemen sipariş ver': 'Order now',
  'siparis ver': 'Order now',
  'sipariş ver': 'Order now',
  incele: 'Explore',
  'bizi ziyaret et': 'Visit us',
  'yolunu dusur': 'Stop by',
  'yolunu düşür': 'Stop by',
  'iletisime gec': 'Get in touch',
  'iletişime geç': 'Get in touch',
  'bilgi al': 'Get info',
  'bize katil': 'Join us',
  'bize katıl': 'Join us',
  'takip et': 'Follow us',
  'bugun dene': 'Try today',
  'bugün dene': 'Try today',
  'menuyu gor': 'View menu',
  'menüyü gör': 'View menu',
  kacirma: "Don't miss out",
  kaçırma: "Don't miss out",
  kesfet: 'Discover',
  keşfet: 'Discover',
  'daha fazla': 'Learn more',
};

const CTA_EN_TO_TR: Record<string, string> = {
  'explore now': 'Hemen incele',
  explore: 'İncele',
  'learn more': 'Detayları incele',
  'see details': 'Detayları incele',
  'discover more': 'Keşfet',
  discover: 'Keşfet',
  'book now': 'Rezervasyon yap',
  'reserve now': 'Rezervasyon yap',
  'reserve a table': 'Masanı ayır',
  'book an appointment': 'Randevu al',
  'save your spot': 'Yerini ayır',
  'reserve your spot': 'Yerini ayırt',
  'order now': 'Sipariş ver',
  'visit us': 'Bizi ziyaret et',
  'stop by': 'Yolunu düşür',
  'get in touch': 'İletişime geç',
  'contact us': 'İletişime geç',
  'get info': 'Bilgi al',
  'join us': 'Bize katıl',
  'follow us': 'Takip et',
  'try today': 'Bugün dene',
  'view menu': 'Menüyü gör',
  "don't miss out": 'Kaçırma',
  'dont miss out': 'Kaçırma',
  'check it out': 'Hemen incele',
};

const TR_FOLD: Record<string, string> = {
  İ: 'i', I: 'i', ı: 'i',
  Ö: 'o', ö: 'o',
  Ü: 'u', ü: 'u',
  Ş: 's', ş: 's',
  Ç: 'c', ç: 'c',
  Ğ: 'g', ğ: 'g',
};

function normalizeCtaKey(text: string): string {
  let s = text.trim();
  for (const [from, to] of Object.entries(TR_FOLD)) {
    s = s.split(from).join(to);
  }
  return s.toLowerCase().normalize('NFKD').replace(/\u0307/g, '');
}

function stripCtaPhrases(text: string): string {
  let cleaned = text;
  const phrases = [...Object.keys(CTA_TR_TO_EN), ...Object.keys(CTA_EN_TO_TR)];
  for (const phrase of phrases) {
    cleaned = cleaned.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  }
  return cleaned;
}

export function detectCtaLanguage(text: string): 'en' | 'tr' {
  const raw = text.trim();
  if (!raw) return 'en';

  const normKey = normalizeCtaKey(raw);
  if (normKey in CTA_TR_TO_EN) return 'tr';
  if (normKey in CTA_EN_TO_TR) return 'en';

  const sample = stripCtaPhrases(raw);
  const lower = ` ${sample.toLowerCase()} `;
  const enMarkers = [' the ', ' and ', ' your ', ' our ', ' discover ', ' why ', ' for ', ' with ', ' real ', ' about ', ' guests '];
  const enHits = enMarkers.filter((w) => lower.includes(w)).length;
  const trMarkers = [' bir ', ' ile ', ' için ', ' ve ', ' bu ', ' şimdi ', ' hemen '];
  const trHits = trMarkers.filter((w) => lower.includes(w)).length;

  if (enHits >= 2 && trHits <= 1) return 'en';
  if (trHits >= 2 && enHits <= 1) return 'tr';
  if (/[çğıöşüÇĞİÖŞÜ]/.test(sample) && enHits === 0) return 'tr';
  if (enHits >= 1) return 'en';
  return 'tr';
}

export function localizeCta(cta: string, targetLang: 'en' | 'tr'): string {
  const trimmed = cta.trim();
  if (!trimmed) return trimmed;
  const key = normalizeCtaKey(trimmed);
  if (targetLang === 'en') {
    if (detectCtaLanguage(trimmed) === 'en') return trimmed;
    return CTA_TR_TO_EN[key] ?? trimmed;
  }
  if (detectCtaLanguage(trimmed) === 'tr') return trimmed;
  return CTA_EN_TO_TR[key] ?? trimmed;
}

export function localizeCtas(ctas: string[], targetLang: 'en' | 'tr'): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of ctas) {
    const loc = localizeCta(String(c), targetLang);
    if (!loc || seen.has(loc.toLowerCase())) continue;
    seen.add(loc.toLowerCase());
    out.push(loc);
  }
  return out;
}

export function parseCtaList(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((c) => String(c).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((c) => String(c).trim()).filter(Boolean);
        }
      } catch {
        /* fall through */
      }
    }
    if (text.includes('|')) {
      return text.split('|').map((p) => p.trim()).filter(Boolean);
    }
    return [text];
  }
  return [];
}

/**
 * Pick a CTA from brand `default_ctas` in the brand content language.
 * Prefers native-language entries, else localizes known Turkish presets.
 */
export function pickLocalizedCta(
  ctas: unknown,
  brandLanguages?: unknown,
  fallback?: string,
): string {
  const target = resolveBrandLanguageCode(brandLanguages);
  const items = parseCtaList(ctas);
  if (items.length === 0) {
    if (fallback?.trim()) return localizeCta(fallback, target);
    return target === 'en' ? 'Learn more' : 'Daha fazla';
  }
  for (const c of items) {
    if (detectCtaLanguage(c) === target) return c;
  }
  const localized = localizeCtas(items, target);
  if (localized[0]) return localized[0];
  return localizeCta(items[0]!, target);
}

function replaceEmbeddedCta(text: string, oldCta: string, newCta: string): string {
  if (!text || !oldCta || !newCta || normalizeCtaKey(oldCta) === normalizeCtaKey(newCta)) return text;

  const direct = new RegExp(oldCta.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (direct.test(text)) return text.replace(direct, newCta.trim());

  const oldWords = oldCta.split(/\s+/);
  const textWords = text.split(/\s+/);
  const oldNorm = oldWords.map(normalizeCtaKey);
  for (let i = 0; i <= textWords.length - oldWords.length; i++) {
    const window = textWords.slice(i, i + oldWords.length);
    if (window.map(normalizeCtaKey).join(' ') === oldNorm.join(' ')) {
      textWords.splice(i, oldWords.length, newCta.trim());
      return textWords.join(' ');
    }
  }
  return text;
}

/** Normalize brand languages from string, comma-list, or string[] contract shape. */
export function normalizeBrandLanguagesInput(raw: unknown): string {
  if (raw == null) return 'tr';
  if (Array.isArray(raw)) {
    const first = raw.map((v) => String(v).trim()).find(Boolean);
    return first ?? 'tr';
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed || 'tr';
  }
  const coerced = String(raw).trim();
  return coerced || 'tr';
}

export function resolveBrandLanguageCode(raw: unknown): 'tr' | 'en' {
  const primary = normalizeBrandLanguagesInput(raw).split(',')[0]?.trim().toLowerCase() || 'tr';
  // Match Python resolve_language_code: "en", "en-US", "english", "eng"
  if (primary === 'en' || primary.startsWith('en-') || primary.startsWith('eng')) return 'en';
  return 'tr';
}

/** Align caption + CTA to brand language. Works even when caption is empty. */
export function harmonizeCaptionAndCta(
  caption: string,
  cta: string,
  brandLanguages?: unknown,
): { caption: string; cta: string } {
  const cap = caption.trim();
  const rawCta = cta.trim();
  if (!rawCta) return { caption: cap, cta: rawCta };

  const brandLang = resolveBrandLanguageCode(brandLanguages);
  const newCta = localizeCta(rawCta, brandLang);
  if (!newCta || normalizeCtaKey(newCta) === normalizeCtaKey(rawCta)) {
    return { caption: cap, cta: rawCta };
  }
  if (!cap) return { caption: cap, cta: newCta };
  return {
    caption: replaceEmbeddedCta(cap, rawCta, newCta),
    cta: newCta,
  };
}

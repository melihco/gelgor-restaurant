/**
 * Caption / CTA language harmonization (safety net for auto-produce).
 * Mirrors backend/app/crew/cta_localization.py — keep in sync for key CTAs.
 */

const CTA_TR_TO_EN: Record<string, string> = {
  'hemen incele': 'Explore now',
  'detaylari incele': 'See details',
  'detayları incele': 'See details',
  'rezervasyon yap': 'Book now',
  'yerini ayirt': 'Reserve your spot',
  'yerini ayırt': 'Reserve your spot',
  'siparis ver': 'Order now',
  'sipariş ver': 'Order now',
  'iletisime gec': 'Get in touch',
  'iletişime geç': 'Get in touch',
  'bize katil': 'Join us',
  'bize katıl': 'Join us',
  'takip et': 'Follow us',
  'bugun dene': 'Try today',
  'bugün dene': 'Try today',
  'menuyu gor': 'View menu',
  'menüyü gör': 'View menu',
  'kacirma': "Don't miss out",
  'kaçırma': "Don't miss out",
  'kesfet': 'Discover',
  'keşfet': 'Discover',
};

const CTA_EN_TO_TR: Record<string, string> = {
  'explore now': 'Hemen incele',
  'learn more': 'Detayları incele',
  'see details': 'Detayları incele',
  'discover more': 'Keşfet',
  discover: 'Keşfet',
  'book now': 'Rezervasyon yap',
  'reserve now': 'Rezervasyon yap',
  'reserve your spot': 'Yerini ayırt',
  'order now': 'Sipariş ver',
  'get in touch': 'İletişime geç',
  'contact us': 'İletişime geç',
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

function detectTextLanguage(text: string): 'en' | 'tr' {
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
    if (detectTextLanguage(trimmed) === 'en') return trimmed;
    return CTA_TR_TO_EN[key] ?? trimmed;
  }
  if (detectTextLanguage(trimmed) === 'tr') return trimmed;
  return CTA_EN_TO_TR[key] ?? trimmed;
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

/** Align caption + CTA to the same language (caption wins on mismatch). */
export function harmonizeCaptionAndCta(
  caption: string,
  cta: string,
  brandLanguages?: string | null,
): { caption: string; cta: string } {
  const cap = caption.trim();
  const rawCta = cta.trim();
  if (!cap || !rawCta) return { caption: cap, cta: rawCta };

  const capLang = detectTextLanguage(cap);
  const ctaLang = detectTextLanguage(rawCta);
  const brandLang = (brandLanguages ?? 'tr').split(',')[0]?.trim().toLowerCase() === 'en' ? 'en' : 'tr';
  const effectiveLang =
    capLang !== ctaLang ? capLang : cap.length > 40 ? capLang : brandLang;

  const newCta = localizeCta(rawCta, effectiveLang);
  if (!newCta || normalizeCtaKey(newCta) === normalizeCtaKey(rawCta)) {
    return { caption: cap, cta: rawCta };
  }
  return {
    caption: replaceEmbeddedCta(cap, rawCta, newCta),
    cta: newCta,
  };
}

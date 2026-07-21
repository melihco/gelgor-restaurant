/**
 * "Açıklama & Ürünler" field contract + synthesis helpers.
 *
 * Product expectation (agents + mission strategist):
 * 1) Short brand-about paragraph grounded in real discovery
 * 2) Explicit products/services catalog the brand actually sells
 *
 * Never invent venues, menus, prices, or offerings not supported by signals.
 */

export type AiBrandDescriptionLanguage = 'tr' | 'en';

export type AiBrandDescriptionSignals = {
  brandName: string;
  industry?: string;
  location?: string;
  websiteSummary?: string;
  instagramBio?: string;
  googleDescription?: string;
  targetAudience?: string;
  brandTone?: string;
  contentPillars?: string[];
  defaultCtas?: string[];
  /** Concrete offerings from brand_service_profile or analysis. */
  signatureOfferings?: string[];
  language?: AiBrandDescriptionLanguage;
};

const NAV_JUNK_RE =
  /^(anasayfa|hoş\s*geldiniz|welcome|home|menu|menü|iletişim|contact|hakkımızda|about|blog|giriş|login)\b/i;
const META_LABEL_RE =
  /^(hedef kitle|marka tonu|görsel dünya|içerik üretiminde|kampanya ve cta|instagram bio)\s*:/i;

export const BRAND_DESCRIPTION_FIELD_CONTRACT_TR = [
  'Alan: Marka açıklaması + ürün/hizmet kataloğu (tek metin).',
  'Bölüm 1 — Açıklama: 2–4 cümle; kim, nerede, ne sunuyor; keşif sinyallerine dayalı.',
  'Bölüm 2 — Ürünler / Hizmetler: 3–8 madde; somut teklifler (menü, deneyim, paket, ürün).',
  'Uydurma yasak: keşifte olmayan ürün, fiyat, adres, ödül yazma.',
  'Ton: profesyonel, akıcı, yazım hatası yok; crawl/nav metni yapıştırma.',
].join(' ');

export const BRAND_DESCRIPTION_FIELD_CONTRACT_EN = [
  'Field: brand about + products/services catalog (single text).',
  'Part 1 — About: 2–4 sentences; who, where, what they offer; grounded in discovery.',
  'Part 2 — Products / Services: 3–8 bullets; concrete offers only.',
  'No invention: do not invent products, prices, awards, or addresses.',
  'Tone: professional, fluent, no crawl/nav paste.',
].join(' ');

function cleanLine(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Drop nav crumbs, meta labels, and ultra-short noise from discovery blobs. */
export function sanitizeDiscoveryText(raw: string | undefined | null, maxLen = 1200): string {
  const text = String(raw ?? '').replace(/\r/g, '').trim();
  if (!text) return '';

  const parts = text
    .split(/\n+|(?<=[.!?…])\s+/)
    .map(cleanLine)
    .filter((line) => {
      if (line.length < 28) return false;
      if (NAV_JUNK_RE.test(line)) return false;
      if (META_LABEL_RE.test(line)) return false;
      if (/^https?:\/\//i.test(line)) return false;
      return true;
    });

  const joined = (parts.length ? parts : [cleanLine(text)]).join(' ').trim();
  return joined.slice(0, maxLen);
}

function uniqueLines(items: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = cleanLine(String(item ?? ''));
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function inferOfferings(input: AiBrandDescriptionSignals): string[] {
  if (input.signatureOfferings?.length) {
    return uniqueLines(input.signatureOfferings).slice(0, 8);
  }

  const hay = [
    input.websiteSummary,
    input.instagramBio,
    input.googleDescription,
    ...(input.contentPillars ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const candidates: Array<[RegExp, string, string]> = [
    [/plaj|beach|şezlong|seating|cabana/, 'Plaj & şezlong deneyimi', 'Beach & sunbed experience'],
    [/havuz|pool/, 'Havuz alanı', 'Pool area'],
    [/restoran|mutfak|kitchen|dining|yemek/, 'Restoran / mutfak', 'Restaurant / kitchen'],
    [/bar|kokteyl|cocktail|içki/, 'Bar & kokteyl', 'Bar & cocktails'],
    [/dj|live\s*music|canlı\s*müzik|etkinlik|event|party/, 'Müzik & etkinlikler', 'Music & events'],
    [/su\s*spor|water\s*sport|wakeboard|jetski/, 'Su sporları', 'Water sports'],
    [/kahvaltı|breakfast|brunch/, 'Kahvaltı / brunch', 'Breakfast / brunch'],
    [/spa|masaj|wellness|bakım/, 'Spa & wellness', 'Spa & wellness'],
    [/konaklama|otel|oda|suite|accommodation/, 'Konaklama', 'Accommodation'],
    [/ürün|product|hediyelik|retail|shop/, 'Ürün / perakende', 'Products / retail'],
  ];

  const lang = input.language === 'en' ? 'en' : 'tr';
  const found: string[] = [];
  for (const [re, tr, en] of candidates) {
    if (re.test(hay)) found.push(lang === 'en' ? en : tr);
  }
  return found.slice(0, 6);
}

/**
 * Deterministic fallback when LLM is unavailable.
 * Still follows the about + offerings shape (no raw crawl dump).
 */
export function buildAiBrandDescriptionFallback(input: AiBrandDescriptionSignals): string {
  const lang = input.language === 'en' ? 'en' : 'tr';
  const name = cleanLine(input.brandName) || (lang === 'en' ? 'This brand' : 'Bu marka');
  const industry = cleanLine(input.industry) || (lang === 'en' ? 'local business' : 'yerel işletme');
  const location = cleanLine(input.location);
  const aboutSource =
    sanitizeDiscoveryText(input.websiteSummary, 520)
    || sanitizeDiscoveryText(input.googleDescription, 420)
    || sanitizeDiscoveryText(input.instagramBio, 320);

  const intro =
    lang === 'en'
      ? `${name}${location ? ` in ${location}` : ''} is a ${industry.replace(/_/g, ' ')} brand.`
      : `${name}${location ? `, ${location}` : ''} konumunda faaliyet gösteren bir ${industry.replace(/_/g, ' ')} markasıdır.`;

  const about = aboutSource
    ? `${intro} ${aboutSource}`
    : intro;

  const offerings = inferOfferings(input);
  if (!offerings.length) {
    return about.slice(0, 1900);
  }

  const heading = lang === 'en' ? 'Products / Services:' : 'Ürünler / Hizmetler:';
  const body = [about.trim(), '', heading, ...offerings.map((o) => `- ${o}`)].join('\n');
  return body.slice(0, 1900);
}

export function buildSynthesizeDescriptionSystemPrompt(language: AiBrandDescriptionLanguage): string {
  const contract =
    language === 'en' ? BRAND_DESCRIPTION_FIELD_CONTRACT_EN : BRAND_DESCRIPTION_FIELD_CONTRACT_TR;
  return [
    language === 'en'
      ? 'You write brand-profile copy for a multi-tenant marketing OS.'
      : 'Sen çok kiracılı bir pazarlama sistemi için marka profil metni yazarsın.',
    contract,
    language === 'en'
      ? 'Return ONLY the final field text. No markdown fences, no preamble.'
      : 'Yalnızca nihai alan metnini döndür. Markdown çiti veya ön söz ekleme.',
  ].join(' ');
}

export function buildSynthesizeDescriptionUserPrompt(input: AiBrandDescriptionSignals): string {
  const lang = input.language === 'en' ? 'en' : 'tr';
  const offerings = uniqueLines(input.signatureOfferings).slice(0, 10);
  const lines = [
    `Language: ${lang === 'en' ? 'English' : 'Turkish'}`,
    `Brand: ${cleanLine(input.brandName) || '—'}`,
    `Sector/type: ${cleanLine(input.industry) || '—'}`,
    `Location: ${cleanLine(input.location) || '—'}`,
    `Website summary (sanitized): ${sanitizeDiscoveryText(input.websiteSummary) || '—'}`,
    `Instagram bio: ${sanitizeDiscoveryText(input.instagramBio, 400) || '—'}`,
    `Google description: ${sanitizeDiscoveryText(input.googleDescription, 400) || '—'}`,
    `Target audience: ${cleanLine(input.targetAudience) || '—'}`,
    `Tone: ${cleanLine(input.brandTone) || '—'}`,
    input.contentPillars?.length
      ? `Content pillars: ${input.contentPillars.slice(0, 8).join(', ')}`
      : 'Content pillars: —',
    offerings.length ? `Known offerings: ${offerings.join('; ')}` : 'Known offerings: —',
    '',
    lang === 'en'
      ? 'Write the Açıklama & Ürünler field now, using only supported facts.'
      : 'Şimdi Açıklama & Ürünler alanını, yalnızca desteklenen gerçeklerle yaz.',
  ];
  return lines.join('\n');
}

/** Normalize model output into the expected two-part shape when possible. */
export function normalizeSynthesizedBrandDescription(
  raw: string,
  language: AiBrandDescriptionLanguage = 'tr',
): string {
  let text = String(raw ?? '')
    .replace(/^```(?:text|markdown)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  // Strip accidental meta preambles.
  text = text
    .replace(/^(here is|işte|aşağıda)[^\n]*\n+/i, '')
    .trim();

  if (!text) return '';

  const hasOfferHeading =
    /ürünler\s*\/\s*hizmetler\s*:/i.test(text)
    || /products\s*\/\s*services\s*:/i.test(text);

  if (!hasOfferHeading) {
    // If model returned only bullets, keep them under the heading.
    const bulletLines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-•*]\s+/.test(l));
    if (bulletLines.length >= 3 && text.length < 500) {
      const heading = language === 'en' ? 'Products / Services:' : 'Ürünler / Hizmetler:';
      const aboutGuess = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^[-•*]\s+/.test(l))
        .join(' ')
        .trim();
      text = [aboutGuess, '', heading, ...bulletLines.map((l) => l.replace(/^[-•*]\s+/, '- '))]
        .filter(Boolean)
        .join('\n');
    }
  }

  return text.slice(0, 1900);
}

export function isStructuredBrandDescription(text: string): boolean {
  const t = text.trim();
  if (t.length < 60) return false;
  const hasOffer =
    /ürünler\s*\/\s*hizmetler\s*:/i.test(t)
    || /products\s*\/\s*services\s*:/i.test(t)
    || (t.match(/^[-•*]\s+/gm) ?? []).length >= 3;
  const looksLikeCrawlDump =
    /instagram bio\s*:/i.test(t)
    || /hedef kitle\s*:/i.test(t)
    || /kampanya ve cta/i.test(t);
  return hasOffer && !looksLikeCrawlDump;
}

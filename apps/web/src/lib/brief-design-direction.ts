/**
 * "+" (Yeni İstek) — owner-driven production vocabulary.
 *
 * The owner tells us *what* (prompt), *why* (goal), *how it should feel*
 * (design direction) and the hard facts (details). Everything here is
 * sector-agnostic: the painter receives directives, the caption receives the
 * facts, and the card is designed freeform from brand DNA — no template lock.
 */

export type BriefGoalId =
  | 'announce'
  | 'promo'
  | 'new_item'
  | 'event'
  | 'hiring'
  | 'celebration'
  | 'social_proof'
  | 'tip';

export interface BriefGoal {
  id: BriefGoalId;
  label: string;
  /** Default on-canvas call to action (brand language resolved later). */
  defaultCta: { tr: string; en: string };
  /** Painter-facing purpose line. */
  directive: string;
  /** Regex on the owner prompt for auto-suggestion. */
  match: RegExp;
}

export const BRIEF_GOALS: BriefGoal[] = [
  {
    id: 'announce',
    label: 'Duyuru',
    defaultCta: { tr: 'Detaylar için DM', en: 'DM for details' },
    directive: 'PURPOSE: announcement — one clear message, calm hierarchy, the fact is the hero.',
    match: /duyur|açıl|açık|kapalı|saat|artık|yeni adres|taşın|announce|open|hours/i,
  },
  {
    id: 'promo',
    label: 'Kampanya',
    defaultCta: { tr: 'Fırsatı yakala', en: 'Grab the offer' },
    directive: 'PURPOSE: offer / campaign — price or benefit must be legible at a glance, still brand-true (no discount-sticker clutter).',
    match: /indirim|kampanya|fırsat|%|tl\b|₺|fiyat|promo|offer|discount|sale|deal/i,
  },
  {
    id: 'new_item',
    label: 'Yeni ürün',
    defaultCta: { tr: 'Şimdi dene', en: 'Try it now' },
    directive: 'PURPOSE: new product / menu item reveal — the item is the hero, generous space around it, appetite or desire first.',
    match: /yeni|menü|ürün|lezzet|tat|çeşit|koleksiyon|new|launch|menu|product|arrival/i,
  },
  {
    id: 'event',
    label: 'Etkinlik',
    defaultCta: { tr: 'Rezervasyon', en: 'Reserve' },
    directive: 'PURPOSE: event — date/time/place read instantly, energy matches the event, one image carries the mood.',
    match: /etkinlik|gece|dj|konser|parti|canlı müzik|atölye|workshop|event|night|party|live|festival/i,
  },
  {
    id: 'hiring',
    label: 'İşe alım',
    defaultCta: { tr: 'Başvur', en: 'Apply' },
    directive: 'PURPOSE: hiring — warm and human, the role is clear, brand pride without corporate stiffness.',
    match: /aranıyor|arıyoruz|işe alım|ekibimize|ekip arkadaşı|başvur|iş ilanı|personel|hiring|join our team|apply|we're hiring/i,
  },
  {
    id: 'celebration',
    label: 'Kutlama',
    defaultCta: { tr: 'Kutlu olsun', en: 'Celebrate with us' },
    directive: 'PURPOSE: celebration / special day — festive but restrained, brand palette over holiday clichés.',
    match: /bayram|kutlu|yılbaşı|yıl dönümü|anneler|babalar|sevgililer|kutlama|tebrik|holiday|anniversary|happy/i,
  },
  {
    id: 'social_proof',
    label: 'Müşteri sesi',
    defaultCta: { tr: 'Siz de anlatın', en: 'Share yours' },
    directive: 'PURPOSE: social proof — a quote or rating is the visual centre, typography does the talking.',
    match: /yorum|müşteri|misafir|teşekkür|puan|değerlendirme|review|guest|testimonial|thank/i,
  },
  {
    id: 'tip',
    label: 'Bilgi / ipucu',
    defaultCta: { tr: 'Kaydet', en: 'Save this' },
    directive: 'PURPOSE: tip / know-how — editorial, readable, numbered or single-fact layout; useful over salesy.',
    match: /nasıl|ipucu|bilgi|öneri|püf|tarif|neden|how to|tip|guide|recipe|why/i,
  },
];

export type BriefDesignDirectionId =
  | 'brand'
  | 'editorial'
  | 'bold'
  | 'minimal'
  | 'warm'
  | 'luxury';

export interface BriefDesignDirection {
  id: BriefDesignDirectionId;
  label: string;
  desc: string;
  /** Painter directive — layered on top of brand DNA, never replacing it. */
  directive: string;
}

export const BRIEF_DESIGN_DIRECTIONS: BriefDesignDirection[] = [
  {
    id: 'brand',
    label: 'Marka çizgisi',
    desc: 'Markanın kendi görünümü',
    directive: 'DESIGN DIRECTION: the brand\'s own house look — palette, type feel and margins exactly as the brand identity describes.',
  },
  {
    id: 'editorial',
    label: 'Editoryal',
    desc: 'Dergi sayfası gibi, sakin',
    directive: 'DESIGN DIRECTION: editorial magazine page — light serif or quiet sans, generous whitespace, hairline rules, photo carries 70%.',
  },
  {
    id: 'bold',
    label: 'Cesur',
    desc: 'Büyük yazı, güçlü kontrast',
    directive: 'DESIGN DIRECTION: bold campaign — oversized headline, strong contrast panel in a brand colour, tight crop; still no sticker bursts.',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    desc: 'Tek mesaj, çok boşluk',
    directive: 'DESIGN DIRECTION: minimal — one short line, one photo, nothing else; small logo, large air, hairline at most.',
  },
  {
    id: 'warm',
    label: 'Sıcak',
    desc: 'Samimi, el yapımı his',
    directive: 'DESIGN DIRECTION: warm & intimate — soft natural light, cream or paper tones, friendly sentence-case type, handmade feel.',
  },
  {
    id: 'luxury',
    label: 'Lüks',
    desc: 'Koyu zemin, ince serif',
    directive: 'DESIGN DIRECTION: luxury — deep dark or ink ground, thin high-contrast serif, gold/metallic accent used once, museum-quiet composition.',
  },
];

export interface BriefDetails {
  date?: string;
  time?: string;
  price?: string;
  cta?: string;
  location?: string;
  link?: string;
}

export function isBriefGoalId(v: unknown): v is BriefGoalId {
  return typeof v === 'string' && BRIEF_GOALS.some((g) => g.id === v);
}

export function isBriefDesignDirectionId(v: unknown): v is BriefDesignDirectionId {
  return typeof v === 'string' && BRIEF_DESIGN_DIRECTIONS.some((d) => d.id === v);
}

/**
 * Alternate looks for "pick one" variants — deterministic, never repeats the
 * owner's pick, and always leads with the two most contrasting houses so two
 * variants never look like the same card twice.
 */
export function pickAlternateDesignDirections(
  chosen: BriefDesignDirectionId | null | undefined,
  n: number,
): BriefDesignDirectionId[] {
  const base: BriefDesignDirectionId = chosen ?? 'brand';
  const contrast: Record<BriefDesignDirectionId, BriefDesignDirectionId[]> = {
    brand: ['editorial', 'bold', 'minimal', 'warm', 'luxury'],
    editorial: ['bold', 'brand', 'luxury', 'minimal', 'warm'],
    bold: ['editorial', 'minimal', 'brand', 'luxury', 'warm'],
    minimal: ['bold', 'warm', 'brand', 'editorial', 'luxury'],
    warm: ['minimal', 'luxury', 'brand', 'editorial', 'bold'],
    luxury: ['warm', 'bold', 'brand', 'editorial', 'minimal'],
  };
  return contrast[base].slice(0, Math.max(0, n));
}

export function briefGoalLabel(id: BriefGoalId | null | undefined): string | null {
  return BRIEF_GOALS.find((g) => g.id === id)?.label ?? null;
}

export function briefDesignDirectionLabel(id: BriefDesignDirectionId | null | undefined): string | null {
  return BRIEF_DESIGN_DIRECTIONS.find((d) => d.id === id)?.label ?? null;
}

/** Best-guess goal from the owner's prompt — a suggestion the UI can preselect. */
export function suggestBriefGoal(text: string): BriefGoalId | null {
  const hay = String(text ?? '').trim();
  if (hay.length < 3) return null;
  // Order matters: promo (price) beats new_item, event beats announce.
  const order: BriefGoalId[] = ['promo', 'event', 'hiring', 'celebration', 'social_proof', 'tip', 'new_item', 'announce'];
  for (const id of order) {
    const g = BRIEF_GOALS.find((x) => x.id === id)!;
    if (g.match.test(hay)) return id;
  }
  return null;
}

export function sanitizeBriefDetails(raw: unknown): BriefDetails {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const pick = (k: keyof BriefDetails, max: number) => {
    const v = String(r[k] ?? '').trim().replace(/\s+/g, ' ');
    return v ? v.slice(0, max) : undefined;
  };
  return {
    date: pick('date', 40),
    time: pick('time', 24),
    price: pick('price', 32),
    cta: pick('cta', 40),
    location: pick('location', 60),
    link: pick('link', 120),
  };
}

/**
 * One on-canvas subline from the facts: "12 Eylül · 21:00 · İskele" — the
 * painter renders it as contracted text, so it must be short and exact.
 */
export function buildBriefDetailSubline(details: BriefDetails): string {
  const parts = [details.date, details.time, details.price, details.location]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean);
  return parts.join(' · ').slice(0, 80);
}

/** Facts appended to the caption so copy never contradicts the card. */
export function buildBriefDetailCaptionTail(details: BriefDetails, locale: 'tr' | 'en' = 'tr'): string {
  const lines: string[] = [];
  const when = [details.date, details.time].filter(Boolean).join(' · ');
  if (when) lines.push(locale === 'tr' ? `📅 ${when}` : `📅 ${when}`);
  if (details.location) lines.push(`📍 ${details.location}`);
  if (details.price) lines.push(locale === 'tr' ? `💰 ${details.price}` : `💰 ${details.price}`);
  if (details.link) lines.push(`🔗 ${details.link}`);
  return lines.join('\n');
}

/** Painter directives for an owner brief — layered on brand DNA + art direction. */
export function buildBriefDesignDirectives(input: {
  goal?: BriefGoalId | null;
  designDirection?: BriefDesignDirectionId | null;
  details?: BriefDetails | null;
}): string[] {
  const out: string[] = [];
  const dir = BRIEF_DESIGN_DIRECTIONS.find((d) => d.id === input.designDirection);
  if (dir) out.push(dir.directive);
  const goal = BRIEF_GOALS.find((g) => g.id === input.goal);
  if (goal) out.push(goal.directive);
  const subline = input.details ? buildBriefDetailSubline(input.details) : '';
  if (subline) out.push(`ON-CANVAS FACTS (verbatim, small secondary line): "${subline}"`);
  const cta = String(input.details?.cta ?? '').trim();
  if (cta) out.push(`ON-CANVAS CTA (verbatim, one short button or line): "${cta.slice(0, 40)}"`);
  return out;
}

export function resolveBriefCta(
  goal: BriefGoalId | null | undefined,
  explicit: string | undefined,
  locale: 'tr' | 'en' = 'tr',
): string | undefined {
  const e = String(explicit ?? '').trim();
  if (e) return e.slice(0, 40);
  const g = BRIEF_GOALS.find((x) => x.id === goal);
  return g ? g.defaultCta[locale] : undefined;
}

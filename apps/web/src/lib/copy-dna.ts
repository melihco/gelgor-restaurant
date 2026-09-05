/**
 * Tenant copy DNA — overlay headline / CTA voice.
 * Tenant brand_theme.copy_dna wins; otherwise sector defaults. No brand-name branches.
 */

import { detectOverlayLocale } from '@/lib/fal-caption-headline';
import { localizeCta } from '@/lib/cta-localization';
import { strategistHeadlineKey } from '@/lib/production-pipeline-router';
import { normalizeSectorId } from '@/lib/sector-production-profile';

export type CopyDnaLocale = 'tr' | 'en' | 'auto';

export interface BrandCopyDna {
  voice: string[];
  locale: CopyDnaLocale;
  bannedStems: string[];
  proofNouns: string[];
  fallbackHeadlineTr: string;
  fallbackHeadlineEn: string;
  bannedCtas: string[];
}

const SHARED_BANNED_EN = [
  'experience',
  'atmosphere',
  'breathtaking',
  'vibrant',
  'ultimate comfort',
  'magical sunset',
  'join us for',
  'discover our',
  'elevate your',
  'exclusive hospitality',
];

const SHARED_BANNED_TR = [
  'sizi bekliyoruz',
  'kaçırmayın',
  'mutlaka deneyin',
  'fırsatlar sizi',
  'lezzetin adresi',
  'güvenilirliğinizi artırın',
];

const SECTOR_COPY_DNA: Record<string, BrandCopyDna> = {
  restaurant_cafe: {
    voice: ['precise', 'hushed', 'plated'],
    locale: 'auto',
    bannedStems: [...SHARED_BANNED_EN, ...SHARED_BANNED_TR, 'elegance in our'],
    proofNouns: ['sofra', 'tabak', 'şef', 'hamachi', 'omakase'],
    fallbackHeadlineTr: 'Sofra konuşsun.',
    fallbackHeadlineEn: 'Let the plate talk.',
    bannedCtas: ['hızlanın', 'hemen tıklayın'],
  },
  beach_club: {
    voice: ['laid-back', 'local', 'salty'],
    locale: 'auto',
    bannedStems: [...SHARED_BANNED_EN, ...SHARED_BANNED_TR, 'beach family', 'hard-working team'],
    proofNouns: ['gün batımı', 'şezlong', 'rüzgar', 'bitez', 'kokteyl'],
    fallbackHeadlineTr: 'Güneş inmeden gel.',
    fallbackHeadlineEn: 'Catch it before it drops.',
    bannedCtas: ['hızlanın', 'hemen tıklayın'],
  },
  local_products_shop: {
    voice: ['samimi', 'concrete', 'batch'],
    locale: 'auto',
    bannedStems: [
      ...SHARED_BANNED_EN,
      ...SHARED_BANNED_TR,
      'taze ve doğal lezzetler',
      'doğal ürünlerin hikayesi',
      'doğal ürünlerimizi keşfedin',
      'eşsiz bir süreç',
      'bizi tercih edin',
    ],
    proofNouns: ['erken hasat', 'zeytinyağı', 'parti', 'datça'],
    fallbackHeadlineTr: 'Bu parti bitince yok.',
    fallbackHeadlineEn: 'This batch does not come back.',
    bannedCtas: ['hızlanın', 'detaylar linkte'],
  },
  coffee_shop: {
    voice: ['warm', 'daily', 'aromatic'],
    locale: 'auto',
    bannedStems: [...SHARED_BANNED_EN, ...SHARED_BANNED_TR, 'perfect cup'],
    proofNouns: ['espresso', 'demleme', 'filitre', 'süt'],
    fallbackHeadlineTr: 'Kahve konuşsun, sen otur.',
    fallbackHeadlineEn: 'Sit. Let the cup talk.',
    bannedCtas: ['hızlanın'],
  },
  beauty_wellness: {
    voice: ['calm', 'clinical', 'intimate'],
    locale: 'tr',
    bannedStems: [...SHARED_BANNED_EN, ...SHARED_BANNED_TR, 'güvenilirlik'],
    proofNouns: ['cilt', 'hydrafacial', 'bakım', 'ayna'],
    fallbackHeadlineTr: 'Cildin bugün ne istiyor?',
    fallbackHeadlineEn: 'What does your skin want today?',
    bannedCtas: ['hızlanın', 'hemen tıklayın', 'kaçırmayın'],
  },
};

const DEFAULT_COPY_DNA: BrandCopyDna = {
  voice: ['clear', 'human', 'short'],
  locale: 'auto',
  bannedStems: [...SHARED_BANNED_EN, ...SHARED_BANNED_TR],
  proofNouns: [],
  fallbackHeadlineTr: 'Gel. Gör. Kal.',
  fallbackHeadlineEn: 'Come closer.',
  bannedCtas: ['hızlanın', 'hemen tıklayın'],
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function parseThemeCopyDna(theme: Record<string, unknown> | null | undefined): Partial<BrandCopyDna> {
  const raw = theme?.copy_dna ?? theme?.copyDna;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const rec = raw as Record<string, unknown>;
  const localeRaw = String(rec.locale ?? '').toLowerCase();
  const locale: CopyDnaLocale | undefined =
    localeRaw === 'tr' || localeRaw === 'en' || localeRaw === 'auto' ? localeRaw : undefined;
  return {
    voice: asStringArray(rec.voice).slice(0, 6),
    locale,
    bannedStems: asStringArray(rec.banned_stems ?? rec.bannedStems),
    proofNouns: asStringArray(rec.proof_nouns ?? rec.proofNouns),
    fallbackHeadlineTr: String(rec.fallback_headline_tr ?? rec.fallbackHeadlineTr ?? '').trim() || undefined,
    fallbackHeadlineEn: String(rec.fallback_headline_en ?? rec.fallbackHeadlineEn ?? '').trim() || undefined,
    bannedCtas: asStringArray(rec.banned_ctas ?? rec.bannedCtas),
  };
}

export function sectorCopyDna(sector: string | null | undefined): BrandCopyDna {
  const id = normalizeSectorId(sector);
  return SECTOR_COPY_DNA[id] ?? DEFAULT_COPY_DNA;
}

export function resolveCopyDna(input: {
  brandTheme?: Record<string, unknown> | null;
  sector?: string | null;
  language?: string | null;
}): BrandCopyDna {
  const base = sectorCopyDna(input.sector);
  const override = parseThemeCopyDna(input.brandTheme);
  const language = String(input.language ?? '').toLowerCase();
  const localeFromLang: CopyDnaLocale | undefined =
    language.startsWith('en') ? 'en' : language.startsWith('tr') ? 'tr' : undefined;
  return {
    voice: override.voice?.length ? override.voice : base.voice,
    locale: override.locale ?? localeFromLang ?? base.locale,
    bannedStems: [...new Set([...base.bannedStems, ...(override.bannedStems ?? [])])],
    proofNouns: [...new Set([...base.proofNouns, ...(override.proofNouns ?? [])])],
    fallbackHeadlineTr: override.fallbackHeadlineTr || base.fallbackHeadlineTr,
    fallbackHeadlineEn: override.fallbackHeadlineEn || base.fallbackHeadlineEn,
    bannedCtas: [...new Set([...base.bannedCtas, ...(override.bannedCtas ?? [])])],
  };
}

function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

export function isBrochureOverlay(text: string, dna?: BrandCopyDna): boolean {
  const folded = fold(text);
  if (!folded) return false;
  const stems = dna?.bannedStems ?? DEFAULT_COPY_DNA.bannedStems;
  return stems.some((stem) => folded.includes(fold(stem)));
}

/** Telegraphic / missing-function-word English — "Get glimpse hardworking". */
export function isBrokenEnglishOverlay(text: string): boolean {
  const raw = text.trim();
  if (!raw || /[çğıöşüÇĞİÖŞÜ]/.test(raw)) return false;
  if (detectOverlayLocale(raw) !== 'en' && !/^[A-Za-z][A-Za-z\s'-]{6,}$/.test(raw)) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false;
  const functionWords = new Set(['the', 'a', 'an', 'our', 'your', 'to', 'for', 'of', 'in', 'on', 'with']);
  const hasFunction = words.some((w) => functionWords.has(w.toLowerCase()));
  const looksStemmed = words.filter((w) => /^[A-Za-z]{5,}$/.test(w)).length >= 2;
  return !hasFunction && looksStemmed;
}

function resolveTargetLocale(headline: string, caption: string, dna: BrandCopyDna): 'tr' | 'en' {
  if (dna.locale === 'tr' || dna.locale === 'en') return dna.locale;
  const fromHeadline = detectOverlayLocale(headline);
  if (fromHeadline === 'tr' || fromHeadline === 'en') return fromHeadline;
  const fromCaption = detectOverlayLocale(caption);
  if (fromCaption === 'tr' || fromCaption === 'en') return fromCaption;
  return 'tr';
}

function fallbackForLocale(dna: BrandCopyDna, locale: 'tr' | 'en'): string {
  return locale === 'en' ? dna.fallbackHeadlineEn : dna.fallbackHeadlineTr;
}

function captionHook(caption: string, maxLen: number, dna: BrandCopyDna): string {
  const clause = caption
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .find((s) => s.length >= 8 && !isBrochureOverlay(s, dna) && !isBrokenEnglishOverlay(s));
  if (!clause) return '';
  const words = clause.replace(/[#@]/g, '').split(/\s+/).filter(Boolean).slice(0, 7);
  const line = words.join(' ').replace(/[,:;]+$/, '').trim();
  return line.slice(0, maxLen);
}

export function applyCopyDnaHeadline(input: {
  headline: string;
  caption?: string;
  brandName: string;
  dna: BrandCopyDna;
  recentKeys?: Set<string>;
  maxLen?: number;
}): { headline: string; replaced: boolean; reason?: string } {
  const maxLen = input.maxLen ?? 48;
  let headline = input.headline.trim();
  const caption = (input.caption ?? '').trim();
  const locale = resolveTargetLocale(headline, caption, input.dna);
  const keyOf = (text: string) => strategistHeadlineKey({ headline: text });

  const replace = (next: string, reason: string) => {
    const clipped = next.trim().slice(0, maxLen);
    return { headline: clipped, replaced: true, reason };
  };

  const needsVoice =
    !headline
    || isBrochureOverlay(headline, input.dna)
    || isBrokenEnglishOverlay(headline);

  if (needsVoice) {
    const hook = captionHook(caption, maxLen, input.dna);
    if (
      hook
      && !isBrochureOverlay(hook, input.dna)
      && !isBrokenEnglishOverlay(hook)
      && hook.toLowerCase() !== headline.toLowerCase()
    ) {
      return replace(hook, 'copy_dna_caption_hook');
    }
    return replace(fallbackForLocale(input.dna, locale), 'copy_dna_fallback');
  }

  const key = keyOf(headline);
  if (key && input.recentKeys?.has(key)) {
    const hook = captionHook(caption, maxLen, input.dna);
    if (hook && keyOf(hook) !== key && !isBrochureOverlay(hook, input.dna)) {
      return replace(hook, 'copy_dna_recent_dup');
    }
    const alt = fallbackForLocale(input.dna, locale);
    if (keyOf(alt) !== key) return replace(alt, 'copy_dna_recent_dup');
  }

  return { headline, replaced: false };
}

export function lockOverlayCta(input: {
  headline: string;
  cta: string;
  caption?: string;
  dna: BrandCopyDna;
}): string {
  const locale = resolveTargetLocale(input.headline, input.caption ?? '', input.dna);
  let cta = (input.cta ?? '').trim();
  if (!cta) return locale === 'en' ? 'See you there' : 'Gel';
  const folded = fold(cta);
  if (input.dna.bannedCtas.some((ban) => folded.includes(fold(ban)))) {
    cta = locale === 'en' ? 'Book a visit' : 'Randevu bırak';
  }
  return localizeCta(cta, locale);
}

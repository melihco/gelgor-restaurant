/**
 * Production headline QA — reject brand-echo / grammatical-suffix hooks
 * (e.g. "Kaçta Info'yu") and recover a punchy line from ideation caption.
 */
import {
  isIncompleteOverlayPhrase,
  isInternalStrategyBriefing,
} from './fal-caption-headline';
import { enforceDisplayHeadline } from './remotion-quality';
import { isVisionAnalysisDescription, isGalleryTagHeadline } from './vision-text-guard';
import { isNonVenueSector } from './sector-gallery-seed';
import { isNonVenueSectorProfile } from './sector-production-profile';

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`´]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip Turkish possessive/accusative suffixes for token comparison. */
function stripMorphSuffix(token: string): string {
  return token.replace(/(?:'?(?:yı|yi|yu|yü|ya|ye|sı|si|su|sü|nı|ni|nu|nü))$/iu, '');
}

function tokenizeForBrandCompare(text: string): string[] {
  return normalizeKey(text)
    .split(/\s+/)
    .filter(Boolean)
    .map(stripMorphSuffix)
    .filter(Boolean);
}

/**
 * Detects "label-style" headlines that are just 1-2 generic Turkish words —
 * category names, section titles, or incomplete phrases that wouldn't work
 * as standalone social media text.
 *
 * Examples caught: "MÜŞTERİ BAŞARI", "Günlük Story", "Doğal Ürünler", "Kampanya"
 * Examples passed: "Lezzet Turu İçin Hazırlanın!", "Bugün Ne Yiyoruz?"
 */
export function isLabelStyleHeadline(headline: string): boolean {
  const h = headline.trim();
  if (!h) return true;

  const words = h.replace(/[!?.…]+$/g, '').trim().split(/\s+/).filter(Boolean);
  const lower = h.toLowerCase();

  if (words.length <= 1 && h.length < 15) return true;

  // Context-signal / calendar / occasion noun phrases — never on-canvas social copy.
  // e.g. "Gündüz plaj/havuz", "Yaz sezonu", "15 Temmuz anması", "Yaz zirvesi — plaj"
  const seasonalOccasionLabels = [
    /\b(yaz|kış|bahar|sonbahar)\s+(sezonu|zirvesi|açılışı|kampanyası|menüsü)\b/i,
    /\bgündüz\s+(plaj|havuz)/i,
    /\b(plaj|havuz)\s*\/\s*(havuz|plaj)/i,
    /\b\d{1,2}\s+temmuz\s+(anması|anma|etkinliği)?\b/i,
    /\b(15\s*temmuz|cumhuriyet\s*bayramı|zafer\s*bayramı|kurban\s*bayramı|ramazan)\b/i,
    /\b(yaz\s*moduna|sezon\s*açılış|hafta\s*sonu\s*programı)\b/i,
    /\b(daytime\s+beach|summer\s+season|pool\s+day|season\s+opening)\b/i,
    /\b(anması|anma\s*günü|commemoration)\b/i,
  ];
  if (seasonalOccasionLabels.some((p) => p.test(lower))) return true;

  // Slash / pipe category labels: "plaj/havuz", "DJ / gece"
  if (words.length <= 5 && /[\/|]/.test(h) && !/[!?]/.test(h)) {
    if (!/\b(ile|için|ve|for|with|your|our)\b/i.test(h)) return true;
  }

  if (words.length === 2) {
    const labelPatterns = [
      /^(müşteri|ürün|hizmet|kampanya|etkinlik|duyuru|tanıtım|günlük|haftalık|yeni)\s/i,
      /\s(tanıtımı|duyurusu|etkinliği|listesi|bilgisi|yorumları|başarı|başarısı|detayı|haberi)$/i,
      /^(social|customer|product|daily|weekly|new|event)\s/i,
    ];
    if (labelPatterns.some((p) => p.test(lower))) return true;
  }

  if (words.length <= 4) {
    if (/\s(tanıtımı|duyurusu|etkinliği|listesi|bilgisi|yorumları|başarısı|detayı|haberi|anması|sezonu|zirvesi)$/i.test(lower)) {
      return true;
    }
  }

  // 3-word noun stacks without verb/CTA energy (signal hooks pasted as headlines)
  if (
    words.length <= 3
    && !/[!?.]$/.test(h)
    && !/\b(ile|için|ve|ya da|veya|gibi|kadar|nasıl|ne|neden|bir|for|with|your|our|the)\b/i.test(h)
  ) {
    const hasVerbEnergy =
      /[ıiuü]yor|[aeiıoöuü]n$|[aeiıoöuü]r$|[aeiıoöuü]cak$|[dt]ı$|[dt]i$|mış$|miş$|[aeiıoöuü]lım$|[aeiıoöuü]!$/i.test(h)
      || /\b(join|meet|discover|book|taste|feel|live|come|get|make|share)\b/i.test(h);
    if (!hasVerbEnergy) return true;
  }

  if (words.length <= 2 && !/[!?.]$/.test(h) && !/\b(ile|için|ve|ya da|veya|gibi|kadar|nasıl|ne|neden|bir)\b/i.test(h)) {
    const hasTurkishVerb = /[ıiuü]yor|[aeiıoöuü]n$|[aeiıoöuü]r$|[aeiıoöuü]cak$|[dt]ı$|[dt]i$|mış$|miş$|[aeiıoöuü]lım$|[aeiıoöuü]!$/i.test(h);
    if (!hasTurkishVerb) return true;
  }

  return false;
}

/**
 * Headline is only the brand name (possibly inflected) — not a marketing hook.
 * Catches: "Kaçta Info", "Kaçta Info'yu", "KAÇTA INFO'YU".
 */
export function isMeaninglessBrandEchoHeadline(headline: string, brandName: string): boolean {
  const h = headline.trim();
  const b = brandName.trim();
  if (!h || !b) return false;

  const hKey = normalizeKey(h);
  const bKey = normalizeKey(b);
  if (hKey === bKey) return true;

  const hTokens = tokenizeForBrandCompare(h);
  const bTokens = tokenizeForBrandCompare(b);
  if (!hTokens.length || !bTokens.length) return false;

  if (hTokens.length > bTokens.length + 1) return false;

  const allFromBrand = hTokens.every((t) =>
    bTokens.some((bt) => t === bt || bt.startsWith(t) || t.startsWith(bt)),
  );
  if (!allFromBrand) return false;

  const hJoined = hTokens.join('');
  const bJoined = bTokens.join('');
  return hJoined.length <= bJoined.length + 4;
}

function stripTrailingOrphanFragment(headline: string): string {
  return headline.replace(/\s+\d{1,2}$/, '').trim();
}

function extractHookFromCaption(caption: string, brandName: string, maxLen = 32): string {
  const cap = caption.trim();
  if (!cap) return '';

  const chunks = cap
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);

  for (const chunk of chunks) {
    if (isVisionAnalysisDescription(chunk)) continue;
    if (isMeaninglessBrandEchoHeadline(chunk, brandName)) continue;
    if (isIncompleteOverlayPhrase(chunk)) continue;
    const clause = chunk.split(/[,—–-]/)[0]?.trim() ?? chunk;
    const words = clause.split(/\s+/).filter(Boolean);
    const hook = words.length > 6 ? words.slice(0, 5).join(' ') : clause;
    if (
      hook.length >= 8
      && !isMeaninglessBrandEchoHeadline(hook, brandName)
      && !isIncompleteOverlayPhrase(hook)
    ) {
      return enforceDisplayHeadline(hook, maxLen);
    }
  }

  const firstClause = cap.split(/[,—–\n]/)[0]?.trim() ?? '';
  if (
    firstClause.length >= 10
    && !isVisionAnalysisDescription(firstClause)
    && !isMeaninglessBrandEchoHeadline(firstClause, brandName)
    && !isIncompleteOverlayPhrase(firstClause)
  ) {
    return enforceDisplayHeadline(firstClause, maxLen);
  }

  return '';
}

function genericHeadlineFallback(brandName: string, businessType?: string): string {
  if (businessType && isNonVenueSectorProfile(businessType)) return 'Randevunuz Hazır!';
  const sectorish = normalizeKey(brandName);
  if (/\b(haber|medya|news|magazine|gazete)\b/.test(sectorish)) return 'Bu Hafta Öne Çıkanlar';
  if (/beach|plaj|club/.test(sectorish)) return 'Yaz Moduna Geçtik!';
  if (/cafe|coffee|kahve/.test(sectorish)) return 'Yeni Lezzetler Keşfet';
  if (/bal|honey|gida|food|lezzet|mutfak/.test(sectorish)) return 'Doğadan Sofranıza';
  return 'Keşfetmeye Hazır mısın?';
}

export function resolveMeaningfulProductionHeadline(input: {
  headline: string;
  caption?: string;
  brandName: string;
  conceptTitle?: string;
  visualDesignHeadline?: string;
  businessType?: string;
  maxLen?: number;
}): { headline: string; replaced: boolean; reason?: string } {
  const maxLen = input.maxLen ?? 32;
  let headline = stripTrailingOrphanFragment(input.headline.trim());
  const caption = (input.caption ?? '').trim();
  const brandName = input.brandName.trim();
  const conceptTitle = stripTrailingOrphanFragment((input.conceptTitle ?? '').trim());
  const vdcHeadline = stripTrailingOrphanFragment((input.visualDesignHeadline ?? '').trim());
  const businessType = (input.businessType ?? '').trim();

  if (!headline) {
    const fromCaption = extractHookFromCaption(caption, brandName, maxLen);
    if (fromCaption) return { headline: fromCaption, replaced: true, reason: 'empty_headline' };
    if (vdcHeadline && !isMeaninglessBrandEchoHeadline(vdcHeadline, brandName)) {
      return { headline: enforceDisplayHeadline(vdcHeadline, maxLen), replaced: true, reason: 'visual_design_card' };
    }
    if (conceptTitle && !isMeaninglessBrandEchoHeadline(conceptTitle, brandName)) {
      return { headline: enforceDisplayHeadline(conceptTitle, maxLen), replaced: true, reason: 'concept_title' };
    }
    return { headline: genericHeadlineFallback(brandName, businessType), replaced: true, reason: 'generic_fallback' };
  }

  const isBadHeadline =
    isMeaninglessBrandEchoHeadline(headline, brandName)
    || isLabelStyleHeadline(headline)
    || isInternalStrategyBriefing(headline)
    || isIncompleteOverlayPhrase(headline);

  if (!isBadHeadline) {
    return { headline: enforceDisplayHeadline(headline, maxLen), replaced: false };
  }

  const fromCaption = extractHookFromCaption(caption, brandName, maxLen);
  if (fromCaption) {
    return { headline: fromCaption, replaced: true, reason: 'label_or_echo_caption' };
  }

  if (
    conceptTitle
    && conceptTitle !== headline
    && !isMeaninglessBrandEchoHeadline(conceptTitle, brandName)
    && !isLabelStyleHeadline(conceptTitle)
  ) {
    return {
      headline: enforceDisplayHeadline(conceptTitle, maxLen),
      replaced: true,
      reason: 'label_concept',
    };
  }

  if (vdcHeadline && !isMeaninglessBrandEchoHeadline(vdcHeadline, brandName) && !isLabelStyleHeadline(vdcHeadline)) {
    return {
      headline: enforceDisplayHeadline(vdcHeadline, maxLen),
      replaced: true,
      reason: 'label_visual_design_card',
    };
  }

  return {
    headline: genericHeadlineFallback(brandName, businessType),
    replaced: true,
    reason: 'label_generic',
  };
}

/** Overlay / publish headline — never gallery tag lists or vision dumps. */
export function sanitizeProductionHeadline(input: {
  headline: string;
  ideationHeadline?: string;
  caption?: string;
  brandName: string;
  conceptTitle?: string;
  businessType?: string;
  maxLen?: number;
}): string {
  const maxLen = input.maxLen ?? 72;
  const brandName = input.brandName.trim();
  const tryHeadline = (raw: string) => {
    const t = raw.trim();
    if (!t || isVisionAnalysisDescription(t) || isGalleryTagHeadline(t)) return '';
    const resolved = resolveMeaningfulProductionHeadline({
      headline: t,
      caption: input.caption,
      brandName,
      conceptTitle: input.conceptTitle,
      businessType: input.businessType,
      maxLen,
    });
    if (isGalleryTagHeadline(resolved.headline)) return '';
    return resolved.headline;
  };

  for (const candidate of [input.ideationHeadline, input.headline]) {
    const ok = tryHeadline(candidate ?? '');
    if (ok) return ok;
  }

  return resolveMeaningfulProductionHeadline({
    headline: '',
    caption: input.caption,
    brandName,
    conceptTitle: input.conceptTitle,
    businessType: input.businessType,
    maxLen,
  }).headline;
}

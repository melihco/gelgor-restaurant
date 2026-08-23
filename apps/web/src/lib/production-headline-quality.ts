/**
 * Production headline QA — reject brand-echo / grammatical-suffix hooks
 * (e.g. "Kaçta Info'yu") and recover a punchy line from ideation caption.
 */
import {
  isIncompleteOverlayPhrase,
  isInternalStrategyBriefing,
} from './fal-caption-headline';
import { hasDaypartCopyConflict } from './brand-operating-profile';
import { overlayHeadlineGroundedInCaption } from './overlay-caption-grounding';
import { enforceDisplayHeadline } from './grafiker-quality';
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
/**
 * Soulless daypart / menu-board lines — never on-canvas social hooks.
 * e.g. "Klasik Pazar Kahvaltısı", "Öğlen Menüsü", "Akşam Kokteyli".
 */
export function isSoullessMenuHourHeadline(headline: string): boolean {
  const lower = headline.trim().toLowerCase();
  if (!lower) return true;
  const patterns = [
    /klasik\s+(pazar\s+)?kahvaltı/i,
    /(öğlen|akşam|sabah)\s+(menü|menüsü|yemeği|yemek)/i,
    /(günün|daily)\s+(menü|menüsü|soup|çorba|yemeği)/i,
    /(akşam|gece)\s+(kokteyl|kokteyli|cocktail)/i,
    /(lunch|dinner|breakfast)\s+menu/i,
    /happy\s*hour/i,
    /(market|pazar)\s+kahvaltısı/i,
    /classic\s+(breakfast|brunch|lunch|dinner)/i,
  ];
  return patterns.some((p) => p.test(lower));
}

export function isLabelStyleHeadline(headline: string): boolean {
  const h = headline.trim();
  if (!h) return true;

  const words = h.replace(/[!?.…]+$/g, '').trim().split(/\s+/).filter(Boolean);
  // Dotted capital İ lowercases to "i̇" (i + combining dot) outside the tr
  // locale, which makes /için/i miss "İçin" and mislabel real copy.
  const lower = h.toLocaleLowerCase('tr-TR').normalize('NFC');

  if (words.length <= 1 && h.length < 15) return true;
  if (isSoullessMenuHourHeadline(h)) return true;

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

  // Slash / pipe category labels: "plaj/havuz", "DJ / gece",
  // "Dolunay temalı gece etkinliği / özel menü". Planning notes join alternatives
  // with a separator at any length, so only a connective or an exclamation marks
  // the phrase as written-for-canvas copy rather than slot vocabulary.
  if (/[\/|]/.test(h) && !/[!?]/.test(h)) {
    if (!/(^|\s)(ile|için|ve|for|with|your|our)(\s|$)/.test(lower)) return true;
  }

  // Catalog slot labels with format suffix — "Çiftlik ziyareti story", "DJ gecesi reel"
  if (
    words.length <= 5
    && /\b(story|reel|post|carousel|feed|hikaye|gönderi|gönderisi|icerik|içerik)\s*$/i.test(h)
    && !/[!?]/.test(h)
  ) {
    return true;
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

  // Concrete product / atmosphere hooks are valid short overlays (≤4 words).
  // e.g. "Serpme Köy Kahvaltısı", "Bahçede Serpme Keyfi", "Doğanın Tazeliği"
  const hasAtmosphereSubject = /\b(kahvaltı|kahvaltısı|serpme|kokteyl|kokteyli|cocktail|breakfast|brunch|bahçe|bahçede|garden|zeytinyağı|reçel|bal|lezzet|lezzetleri|tadım|hasat|harvest|mezze|gün\s*batımı|sunset|sunrise|gece|gecesi|keyfi|tazeliği|doğallığı|stars|night)\b/i.test(lower);

  // Turkish expresses a claim through case marking, not only through verbs:
  // ablative → dative ("Bahçemizden Sofranıza") is a complete "from X to Y"
  // promise. Category labels ("Yaz sezonu", "Müşteri yorumları") never take
  // that pairing, so it separates real taglines from slot vocabulary.
  // `\w` excludes ç/ğ/ı/ö/ş/ü, so these must be Unicode letter classes.
  const hasDirectionalCaseFraming =
    /[\p{L}\p{N}]{2,}(?:den|dan|ten|tan)\b/iu.test(lower)
    && /[\p{L}\p{N}]{2,}(?:ya|ye|na|ne|a|e)$/iu.test(words[words.length - 1] ?? '');

  // 3-word noun stacks without verb/CTA energy (signal hooks pasted as headlines)
  if (
    words.length <= 3
    && !/[!?.]$/.test(h)
    && !hasAtmosphereSubject
    && !hasDirectionalCaseFraming
    && !/\b(ile|için|ve|ya da|veya|gibi|kadar|nasıl|ne|neden|bir|for|with|your|our|the)\b/i.test(h)
  ) {
    const hasVerbEnergy =
      /[ıiuü]yor|[aeiıoöuü]n$|[aeiıoöuü]r$|[aeiıoöuü]cak$|[dt]ı$|[dt]i$|mış$|miş$|[aeiıoöuü]lım$|[aeiıoöuü]!$/i.test(h)
      || /\b(join|meet|discover|book|taste|feel|live|come|get|make|share)\b/i.test(h);
    if (!hasVerbEnergy) return true;
  }

  if (
    words.length <= 2
    && !/[!?.]$/.test(h)
    && !hasDirectionalCaseFraming
    && !/\b(ile|için|ve|ya da|veya|gibi|kadar|nasıl|ne|neden|bir)\b/i.test(h)
  ) {
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
    // Prefer a complete short sentence over a 5-word mid-phrase stub.
    const clause = chunk.split(/[,—–-]/)[0]?.trim() ?? chunk;
    const hook = clause.length <= maxLen
      ? clause
      : enforceDisplayHeadline(clause, maxLen);
    if (
      hook.length >= 8
      && !isMeaninglessBrandEchoHeadline(hook, brandName)
      && !isIncompleteOverlayPhrase(hook)
    ) {
      return hook.length <= maxLen ? hook : enforceDisplayHeadline(hook, maxLen);
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

function isEnglishOutputLanguage(language?: string | null): boolean {
  const raw = String(language ?? '').trim().toLowerCase();
  return raw === 'en' || raw.startsWith('en-') || raw.startsWith('eng');
}

function genericHeadlineFallback(
  brandName: string,
  businessType?: string,
  language?: string | null,
): string {
  const en = isEnglishOutputLanguage(language);
  if (businessType && isNonVenueSectorProfile(businessType)) {
    return en ? 'Your Appointment Awaits!' : 'Randevunuz Hazır!';
  }
  const sectorish = normalizeKey(`${brandName} ${businessType ?? ''}`);
  if (/\b(haber|medya|news|magazine|gazete)\b/.test(sectorish)) {
    return en ? 'This Week’s Highlights' : 'Bu Hafta Öne Çıkanlar';
  }
  if (/beach|plaj|club|resort|hotel/.test(sectorish)) {
    return en ? 'Summer Mode: On' : 'Yaz Moduna Geçtik!';
  }
  if (/cafe|coffee|kahve|restaurant|restoran/.test(sectorish)) {
    return en ? 'Discover New Flavors' : 'Yeni Lezzetler Keşfet';
  }
  if (/bal|honey|gida|food|lezzet|mutfak|local_products/.test(sectorish)) {
    return en ? 'From Nature to Your Table' : 'Doğadan Sofranıza';
  }
  return en ? 'Ready to Explore?' : 'Keşfetmeye Hazır mısın?';
}

/**
 * Mission `visual_design_cards` headlines are intentionally short product/atmosphere
 * hooks ("Doğanın Tazeliği", "Balın Doğallığı"). `isLabelStyleHeadline` rejects many of
 * those as noun stacks — this gate keeps them as usable on-canvas overlay copy.
 */
export function isUsableVisualDesignCardHeadline(headline: string, brandName: string): boolean {
  const h = stripTrailingOrphanFragment(headline.trim());
  if (h.length < 4 || h.length > 48) return false;
  if (isMeaninglessBrandEchoHeadline(h, brandName)) return false;
  if (isInternalStrategyBriefing(h)) return false;
  if (isIncompleteOverlayPhrase(h)) return false;
  if (isGalleryTagHeadline(h)) return false;
  if (/\b(story|stories|reel|reels|post|posts|carousel|feed)\s*$/i.test(h)) return false;
  // Reject planning-brief verbs that leak into cards
  if (/\b(yapacağız|oluşturacağız|vurgulayan|paylaşacağız|tanıtımını)\b/i.test(h)) return false;
  return true;
}

export function resolveMeaningfulProductionHeadline(input: {
  headline: string;
  caption?: string;
  brandName: string;
  conceptTitle?: string;
  visualDesignHeadline?: string;
  businessType?: string;
  /** Brand content language — drives generic fallback locale (`en` | `tr` | `English`). */
  language?: string | null;
  maxLen?: number;
}): { headline: string; replaced: boolean; reason?: string } {
  const maxLen = input.maxLen ?? 32;
  let headline = stripTrailingOrphanFragment(input.headline.trim());
  const caption = (input.caption ?? '').trim();
  const brandName = input.brandName.trim();
  const conceptTitle = stripTrailingOrphanFragment((input.conceptTitle ?? '').trim());
  const vdcHeadline = stripTrailingOrphanFragment((input.visualDesignHeadline ?? '').trim());
  const businessType = (input.businessType ?? '').trim();
  const language = input.language ?? null;
  const usableCard = vdcHeadline && isUsableVisualDesignCardHeadline(vdcHeadline, brandName)
    ? enforceDisplayHeadline(vdcHeadline, maxLen)
    : '';

  if (!headline) {
    // Prefer mission design-card headline over caption hooks (cards are written for overlay).
    if (usableCard) {
      return { headline: usableCard, replaced: true, reason: 'visual_design_card' };
    }
    const fromCaption = extractHookFromCaption(caption, brandName, maxLen);
    if (fromCaption) return { headline: fromCaption, replaced: true, reason: 'empty_headline' };
    if (conceptTitle && !isMeaninglessBrandEchoHeadline(conceptTitle, brandName)) {
      return { headline: enforceDisplayHeadline(conceptTitle, maxLen), replaced: true, reason: 'concept_title' };
    }
    return {
      headline: genericHeadlineFallback(brandName, businessType, language),
      replaced: true,
      reason: 'generic_fallback',
    };
  }

  if (caption && hasDaypartCopyConflict(caption, headline)) {
    if (usableCard && !/\b(gece|night|dj\b)/i.test(usableCard)) {
      return { headline: usableCard, replaced: true, reason: 'daypart_visual_design_card' };
    }
    const fromCaption = extractHookFromCaption(caption, brandName, maxLen);
    if (fromCaption) {
      return { headline: fromCaption, replaced: true, reason: 'daypart_conflict_caption' };
    }
    if (
      conceptTitle
      && !isMeaninglessBrandEchoHeadline(conceptTitle, brandName)
      && !/\b(gece|night|dj\b)/i.test(conceptTitle)
    ) {
      return {
        headline: enforceDisplayHeadline(conceptTitle, maxLen),
        replaced: true,
        reason: 'daypart_concept',
      };
    }
    return {
      headline: genericHeadlineFallback(brandName, businessType, language),
      replaced: true,
      reason: 'daypart_conflict_generic',
    };
  }

  const labelStyle = isLabelStyleHeadline(headline);
  const isBadHeadline =
    isMeaninglessBrandEchoHeadline(headline, brandName)
    || labelStyle
    || isInternalStrategyBriefing(headline)
    || isIncompleteOverlayPhrase(headline);

  if (!isBadHeadline) {
    return { headline: enforceDisplayHeadline(headline, maxLen), replaced: false };
  }

  // A noun-phrase headline that names what the caption is about is the idea's own
  // subject, not a reusable slot label ("Yaz sezonu", "Perde arkası"). Generic
  // labels are not grounded in tenant copy, so grounding separates the two and
  // keeps us from painting a truncated caption prefix over a valid headline.
  if (
    labelStyle
    && caption
    && !isMeaninglessBrandEchoHeadline(headline, brandName)
    && !isInternalStrategyBriefing(headline)
    && !isIncompleteOverlayPhrase(headline)
    && overlayHeadlineGroundedInCaption(headline, caption)
  ) {
    return { headline: enforceDisplayHeadline(headline, maxLen), replaced: false };
  }

  if (usableCard) {
    return { headline: usableCard, replaced: true, reason: 'label_visual_design_card' };
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

  return {
    headline: genericHeadlineFallback(brandName, businessType, language),
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
  /** Mission visual_design_cards headline — preferred overlay when usable. */
  visualDesignHeadline?: string;
  businessType?: string;
  language?: string | null;
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
      visualDesignHeadline: input.visualDesignHeadline,
      businessType: input.businessType,
      language: input.language,
      maxLen,
    });
    if (isGalleryTagHeadline(resolved.headline)) return '';
    return resolved.headline;
  };

  // Prefer design-card overlay when caller asks sanitize with empty/ideation-only paths.
  const preferredCard = String(input.visualDesignHeadline ?? '').trim();
  if (preferredCard && isUsableVisualDesignCardHeadline(preferredCard, brandName)) {
    const cardOk = tryHeadline(preferredCard);
    if (cardOk) return cardOk;
  }

  for (const candidate of [input.ideationHeadline, input.headline]) {
    const ok = tryHeadline(candidate ?? '');
    if (ok) return ok;
  }

  return resolveMeaningfulProductionHeadline({
    headline: '',
    caption: input.caption,
    brandName,
    conceptTitle: input.conceptTitle,
    visualDesignHeadline: input.visualDesignHeadline,
    businessType: input.businessType,
    language: input.language,
    maxLen,
  }).headline;
}

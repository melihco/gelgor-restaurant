/**
 * fal.ai Caption-Aware Headline Resolution
 *
 * Resolves a unique, caption-specific display headline for fal typography designs.
 * Prevents the "same mission title repeated on every visual" problem by extracting
 * punchy, differentiated hooks from each slot's actual caption.
 *
 * Also applies Turkish spell-check corrections for common ideation typos.
 */

import {
  formatFalLogoPlacementDirective,
  type ResolvedFalLogoPlacement,
} from './fal-logo-placement';
import { hasCaptionHeadlineThemeConflict } from './headline-theme-clusters';

// ── Turkish Spell-Check Dictionary ────────────────────────────────────────────

const TYPO_CORRECTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bkoketyl\b/gi, 'Kokteyl'],
  [/\bkoctail\b/gi, 'Kokteyl'],
  [/\brestarant\b/gi, 'Restoran'],
  [/\brezarvasyon\b/gi, 'Rezervasyon'],
  [/\bindrim\b/gi, 'İndirim'],
  [/\bhaftasonu\b/gi, 'Hafta Sonu'],
  [/\bpazartsi\b/gi, 'Pazartesi'],
  [/\bpersembe\b/gi, 'Perşembe'],
  [/\bjubilesyon\b/gi, 'Jubilasyon'],
];

/** Turkish copy normalization — never translate English words when locale is unknown/en. */
const TR_NORMALIZE_CORRECTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bkokteyl\b/gi, 'Kokteyl'],
  [/\brezervasyon\b/gi, 'Rezervasyon'],
  [/\bkampanya\b/gi, 'Kampanya'],
  [/\bindirim\b/gi, 'İndirim'],
  [/\bhafta sonu\b/gi, 'Hafta Sonu'],
  [/\bperşembe\b/gi, 'Perşembe'],
  [/\bgurme\b/gi, 'Gurme'],
  [/\blezzet\b/gi, 'Lezzet'],
  [/\bdeneyim\b/gi, 'Deneyim'],
  [/\btecrübe\b/gi, 'Tecrübe'],
  [/\bfırsat\b/gi, 'Fırsat'],
  [/\bfirsatlar\b/gi, 'Fırsatlar'],
  [/\bfırsatlar\b/gi, 'Fırsatlar'],
  [/\bgecesi\b/gi, 'Gecesi'],
  [/\byaz\b/g, 'Yaz'],
  [/\bkış\b/g, 'Kış'],
  [/\bbahar\b/g, 'Bahar'],
  [/\bsonbahar\b/g, 'Sonbahar'],
];

/** English → Turkish localization — only when overlay locale is explicitly Turkish. */
const TR_LOCALIZE_CORRECTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bcocktail\b/gi, 'Kokteyl'],
  [/\brestaurant\b/gi, 'Restoran'],
];

function applySpellingCorrections(
  headline: string,
  patterns: ReadonlyArray<[RegExp, string]>,
): string {
  let result = headline;
  for (const [pattern, replacement] of patterns) {
    result = result.replace(pattern, (match) => {
      if (match === match.toUpperCase()) return replacement.toUpperCase();
      if (match[0] === match[0]?.toUpperCase()) return replacement;
      return replacement.toLowerCase();
    });
  }
  return result;
}

function looksTurkishOverlay(text: string): boolean {
  return TR_CHAR_RX.test(text) || TR_WORD_RX.test(text);
}

export type OverlayLocale = 'tr' | 'en' | 'unknown';

const TR_CHAR_RX = /[ğüşöçıİĞÜŞÖÇ]/;
const TR_WORD_RX = /\b(ve|için|icin|ile|burada|şimdi|simdi|hemen|yerini|ayirt|ayırt|rezervasyon|lezzet|deneyim|gecesi|hafta|sonu|kokteyl|mekan|davet)\b/i;
const EN_WORD_RX = /\b(the|and|for|with|your|share|details|book|now|discover|join|experience|meet|maker|artisan|citrus|fresh|this|weekend)\b/i;

/** Rough locale detector for overlay copy — drives CTA/headline language lock. */
export function detectOverlayLocale(text: string | undefined | null): OverlayLocale {
  const t = String(text ?? '').trim();
  if (t.length < 3) return 'unknown';
  const hasTrChar = TR_CHAR_RX.test(t);
  const hasTrWord = TR_WORD_RX.test(t);
  const hasEnWord = EN_WORD_RX.test(t);
  if (hasTrChar || (hasTrWord && !hasEnWord)) return 'tr';
  if (hasEnWord && !hasTrChar && !hasTrWord) return 'en';
  if (hasEnWord && hasTrWord) return 'unknown';
  return 'unknown';
}

/**
 * Fix common Turkish spelling errors found in AI-generated headlines.
 * Preserves casing for first-word capitalization.
 * Skips English copy — do not rewrite "cocktail" → "Kokteyl" on EN posts.
 */
export function correctTurkishSpelling(
  headline: string,
  opts?: { locale?: OverlayLocale },
): string {
  const locale = opts?.locale ?? detectOverlayLocale(headline);
  if (locale === 'en') return headline;

  let result = applySpellingCorrections(headline, TYPO_CORRECTIONS);
  if (locale === 'tr') {
    result = applySpellingCorrections(result, TR_NORMALIZE_CORRECTIONS);
    result = applySpellingCorrections(result, TR_LOCALIZE_CORRECTIONS);
  } else if (locale === 'unknown' && looksTurkishOverlay(result)) {
    result = applySpellingCorrections(result, TR_NORMALIZE_CORRECTIONS);
  }
  return result;
}

function dominantOverlayLocale(...parts: Array<string | undefined | null>): OverlayLocale {
  let tr = 0;
  let en = 0;
  for (const p of parts) {
    const loc = detectOverlayLocale(p ?? '');
    if (loc === 'tr') tr += 1;
    else if (loc === 'en') en += 1;
  }
  if (tr > en) return 'tr';
  if (en > tr) return 'en';
  return 'unknown';
}

function localesCompatible(a: OverlayLocale, b: OverlayLocale): boolean {
  if (a === 'unknown' || b === 'unknown') return true;
  return a === b;
}

export interface FalOverlayCopyInput {
  headline: string;
  cta?: string;
  caption?: string;
  channel: 'reel' | 'feed_post' | 'story';
  /** Mission production: render ideation headline + CTA verbatim (no caption hook rewrite). */
  lockIdeationCopy?: boolean;
}

/**
 * When ideation headline fights the caption theme (kitchen vs DJ), rebuild
 * overlay from the caption so on-canvas copy matches the Instagram body.
 */
function resolveCaptionAlignedOverlayWhenThemeConflicts(input: {
  caption: string;
  headline: string;
  cta?: string;
  channel: FalOverlayCopyInput['channel'];
  targetLocale: OverlayLocale;
}): { headline: string; subtitle?: string } | null {
  const caption = input.caption.trim();
  if (!caption || !hasCaptionHeadlineThemeConflict(caption, input.headline)) {
    return null;
  }
  const resolved = resolveFalDisplayHeadline({
    caption,
    missionTitle: input.headline,
    brandName: '',
    cta: input.cta,
    maxLen: input.channel === 'reel' ? 22 : 32,
  });
  let headline = resolveFalProductionOverlayHeadline(
    resolved.headline,
    [input.headline, caption.split(/[.!?\n]/)[0]?.trim() ?? ''].filter(Boolean),
    input.channel,
  );
  if (!headline || hasCaptionHeadlineThemeConflict(caption, headline)) {
    const firstLine = caption.split(/[.!?\n]/)[0]?.trim() ?? '';
    headline = resolveFalProductionOverlayHeadline(firstLine, [input.headline], input.channel);
  }
  if (!headline) return null;
  if (input.targetLocale === 'tr') {
    headline = correctTurkishSpelling(headline, { locale: 'tr' });
  }
  let subtitle: string | undefined;
  const sub = resolveFalSubtitle({
    caption,
    headline,
    cta: input.cta,
  });
  if (sub && localesCompatible(input.targetLocale, detectOverlayLocale(sub))) {
    subtitle = input.targetLocale === 'tr' ? correctTurkishSpelling(sub, { locale: 'tr' }) : sub;
  }
  return { headline, subtitle };
}

/**
 * Resolve on-image headline + subtitle for fal/GPT designed posts.
 * Mission default: ideation strings only, same language as caption, no auto-translation.
 * Exception: theme conflict with caption → caption-derived overlay (prevents kitchen/DJ drift).
 */
export function resolveFalOverlayCopy(input: FalOverlayCopyInput): {
  headline: string;
  subtitle?: string;
} {
  const targetLocale = dominantOverlayLocale(input.caption, input.headline, input.cta);
  const rawHeadline = sanitizeFalOverlayText(input.headline);
  const rawCta = input.cta ? sanitizeFalOverlayText(input.cta.trim()) : '';

  let headline = rawHeadline;
  let subtitle: string | undefined;

  if (input.lockIdeationCopy !== false) {
    const themeFix = resolveCaptionAlignedOverlayWhenThemeConflicts({
      caption: input.caption ?? '',
      headline: rawHeadline,
      cta: input.cta,
      channel: input.channel,
      targetLocale,
    });
    if (themeFix) {
      return themeFix;
    }

    headline = correctTurkishSpelling(rawHeadline, {
      locale: detectOverlayLocale(rawHeadline) === 'unknown' ? targetLocale : detectOverlayLocale(rawHeadline),
    });
    headline = resolveFalProductionOverlayHeadline(headline, [], input.channel);
    if (rawCta && isMeaningfulFalOverlayText(rawCta) && !areFalOverlayTextsRedundant(headline, rawCta)) {
      const ctaLoc = detectOverlayLocale(rawCta);
      if (localesCompatible(targetLocale, ctaLoc)) {
        subtitle = targetLocale === 'tr'
          ? correctTurkishSpelling(rawCta, { locale: 'tr' })
          : rawCta;
      }
    }
    return { headline, subtitle };
  }

  const resolved = resolveFalDisplayHeadline({
    caption: input.caption ?? '',
    missionTitle: input.headline,
    brandName: '',
    cta: input.cta,
    maxLen: input.channel === 'reel' ? 22 : 32,
  });
  headline = resolveFalProductionOverlayHeadline(
    resolved.headline,
    [input.headline, input.caption?.split(/[.!?\n]/)[0]?.trim() ?? ''].filter(Boolean),
    input.channel,
  );
  const sub = resolveFalSubtitle({
    caption: input.caption ?? '',
    headline,
    cta: input.cta,
  });
  if (sub && localesCompatible(targetLocale, detectOverlayLocale(sub))) {
    subtitle = targetLocale === 'tr' ? correctTurkishSpelling(sub, { locale: 'tr' }) : sub;
  } else if (rawCta && localesCompatible(targetLocale, detectOverlayLocale(rawCta))) {
    subtitle = rawCta;
  }
  return { headline, subtitle };
}

// ── Caption-Derived Headline Extraction ───────────────────────────────────────

const FILLER_WORDS = /\b(ve|ile|için|bu|bir|her|da|de|olan|gibi|kadar|şimdi|hemen)\b/gi;
const EMOJI_RX = /[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const HASHTAG_RX = /#\S+/g;
const MENTION_RX = /@\S+/g;

interface CaptionHeadlineInput {
  /** Full caption text for this slot */
  caption: string;
  /** Mission-level concept title (may repeat across slots) */
  missionTitle: string;
  /** Brand name — avoid echoing it in the headline */
  brandName: string;
  /** Slot's CTA text if available */
  cta?: string;
  /** Max character length for the display headline */
  maxLen?: number;
}

type FalHeadlineSource =
  | 'caption_hook'
  | 'caption_question'
  | 'caption_cta'
  | 'mission_title';

/**
 * Extract a unique, caption-derived display headline that differs from the
 * mission title. Falls back to a shortened mission title only when no
 * meaningful alternative exists.
 */
export function resolveFalDisplayHeadline(input: CaptionHeadlineInput): {
  headline: string;
  source: FalHeadlineSource;
} {
  const maxLen = input.maxLen ?? 28;
  const caption = cleanCaption(input.caption);
  const missionTitle = input.missionTitle.trim();
  const brandName = input.brandName.trim().toLowerCase();

  // Strategy 1: Extract a question from the caption (great engagement hook)
  const question = extractQuestion(caption, brandName, maxLen);
  if (question && question.toLowerCase() !== missionTitle.toLowerCase()) {
    const finalized = finalizeHeadline(question, maxLen);
    if (finalized) return { headline: finalized.headline, source: 'caption_question' };
  }

  // Strategy 2: Extract the strongest action/benefit phrase from caption
  const hook = extractCaptionHook(caption, missionTitle, brandName, maxLen);
  if (hook && hook.toLowerCase() !== missionTitle.toLowerCase()) {
    const finalized = finalizeHeadline(hook, maxLen);
    if (finalized) return { headline: finalized.headline, source: 'caption_hook' };
  }

  // Strategy 3: Use CTA as a differentiated headline
  if (input.cta) {
    const ctaClean = input.cta.trim().replace(/[!.]+$/, '').trim();
    if (ctaClean.length >= 6 && ctaClean.length <= maxLen
      && ctaClean.toLowerCase() !== missionTitle.toLowerCase()
      && !ctaClean.toLowerCase().includes(brandName)) {
      const finalized = finalizeHeadline(ctaClean, maxLen);
      if (finalized) return { headline: finalized.headline, source: 'caption_cta' };
    }
  }

  // Strategy 4: First meaningful caption sentence (broader fallback)
  const captionSentence = extractCaptionHook(caption, '', brandName, maxLen + 20);
  if (captionSentence && captionSentence.toLowerCase() !== missionTitle.toLowerCase()) {
    const finalized = finalizeHeadline(captionSentence, maxLen);
    if (finalized) return { headline: finalized.headline, source: 'caption_hook' };
  }

  // Fallback: Use mission title with spell-check
  const missionFallback = finalizeHeadline(missionTitle, maxLen);
  return {
    headline: missionFallback?.headline ?? correctTurkishSpelling(truncateClean(missionTitle, maxLen)),
    source: 'mission_title',
  };
}

/**
 * Video-safe fal headline.
 *
 * Motion models are much less reliable than still-image models when preserving
 * long typography, so video slots must use a shorter, punchier on-frame hook.
 */
export function resolveFalVideoHeadline(input: CaptionHeadlineInput & {
  maxWords?: number;
}): {
  headline: string;
  source: FalHeadlineSource;
} {
  const maxLen = input.maxLen ?? 22;
  const maxWords = input.maxWords ?? 3;
  const base = resolveFalDisplayHeadline({
    ...input,
    maxLen,
  });
  return {
    headline: tightenVideoHeadline(base.headline, maxLen, maxWords),
    source: base.source,
  };
}

function cleanCaption(raw: string): string {
  return raw
    .replace(EMOJI_RX, '')
    .replace(HASHTAG_RX, '')
    .replace(MENTION_RX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractQuestion(caption: string, brandName: string, maxLen: number): string | null {
  const sentences = caption.split(/[.!?\n]+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    if (!s.includes('?') && !/\b(ne|nasıl|neden|nerede|hangi|kim|kaç)\b/i.test(s)) continue;
    const clean = s.replace(/\?+$/, '').trim();
    if (clean.length < 8 || clean.length > maxLen) continue;
    if (clean.toLowerCase().includes(brandName)) continue;
    return clean + '?';
  }
  return null;
}

function extractCaptionHook(
  caption: string,
  missionTitle: string,
  brandName: string,
  maxLen: number,
): string | null {
  const missionTitleLower = missionTitle.toLowerCase();
  const sentences = caption
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && s.length <= 80);

  for (const sentence of sentences) {
    if (sentence.toLowerCase() === missionTitleLower) continue;
    if (sentence.toLowerCase().includes(brandName)) continue;
    if (isInternalStrategyBriefing(sentence)) continue;

    // Prefer sentences with action verbs or benefit language
    const hasAction = /[ıiuü]yor|[aeiıoöuü]n!|hazır|keşfet|tadını|dene|gel|başla|katıl|kaçır/i.test(sentence);
    if (!hasAction && sentences.indexOf(sentence) > 1) continue;

    const hook = extractBestPhrase(sentence, maxLen);
    if (hook && hook.length >= 8) return hook;
  }

  // Try first meaningful sentence regardless of action verb
  for (const sentence of sentences.slice(0, 3)) {
    if (sentence.toLowerCase() === missionTitleLower) continue;
    if (sentence.toLowerCase().includes(brandName)) continue;
    if (isInternalStrategyBriefing(sentence)) continue;
    const hook = extractBestPhrase(sentence, maxLen);
    if (hook && hook.length >= 8) return hook;
  }

  return null;
}

function extractBestPhrase(sentence: string, maxLen: number): string {
  const normalized = sentence.trim();
  if (normalized.length <= maxLen && !isIncompleteOverlayPhrase(normalized)) {
    return capitalizeFirst(normalized);
  }

  // Split by comma/dash, take first clause
  const clause = normalized.split(/[,—–\-]/)[0]?.trim() ?? normalized;
  if (clause.length <= maxLen && clause.length >= 8 && !isIncompleteOverlayPhrase(clause)) {
    return capitalizeFirst(clause);
  }

  const truncated = truncateAtWordBoundary(normalized, maxLen);
  return truncated ? capitalizeFirst(truncated) : '';
}

function capitalizeFirst(text: string): string {
  if (!text) return '';
  const turkishUpper: Record<string, string> = { 'i': 'İ', 'ı': 'I' };
  const first = text[0]!;
  const upper = turkishUpper[first] ?? first.toUpperCase();
  return upper + text.slice(1);
}

/** Word-boundary truncation — never slices mid-word or mid-character. */
export function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return stripDanglingOverlayTail(text);
  const words = text.split(/\s+/).filter(Boolean);
  let result = '';
  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > maxLen) break;
    result = candidate;
  }
  let trimmed = stripDanglingOverlayTail(result);
  while (trimmed && isIncompleteOverlayPhrase(trimmed)) {
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return '';
    parts.pop();
    trimmed = stripDanglingOverlayTail(parts.join(' '));
  }
  return trimmed;
}

/** @deprecated Use truncateAtWordBoundary — kept as internal alias. */
function truncateClean(text: string, maxLen: number): string {
  return truncateAtWordBoundary(text, maxLen);
}

// ── Overlay text hygiene (prevents prompt-instruction leaks on canvas) ────────

/** Words image models sometimes paint when they appear in typography prompts. */
const PROMPT_LEAK_WORDS = new Set([
  'exactly', 'only', 'critical', 'mandatory', 'absolutely', 'verbatim',
  'headline', 'subtitle', 'tagline', 'placeholder', 'lorem', 'ipsum',
  'text', 'copy', 'render', 'character', 'precisely', 'additions',
  'omissions', 'paraphrasing', 'watermark', 'badge',
]);

/** Platform/format meta words — must never appear as on-canvas consumer copy. */
export const FAL_CANVAS_META_WORDS = new Set([
  'story', 'stories', 'reel', 'reels', 'post', 'posts', 'feed', 'instagram',
  'tiktok', 'facebook', 'social', 'media', 'viral', 'trending',
  'ünü', 'unlu', 'ünlü', 'famous',
]);

const FAL_CANVAS_META_RX = /\b(story|stories|reel|reels|instagram|tiktok|ünü|unlu|ünlü)\b/i;

const INSTRUCTION_FRAGMENT_RX =
  /\b(exactly|verbatim|character-for-character|spell every|reads exactly|no additions|no omissions|no paraphrasing|critical text|mandatory)\b/gi;

/** Agent/strategist briefing verbs — never consumer-facing overlay copy. */
const STRATEGY_BRIEFING_START_RX =
  /^(highlight|showcase|emphasize|emphasise|focus on|drive|leverage|establish|communicate|convey|promote|position|positioning|create awareness|build awareness|increase engagement)\b/i;

const STRATEGY_BRIEFING_BODY_RX =
  /\b(exclusivity|awareness|engagement rate|conversion funnel|brand positioning|target audience|call to action strategy|content pillar|strategic purpose|visual hierarchy goal)\b/i;

/** Trailing words that indicate word-boundary truncation left an incomplete phrase. */
const DANGLING_TAIL_RX =
  /\b(and|or|the|a|an|for|with|to|of|in|on|at|by|from|that|this|ve|ile|için|icin|bir|bu|da|de|ya|veya)\s*$/iu;

/** Trailing modifiers that leave a headline mid-thought (e.g. "This weekend just"). */
const INCOMPLETE_MODIFIER_TAIL_RX =
  /\b(just|only|even|still|already|more|so|very|really|quite|about|almost|nearly|now|then|here|there|yet|also|too)\s*$/iu;

/** Turkish present/past participles without object — "kartta yeni gelen", "menüde sunulan". */
const INCOMPLETE_TR_PARTICIPLE_TAIL_RX =
  /\b(gelen|giden|olan|olacak|yapılan|sunulan|başlayan|bekleyen|edilen|paylaşılan|deneyebileceğiniz|keşfedebileceğiniz)\s*$/iu;

/** Locative + adjective fragment with no noun — "kartta yeni", "menüde özel". */
const INCOMPLETE_TR_LOCATIVE_ADJECTIVE_RX =
  /\b(kartta|menüde|masada|bahçede|sofrada|rafta|vitrinde|menümüzde|tabağımızda)\s+.+\s+(yeni|taze|özel|günlük|mevsim|farklı|benzersiz|taptaze)\s*$/iu;

/**
 * Strip prompt-instruction fragments and decorative quotes from text destined
 * for on-image typography. Does NOT rewrite meaning — only removes leakage.
 */
export function sanitizeFalOverlayText(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = raw
    .replace(/[\u201C\u201D\u2018\u2019"'`«»]/g, '')
    .replace(INSTRUCTION_FRAGMENT_RX, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Drop leading/trailing punctuation left after stripping
  text = text.replace(/^[\s\-–—:;,.!?]+|[\s\-–—:;,.!?]+$/g, '').trim();

  const lower = text.toLowerCase();
  if (PROMPT_LEAK_WORDS.has(lower)) return '';
  if (/^(exactly|only|critical)$/i.test(text)) return '';

  return text;
}

/**
 * Internal strategist / content-agent briefing — not valid on-image copy.
 * e.g. "Highlight the exclusivity and premium positioning of the menu launch"
 */
export function isInternalStrategyBriefing(text: string): boolean {
  const clean = sanitizeFalOverlayText(text);
  if (!clean || clean.length < 8) return false;
  if (STRATEGY_BRIEFING_START_RX.test(clean)) return true;
  if (STRATEGY_BRIEFING_BODY_RX.test(clean) && !/\b(menü|menu|kokteyl|plaj|gece|lezzet|rezervasyon)\b/i.test(clean)) {
    return true;
  }
  return false;
}

/** Remove trailing conjunctions/articles/modifiers left after max-length word clamping. */
export function stripDanglingOverlayTail(text: string): string {
  let result = text.trim();
  for (let i = 0; i < 6; i += 1) {
    const before = result;
    result = result
      .replace(DANGLING_TAIL_RX, '')
      .replace(INCOMPLETE_MODIFIER_TAIL_RX, '')
      .trim();
    if (result === before) break;
  }
  return result;
}

/** Vision/OCR readback — reject truncated or briefing text painted on canvas. */
export function isRenderedOverlayTextIncomplete(detected: string | undefined | null): boolean {
  if (!detected?.trim()) return false;
  const t = detected.trim();
  if (DANGLING_TAIL_RX.test(t)) return true;
  if (INCOMPLETE_MODIFIER_TAIL_RX.test(t)) return true;
  if (isInternalStrategyBriefing(t)) return true;
  if (STRATEGY_BRIEFING_START_RX.test(t)) return true;
  return false;
}

/** Headline ends mid-thought — unsuitable for publish or fal canvas. */
export function isIncompleteOverlayPhrase(text: string): boolean {
  const clean = stripDanglingOverlayTail(sanitizeFalOverlayText(text));
  if (!clean || clean.length < 4) return true;
  if (DANGLING_TAIL_RX.test(text.trim())) return true;
  if (INCOMPLETE_MODIFIER_TAIL_RX.test(text.trim())) return true;
  if (INCOMPLETE_TR_PARTICIPLE_TAIL_RX.test(clean)) return true;
  if (INCOMPLETE_TR_LOCATIVE_ADJECTIVE_RX.test(clean)) return true;
  if (isInternalStrategyBriefing(clean)) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 4 && !/[.!?…]$/.test(clean) && STRATEGY_BRIEFING_START_RX.test(clean)) return true;
  return false;
}

/** True when detected/painted canvas text contains platform meta leakage. */
export function containsFalCanvasMetaLeak(text: string): boolean {
  const clean = sanitizeFalOverlayText(text);
  if (!clean) return false;
  if (FAL_CANVAS_META_RX.test(clean)) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  return words.some((w) => FAL_CANVAS_META_WORDS.has(w.toLowerCase()));
}

/** Headline is only platform/meta vocabulary — e.g. "ÜNLÜ STORY", "INSTAGRAM REEL". */
export function isFalCanvasMetaOnlyHeadline(text: string): boolean {
  const clean = sanitizeFalOverlayText(text);
  if (!clean) return true;
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const nonMeta = words.filter((w) => {
    const lower = w.toLowerCase();
    return !PROMPT_LEAK_WORDS.has(lower) && !FAL_CANVAS_META_WORDS.has(lower);
  });
  return nonMeta.length === 0;
}

/** True when copy is long enough to be a real headline/tagline, not a prompt artifact. */
export function isMeaningfulFalOverlayText(text: string): boolean {
  const clean = sanitizeFalOverlayText(text);
  if (clean.length < 6) return false;
  if (isInternalStrategyBriefing(clean)) return false;
  if (isIncompleteOverlayPhrase(clean)) return false;
  if (isFalCanvasMetaOnlyHeadline(clean)) return false;

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const w = words[0]!.toLowerCase();
    if (PROMPT_LEAK_WORDS.has(w) || FAL_CANVAS_META_WORDS.has(w)) return false;
    return clean.length >= 8 && /[aeiouıöüAEIOUİÖÜ]/i.test(clean);
  }

  const meaningfulWords = words.filter((w) => {
    const lower = w.toLowerCase();
    return !PROMPT_LEAK_WORDS.has(lower) && !FAL_CANVAS_META_WORDS.has(lower);
  });
  return meaningfulWords.length >= 2 && meaningfulWords.join(' ').length >= 8;
}

/**
 * Pick the first meaningful overlay string from primary + fallbacks.
 * Used before fal/Ideogram prompts so bad ideation never becomes canvas text.
 */
export function ensureMeaningfulFalOverlayText(
  primary: string,
  fallbacks: string[] = [],
  maxLen?: number,
): string {
  const candidates = [primary, ...fallbacks].map((c) => c.trim()).filter(Boolean);
  for (const candidate of candidates) {
    const clean = sanitizeFalOverlayText(candidate);
    const clipped = maxLen ? truncateClean(clean, maxLen) : clean;
    const normalized = stripDanglingOverlayTail(clipped);
    if (isMeaningfulFalOverlayText(normalized)) {
      return correctTurkishSpelling(normalized);
    }
  }
  // Never return unvalidated copy — callers must abort or pick another source.
  return '';
}

/**
 * Resolved overlay headline for fal production — empty when no safe copy exists.
 * Callers MUST NOT generate typography when this returns ''.
 */
export function resolveFalProductionOverlayHeadline(
  primary: string,
  fallbacks: string[] = [],
  channel: 'reel' | 'feed_post' | 'story',
): string {
  const raw = ensureMeaningfulFalOverlayText(primary, fallbacks);
  if (!raw) return '';
  const clamped = clampFalOverlayHeadlineForCanvas(raw, channel);
  return clamped && isMeaningfulFalOverlayText(clamped) ? clamped : '';
}

/** Image-model-safe headline directive — avoids "EXACTLY" and similar leak words. */
export function formatFalOnImageHeadlineDirective(headline: string, fontDescription: string): string {
  const safe = sanitizeFalOverlayText(headline);
  return [
    `Main on-image headline — render ONLY this copy: «${safe}».`,
    `Typography style: ${fontDescription}.`,
    'Do not paint prompt instructions or any text outside the quoted headline.',
  ].join(' ');
}

/** Image-model-safe subtitle/tagline directive. */
export function formatFalOnImageSubtitleDirective(subtitle: string): string {
  const safe = sanitizeFalOverlayText(subtitle);
  return `Secondary tagline below headline (ONLY this copy): «${safe}». Designed complement font — not plain body text.`;
}

/**
 * Clamp overlay copy to lengths image models can spell reliably.
 * Reels/stories: ≤3 words / 22 chars — long headlines become garbled ("Cııçogra pry").
 */
export function clampFalOverlayHeadlineForCanvas(
  headline: string,
  channel: 'reel' | 'feed_post' | 'story',
): string {
  const clean = correctTurkishSpelling(sanitizeFalOverlayText(headline));
  if (!clean) return '';
  if (isInternalStrategyBriefing(clean)) return '';
  if (channel === 'reel') return tightenVideoHeadline(clean, 22, 3);
  if (channel === 'story') return tightenVideoHeadline(clean, 28, 4);
  const result = truncateAtWordBoundary(clean, 32);
  if (result && isMeaningfulFalOverlayText(result)) return result;
  const shortHook = tightenVideoHeadline(clean, 32, 3);
  if (shortHook && isMeaningfulFalOverlayText(shortHook)) return shortHook;
  return '';
}

/**
 * Progressively shorten overlay copy for image-model retries.
 * Always returns complete phrases — never character-sliced fragments.
 */
export function shortenFalOverlayForImageRetry(
  headline: string,
  attempt: number,
  channel: 'reel' | 'feed_post' | 'story',
): string {
  const clean = sanitizeFalOverlayText(headline);
  if (!clean) return '';
  if (attempt <= 0) return clampFalOverlayHeadlineForCanvas(clean, channel) || clean;

  const baseMax = channel === 'reel' ? 22 : channel === 'story' ? 28 : 32;
  const maxLen = Math.max(10, baseMax - attempt * 5);
  const baseWords = channel === 'reel' ? 3 : channel === 'story' ? 4 : 5;
  const maxWords = Math.max(2, baseWords - attempt);

  const shortened = channel === 'feed_post'
    ? truncateAtWordBoundary(clean, maxLen)
    : tightenVideoHeadline(clean, maxLen, maxWords);

  const normalized = stripDanglingOverlayTail(shortened);
  return normalized && isMeaningfulFalOverlayText(normalized) ? normalized : '';
}

/**
 * Explicit on-canvas text contract for fal/Ideogram/GPT-image prompts.
 * Lists the only strings that may appear as visible text — prevents gibberish output.
 */
export function buildFalOnCanvasTextContract(input: {
  headline: string;
  subtitle?: string;
  brandName?: string;
  logoProvided?: boolean;
}): string {
  const headline = sanitizeFalOverlayText(input.headline);
  const headlineWords = headline.split(/\s+/).filter(Boolean);

  const lines = [
    'ON-CANVAS TEXT CONTRACT (mandatory — render ONLY these strings as visible text):',
    `HEADLINE: "${headline}"`,
  ];

  if (headlineWords.length > 0) {
    lines.push(
      `Headline word order (${headlineWords.length} words, do not reorder or misspell): ${
        headlineWords.map((w, i) => `${i + 1}="${w}"`).join(' · ')
      }`,
    );
  }

  const subtitle = input.subtitle ? sanitizeFalOverlayText(input.subtitle) : '';
  if (subtitle && isMeaningfulFalOverlayText(subtitle)) {
    lines.push(`SUBTITLE (second line, optional): "${subtitle}"`);
  }

  if (input.brandName?.trim() && !input.logoProvided) {
    lines.push(`BRAND MARK (small corner wordmark only): "${input.brandName.trim()}"`);
  }

  lines.push(
    'FORBIDDEN on canvas: gibberish, invented words, misspellings, partial words, extra slogans, URLs, hashtags, dates, auto-translation, mixed-language lines, or any text not listed above.',
    'FORBIDDEN META WORDS on canvas: never paint "STORY", "REEL", "POST", "INSTAGRAM", "TIKTOK", "FEED", "ÜNLÜ", "VIRAL", "SHARE", or any platform/format label — only the quoted headline/subtitle above.',
    'LANGUAGE LOCK: Render headline and subtitle in the SAME language as the quoted strings — do NOT translate EN↔TR or invent alternate wording.',
    'THEME LOCK: Headline/subtitle must stay on the same topic as the Instagram caption for this post — never invent kitchen/menu copy for a nightlife/DJ caption, or nightlife copy for a food caption.',
    'TURKISH DIACRITICS: When Turkish copy is listed, preserve İ/ı/Ş/ş/Ğ/ğ/Ü/ü/Ö/ö/Ç/ç exactly — never ASCII-only approximations like "Iletigime Gec".',
    'If space is tight, shrink typography — never invent alternate wording or truncate mid-word.',
  );

  return lines.join(' ');
}

export type FalLogoCanvasChannel = 'feed_post' | 'reel' | 'story';

/**
 * Logo placement + integrity contract for fal/Ideogram/GPT-image designed posts.
 *
 * When a logo URL is configured, AI must NOT draw the mark — we composite the
 * official file in post-production (see fal-logo-composite.ts).
 */
export function buildFalLogoPlacementContract(input: {
  logoProvided: boolean;
  brandName?: string;
  channel?: FalLogoCanvasChannel;
  /** When false, skip photo-hero placement hints (synthetic backgrounds). */
  hasPhotoHero?: boolean;
  /** Art director / archetype / brand resolved anchor. */
  placement?: ResolvedFalLogoPlacement | null;
}): string {
  if (!input.logoProvided) return '';

  const channel = input.channel ?? 'feed_post';

  const fallbackPlacement: Record<FalLogoCanvasChannel, string> = {
    feed_post:
      'Reserve a clean quiet corner (top-right OR bottom-right) — no text, icons, or busy texture. Never over faces, hands, food, cutlery, glassware, or the headline block.',
    reel:
      'Reserve top-right (below the top 12% Instagram UI safe zone) OR bottom-right (above the bottom 15% safe zone). Keep away from the photo hero subject and headline panel.',
    story:
      'Reserve top-right (below safe zone) OR bottom-left. Never center over the main subject or headline stack.',
  };

  const placementLine = input.placement
    ? formatFalLogoPlacementDirective(input.placement, channel)
    : fallbackPlacement[channel];

  const brandNote = input.brandName?.trim()
    ? ` Brand: "${input.brandName.trim()}" — do NOT type, spell, or abbreviate the brand name anywhere on canvas (including headline zones); logo is composited separately.`
    : '';

  return [
    'BRAND LOGO CONTRACT (mandatory — highest priority after on-canvas text):',
    'The official logo is supplied as a separate asset and will be composited in post-production — pixel-perfect, unchanged.',
    'DO NOT draw, generate, illustrate, paint, emboss, or type any logo, emblem, monogram, mascot, sun icon, location pin, map marker, or brand mark anywhere in this image.',
    'LOGO INTEGRITY (non-negotiable): The AI must never redraw, reimagine, simplify, cartoonify, recolor, warp, stretch, crop, or replace the official mark.',
    'FORBIDDEN SUBSTITUTES: no fake wordmarks, no stylized spelling of the brand name, no pin icons, no sun badges — the reserved zone must stay visually empty.',
    'ALLOWED in the reserved zone only: leave empty quiet space (solid color, soft gradient, or uncluttered margin). Motion/video may later add subtle opacity pulse or glow on the composited logo — never on an AI-drawn substitute.',
    `RESERVED LOGO ZONE: ${placementLine}${brandNote}`,
    input.hasPhotoHero !== false
      ? 'Photo hero rule: reserved logo zone must sit in a margin/corner — never over the dish, hands, knife/fork action, or primary photo subject.'
      : '',
    'Reserved zone size: ~8–12% of frame width, with at least 3% padding from frame edges and from headline/subtitle blocks.',
    'FORBIDDEN: any invented icon, stylized lettering, fake watermark, or spelling the brand name instead of leaving the reserved zone empty.',
  ].filter(Boolean).join(' ');
}

function finalizeHeadline(text: string, maxLen: number): { headline: string; source?: FalHeadlineSource } | null {
  const clean = correctTurkishSpelling(truncateClean(sanitizeFalOverlayText(text), maxLen));
  if (!isMeaningfulFalOverlayText(clean)) return null;
  return { headline: clean };
}

function tightenVideoHeadline(text: string, maxLen: number, maxWords: number): string {
  const normalized = correctTurkishSpelling(
    text
      .replace(/[!"'():;[\]{}]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!normalized) return '';

  const words = normalized.split(/\s+/).filter(Boolean);
  const filtered = words.filter((word, index) => {
    const lower = word.toLowerCase();
    if (index === 0 && /^(yaz|kış|bahar|sonbahar)$/.test(lower)) return true;
    FILLER_WORDS.lastIndex = 0;
    return !FILLER_WORDS.test(lower);
  });
  FILLER_WORDS.lastIndex = 0;

  const pool = filtered.length > 0 ? filtered : words;
  let result = '';
  let used = 0;
  for (const word of pool) {
    if (used >= maxWords) break;
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > maxLen) break;
    result = candidate;
    used += 1;
  }

  let compact = capitalizeFirst(result || truncateAtWordBoundary(normalized, maxLen));
  compact = stripDanglingOverlayTail(compact);
  while (compact && isIncompleteOverlayPhrase(compact)) {
    const parts = compact.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return '';
    parts.pop();
    compact = capitalizeFirst(stripDanglingOverlayTail(parts.join(' ')));
  }
  const sanitized = sanitizeFalOverlayText(compact.replace(/[,.!?]+$/g, '').trim());
  return sanitized && isMeaningfulFalOverlayText(sanitized) ? sanitized : '';
}

// ── Subtitle from Caption ─────────────────────────────────────────────────────

/**
 * Extract a meaningful subtitle line from caption that complements the headline.
 * Returns a short phrase (max 50 chars) that adds context without repeating the headline.
 */
export function resolveFalSubtitle(input: {
  caption: string;
  headline: string;
  cta?: string;
  brandName?: string;
  maxLen?: number;
}): string | undefined {
  const maxLen = input.maxLen ?? 50;
  const caption = cleanCaption(input.caption);
  const headlineLower = input.headline.toLowerCase();
  const brandLower = (input.brandName ?? '').toLowerCase();

  const sentences = caption
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8 && s.length <= 60);

  for (const s of sentences) {
    const sLower = s.toLowerCase();
    if (sLower === headlineLower) continue;
    if (headlineLower.includes(sLower) || sLower.includes(headlineLower)) continue;
    if (areFalOverlayTextsRedundant(input.headline, s)) continue;
    if (brandLower && sLower.startsWith(brandLower)) continue;

    const clean = s.replace(/[!.]+$/, '').trim();
    if (clean.length >= 8 && clean.length <= maxLen) {
      const sanitized = sanitizeFalOverlayText(clean);
      if (isMeaningfulFalOverlayText(sanitized)) {
        return correctTurkishSpelling(sanitized);
      }
    }
  }

  // Fallback to CTA if it's meaningful
  if (input.cta) {
    const ctaClean = sanitizeFalOverlayText(input.cta.trim());
    if (ctaClean.length >= 6 && ctaClean.length <= maxLen
      && !ctaClean.toLowerCase().includes(headlineLower)
      && !areFalOverlayTextsRedundant(input.headline, ctaClean)
      && isMeaningfulFalOverlayText(ctaClean)) {
      return ctaClean;
    }
  }

  return undefined;
}

function normalizeOverlayCompare(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function overlayEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i]![0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0]![j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }
  return matrix[rows - 1]![cols - 1]!;
}

const RESERVATION_OVERLAY_RX = /\b(rezerv\w*|ayir\w*|masa\w*|yerini|book|reserve|table)\b/i;

/**
 * Detect when headline + subtitle/CTA would repeat the same reservation hook
 * (e.g. "Masani ayır" + "Masani ayırt") on the same canvas.
 */
export function areFalOverlayTextsRedundant(a: string, b: string): boolean {
  const left = normalizeOverlayCompare(sanitizeFalOverlayText(a));
  const right = normalizeOverlayCompare(sanitizeFalOverlayText(b));
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  if (RESERVATION_OVERLAY_RX.test(left) && RESERVATION_OVERLAY_RX.test(right)) {
    const leftWords = new Set(left.split(/\s+/).filter((w) => w.length > 3));
    const shared = right.split(/\s+/).filter((w) => w.length > 3 && leftWords.has(w));
    if (shared.length >= 1) return true;

    const reservationStem = (text: string) => {
      const match = text.match(/\b(ayirt\w*|ayir\w*|rezerv\w*)\b/);
      return match ? match[0].slice(0, 5) : null;
    };
    const leftStem = reservationStem(left);
    const rightStem = reservationStem(right);
    if (leftStem && rightStem && leftStem === rightStem) return true;
  }

  if (left.length <= 28 && right.length <= 28) {
    return overlayEditDistance(left, right) <= 3;
  }

  return false;
}

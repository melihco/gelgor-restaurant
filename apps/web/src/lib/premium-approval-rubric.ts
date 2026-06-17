/**
 * Premium Approval Rubric — Sprint 4
 *
 * Detects "AI-pretty but hollow" content before it is attached to a bundle.
 * Works on Story and Reel content alike. Returns a score (0–100) + actionable reasons.
 *
 * DESIGN PRINCIPLE: Never hard-block production. This rubric is advisory:
 *   - score ≥ 60 → PASS, attach normally
 *   - score 40–59 → WARN, attach with flag `rubric_caution: true`
 *   - score < 40 → FAIL, log loudly but still attach (creative director may fix on retry)
 */

export interface PremiumRubricInput {
  headline: string;
  caption: string;
  /** The story card's narrative role. */
  sequenceRole?: 'hook' | 'proof' | 'cta';
  /** Other headlines already produced in this set (for copy-similarity check). */
  siblingHeadlines?: string[];
  /** Brand name — excluded from specificity scoring. */
  brandName?: string;
  /** Business sector. */
  sector?: string;
}

export interface PremiumRubricResult {
  score: number;
  pass: boolean;
  caution: boolean;
  reasons: string[];
  tags: string[];
}

// ─── Corporate buzzword list ───────────────────────────────────────────────────
// Words that signal AI-generated boilerplate rather than authentic brand voice.
const HOLLOW_WORDS: ReadonlyArray<RegExp> = [
  /\bexcellence\b/i,
  /\bexceptional\b/i,
  /\bpremium quality\b/i,
  /\bworld.?class\b/i,
  /\bcrafted with (love|care|passion)\b/i,
  /\bpassion(ate)?\b/i,
  /\bjourney\b/i,
  /\belevate (your|the)\b/i,
  /\bunmatched\b/i,
  /\bsecond to none\b/i,
  /\bdiffer(ent|ence)\b/i,
  /\bexperience the (best|difference|ultimate)\b/i,
  /\bdiscover the (magic|beauty|power|difference)\b/i,
  /\byour (dream|vision|goals)\b/i,
  /\btake it to the next level\b/i,
  /\bwe (pride ourselves|are dedicated|are committed)\b/i,
  /\bstate.?of.?the.?art\b/i,
  /\bseamless(ly)?\b/i,
  /\bholistic\b/i,
  /\bleverage\b/i,
  /\bsynergy\b/i,
  /\bparadigm\b/i,
  /\bkesintisiz\b/i,
  /\bmükemmellik\b/i,
  /\btutkuyla\b/i,
  /\bfarkı hissedin\b/i,
  /\bkali(te)?(li)? (hizmet|deneyim|ürün)\b/i,
  /\bsizin için buradayız\b/i,
  /\bfarkımızı (yaşayın|keşfedin)\b/i,
];

// ─── Specificity signals ───────────────────────────────────────────────────────
// A specific piece of content has at least one of: price, date, number, proper noun.
const SPECIFICITY_PATTERNS: ReadonlyArray<RegExp> = [
  /\b\d{1,3}([.,]\d+)?\s*(tl|₺|\$|€|usd|eur)\b/i,   // prices
  /\b(ocak|şubat|mart|nisan|mayıs|haziran|temmuz|ağustos|eylül|ekim|kasım|aralık)\b/i, // Turkish months
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b/i,  // EN months
  /\b\d{1,2}[./]\d{1,2}([./]\d{2,4})?\b/,            // dates
  /\b(saat|at)\s+\d{1,2}[:.]\d{2}\b/i,               // times
  /\b\d+\s*(kişi|kişilik|masas[aı]|pax|guest|seat)\b/i, // capacity
  /\b\d+\s*(yıl|yıllık|year|years)\b/i,              // years of experience
  /\b\d+\s*(m²|m2|sqm|sqft)\b/i,                     // dimensions
  /[""«»].{5,40}[""»]/,                               // a real quote
  /\b(yeni|new|lansman|launch|açılı|opening)\b/i,    // launch specifics
];

// ─── Hook quality words ────────────────────────────────────────────────────────
// Strong first-word hooks that stop the scroll.
const HOOK_POWER_WORDS: ReadonlyArray<RegExp> = [
  /^(yeni|new|son|first|ilk|tek|only|now|bu gece|tonight|bugün|today|sabah|morning)\b/i,
  /\?$/,                                                            // question hook
  /!\s*$/,                                                          // exclamation hook
  /^\d+\b/,                                                         // number hook ("5 sebep...")
  /\b(sır|secret|hack|pro tip|trick|nasıl|how to|why)\b/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countMatches(text: string, patterns: ReadonlyArray<RegExp>): number {
  return patterns.filter((p) => p.test(text)).length;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function similarityRatio(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
  const aWords = new Set(normalize(a));
  const bWords = normalize(b);
  if (!aWords.size || !bWords.length) return 0;
  const shared = bWords.filter((w) => aWords.has(w)).length;
  return shared / Math.max(aWords.size, bWords.length);
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export function assessPremiumRubric(input: PremiumRubricInput): PremiumRubricResult {
  const { headline, caption, sequenceRole, siblingHeadlines = [], brandName = '', sector = '' } = input;
  const fullText = `${headline} ${caption}`;
  const reasons: string[] = [];
  const tags: string[] = [];
  let score = 100;

  // ── 1. Hollow language penalty ───────────────────────────────────────────
  const hollowHits = countMatches(fullText, HOLLOW_WORDS);
  if (hollowHits >= 3) {
    score -= 30;
    reasons.push(`hollow_language:${hollowHits}_buzzwords`);
    tags.push('ai_boilerplate');
  } else if (hollowHits >= 1) {
    score -= hollowHits * 8;
    reasons.push(`hollow_language:${hollowHits}_buzzwords`);
  }

  // ── 2. Specificity bonus ─────────────────────────────────────────────────
  const specificityHits = countMatches(fullText, SPECIFICITY_PATTERNS);
  if (specificityHits >= 2) {
    score += 10;
    tags.push('specific_content');
  } else if (specificityHits === 0) {
    score -= 15;
    reasons.push('no_specificity:missing_numbers_dates_quotes');
  }

  // ── 3. Caption length ────────────────────────────────────────────────────
  const captionWords = wordCount(caption);
  if (captionWords < 8) {
    score -= 20;
    reasons.push(`thin_caption:${captionWords}_words`);
    tags.push('thin_copy');
  } else if (captionWords > 120) {
    score -= 8;
    reasons.push('overlong_caption:wall_of_text');
  }

  // ── 4. Headline quality ──────────────────────────────────────────────────
  const headlineWords = wordCount(headline);
  if (headlineWords <= 1) {
    score -= 20;
    reasons.push('single_word_headline');
    tags.push('weak_hook');
  } else if (headlineWords > 8) {
    score -= 10;
    reasons.push('headline_too_long:truncation_risk');
  }

  // Hook role bonus for power-word hooks
  if (sequenceRole === 'hook') {
    const hasHookWord = countMatches(headline, HOOK_POWER_WORDS) > 0;
    if (hasHookWord) {
      score += 8;
      tags.push('hook_power_word');
    } else {
      score -= 10;
      reasons.push('hook_no_scroll_stop_word');
    }
  }

  // ── 5. Copy similarity with siblings ────────────────────────────────────
  for (const sibling of siblingHeadlines) {
    const sim = similarityRatio(headline, sibling);
    if (sim > 0.7) {
      score -= 25;
      reasons.push(`copy_too_similar_to_sibling:${Math.round(sim * 100)}pct`);
      tags.push('duplicate_copy');
      break;
    } else if (sim > 0.45) {
      score -= 12;
      reasons.push(`copy_similar_to_sibling:${Math.round(sim * 100)}pct`);
    }
  }

  // ── 6. Brand name as headline penalty ───────────────────────────────────
  if (brandName && headline.trim().toLowerCase() === brandName.trim().toLowerCase()) {
    score -= 30;
    reasons.push('headline_is_brand_name_only');
    tags.push('no_hook');
  }

  // ── 7. CTA role check — must have an actionable phrase ──────────────────
  if (sequenceRole === 'cta') {
    const hasAction = /\b(book|reserve|call|shop|buy|visit|join|sign|get|learn|view|al|ara|gel|kaydol|sipari|ziyaret|incele)\b/i.test(fullText);
    if (!hasAction) {
      score -= 15;
      reasons.push('cta_card_no_actionable_verb');
      tags.push('weak_cta');
    }
  }

  // ── 8. Sector relevance bonus ────────────────────────────────────────────
  const sectorLow = sector.toLowerCase();
  const textLow = fullText.toLowerCase();
  const sectorWords: Record<string, string[]> = {
    restaurant: ['menu', 'dish', 'chef', 'taste', 'flavor', 'cuisine', 'rezerv', 'lezzet', 'şef', 'menü'],
    beauty: ['skin', 'glow', 'hair', 'lash', 'nail', 'cilt', 'saç', 'parla', 'makyaj', 'güzellik'],
    hotel: ['room', 'suite', 'pool', 'view', 'stay', 'suite', 'oda', 'deniz', 'tatil', 'konfor'],
    fitness: ['workout', 'strength', 'muscle', 'class', 'coach', 'antrenman', 'güç', 'kilo', 'egzersiz'],
    retail: ['collection', 'style', 'trend', 'season', 'koleksiyon', 'sezon', 'tarz', 'yeni'],
  };

  for (const [key, words] of Object.entries(sectorWords)) {
    if (sectorLow.includes(key)) {
      const hit = words.some((w) => textLow.includes(w));
      if (hit) {
        score += 5;
        tags.push(`sector_relevant:${key}`);
      }
      break;
    }
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const pass = finalScore >= 60;
  const caution = finalScore >= 40 && finalScore < 60;

  return { score: finalScore, pass, caution, reasons, tags };
}

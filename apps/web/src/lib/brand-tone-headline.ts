/**
 * Score short overlay headlines against brand_tone so story/reel titles
 * feel on-brand (warm/chill/luxury/energetic) rather than generic promo.
 */

const TONE_LEXICONS: Array<{ keys: RegExp; words: string[] }> = [
  {
    keys: /samimi|sıcak|warm|friendly|davetkar|cozy|homey/,
    words: ['gel', 'beraber', 'senin', 'bizim', 'keyif', 'rahat', 'sıcak', 'miss', 'sofra', 'sohbet'],
  },
  {
    keys: /lüks|luxury|premium|zarif|elegant|chic|sofistike/,
    words: ['exclusive', 'private', 'atelier', 'signature', 'reserve', 'golden', 'velvet', 'sunset', 'terrace'],
  },
  {
    keys: /enerjik|eğlence|party|gece|night|club|dans|vibrant|upbeat/,
    words: ['gece', 'beat', 'dans', 'party', 'vibes', 'neon', 'dj', 'tonight', 'lets', 'go'],
  },
  {
    keys: /chill|rahat|sakin|relax|lounge|beach|yaz|summer|deniz/,
    words: ['chill', 'breeze', 'sunset', 'waves', 'loung', 'yaz', 'deniz', 'güneş', 'slow', 'easy', 'vibes'],
  },
  {
    keys: /minimal|sade|clean|modern|studio/,
    words: ['essentials', 'pure', 'clean', 'form', 'line', 'studio', 'now', 'here'],
  },
];

function tokenizeTone(brandTone: string): string[] {
  return brandTone
    .toLowerCase()
    .split(/[,;/|]+|\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);
}

export function scoreHeadlineForBrandTone(
  headline: string,
  brandTone?: string | null,
): number {
  const tone = String(brandTone ?? '').trim().toLowerCase();
  if (!tone || !headline.trim()) return 0;
  const h = headline.toLowerCase();
  let score = 0;

  for (const token of tokenizeTone(tone)) {
    if (h.includes(token)) score += 3;
  }

  for (const lex of TONE_LEXICONS) {
    if (!lex.keys.test(tone)) continue;
    for (const w of lex.words) {
      if (h.includes(w)) score += 2;
    }
  }

  // Soft penalty for cold retail CTAs that fight chill/luxury hospitality brands
  if (/indirim|kampanya|son gün|hemen al|%?\d+\s*off/i.test(h) && /chill|lüks|luxury|samimi|beach/i.test(tone)) {
    score -= 4;
  }

  return score;
}

/**
 * Prefer the candidate whose language best matches brand tone.
 * Returns `current` when no alternative scores meaningfully better.
 */
export function preferBrandToneHeadline(input: {
  current: string;
  alternatives: string[];
  brandTone?: string | null;
  minGain?: number;
}): string {
  const minGain = input.minGain ?? 2;
  const currentScore = scoreHeadlineForBrandTone(input.current, input.brandTone);
  let best = input.current.trim();
  let bestScore = currentScore;

  for (const alt of input.alternatives) {
    const cleaned = String(alt ?? '').trim();
    if (!cleaned || cleaned === best) continue;
    const score = scoreHeadlineForBrandTone(cleaned, input.brandTone);
    if (score >= bestScore + minGain) {
      best = cleaned;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Lexical Turkish morphology for caption ↔ photo matching.
 *
 * Not a linguistics-grade stemmer: it only has to make agglutinated caption
 * tokens comparable to gallery vision text. Two Turkish facts break naive
 * substring matching and both cost real production:
 *
 * 1. Suffixes attach to the right ("burgerimiz"), so `description.includes(token)`
 *    fails even though the photo literally shows a burger.
 * 2. Final consonants soften before a vowel ("yemek" → "yemeği"), so even a
 *    substring hint misses the inflected form.
 *
 * Matching here is additive by contract: a caller may only gain a match it
 * previously missed, never lose one. That keeps scoring tunable without
 * silently loosening the hard mismatch vetoes.
 */

/**
 * Suffixes ordered longest-first so the greedy strip takes the full cluster
 * ("-larımızın") instead of leaving a fragment behind.
 */
const TR_SUFFIXES: readonly string[] = [
  'larımızın', 'lerimizin', 'larınızın', 'lerinizin',
  'larımız', 'lerimiz', 'larınız', 'leriniz', 'larının', 'lerinin',
  'ımızın', 'imizin', 'umuzun', 'ümüzün', 'ınızın', 'inizin',
  'larını', 'lerini', 'larında', 'lerinde', 'larından', 'lerinden',
  'ımız', 'imiz', 'umuz', 'ümüz', 'ınız', 'iniz', 'unuz', 'ünüz',
  'ından', 'inden', 'undan', 'ünden',
  'ları', 'leri', 'lara', 'lere', 'larda', 'lerde',
  'lar', 'ler',
  'nın', 'nin', 'nun', 'nün',
  'ımı', 'imi', 'umu', 'ümü',
  'dan', 'den', 'tan', 'ten',
  'sı', 'si', 'su', 'sü',
  'da', 'de', 'ta', 'te',
  'ya', 'ye', 'na', 'ne',
  'ın', 'in', 'un', 'ün',
  'ı', 'i', 'u', 'ü', 'a', 'e',
];

/** Final-consonant softening pairs — the hard form is what dictionaries carry. */
const TR_FINAL_SOFTENING: ReadonlyArray<readonly [string, string]> = [
  ['k', 'ğ'],
  ['p', 'b'],
  ['t', 'd'],
  ['ç', 'c'],
];

/**
 * Shortest stem we trust for a substring match. Below this, stems collide across
 * unrelated words (the classic "bal" ⊂ "balık" honey/fish trap), so we keep the
 * original token instead.
 */
export const TR_MIN_STEM_LENGTH = 4;

/**
 * Strip one Turkish suffix cluster. Returns the input unchanged when nothing
 * safe can be removed.
 */
export function turkishStem(token: string): string {
  const t = token.toLowerCase().trim();
  if (t.length <= TR_MIN_STEM_LENGTH) return t;

  for (const suffix of TR_SUFFIXES) {
    if (!t.endsWith(suffix)) continue;
    const stripped = t.slice(0, t.length - suffix.length);
    if (stripped.length < TR_MIN_STEM_LENGTH) continue;
    return stripped;
  }
  return t;
}

/**
 * Candidate dictionary forms for an inflected token.
 *
 * Hardening is lexically ambiguous — "yemeği" comes from "yemek" but "yağı"
 * comes from "yağ", and nothing in the surface form says which. Both readings
 * are returned so matching can accept either; a wrong candidate simply fails
 * to appear in the photo text rather than inventing a match.
 */
export function turkishStemCandidates(token: string): string[] {
  const stem = turkishStem(token);
  if (stem.length < TR_MIN_STEM_LENGTH) return [];
  const hardened = hardenFinalConsonant(stem);
  return hardened === stem ? [stem] : [stem, hardened];
}

/** "yemeğ" → "yemek" so an inflected token can meet its dictionary form. */
export function hardenFinalConsonant(stem: string): string {
  for (const [hard, soft] of TR_FINAL_SOFTENING) {
    if (stem.endsWith(soft)) return `${stem.slice(0, -1)}${hard}`;
  }
  return stem;
}

/** "yemek" → "yemeğ" so a dictionary hint can meet an inflected token. */
export function softenFinalConsonant(hint: string): string | null {
  for (const [hard, soft] of TR_FINAL_SOFTENING) {
    if (hint.endsWith(hard)) return `${hint.slice(0, -1)}${soft}`;
  }
  return null;
}

/**
 * Does `text` contain `token`, allowing for Turkish suffixes on either side?
 * Additive: falls back to the plain substring test first.
 */
export function textContainsToken(text: string, token: string): boolean {
  const haystack = text.toLowerCase();
  const needle = token.toLowerCase().trim();
  if (!needle) return false;
  if (haystack.includes(needle)) return true;

  return turkishStemCandidates(needle)
    .some((candidate) => candidate !== needle && haystack.includes(candidate));
}

/**
 * Does caption token `token` already account for photo word `word`?
 *
 * Guards bidirectional scoring: "burgerimiz" already earned its points against
 * "burger", so the reverse pass must not pay for the same word again — an
 * inflected caption would otherwise outscore its own dictionary form.
 */
export function tokenCoversWord(token: string, word: string): boolean {
  const t = token.toLowerCase();
  const w = word.toLowerCase();
  if (t === w || t.includes(w)) return true;
  return turkishStemCandidates(t).some((stem) => stem === w || stem.includes(w));
}

/**
 * Does `text` contain a dictionary `hint`, tolerating the softened form the
 * hint takes once a vowel-initial suffix attaches ("yemek" → "yemeği")?
 */
export function textContainsHint(text: string, hint: string): boolean {
  const haystack = text.toLowerCase();
  const needle = hint.toLowerCase().trim();
  if (!needle) return false;
  if (haystack.includes(needle)) return true;

  // Only whole words soften; a short hint would match unrelated stems.
  if (needle.length < TR_MIN_STEM_LENGTH) return false;
  const softened = softenFinalConsonant(needle);
  return softened ? haystack.includes(softened) : false;
}

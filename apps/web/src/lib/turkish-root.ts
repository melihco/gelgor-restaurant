/**
 * Agglutinative root check for folded (ASCII, lower-case) tokens.
 * "zeytinyagi" ↔ "zeytinyaglarimizi", "bal" ↔ "balimiz" (via length ≥ 5 rule
 * the caller must relax short words separately). No word list — pure prefix
 * morphology, so it holds for every tenant and sector.
 */
export function sharesAgglutinativeRoot(a: string, b: string): boolean {
  if (a.length < 5 || b.length < 5) return false;
  const limit = Math.min(a.length, b.length);
  let lcp = 0;
  while (lcp < limit && a.charCodeAt(lcp) === b.charCodeAt(lcp)) lcp += 1;
  if (lcp < 5) return false;
  return lcp >= Math.ceil(limit * 0.75);
}

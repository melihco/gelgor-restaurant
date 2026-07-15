/**
 * Word-level spelling deviation gate — painted typos that global similarity misses.
 * e.g. "Ferahlatan Koktey'ller" is 95% similar to "Ferahlatan Kokteyller" but the
 * apostrophe makes it an amateur, unusable render.
 */
import { describe, it, expect } from 'vitest';
import { hasWordLevelSpellingDeviation, quickTextSimilarity } from '../typography-text-validation';

describe('hasWordLevelSpellingDeviation', () => {
  it('rejects misplaced apostrophe inside a word ("Koktey\'ller")', () => {
    expect(
      hasWordLevelSpellingDeviation("Ferahlatan Koktey'ller", 'Ferahlatan Kokteyller'),
    ).toBe(true);
  });

  it('rejects near-miss painted typos (1-2 edit distance)', () => {
    expect(hasWordLevelSpellingDeviation('Ferahlatan Koktyller', 'Ferahlatan Kokteyller')).toBe(true);
    expect(hasWordLevelSpellingDeviation('Yaz Lezetleri', 'Yaz Lezzetleri')).toBe(true);
  });

  it('accepts exact matches including diacritics', () => {
    expect(hasWordLevelSpellingDeviation('Ferahlatan Kokteyller', 'Ferahlatan Kokteyller')).toBe(false);
    expect(hasWordLevelSpellingDeviation('Şeflerimizden Taze Lezzetler', 'Şeflerimizden Taze Lezzetler')).toBe(false);
  });

  it('accepts case and punctuation-only differences at word edges', () => {
    expect(hasWordLevelSpellingDeviation('FERAHLATAN KOKTEYLLER!', 'Ferahlatan Kokteyller')).toBe(false);
  });

  it('keeps intended apostrophes (proper noun possessive)', () => {
    expect(hasWordLevelSpellingDeviation("Bodrum'da Yaz", "Bodrum'da Yaz")).toBe(false);
  });

  it('ignores completely different words (handled by global similarity gate)', () => {
    // "Mutfak Hikayesi" vs intended "Ferahlatan Kokteyller" — words are not near-misses,
    // so this gate stays silent; quickTextSimilarity catches the mismatch instead.
    expect(hasWordLevelSpellingDeviation('Mutfak Hikayesi', 'Ferahlatan Kokteyller')).toBe(false);
    expect(quickTextSimilarity('Mutfak Hikayesi', 'Ferahlatan Kokteyller')).toBeLessThan(0.55);
  });
});

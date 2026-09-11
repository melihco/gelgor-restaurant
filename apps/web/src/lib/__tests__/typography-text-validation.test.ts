/**
 * Word-level spelling deviation gate — painted typos that global similarity misses.
 * e.g. "Ferahlatan Koktey'ller" is 95% similar to "Ferahlatan Kokteyller" but the
 * apostrophe makes it an amateur, unusable render.
 */
import { describe, it, expect } from 'vitest';
import {
  hasCollapsedWordSpacing,
  hasEdgeClippedLeadingGlyph,
  hasTurkishDiacriticMiss,
  hasWordLevelSpellingDeviation,
  quickTextSimilarity,
} from '../typography-text-validation';

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

  it('beach: Sinirli vs Sınırlı is a diacritic miss, not a new word', () => {
    expect(quickTextSimilarity('Sinirli Süre', 'Sınırlı Süre')).toBeGreaterThan(0.72);
    expect(hasTurkishDiacriticMiss('Sinirli Süre', 'Sınırlı Süre')).toBe(true);
    expect(hasTurkishDiacriticMiss('Sınırlı Süre', 'Sınırlı Süre')).toBe(false);
  });

  it('shop: Sizma vs Sızma is a diacritic miss', () => {
    expect(hasTurkishDiacriticMiss('Sizma zeytinyagi', 'Sızma zeytinyağı')).toBe(true);
    expect(hasTurkishDiacriticMiss('Sızma zeytinyağı', 'Sızma zeytinyağı')).toBe(false);
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

describe('hasCollapsedWordSpacing — shop + beach', () => {
  it('shop: rejects smashed early-harvest letters that similarity would pass', () => {
    const intended = 'Erken hasat zeytinyağımız';
    const painted = 'Erkenhasatzeytinyağımız';
    expect(quickTextSimilarity(painted, intended)).toBeGreaterThan(0.7);
    expect(hasCollapsedWordSpacing(painted, intended)).toBe(true);
  });

  it('beach: rejects Visitustoday against Visit us today', () => {
    expect(quickTextSimilarity('Visitustoday', 'Visit us today')).toBe(1);
    expect(hasCollapsedWordSpacing('Visitustoday', 'Visit us today')).toBe(true);
    expect(hasCollapsedWordSpacing("Bitez'inhuzurunubugünyaşayın", "Bitez'in huzurunu bugün yaşayın")).toBe(true);
  });

  it('keeps spaced shop and beach mottos', () => {
    expect(hasCollapsedWordSpacing('Sızma zeytinyağımız raflarda', 'Sızma zeytinyağımız raflarda')).toBe(false);
    expect(hasCollapsedWordSpacing('Deniz duruyor', 'Deniz duruyor')).toBe(false);
    expect(hasCollapsedWordSpacing('Visit us today', 'Visit us today')).toBe(false);
  });
});

describe('hasEdgeClippedLeadingGlyph', () => {
  it('rejects Yula-style left-edge clip ("ınırlı" ← "Sınırlı")', () => {
    expect(hasEdgeClippedLeadingGlyph('ınırlı Süre', 'Sınırlı Süre')).toBe(true);
    expect(hasEdgeClippedLeadingGlyph('zel Kampanya', 'Özel Kampanya')).toBe(true);
  });

  it('accepts complete Turkish copy', () => {
    expect(hasEdgeClippedLeadingGlyph('Sınırlı Süre', 'Sınırlı Süre')).toBe(false);
    expect(hasEdgeClippedLeadingGlyph('Özel Kampanya', 'Özel Kampanya')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  turkishStem,
  turkishStemCandidates,
  textContainsToken,
  textContainsHint,
} from '../turkish-morphology';

describe('turkishStem — suffix stripping', () => {
  it('strips possessive clusters down to the dictionary form', () => {
    expect(turkishStem('burgerimiz')).toBe('burger');
    expect(turkishStem('reçelimiz')).toBe('reçel');
    expect(turkishStem('makarnası')).toBe('makarna');
    expect(turkishStem('menüsü')).toBe('menü');
    expect(turkishStem('şezlongları')).toBe('şezlong');
  });

  it('leaves a token alone when stripping would leave a colliding fragment', () => {
    // "bal" ⊂ "balık" — honey must never stem into fish.
    expect(turkishStem('balık')).toBe('balık');
    expect(turkishStem('bal')).toBe('bal');
    expect(turkishStem('taze')).toBe('taze');
    expect(turkishStem('sıcak')).toBe('sıcak');
  });
});

describe('turkishStemCandidates — softening is ambiguous, so offer both', () => {
  it('offers the hardened reading for a softened stem', () => {
    expect(turkishStemCandidates('yemeği')).toEqual(['yemeğ', 'yemek']);
    expect(turkishStemCandidates('tabağımız')).toEqual(['tabağ', 'tabak']);
  });

  it('keeps roots that genuinely end in the soft consonant reachable', () => {
    // "yağ" is a root, not a softened "yak" — both readings must be offered or
    // the correct match is lost.
    expect(turkishStemCandidates('zeytinyağımız')).toContain('zeytinyağ');
  });
});

describe('textContainsToken — inflected caption token vs dictionary photo text', () => {
  it('matches an inflected caption token against vision description', () => {
    expect(textContainsToken('Burger and fries on a plate', 'burgerimiz')).toBe(true);
    expect(textContainsToken('sıcak yemek tabakları', 'yemeği')).toBe(true);
    expect(textContainsToken('Soğuk sıkım zeytinyağ şişeleri', 'zeytinyağımız')).toBe(true);
  });

  it('does not invent a match for unrelated text', () => {
    expect(textContainsToken('gym equipment dumbbell bench', 'burgerimiz')).toBe(false);
    expect(textContainsToken('nail art manicure studio', 'makarnası')).toBe(false);
  });
});

describe('textContainsHint — dictionary hint vs inflected caption', () => {
  it('tolerates final-consonant softening', () => {
    expect(textContainsHint('akşam yemeği için rezervasyon', 'yemek')).toBe(true);
    expect(textContainsHint('tabağımızda meze var', 'tabak')).toBe(true);
    expect(textContainsHint('adana kebabı', 'kebap')).toBe(true);
  });

  it('refuses to soften a hint too short to be a whole word', () => {
    expect(textContainsHint('bağ bozumu', 'bak')).toBe(false);
  });
});

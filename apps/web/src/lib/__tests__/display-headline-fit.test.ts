import { describe, expect, it } from 'vitest';
import { enforceDisplayHeadline } from '@/lib/grafiker-quality';

/**
 * On-canvas budgets (22 reel / 28 story / 32 post) are much tighter than the
 * headlines ideation writes, so the fit strategy decides what the design paints.
 * Tail truncation used to ship broken copy ("Yaz Pikniği Seti: Herkesin").
 */
describe('enforceDisplayHeadline keeps overbudget headlines readable', () => {
  it('cuts at an authored clause boundary instead of mid-phrase', () => {
    expect(enforceDisplayHeadline('Yaz Pikniği Seti: Herkesin Favorisi!', 28))
      .toBe('Yaz Pikniği Seti');
    expect(enforceDisplayHeadline('Zeytinlerin İhtişamı: Datça’nın Kalbinden!', 32))
      .toBe('Zeytinlerin İhtişamı');
    expect(enforceDisplayHeadline('Tatlar ve Anılar: Yaz Pikniği İçin Hazırız!', 28))
      .toBe('Tatlar ve Anılar');
  });

  it('sheds front modifiers so the Turkish head and verb survive', () => {
    // Turkish is head-final: keeping the tail keeps the sentence.
    expect(enforceDisplayHeadline('Mutlu Müşteri Yorumlarıyla Tanışın!', 32))
      .toBe('Müşteri Yorumlarıyla Tanışın!');
    expect(enforceDisplayHeadline('Serpme Kahvaltımız İle Güne Merhaba!', 32))
      .toBe('Kahvaltımız İle Güne Merhaba!');
  });

  it('never opens on a dangling connective', () => {
    const out = enforceDisplayHeadline('Bugün ailenizle birlikte ve dostlarınızla kutlayın!', 24);
    expect(out).not.toMatch(/^(ve|ile|için|and|with|for)\b/i);
  });

  it('never ends on a dangling connective', () => {
    const out = enforceDisplayHeadline('Doğal ürünlerimiz ve taze lezzetlerimiz sizi bekliyor', 22);
    expect(out).not.toMatch(/\s(ve|ile|için|and|with|for)$/i);
  });

  it('leaves headlines within budget untouched', () => {
    expect(enforceDisplayHeadline('Bahçemizden Sofranıza!', 28)).toBe('Bahçemizden Sofranıza!');
    expect(enforceDisplayHeadline('Bungalovda Ailece Keyifli Anlar!', 32))
      .toBe('Bungalovda Ailece Keyifli Anlar!');
  });

  it('stays within the budget in every strategy', () => {
    const samples = [
      'Yaz Pikniği Seti: Herkesin Favorisi!',
      'Mutlu Müşteri Yorumlarıyla Tanışın!',
      'Müşterilerimizden Gelen Güzel Yorumlar!',
      'Bungalovda Ailece Keyifli Anlar!',
      'Discover Our Freshly Baked Morning Pastries Today',
    ];
    for (const max of [22, 28, 32]) {
      for (const s of samples) {
        expect(enforceDisplayHeadline(s, max).length).toBeLessThanOrEqual(max);
      }
    }
  });
});

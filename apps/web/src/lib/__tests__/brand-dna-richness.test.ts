import { describe, expect, it } from 'vitest';
import {
  brandDnaRichness,
  isBrandDnaProductionReady,
} from '@/lib/brand-gap-analysis';

describe('brandDnaRichness', () => {
  it('rejects short visual_dna that only cleared the old length>50 gate', () => {
    const short = 'A warm premium brand with quality experience vibes for guests.';
    expect(short.length).toBeGreaterThan(50);
    expect(brandDnaRichness(null, short)).not.toBe('ok');
    expect(isBrandDnaProductionReady(null, short)).toBe(false);
  });

  it('accepts concrete visual DNA with tokens + length', () => {
    const dna = [
      'Coastal beach club at golden hour: warm amber #C8A86A and navy #1E3F55,',
      'linen textures, soft candle ambient light on the terrace, editorial serif overlays,',
      'cocktail close-ups and poolside lifestyle — never neon club chrome.',
    ].join(' ');
    expect(brandDnaRichness(null, dna)).toBe('ok');
    expect(isBrandDnaProductionReady(null, dna)).toBe(true);
  });

  it('treats explicit sparse brand_dna as not production-ready', () => {
    const sparse = {
      brand_essence: 'Local shop',
      data_richness: 'sparse',
      audience_intelligence: { what_they_want: 'Quality experience' },
    };
    expect(brandDnaRichness(sparse, null)).toBe('sparse');
    expect(isBrandDnaProductionReady(sparse, null)).toBe(false);
  });

  it('accepts moderate/rich structured DNA', () => {
    expect(brandDnaRichness({ data_richness: 'moderate' }, null)).toBe('moderate');
    expect(isBrandDnaProductionReady({ data_richness: 'rich' }, null)).toBe(true);
  });
});

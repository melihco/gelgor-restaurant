import { describe, it, expect } from 'vitest';

import {
  inferTypographyVibeFromBrandDna,
  typographyVibeFromBrandDna,
} from '../typography-vibe-inference';
import { resolveTypographyVibeFromContext } from '../fal-designer-production';
import { resolveTypographyVibe } from '../production-design-policy';

describe('inferTypographyVibeFromBrandDna — identity beats adjective soup', () => {
  it('takes a single identity term as decisive', () => {
    expect(inferTypographyVibeFromBrandDna('Bohemian Aegean coastal warmth, sun-bleached'))
      .toMatchObject({ vibe: 'warm_coastal', tier: 'identity' });
    expect(inferTypographyVibeFromBrandDna('Anatolian heritage, ocakbaşı and meze culture'))
      .toMatchObject({ vibe: 'anatolian_warm', tier: 'identity' });
    expect(inferTypographyVibeFromBrandDna('neon nightlife after-dark DJ booth'))
      .toMatchObject({ vibe: 'neon_glow', tier: 'identity' });
  });

  it('ignores universal filler words entirely', () => {
    // Nearly every generated visual DNA says "warm", "natural" or "clean";
    // deciding typography from them is a coin flip.
    expect(typographyVibeFromBrandDna('Warm and inviting atmosphere with natural wood')).toBeNull();
    expect(typographyVibeFromBrandDna('Clean modern spaces with bright natural light')).toBeNull();
  });

  it('requires two supporting adjectives before overruling a sector default', () => {
    expect(typographyVibeFromBrandDna('earthy terracotta tones')).toBeNull();
    expect(inferTypographyVibeFromBrandDna('refined premium elegant sophisticated dining'))
      .toMatchObject({ vibe: 'editorial_serif', tier: 'supporting' });
  });

  it('lets an identity term outrank supporting hits from another vibe', () => {
    // "premium/elegant" (supporting) must not beat "ocakbaşı" (identity).
    expect(inferTypographyVibeFromBrandDna('premium elegant ocakbaşı grill house'))
      .toMatchObject({ vibe: 'anatolian_warm', tier: 'identity' });
  });
});

describe('typography vibe resolution — palette words no longer pick the font', () => {
  it('keeps an Aegean beach club coastal despite a terracotta palette', () => {
    const dna = 'The color scheme is warm and inviting, featuring earthy tones like '
      + 'terracotta and teal, complemented by soft blues and sandy neutrals.';
    expect(resolveTypographyVibeFromContext({ visualDnaTone: dna, sector: 'beach_club' }))
      .toBe('warm_coastal');
    expect(resolveTypographyVibe({ sector: 'beach_club', visualDna: dna })).toBe('warm_coastal');
  });

  it('keeps a dental clinic clinical when its DNA is generic adjectives', () => {
    const dna = 'Clean modern minimal spaces with bright natural light';
    expect(resolveTypographyVibeFromContext({ visualDnaTone: dna, sector: 'dental_clinic' }))
      .toBe('clinical_clean');
    expect(resolveTypographyVibe({ sector: 'dental_clinic', visualDna: dna }))
      .toBe('clinical_clean');
  });

  it('both call sites agree — they used to keep separate keyword tables', () => {
    const dna = 'Anatolian ocakbaşı mezze terracotta heritage warm';
    expect(resolveTypographyVibeFromContext({ visualDnaTone: dna, sector: 'restaurant_cafe' }))
      .toBe(resolveTypographyVibe({ sector: 'restaurant_cafe', visualDna: dna }));
  });
});

describe('post mood / caption guard — one word cannot redefine a venue', () => {
  it('does not turn a beach club into a nightclub over "bar scene"', () => {
    expect(resolveTypographyVibeFromContext({
      sector: 'beach_club',
      postMood: 'bright and inviting bar scene with a focus on the cocktail',
    })).toBe('warm_coastal');
  });

  it('still honours a genuine nightlife theme', () => {
    expect(resolveTypographyVibeFromContext({
      sector: 'beach_club',
      postMood: 'neon dj set party night energy on the dancefloor',
    })).toBe('neon_glow');
  });

  it('leaves the sector default alone when the sector is already nightlife', () => {
    expect(resolveTypographyVibeFromContext({
      sector: 'nightclub_lounge',
      postMood: 'bright and inviting bar scene with a focus on the cocktail',
    })).toBe('neon_glow');
  });

  it('does not read nightlife out of ordinary words like "after"', () => {
    expect(resolveTypographyVibeFromContext({
      sector: 'restaurant_cafe',
      postMood: 'a calm moment after a long day at the counter',
    })).toBe('retro_poster');
  });

  it('keeps loud vibes available to non-venue sectors', () => {
    expect(resolveTypographyVibeFromContext({
      sector: 'fashion_retail',
      postMood: 'yeni sezon koleksiyon drop enerji',
    })).toBe('street_bold');
  });
});

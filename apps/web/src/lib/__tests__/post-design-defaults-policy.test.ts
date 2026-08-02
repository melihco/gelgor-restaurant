import { describe, expect, it } from 'vitest';
import {
  hasSavedPostDesignDefaults,
  resolvePostDesignDefaultsFromVibe,
} from '@/lib/post-design-defaults-policy';
import {
  resolvePostDesignDefaultsForTypography,
  resolveSuggestedTypographyConfig,
} from '@/lib/typography-design-policy';
import { defaultTypographyVibeForSector } from '@/types/brand-theme';

describe('post-design-defaults-policy', () => {
  it('maps handwritten / warm DNA vibes away from 3D poster', () => {
    const hw = resolvePostDesignDefaultsFromVibe('handwritten');
    expect(hw.font_preset).toBe('elegant_serif');
    expect(hw.text_effect).toBe('soft_shadow');

    const coastal = resolvePostDesignDefaultsFromVibe('warm_coastal');
    expect(coastal.font_preset).toBe('elegant_serif');
    expect(coastal.text_effect).toBe('soft_shadow');
  });

  it('keeps neon / street vibes on bold 3D presets', () => {
    expect(resolvePostDesignDefaultsFromVibe('neon_glow')).toMatchObject({
      font_preset: 'condensed_impact',
      text_effect: 'neon_3d',
    });
    expect(resolvePostDesignDefaultsFromVibe('street_bold')).toMatchObject({
      font_preset: 'poster_3d',
      text_effect: 'extrude_3d',
    });
  });

  it('hasSavedPostDesignDefaults is false for empty theme', () => {
    expect(hasSavedPostDesignDefaults({})).toBe(false);
    expect(hasSavedPostDesignDefaults({ post_design_defaults: {} })).toBe(false);
    expect(hasSavedPostDesignDefaults({
      post_design_defaults: { font_preset: 'elegant_serif', text_effect: 'soft_shadow' },
    })).toBe(true);
  });
});

describe('onboarding typography → post_design chain', () => {
  it('DNA-aware suggestion + post defaults for artisan restaurant', () => {
    const dna = 'Warm artisan garden restaurant, handwritten chalk menus, organic earthy palette';
    const suggested = resolveSuggestedTypographyConfig({}, 'restaurant_cafe', dna);
    expect(suggested.vibe).toBe('handwritten');
    expect(suggested.text_effect).toBe('soft_shadow');
    expect(suggested.background_style).toBe('photo_overlay');

    const post = resolvePostDesignDefaultsForTypography(suggested);
    expect(post.font_preset).toBe('elegant_serif');
    expect(post.text_effect).toBe('soft_shadow');
  });

  it('aligns hotel sector default with editorial_serif (not chrome_gradient)', () => {
    expect(defaultTypographyVibeForSector('hotel_resort')).toBe('editorial_serif');
    const suggested = resolveSuggestedTypographyConfig({}, 'hotel');
    expect(suggested.vibe).toBe('editorial_serif');
  });

  it('beach_club stays warm_coastal without neon DNA override', () => {
    const suggested = resolveSuggestedTypographyConfig({}, 'beach_club', 'Aegean coastal turquoise marina');
    expect(suggested.vibe).toBe('warm_coastal');
    const post = resolvePostDesignDefaultsForTypography(suggested);
    expect(post.font_preset).toBe('elegant_serif');
  });
});

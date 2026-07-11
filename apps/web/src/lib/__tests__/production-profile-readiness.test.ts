import { describe, expect, it } from 'vitest';
import {
  computeProductionProfileReadiness,
  isProductionFormatVisualDna,
  isSectorConsistentWithServiceProfile,
  PRODUCTION_PROFILE_THRESHOLD,
} from '../brand-readiness';

describe('production profile readiness', () => {
  const productionVisualDna = [
    'Mood: refined coastal calm',
    'Aesthetic: bohemian-luxe editorial',
    'Palette words: sand, coral, turquoise',
    'Lighting: golden hour natural',
    'Photography: photo-led quiet luxury',
    'Typography feel: understated serif',
    'Anti-look: neon clutter, stock wellness',
  ].join('\n');

  it('detects production-format visual_dna', () => {
    expect(isProductionFormatVisualDna(productionVisualDna)).toBe(true);
    expect(isProductionFormatVisualDna('**Brand**: Yula\nSome markdown DNA')).toBe(false);
    expect(isProductionFormatVisualDna('short')).toBe(false);
  });

  it('scores ready tenant at threshold', () => {
    const result = computeProductionProfileReadiness({
      serviceProfile: { category: 'beach_club_bar', category_confidence: 0.9 },
      businessType: 'beach_club',
      visualDna: productionVisualDna,
      brandTheme: {
        typography_design: {
          vibe: 'warm_coastal',
          confirmed_at: '2026-07-11T12:00:00.000Z',
          source: 'user',
        },
        fal_design_intensity: { story: 'photo_first', reel: 'elegant_light', post: 'elegant_light' },
        anti_patterns: ['neon clutter', 'stock wellness', 'kids party'],
      },
    });
    expect(result.score).toBe(100);
    expect(result.isProductionReady).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(PRODUCTION_PROFILE_THRESHOLD).toBe(70);
  });

  it('flags sector mismatch between SP and business_type', () => {
    expect(
      isSectorConsistentWithServiceProfile('local_products_shop', { category: 'beach_club_bar' }),
    ).toBe(false);

    const result = computeProductionProfileReadiness({
      serviceProfile: { category: 'beach_club_bar' },
      businessType: 'local_products_shop',
      visualDna: productionVisualDna,
      brandTheme: {
        typography_design: {
          vibe: 'warm_coastal',
          confirmed_at: '2026-07-11T12:00:00.000Z',
          source: 'user',
        },
        fal_design_intensity: { story: 'photo_first' },
        anti_patterns: ['a', 'b', 'c'],
      },
    });
    expect(result.checks.find((c) => c.id === 'sector_consistency')?.passed).toBe(false);
    expect(result.score).toBe(75);
    expect(result.isProductionReady).toBe(true);
  });

  it('scores local products shop consistently across sectors', () => {
    const result = computeProductionProfileReadiness({
      serviceProfile: { category: 'local_products_shop' },
      businessType: 'local_products_shop',
      visualDna: productionVisualDna,
      brandTheme: {
        typography_design: {
          vibe: 'retro_poster',
          confirmed_at: '2026-07-11T12:00:00.000Z',
          source: 'user',
        },
        fal_design_intensity: { story: 'photo_first' },
        anti_patterns: ['industrial', 'clinical', 'luxury hotel'],
      },
    });
    expect(result.checks.find((c) => c.id === 'sector_consistency')?.passed).toBe(true);
  });
});

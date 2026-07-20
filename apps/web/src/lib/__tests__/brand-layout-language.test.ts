import { describe, expect, it } from 'vitest';
import {
  clampIntensityToLayoutLanguage,
  resolveBrandLayoutLanguage,
  resolveCraftAllowlistForPack,
  shouldApplyCraftLayoutFamily,
} from '@/lib/brand-layout-language';
import { resolveDesignCraftLayoutFamily } from '@/lib/fal-design-intensity';

describe('resolveBrandLayoutLanguage', () => {
  it('maps quiet-luxury DNA on beach_club to soft craft allowlist (Yula-like)', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'beach_club',
      visualDna: 'sun-washed photography, refined type, quiet luxury, no neon flyer energy',
      brandTone: 'editorial, warm, understated',
      vibeProfile: { mood: 'Aegean luxury', energy: 'soft' },
    });
    expect(pack.id).toBe('coastal_editorial');
    expect(pack.composeMode).toBe('type_on_photo');
    expect(pack.craftAllowlist).toEqual(['type_with_brand_rules']);
    expect(pack.preferPhotoLedCraft).toBe(true);
    // Brand parameters may still set designed — DNA does not clamp intensity.
    expect(shouldApplyCraftLayoutFamily('designed', pack)).toBe(true);
    expect(clampIntensityToLayoutLanguage('designed', pack)).toBe('designed');
  });

  it('keeps local_products_shop on product_catalog — soft craft, no heavy rail/L (Karaman)', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'local_products_shop',
      visualDna: 'artisan jars, warm wood, natural packaging',
      brandTone: 'samimi, organik',
    });
    expect(pack.id).toBe('product_catalog');
    expect(pack.craftAllowlist).toEqual(['type_with_brand_rules', 'inset_photo_frame']);
    expect(pack.craftAllowlist).not.toContain('side_rail_frame');
    expect(pack.craftAllowlist).not.toContain('l_shape_accent');
    // Designed from Brand Hub / slot must keep craft — DNA must not force elegant_light.
    expect(shouldApplyCraftLayoutFamily('designed', pack)).toBe(true);
    expect(clampIntensityToLayoutLanguage('designed', pack)).toBe('designed');
  });

  it('allows bold craft for nightlife DNA without quiet signals', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'nightclub_lounge',
      visualDna: 'neon nightlife, after-dark electric energy, DJ booth',
      brandTone: 'bold, high energy',
    });
    expect(pack.id).toBe('nightlife_bold');
    expect(pack.craftAllowlist).toContain('side_rail_frame');
  });

  it('defaults premium venue without DNA toward quiet/coastal — not balanced_default paint pack', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'beach_club',
      visualDna: '',
      brandTone: '',
    });
    expect(['quiet_luxury', 'coastal_editorial']).toContain(pack.id);
  });
});

describe('craft allowlist + family resolver', () => {
  it('never picks heavy families outside product allowlist', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'local_products_shop',
      visualDna: 'product packaging catalog',
    });
    const allow = resolveCraftAllowlistForPack(pack);
    for (let i = 0; i < 12; i += 1) {
      const family = resolveDesignCraftLayoutFamily(`slot-${i}-product`, allow);
      expect(allow).toContain(family);
      expect(family === 'side_rail_frame' || family === 'editorial_split_soft').toBe(false);
    }
  });

  it('respects parameter intensity for craft — elegant_light skips lock, designed uses allowlist', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'fine_dining',
      visualDna: 'quiet luxury refined serene understated',
    });
    expect(pack.id).toBe('quiet_luxury');
    expect(shouldApplyCraftLayoutFamily('elegant_light', pack)).toBe(false);
    expect(shouldApplyCraftLayoutFamily('designed', pack)).toBe(true);
    expect(resolveCraftAllowlistForPack(pack)).toEqual(['type_with_brand_rules']);
  });
});

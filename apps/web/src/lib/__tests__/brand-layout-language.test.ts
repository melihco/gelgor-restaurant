import { describe, expect, it } from 'vitest';
import {
  clampIntensityToLayoutLanguage,
  resolveBrandLayoutLanguage,
  resolveCraftAllowlistForPack,
  shouldApplyCraftLayoutFamily,
} from '@/lib/brand-layout-language';
import { resolveDesignCraftLayoutFamily } from '@/lib/fal-design-intensity';

describe('resolveBrandLayoutLanguage', () => {
  it('keeps vibrant beach_club (Yula-like) on coastal craft-window — not caption-only', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'beach_club',
      visualDna:
        'Mood: sunlit coastal joy — citrus-bright, social, unhurried Drink & Chill. Aesthetic: Aegean beach-club daybed life — turquoise water',
      brandTone: 'inviting, vibrant, fresh, relaxed',
      // Nested typography noise must NOT force quiet luxury
      vibeProfile: {
        motion: { pace: 'serene beach visuals' },
        typography: { heading_personality: 'condensed editorial uppercase serif' },
      },
    });
    expect(pack.id).toBe('coastal_editorial');
    expect(pack.composeMode).toBe('craft_window');
    expect(pack.craftAllowlist.length).toBeGreaterThan(1);
    expect(pack.craftAllowlist).toContain('asymmetric_corner_plate');
    expect(shouldApplyCraftLayoutFamily('bold_editorial', pack)).toBe(true);
    expect(clampIntensityToLayoutLanguage('bold_editorial', pack)).toBe('bold_editorial');
  });

  it('maps true quiet-luxury coastal soul to type-led coastal', () => {
    const pack = resolveBrandLayoutLanguage({
      sector: 'beach_club',
      visualDna: 'sun-washed photography, quiet luxury, understated Aman restraint, no neon',
      brandTone: 'editorial, warm, understated',
    });
    expect(pack.id).toBe('coastal_editorial');
    expect(pack.composeMode).toBe('type_on_photo');
    expect(pack.craftAllowlist).toEqual(['type_with_brand_rules']);
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
    expect(shouldApplyCraftLayoutFamily('designed', pack)).toBe(true);
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
    }
  });
});

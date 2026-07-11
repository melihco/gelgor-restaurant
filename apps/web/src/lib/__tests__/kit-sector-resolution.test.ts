import { describe, expect, it } from 'vitest';
import { getBrandKit } from '@/lib/agency-brand-kits';
import { kitMatchesSector, resolveKitForSector } from '@/lib/story-template-registry';
import { deriveBrandTemplateLibrary, ensureBrandTemplateLibrary } from '@/lib/brand-template-library';

const sectorOfKit = (kitId: string) => getBrandKit(kitId)?.sector;

describe('resolveKitForSector — deterministic, sector-accurate', () => {
  it('maps hospitality canonical sectors to a matching kit (never random)', () => {
    expect(sectorOfKit(resolveKitForSector('beach_club'))).toBe('beach_club');
    expect(sectorOfKit(resolveKitForSector('beach_club_bar'))).toBe('beach_club');
    expect(sectorOfKit(resolveKitForSector('restaurant_bar'))).toBe('cocktail_bar');
    expect(sectorOfKit(resolveKitForSector('restaurant_cafe'))).toBe('cafe_bakery');
  });

  it('never resolves a bar/restaurant to vegan_cafe or other absurd kits', () => {
    for (const seed of [0, 1, 7, 13, 35, 49, 100]) {
      const sector = sectorOfKit(resolveKitForSector('restaurant_bar', seed));
      expect(sector).not.toBe('vegan_cafe');
      expect(sector).toBe('cocktail_bar');
    }
  });

  it('falls back to a neutral, brand-appropriate kit for unmappable sectors', () => {
    const NEUTRAL = ['cafe_bakery', 'fine_dining', 'mediterranean', 'boutique_hotel', 'art_gallery'];
    for (const seed of [0, 3, 9, 22]) {
      const sector = sectorOfKit(resolveKitForSector('something_totally_unknown_xyz', seed));
      expect(NEUTRAL).toContain(sector);
    }
  });

  it('is deterministic for the same sector + seed', () => {
    expect(resolveKitForSector('restaurant_bar', 5)).toBe(resolveKitForSector('restaurant_bar', 5));
  });
});

describe('kitMatchesSector — locked-kit compatibility', () => {
  it('flags the misclassification kit as incompatible after sector correction', () => {
    expect(kitMatchesSector('kit_36_vegan_cafe', 'restaurant_bar')).toBe(false);
    expect(kitMatchesSector('kit_36_vegan_cafe', 'restaurant_cafe')).toBe(false);
    expect(kitMatchesSector('kit_12_art_gallery', 'restaurant_cafe')).toBe(false);
  });

  it('keeps a correctly-matched kit compatible', () => {
    const beachKit = resolveKitForSector('beach_club');
    expect(kitMatchesSector(beachKit, 'beach_club')).toBe(true);
    const cafeKit = resolveKitForSector('restaurant_cafe');
    expect(kitMatchesSector(cafeKit, 'restaurant_cafe')).toBe(true);
  });

  it('does not churn when the sector is unmappable (cannot judge)', () => {
    expect(kitMatchesSector('kit_36_vegan_cafe', 'something_totally_unknown_xyz')).toBe(true);
  });
});

describe('ensureBrandTemplateLibrary — auto-heal locked wrong kit', () => {
  const lockedVeganTheme = (() => {
    const lib = deriveBrandTemplateLibrary({ sector: 'local_products_shop', tenantId: 't1', kitId: 'kit_36_vegan_cafe' });
    return { template_library: { ...lib, locked: true } };
  })();

  it('re-derives a locked vegan_cafe library once the sector is corrected to restaurant', () => {
    const healed = ensureBrandTemplateLibrary(lockedVeganTheme, { sector: 'restaurant_cafe', tenantId: 't1' });
    expect(healed.kitId).not.toBe('kit_36_vegan_cafe');
    expect(sectorOfKit(healed.kitId)).toBe('cafe_bakery');
  });

  it('preserves a locked library that still matches its sector', () => {
    const beachKit = resolveKitForSector('beach_club');
    const lib = deriveBrandTemplateLibrary({ sector: 'beach_club', tenantId: 't1', kitId: beachKit });
    const theme = { template_library: { ...lib, locked: true } };
    const kept = ensureBrandTemplateLibrary(theme, { sector: 'beach_club', tenantId: 't1' });
    expect(kept.kitId).toBe(beachKit);
  });

  it('honours an explicit kitId override even when locked', () => {
    const kept = ensureBrandTemplateLibrary(lockedVeganTheme, { sector: 'restaurant_cafe', tenantId: 't1', kitId: 'kit_36_vegan_cafe' });
    expect(kept.kitId).toBe('kit_36_vegan_cafe');
  });
});

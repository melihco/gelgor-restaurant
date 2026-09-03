import { describe, expect, it } from 'vitest';
import { compileBrandDesignConstitution } from '@/lib/brand-design-constitution';
import { CANVA_SECTOR_ARCHETYPE_HINTS } from '@/lib/canva-archetype-catalog';
import {
  mergeHouseFamilyIntoTheme,
  parseHouseMoodboardRefs,
  resolveHouseLayoutFamily,
  rotateHouseFamilyArchetype,
  themeNeedsHouseFamilySeal,
} from '@/lib/house-layout-family';

describe('resolveHouseLayoutFamily', () => {
  it('keeps beach coastal family inside the beach pool', () => {
    const family = resolveHouseLayoutFamily({
      sector: 'beach_club',
      layoutPackId: 'coastal_editorial',
    });
    const pool = CANVA_SECTOR_ARCHETYPE_HINTS.beach_club!;
    expect(family).toHaveLength(3);
    expect(family).toEqual([
      'cinematic_full_bleed',
      'diagonal_brand_split',
      'split_feature_panel',
    ]);
    expect(family.every((id) => pool.includes(id))).toBe(true);
    expect(family).not.toContain('neon_night_promo');
  });

  it('keeps shop catalog family inside the shop pool — never neon', () => {
    const family = resolveHouseLayoutFamily({
      sector: 'local_products_shop',
      layoutPackId: 'product_catalog',
    });
    const pool = CANVA_SECTOR_ARCHETYPE_HINTS.local_products_shop!;
    expect(family).toEqual([
      'product_hero_card',
      'promo_price_stack',
      'graphic_shape_stack',
    ]);
    expect(family.every((id) => pool.includes(id))).toBe(true);
    expect(family).not.toContain('neon_night_promo');
  });

  it('drops pack seeds that leave the sector and fills from the pool', () => {
    const family = resolveHouseLayoutFamily({
      sector: 'local_products_shop',
      layoutPackId: 'quiet_luxury',
    });
    const pool = CANVA_SECTOR_ARCHETYPE_HINTS.local_products_shop!;
    expect(family).toHaveLength(3);
    expect(family.every((id) => pool.includes(id))).toBe(true);
    expect(family).not.toContain('noir_editorial');
    expect(family).not.toContain('neon_night_promo');
  });

  it('lets in-sector tenant prefs win, then fills from the pack', () => {
    const family = resolveHouseLayoutFamily({
      sector: 'beach_club',
      layoutPackId: 'coastal_editorial',
      tenantPreferred: ['social_proof_banner', 'neon_night_promo'],
    });
    expect(family[0]).toBe('social_proof_banner');
    expect(family[1]).toBe('neon_night_promo');
    expect(family[2]).toBe('cinematic_full_bleed');
  });

  it('ignores tenant prefs outside the sector pool', () => {
    const family = resolveHouseLayoutFamily({
      sector: 'local_products_shop',
      layoutPackId: 'product_catalog',
      tenantPreferred: ['neon_night_promo', 'event_ticket_stub'],
    });
    expect(family).not.toContain('neon_night_promo');
    expect(family[0]).toBe('product_hero_card');
  });
});

describe('rotateHouseFamilyArchetype', () => {
  it('shares three geometries across five library shells', () => {
    const family = ['cinematic_full_bleed', 'diagonal_brand_split', 'split_feature_panel'];
    const rotated = [0, 1, 2, 3, 4].map((i) => rotateHouseFamilyArchetype(family, i));
    expect(new Set(rotated).size).toBe(3);
    expect(rotated[0]).toBe('cinematic_full_bleed');
    expect(rotated[3]).toBe('cinematic_full_bleed');
    expect(rotated.every((id) => family.includes(id!))).toBe(true);
  });
});

describe('parseHouseMoodboardRefs', () => {
  it('keeps the first three usable onboarding refs and skips stock', () => {
    expect(parseHouseMoodboardRefs([
      'https://cdn.example.com/a.jpg',
      'https://images.unsplash.com/photo-1',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
      'https://cdn.example.com/d.jpg',
    ])).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.jpg',
      'https://cdn.example.com/c.jpg',
    ]);
  });
});

describe('house family theme seal', () => {
  it('seals empty typography prefs and is a no-op when prefs already exist', () => {
    const family = ['product_hero_card', 'promo_price_stack', 'graphic_shape_stack'];
    expect(themeNeedsHouseFamilySeal({}, family)).toBe(true);
    expect(themeNeedsHouseFamilySeal({
      typography_design: { preferred_canva_archetypes: ['product_hero_card'] },
    }, family)).toBe(false);

    const sealed = mergeHouseFamilyIntoTheme({ palette: { primary: '#5c3317' } }, family);
    expect(sealed.typography_design).toMatchObject({
      preferred_canva_archetypes: family,
    });
  });
});

describe('constitution stamps house family + moodboard', () => {
  it('gives coastal beach and artisan shop different in-sector families', () => {
    const beach = compileBrandDesignConstitution({
      brandName: 'Coastal Club',
      sector: 'beach_club',
      visualDna: 'sun-washed Aegean photography',
      brandTone: 'warm coastal',
      referenceImageUrls: [
        'https://cdn.example.com/beach-1.jpg',
        'https://cdn.example.com/beach-2.jpg',
        'https://cdn.example.com/beach-3.jpg',
      ],
    });
    const night = compileBrandDesignConstitution({
      brandName: 'Night Deck',
      sector: 'beach_club',
      visualDna: 'neon nightclub DJ terrace, late-night energy',
      brandTone: 'bold nightlife',
    });
    const shop = compileBrandDesignConstitution({
      brandName: 'Datça Atölye',
      sector: 'local_products_shop',
      visualDna: 'artisan jars, terracotta, handwritten labels',
      brandTheme: {
        typography_design: {
          preferred_canva_archetypes: ['polaroid_memory', 'frosted_quote_card'],
        },
      },
    });

    expect(beach.signatureArchetypes).toEqual([
      'cinematic_full_bleed',
      'diagonal_brand_split',
      'split_feature_panel',
    ]);
    expect(night.layoutPackId).toBe('nightlife_bold');
    expect(night.signatureArchetypes[0]).toBe('neon_night_promo');
    expect(night.signatureArchetypes).not.toEqual(beach.signatureArchetypes);
    expect(shop.signatureArchetypes[0]).toBe('polaroid_memory');
    expect(shop.signatureArchetypes[1]).toBe('frosted_quote_card');
    expect(shop.signatureArchetypes).not.toContain('neon_night_promo');

    const house = beach;
    expect(house.moodboardRefs).toHaveLength(3);
    expect(house.preferredArchetypes).toEqual(house.signatureArchetypes);
  });
});

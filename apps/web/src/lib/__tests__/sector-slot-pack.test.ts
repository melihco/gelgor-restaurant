import { describe, it, expect } from 'vitest';
import {
  SECTOR_SLOT_PACKS,
  buildSlotKeysBySectorFromPacks,
  getSectorSlotPack,
  listSectorSlotPackIds,
  slotKeyForSector,
} from '@/lib/sector-slot-pack';

describe('sector-slot-pack coverage', () => {
  const requiredSectors = [
    'beach_club',
    'restaurant_cafe',
    'coffee_shop',
    'fine_dining',
    'hospitality',
    'beauty_wellness',
    'barber_salon',
    'healthcare_clinic',
    'wedding_event',
    'local_products_shop',
    'ecommerce_retail',
    'fitness_gym',
    'nightclub',
    'fashion_boutique',
    'bakery_patisserie',
    'real_estate',
    'local_service_business',
    'general_business',
  ];

  it('covers all required canonical sectors', () => {
    const ids = listSectorSlotPackIds();
    for (const sector of requiredSectors) {
      expect(ids).toContain(sector);
      expect(getSectorSlotPack(sector)).not.toBeNull();
    }
  });

  it('each sector has 12–20 unique slot keys', () => {
    const keysBySector = buildSlotKeysBySectorFromPacks();
    for (const pack of SECTOR_SLOT_PACKS) {
      const keys = keysBySector[pack.sectorId] ?? [];
      expect(keys.length).toBeGreaterThanOrEqual(12);
      expect(keys.length).toBeLessThanOrEqual(20);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(key.startsWith(`${pack.sectorId}_`)).toBe(true);
      }
    }
  });

  it('format mix includes post, story, reel, and carousel', () => {
    for (const pack of SECTOR_SLOT_PACKS) {
      const formats = new Set(pack.instances.map((i) => i.format));
      expect(formats.has('post')).toBe(true);
      expect(formats.has('story')).toBe(true);
      expect(formats.has('reel')).toBe(true);
      expect(formats.has('carousel')).toBe(true);
    }
  });

  it('beach_club pool slots are optional-tagged', () => {
    const pack = getSectorSlotPack('beach_club');
    const poolKeys = pack?.instances.filter((i) => i.suffix.includes('pool')) ?? [];
    expect(poolKeys.length).toBeGreaterThan(0);
    for (const inst of poolKeys) {
      expect(inst.optionalTags).toContain('requires:pool');
    }
    expect(slotKeyForSector('beach_club', 'pool_lifestyle_post')).toBe('beach_club_pool_lifestyle_post');
  });

  it('coffee_shop is distinct from restaurant_cafe keys', () => {
    const coffee = buildSlotKeysBySectorFromPacks().coffee_shop;
    const restaurant = buildSlotKeysBySectorFromPacks().restaurant_cafe;
    expect(coffee.some((k) => k.includes('latte'))).toBe(true);
    expect(coffee.every((k) => !restaurant.includes(k))).toBe(true);
  });

  it('wedding_event has bridal and venue slots', () => {
    const keys = buildSlotKeysBySectorFromPacks().wedding_event;
    expect(keys.some((k) => k.includes('bridal'))).toBe(true);
    expect(keys.some((k) => k.includes('venue'))).toBe(true);
  });
});

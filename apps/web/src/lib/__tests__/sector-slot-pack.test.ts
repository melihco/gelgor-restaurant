import { describe, it, expect } from 'vitest';
import {
  CROSS_SECTOR_SERVICE_SLOTS,
  DEFAULT_SLOT_FACILITIES,
  SECTOR_SLOT_PACKS,
  buildSlotKeysBySectorFromPacks,
  getSectorSlotPack,
  instanceToSlotDefinition,
  listSectorSlotPackIds,
  slotEnabledByFacilities,
  slotKeyForSector,
  synthesizeSectorSlotDefinitions,
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
    'kids_party_venue',
    'local_products_shop',
    'ecommerce_retail',
    'fitness_gym',
    'nightclub',
    'fashion_boutique',
    'bakery_patisserie',
    'real_estate',
    'local_service_business',
    'agency_services',
    'jewelry_accessories',
    'general_business',
  ];

  it('covers all required canonical sectors', () => {
    const ids = listSectorSlotPackIds();
    for (const sector of requiredSectors) {
      expect(ids).toContain(sector);
      expect(getSectorSlotPack(sector)).not.toBeNull();
    }
  });

  it('each sector has 12–40 unique slot keys', () => {
    const keysBySector = buildSlotKeysBySectorFromPacks();
    for (const pack of SECTOR_SLOT_PACKS) {
      const keys = keysBySector[pack.sectorId] ?? [];
      expect(keys.length).toBeGreaterThanOrEqual(12);
      expect(keys.length).toBeLessThanOrEqual(40);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(key.startsWith(`${pack.sectorId}_`)).toBe(true);
      }
    }
  });

  it('gates restaurant cocktail/happy-hour behind opt-in bar facility', () => {
    expect(DEFAULT_SLOT_FACILITIES.bar).toBe(false);
    const cafe = synthesizeSectorSlotDefinitions('restaurant_cafe');
    const happy = cafe.find((s) => s.slot_key === 'restaurant_cafe_happy_hour_post');
    const cocktail = cafe.find((s) => s.slot_key === 'restaurant_cafe_cocktail_bar_reel');
    expect(happy?.optional_tags).toEqual(expect.arrayContaining(['requires:bar']));
    expect(cocktail?.optional_tags).toEqual(expect.arrayContaining(['requires:bar']));
    expect(slotEnabledByFacilities(happy?.optional_tags, DEFAULT_SLOT_FACILITIES)).toBe(false);
    expect(
      slotEnabledByFacilities(happy?.optional_tags, { ...DEFAULT_SLOT_FACILITIES, bar: true }),
    ).toBe(true);
  });

  it('every sector includes opt-in hiring + events_calendar service slots', () => {
    expect(DEFAULT_SLOT_FACILITIES.hiring).toBe(false);
    expect(DEFAULT_SLOT_FACILITIES.events_calendar).toBe(false);
    expect(CROSS_SECTOR_SERVICE_SLOTS.length).toBe(4);

    for (const pack of SECTOR_SLOT_PACKS) {
      for (const extra of CROSS_SECTOR_SERVICE_SLOTS) {
        const inst = pack.instances.find((i) => i.suffix === extra.suffix);
        expect(inst, `${pack.sectorId} missing ${extra.suffix}`).toBeTruthy();
        expect(inst!.optionalTags).toEqual(extra.optionalTags);
      }
    }

    const beach = synthesizeSectorSlotDefinitions('beach_club');
    const hiring = beach.find((s) => s.slot_key === 'beach_club_hiring_open_role_post');
    expect(hiring?.match_signals?.announcement_types).toEqual(
      expect.arrayContaining(['hiring', 'job_posting']),
    );
    expect(hiring?.design_template_type).toBe('announcement_formal');
    expect(slotEnabledByFacilities(hiring?.optional_tags, DEFAULT_SLOT_FACILITIES)).toBe(false);
    expect(
      slotEnabledByFacilities(hiring?.optional_tags, { ...DEFAULT_SLOT_FACILITIES, hiring: true }),
    ).toBe(true);

    const events = beach.find((s) => s.slot_key === 'beach_club_events_calendar_story');
    expect(events?.design_template_type).toBe('event_special');
    expect(events?.match_signals?.announcement_types).toEqual(
      expect.arrayContaining(['events_calendar', 'event_announcement']),
    );
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

  it('kids_party_venue has birthday/theme slots and stays off wedding bridal', () => {
    const keys = buildSlotKeysBySectorFromPacks().kids_party_venue;
    expect(keys.some((k) => k.includes('birthday_package'))).toBe(true);
    expect(keys.some((k) => k.includes('theme_room'))).toBe(true);
    expect(keys.every((k) => !k.includes('bridal'))).toBe(true);
    const pack = getSectorSlotPack('kids_party_venue');
    const theme = pack?.instances.find((i) => i.suffix === 'theme_room_post');
    expect(theme?.optionalTags).toContain('requires:kids_area');
  });

  it('wedding photography slots gate on wedding_photography facility', () => {
    const pack = getSectorSlotPack('wedding_event');
    const photo = pack?.instances.find((i) => i.suffix === 'couple_portrait_post');
    expect(photo?.optionalTags).toContain('requires:wedding_photography');
    expect(DEFAULT_SLOT_FACILITIES.wedding_photography).toBe(false);
    expect(slotEnabledByFacilities(photo?.optionalTags, DEFAULT_SLOT_FACILITIES)).toBe(false);
    expect(
      slotEnabledByFacilities(photo?.optionalTags, {
        ...DEFAULT_SLOT_FACILITIES,
        wedding_photography: true,
      }),
    ).toBe(true);
  });

  it('agency_services and jewelry_accessories packs are production-ready size', () => {
    for (const sector of ['agency_services', 'jewelry_accessories'] as const) {
      const pack = getSectorSlotPack(sector);
      expect(pack).not.toBeNull();
      expect(pack!.instances.length).toBeGreaterThanOrEqual(16);
      const formats = new Set(pack!.instances.map((i) => i.format));
      expect(formats.has('post')).toBe(true);
      expect(formats.has('story')).toBe(true);
      expect(formats.has('reel')).toBe(true);
      expect(formats.has('carousel')).toBe(true);
    }
  });

  it('beach_club and restaurant_cafe expose story poster slots with pipeline overrides', () => {
    for (const sectorId of ['beach_club', 'restaurant_cafe'] as const) {
      const pack = getSectorSlotPack(sectorId)!;
      const eventInst = pack.instances.find((i) => i.suffix === 'event_announcement_story');
      const typoInst = pack.instances.find((i) => i.suffix === 'typography_poster_story');
      expect(eventInst?.format).toBe('story');
      expect(eventInst?.pipeline).toBe('fal_story');
      expect(eventInst?.slotRole).toBe('campaign_story_motion');
      expect(typoInst?.format).toBe('story');
      expect(typoInst?.pipeline).toBe('fal_only_story');
      expect(typoInst?.slotRole).toBe('fal_only_story');

      const eventDef = instanceToSlotDefinition(pack, eventInst!, 100);
      const typoDef = instanceToSlotDefinition(pack, typoInst!, 110);
      expect(eventDef.slot_key).toBe(`${sectorId}_event_announcement_story`);
      expect(eventDef.pipeline).toBe('fal_story');
      expect(typoDef.pipeline).toBe('fal_only_story');
      expect(typoDef.design_template_type).toBe('campaign_announcement');
      expect(eventDef.design_template_type).toBe('event_special');
    }
  });
});

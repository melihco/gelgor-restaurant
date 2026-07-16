import { describe, it, expect } from 'vitest';
import { buildMissionSlotChecklist } from '@/lib/mission-slot-checklist';

// Faz 5 — flip cards must follow durable production_jobs rows (catalog label + template),
// not Feed Director generic roles or static manifest padding.

const baseAssignment = (ideaIndex: number, slotRole: string, catalogSlotKey?: string) => ({
  idea_index: ideaIndex,
  slot_role: slotRole,
  pipeline: 'fal_design',
  copy_bundle_id: 'week',
  publish_channel: 'instagram_organic',
  ...(catalogSlotKey ? { catalog_slot_key: catalogSlotKey } : {}),
});

describe('buildMissionSlotChecklist factory-first (Faz 5)', () => {
  it('uses factory slots as the sole checklist source when plan rows exist (restaurant_cafe)', () => {
    const checklist = buildMissionSlotChecklist({
      missionId: 'm-factory',
      missionType: 'weekly_content',
      assignments: [
        baseAssignment(0, 'fal_only_reel'),
        baseAssignment(1, 'fal_only_reel'),
        baseAssignment(0, 'fal_story_motion'),
      ],
      artifacts: [],
      missionInFlight: true,
      factorySlots: [
        {
          ideaIndex: 0,
          slotRole: 'organic_post',
          catalogSlotKey: 'restaurant_cafe_private_dining_post',
          catalogSlotLabel: 'Özel yemek',
          pipeline: 'gallery_photo',
          status: 'pending',
        },
        {
          ideaIndex: 3,
          slotRole: 'designed_typography',
          catalogSlotKey: 'restaurant_cafe_seasonal_ingredient_post',
          catalogSlotLabel: 'Mevsimsel malzeme',
          pipeline: 'fal_design',
          status: 'running',
        },
      ],
    });

    expect(checklist.items).toHaveLength(2);
    expect(checklist.items.every((i) => i.catalogSlotLabel)).toBe(true);
    expect(checklist.items.some((i) => i.label.includes('fal.ai'))).toBe(false);
    expect(checklist.items[0]!.catalogSlotLabel).toBe('Özel yemek');
    expect(checklist.items[1]!.status).toBe('rendering');
  });

  it('shows catalog labels on factory rows (beach_club)', () => {
    const checklist = buildMissionSlotChecklist({
      missionId: 'm-1',
      missionType: 'weekly_content',
      assignments: [baseAssignment(0, 'fal_designed_post', 'beach_club_pool_lifestyle_post')],
      artifacts: [],
      missionInFlight: true,
      factorySlots: [{
        ideaIndex: 0,
        slotRole: 'fal_designed_post',
        catalogSlotKey: 'beach_club_dj_night_teaser_post',
        catalogSlotLabel: 'DJ Gecesi Teaser',
        status: 'pending',
      }],
    });

    expect(checklist.items).toHaveLength(1);
    expect(checklist.items[0]!.catalogSlotKey).toBe('beach_club_dj_night_teaser_post');
    expect(checklist.items[0]!.catalogSlotLabel).toBe('DJ Gecesi Teaser');
    expect(checklist.items[0]!.label).toBe('DJ Gecesi Teaser');
  });

  it('falls back to FD assignments when no factory rows exist (local_products_shop)', () => {
    const checklist = buildMissionSlotChecklist({
      missionId: 'm-2',
      missionType: 'weekly_content',
      assignments: [baseAssignment(0, 'designed_typography', 'local_products_shop_harvest_post')],
      artifacts: [],
      missionInFlight: true,
    });

    const item = checklist.items.find((i) => i.role === 'designed_typography');
    expect(item?.catalogSlotKey).toBe('local_products_shop_harvest_post');
    expect(item?.catalogSlotLabel ?? null).toBeNull();
  });

  it('leaves pre-plan items without catalog binding untouched', () => {
    const checklist = buildMissionSlotChecklist({
      missionId: 'm-3',
      missionType: 'weekly_content',
      assignments: [baseAssignment(0, 'organic_post')],
      artifacts: [],
      missionInFlight: true,
    });

    const item = checklist.items.find((i) => i.role === 'organic_post');
    expect(item).toBeTruthy();
    expect(item?.catalogSlotKey).toBeUndefined();
  });
});

describe('buildMissionSlotChecklist catalog-first FD', () => {
  it('uses FD catalog_slot_label before generic role labels (local_products_shop)', () => {
    const checklist = buildMissionSlotChecklist({
      missionId: 'm-fd-catalog',
      missionType: 'weekly_content',
      assignments: [{
        ...baseAssignment(0, 'fal_designed_post', 'local_products_shop_harvest_post'),
        catalog_slot_label: 'Hasat Sezonu',
      }],
      artifacts: [],
      missionInFlight: true,
    });

    expect(checklist.items).toHaveLength(1);
    expect(checklist.items[0]?.label).toBe('Hasat Sezonu');
    expect(checklist.items[0]?.catalogSlotKey).toBe('local_products_shop_harvest_post');
  });

  it('skips static manifest padding when FD assignments are catalog-first', () => {
    const checklist = buildMissionSlotChecklist({
      missionId: 'm-no-padding',
      missionType: 'weekly_content',
      assignments: [
        baseAssignment(0, 'campaign_story_motion', 'restaurant_cafe_new_menu_story'),
        baseAssignment(1, 'fal_designed_post', 'restaurant_cafe_brunch_offer_post'),
      ],
      artifacts: [],
      missionInFlight: true,
    });

    expect(checklist.items).toHaveLength(2);
    expect(checklist.items.every((i) => i.catalogSlotKey)).toBe(true);
    expect(checklist.items.some((i) => i.label.includes('fal.ai'))).toBe(false);
  });
});

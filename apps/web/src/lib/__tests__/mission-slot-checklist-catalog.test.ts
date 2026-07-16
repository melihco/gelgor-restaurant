import { describe, it, expect } from 'vitest';
import { buildMissionSlotChecklist } from '@/lib/mission-slot-checklist';

// Faz 5 — the checklist must surface tenant catalog bindings (slot_key + label_tr)
// coming from durable production_jobs rows, falling back to FD assignments.

const baseAssignment = (ideaIndex: number, slotRole: string, catalogSlotKey?: string) => ({
  idea_index: ideaIndex,
  slot_role: slotRole,
  pipeline: 'fal_design',
  copy_bundle_id: 'week',
  publish_channel: 'instagram_organic',
  ...(catalogSlotKey ? { catalog_slot_key: catalogSlotKey } : {}),
});

describe('buildMissionSlotChecklist catalog binding (Faz 5)', () => {
  it('prefers factory slot_key + label over assignment key (beach_club)', () => {
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
      }],
    });

    const item = checklist.items.find((i) => i.role === 'fal_designed_post');
    expect(item?.catalogSlotKey).toBe('beach_club_dj_night_teaser_post');
    expect(item?.catalogSlotLabel).toBe('DJ Gecesi Teaser');
  });

  it('falls back to the FD assignment catalog_slot_key when no factory row exists (local_products_shop)', () => {
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

  it('leaves items without any binding untouched', () => {
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

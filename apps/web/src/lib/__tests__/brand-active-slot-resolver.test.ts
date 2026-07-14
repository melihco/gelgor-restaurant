import { describe, it, expect } from 'vitest';
import {
  filterDesignTemplatesToActiveSlots,
  matchIdeaToBrandCatalogSlot,
  enrichProductionQueueWithBrandSlots,
  resolveBrandActiveSlotKeys,
  resolveBrandProductionFormatTargets,
} from '@/lib/brand-active-slot-resolver';
import type { BrandDesignTemplateRecord } from '@/lib/brand-design-template-matcher';
import type { ProductionSlotDefinition, TenantSlotAssignment } from '@/lib/production-slot-catalog';

function mockSlot(
  key: string,
  format: ProductionSlotDefinition['format'],
  overrides: Partial<ProductionSlotDefinition> = {},
): ProductionSlotDefinition {
  return {
    slot_key: key,
    sector_id: 'beach_club',
    label_tr: key,
    label_en: key,
    format,
    pipeline: 'fal_design',
    slot_role: 'fal_designed_post',
    design_template_type: 'venue_showcase',
    library_slot_key: 'editorial_story',
    tier: 'standard',
    match_signals: {},
    prompt_pack: {},
    optional_tags: overrides.optional_tags ?? [],
    enabled_by_default: true,
    sort_order: 1,
    status: 'active',
    ...overrides,
  };
}

function mockAssignment(slotKey: string, enabled: boolean, slot?: ProductionSlotDefinition): TenantSlotAssignment {
  return {
    id: slotKey,
    workspace_id: 'ws-1',
    slot_key: slotKey,
    enabled,
    priority: 10,
    assignment_source: 'onboarding',
    notes: null,
    slot: slot ?? mockSlot(slotKey, 'post'),
  };
}

describe('resolveBrandActiveSlotKeys', () => {
  const beachSlots = [
    mockSlot('beach_club_pool_lifestyle_post', 'post', { design_template_type: 'venue_showcase', sort_order: 3 }),
    mockSlot('beach_club_dj_night_teaser_post', 'post', { design_template_type: 'event_special', sort_order: 5 }),
    mockSlot('beach_club_pool_party_story', 'story', { design_template_type: 'daily_story', sort_order: 13 }),
    mockSlot('beach_club_sunset_golden_story', 'story', { design_template_type: 'daily_story', sort_order: 11 }),
  ];

  it('excludes disabled tenant assignments (pool slots off)', () => {
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-1',
      sector: 'beach_club',
      sectorSlots: beachSlots,
      tenantAssignments: [
        mockAssignment('beach_club_pool_lifestyle_post', false, beachSlots[0]),
        mockAssignment('beach_club_pool_party_story', false, beachSlots[2]),
        mockAssignment('beach_club_dj_night_teaser_post', true, beachSlots[1]),
        mockAssignment('beach_club_sunset_golden_story', true, beachSlots[3]),
      ],
      designTemplates: [
        { id: 't1', catalog_slot_key: 'beach_club_dj_night_teaser_post', status: 'active' },
      ],
    });

    expect(set.slots.map((s) => s.slotKey)).toEqual([
      'beach_club_dj_night_teaser_post',
      'beach_club_sunset_golden_story',
    ]);
    expect(set.enabledSlotKeys.has('beach_club_pool_lifestyle_post')).toBe(false);
    expect(set.slots.find((s) => s.slotKey === 'beach_club_dj_night_teaser_post')?.hasTemplate).toBe(true);
  });

  it('uses sector defaults when no assignments exist', () => {
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-2',
      sector: 'beach_club',
      sectorSlots: beachSlots,
    });
    expect(set.slots.length).toBe(4);
  });

  it('auto-disables pool slots when slot_facilities.pool is false', () => {
    const slots = [
      mockSlot('beach_club_pool_lifestyle_post', 'post', { optional_tags: ['requires:pool'] }),
      mockSlot('beach_club_dj_night_teaser_post', 'post'),
      mockSlot('beach_club_pool_party_story', 'story', { optional_tags: ['requires:pool'] }),
      mockSlot('beach_club_sunset_golden_story', 'story'),
    ];
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-pool-off',
      sector: 'beach_club',
      sectorSlots: slots,
      slotFacilities: { pool: false },
    });
    expect(set.slots.map((s) => s.slotKey)).toEqual([
      'beach_club_dj_night_teaser_post',
      'beach_club_sunset_golden_story',
    ]);
  });
});

describe('resolveBrandProductionFormatTargets', () => {
  it('caps package geometry when pool slots disabled', () => {
    const slots = [
      mockSlot('beach_club_pool_lifestyle_post', 'post'),
      mockSlot('beach_club_dj_night_teaser_post', 'post'),
      mockSlot('beach_club_pool_party_story', 'story'),
      mockSlot('beach_club_sunset_golden_story', 'story'),
    ];
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-1',
      sector: 'beach_club',
      sectorSlots: slots,
      tenantAssignments: [
        mockAssignment('beach_club_pool_lifestyle_post', false, slots[0]),
        mockAssignment('beach_club_pool_party_story', false, slots[2]),
        mockAssignment('beach_club_dj_night_teaser_post', true, slots[1]),
        mockAssignment('beach_club_sunset_golden_story', true, slots[3]),
      ],
    });

    const targets = resolveBrandProductionFormatTargets(set, 'growth');
    expect(targets.post).toBe(1);
    expect(targets.story).toBe(1);
    expect(targets.total).toBe(2);
  });
});

describe('matchIdeaToBrandCatalogSlot', () => {
  const activeSet = resolveBrandActiveSlotKeys({
    workspaceId: 'ws-1',
    sector: 'beach_club',
    sectorSlots: [
      mockSlot('beach_club_pool_lifestyle_post', 'post', { library_slot_key: 'editorial_story' }),
      mockSlot('beach_club_dj_night_teaser_post', 'post', {
        design_template_type: 'event_special',
        library_slot_key: 'event_story',
      }),
    ],
    tenantAssignments: [
      mockAssignment('beach_club_pool_lifestyle_post', false),
      mockAssignment('beach_club_dj_night_teaser_post', true),
    ],
  });

  it('never matches disabled pool slot', () => {
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        headline: 'Havuz keyfi',
        caption: 'Serin havuz anları',
        content_type: 'instagram_post',
      },
      activeSlots: activeSet,
    });
    expect(matched?.slotKey).toBe('beach_club_dj_night_teaser_post');
  });

  it('matches event teaser to dj slot', () => {
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        calendar_announcement_type: 'event_teaser',
        headline: 'DJ Night',
        content_type: 'instagram_post',
      },
      activeSlots: activeSet,
    });
    expect(matched?.slotKey).toBe('beach_club_dj_night_teaser_post');
  });
});

describe('filterDesignTemplatesToActiveSlots', () => {
  it('drops templates bound to disabled catalog slots', () => {
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-1',
      sector: 'beach_club',
      sectorSlots: [
        mockSlot('beach_club_pool_lifestyle_post', 'post'),
        mockSlot('beach_club_dj_night_teaser_post', 'post'),
      ],
      tenantAssignments: [
        mockAssignment('beach_club_pool_lifestyle_post', false),
        mockAssignment('beach_club_dj_night_teaser_post', true),
      ],
    });

    const templates: BrandDesignTemplateRecord[] = [
      {
        id: 'pool',
        template_type: 'venue_showcase',
        template_name: 'Pool',
        format: 'post',
        thumbnail_url: null,
        catalog_slot_key: 'beach_club_pool_lifestyle_post',
        design_spec: {},
        status: 'active',
      },
      {
        id: 'dj',
        template_type: 'event_special',
        template_name: 'DJ',
        format: 'post',
        thumbnail_url: 'https://example.com/dj.png',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        design_spec: {},
        status: 'active',
      },
    ];

    const filtered = filterDesignTemplatesToActiveSlots(templates, activeSet);
    expect(filtered.map((t) => t.id)).toEqual(['dj']);
  });
});

describe('enrichProductionQueueWithBrandSlots', () => {
  it('sets catalog_slot_key but preserves the legacy library_slot_key for template routing', () => {
    const djSlot = mockSlot('beach_club_dj_night_teaser_post', 'post', {
      design_template_type: 'event_special',
      library_slot_key: 'event_story',
    });
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-1',
      sector: 'beach_club',
      sectorSlots: [djSlot],
      tenantAssignments: [mockAssignment('beach_club_dj_night_teaser_post', true, djSlot)],
    });

    const queue = enrichProductionQueueWithBrandSlots(
      [{
        queueIndex: 0,
        ideaIndex: 0,
        idea: {
          headline: 'DJ Night',
          calendar_announcement_type: 'event_teaser',
          content_type: 'instagram_post',
        },
        assignment: {
          idea_index: 0,
          slot_role: 'fal_designed_post',
          pipeline: 'fal_design',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
          library_slot_key: 'campaign_post',
        },
      }],
      activeSet,
    );

    expect(queue).toHaveLength(1);
    expect(queue[0]!.assignment.catalog_slot_key).toBe('beach_club_dj_night_teaser_post');
    // library_slot_key keeps the legacy template-routing key (from the slot def),
    // not the full catalog id — so LIBRARY_SLOT_TO_TEMPLATE_TYPES still resolves.
    expect(queue[0]!.assignment.library_slot_key).toBe('event_story');
    expect(queue[0]!.assignment.library_slot_key).not.toBe('beach_club_dj_night_teaser_post');
  });

  it('keeps all ideas when the brand has fewer enabled catalog slots than queue rows', () => {
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-1',
      sector: 'local_products_shop',
      sectorSlots: [
        mockSlot('local_products_shop_harvest_post', 'post'),
        mockSlot('local_products_shop_product_post', 'post'),
      ],
      tenantAssignments: [
        mockAssignment('local_products_shop_harvest_post', true),
        mockAssignment('local_products_shop_product_post', true),
      ],
    });

    const queueItems = Array.from({ length: 8 }, (_, i) => ({
      queueIndex: i,
      ideaIndex: i,
      idea: {
        headline: `Idea ${i}`,
        content_type: 'instagram_post',
        caption_draft: `caption ${i}`,
        production_scope: i < 4 ? 'ideation' : 'calendar_plan',
      },
      assignment: {
        idea_index: i,
        slot_role: 'designed_post' as const,
        pipeline: 'fal_design',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic' as const,
      },
    }));

    const queue = enrichProductionQueueWithBrandSlots(queueItems, activeSet);
    expect(queue).toHaveLength(8);
    expect(queue.every((row) => row.assignment.catalog_slot_key)).toBe(true);
  });
});

describe('wedding_event sector isolation', () => {
  it('resolves wedding-specific slot set', () => {
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-wedding',
      sector: 'wedding_event',
      sectorSlots: [
        mockSlot('wedding_event_venue_showcase_post', 'post', { sector_id: 'wedding_event' }),
        mockSlot('wedding_event_bridal_inspiration_post', 'post', { sector_id: 'wedding_event' }),
        mockSlot('wedding_event_dj_reception_post', 'post', {
          sector_id: 'wedding_event',
          optional_tags: ['requires:dj_stage'],
        }),
      ],
    });
    expect(set.slots.length).toBe(3);
    expect([...set.enabledSlotKeys].every((k) => k.startsWith('wedding_event_'))).toBe(true);
  });

  it('disables dj reception when dj_stage facility off', () => {
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-wedding',
      sector: 'wedding_event',
      sectorSlots: [
        mockSlot('wedding_event_venue_showcase_post', 'post', { sector_id: 'wedding_event' }),
        mockSlot('wedding_event_dj_reception_post', 'post', {
          sector_id: 'wedding_event',
          optional_tags: ['requires:dj_stage'],
        }),
      ],
      slotFacilities: { dj_stage: false },
    });
    expect(set.slots.map((s) => s.slotKey)).toEqual(['wedding_event_venue_showcase_post']);
  });
});

describe('local_products_shop sector isolation', () => {
  it('resolves independent slot set without beach_club pool keys', () => {
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-3',
      sector: 'local_products_shop',
      sectorSlots: [
        mockSlot('local_products_hero_post', 'post', { sector_id: 'ecommerce_retail' }),
        mockSlot('local_products_story', 'story', { sector_id: 'ecommerce_retail' }),
      ],
      tenantAssignments: [
        mockAssignment('local_products_hero_post', true),
        mockAssignment('local_products_story', true),
      ],
    });

    expect([...set.enabledSlotKeys].every((k) => !k.includes('pool'))).toBe(true);
    expect(set.slots.length).toBe(2);
  });
});

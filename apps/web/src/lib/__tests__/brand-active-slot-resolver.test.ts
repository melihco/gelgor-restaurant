import { describe, it, expect } from 'vitest';
import {
  alignAssignmentToCatalogSlotKey,
  applyCatalogSlotBindingsToQueue,
  collectDurableCatalogPreferredKeys,
  isDurableCatalogQueuePin,
  applyCatalogSlotToAssignment,
  filterDesignTemplatesToActiveSlots,
  filterIdeasToEnabledFormats,
  filterProductionQueueToEnabledFormats,
  formatFromSlotRole,
  inferFormatFromCatalogSlotKey,
  matchIdeaToBrandCatalogSlot,
  enrichProductionQueueWithBrandSlots,
  resolveBrandActiveSlotKeys,
  resolveBrandProductionFormatTargets,
  resolveProduceFormatForIdea,
  resolveSlotBackfillProductionLoop,
  stampIdeasWithBrandCatalogSlots,
  summarizeCatalogSlotStampCoverage,
} from '@/lib/brand-active-slot-resolver';
import type { BrandDesignTemplateRecord } from '@/lib/brand-design-template-matcher';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';
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
        {
          id: 't1',
          catalog_slot_key: 'beach_club_dj_night_teaser_post',
          status: 'active',
          design_spec: {
            slot_creative_brief: {
              version: 1,
              creative_intent_tr: 'DJ gece teaser purpose brief for tests.',
            },
          },
        },
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

describe('filterProductionQueueToEnabledFormats', () => {
  function queueItem(
    ideaIndex: number,
    format: 'post' | 'story' | 'reel' | 'carousel',
    role: string,
  ): ManifestProductionQueueItem {
    const contentType = format === 'reel'
      ? 'instagram_reel'
      : format === 'story'
        ? 'instagram_story'
        : format === 'carousel'
          ? 'instagram_carousel'
          : 'instagram_post';
    return {
      queueIndex: ideaIndex,
      ideaIndex,
      idea: {
        headline: `${format} idea ${ideaIndex}`,
        content_type: contentType,
        format,
      },
      assignment: {
        idea_index: ideaIndex,
        slot_role: role as ManifestProductionQueueItem['assignment']['slot_role'],
        pipeline: 'fal_design',
        rationale: 'test',
        publish_channel: 'instagram',
      },
    };
  }

  it('beach_club: drops reel/story rows when only post slots enabled', () => {
    const slots = [
      mockSlot('beach_club_dj_night_teaser_post', 'post'),
      mockSlot('beach_club_sunset_golden_story', 'story'),
      mockSlot('beach_club_sunset_reel', 'reel', {
        slot_role: 'organic_reel',
        pipeline: 'fal_reel',
      }),
    ];
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-beach',
      sector: 'beach_club',
      sectorSlots: slots,
      tenantAssignments: [
        mockAssignment('beach_club_dj_night_teaser_post', true, slots[0]),
        mockAssignment('beach_club_sunset_golden_story', false, slots[1]),
        mockAssignment('beach_club_sunset_reel', false, slots[2]),
      ],
    });

    const { kept, skipped } = filterProductionQueueToEnabledFormats(
      [
        queueItem(0, 'post', 'fal_designed_post'),
        queueItem(1, 'reel', 'organic_reel'),
        queueItem(2, 'story', 'fal_story_motion'),
      ],
      set,
    );

    expect(kept.map((q) => q.ideaIndex)).toEqual([0]);
    expect(skipped.map((s) => s.format).sort()).toEqual(['reel', 'story']);
    expect(resolveProduceFormatForIdea(
      { content_type: 'instagram_reel' },
      { slot_role: 'organic_reel' },
    )).toBe('reel');
  });

  it('local_products_shop: drops post rows when only story slots enabled', () => {
    const slots = [
      mockSlot('local_products_shop_gift_bundle_post', 'post', {
        sector_id: 'local_products_shop',
      }),
      mockSlot('local_products_shop_sunset_story', 'story', {
        sector_id: 'local_products_shop',
        slot_role: 'fal_story_motion',
        pipeline: 'fal_story',
      }),
    ];
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-shop',
      sector: 'local_products_shop',
      sectorSlots: slots,
      tenantAssignments: [
        mockAssignment('local_products_shop_gift_bundle_post', false, slots[0]),
        mockAssignment('local_products_shop_sunset_story', true, slots[1]),
      ],
    });

    const { kept, skipped } = filterProductionQueueToEnabledFormats(
      [
        queueItem(0, 'post', 'fal_designed_post'),
        queueItem(1, 'story', 'fal_story_motion'),
        queueItem(2, 'reel', 'organic_reel'),
      ],
      set,
    );

    expect(kept.map((q) => q.ideaIndex)).toEqual([1]);
    expect(skipped.map((s) => s.format).sort()).toEqual(['post', 'reel']);
    expect(filterIdeasToEnabledFormats(
      [
        { content_type: 'instagram_post', headline: 'A' },
        { content_type: 'instagram_story', headline: 'B' },
      ],
      set,
    ).kept.map((i) => i.headline)).toEqual(['B']);
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

  it('boosts slots via match_signals.announcement_types', () => {
    const venue = mockSlot('beach_club_aerial_venue_post', 'post', {
      match_signals: { announcement_types: ['venue_showcase'] },
      design_template_type: 'venue_showcase',
    });
    const offer = mockSlot('beach_club_daybed_offer_post', 'post', {
      match_signals: { announcement_types: ['offer_campaign'] },
      design_template_type: 'campaign_announcement',
    });
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-signals',
      sector: 'beach_club',
      sectorSlots: [venue, offer],
      tenantAssignments: [
        mockAssignment(venue.slot_key, true, venue),
        mockAssignment(offer.slot_key, true, offer),
      ],
    });
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        calendar_announcement_type: 'offer_campaign',
        headline: 'Daybed indirimi',
        content_type: 'instagram_post',
      },
      activeSlots: set,
    });
    expect(matched?.slotKey).toBe('beach_club_daybed_offer_post');
  });

  it('soft-penalizes reuse so a less-used peer wins when fit is similar', () => {
    const a = mockSlot('beach_club_sunset_ambiance_post', 'post', {
      match_signals: { announcement_types: ['venue_showcase'] },
    });
    const b = mockSlot('beach_club_aerial_venue_post', 'post', {
      match_signals: { announcement_types: ['venue_showcase'] },
    });
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-reuse',
      sector: 'beach_club',
      sectorSlots: [a, b],
      tenantAssignments: [
        mockAssignment(a.slot_key, true, a),
        mockAssignment(b.slot_key, true, b),
      ],
    });
    const usage = new Map<string, number>([[a.slot_key, 2]]);
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        calendar_announcement_type: 'venue_showcase',
        headline: 'Mekan manzarası',
        content_type: 'instagram_post',
      },
      activeSlots: set,
      slotUsageCounts: usage,
    });
    expect(matched?.slotKey).toBe('beach_club_aerial_venue_post');
  });

  it('hard-excludes recent catalog keys across beach_club + local_products_shop', () => {
    for (const [sector, sticky, peer, announcement, headline] of [
      [
        'beach_club',
        'beach_club_sunset_ambiance_post',
        'beach_club_aerial_venue_post',
        'venue_showcase',
        'Mekan manzarası',
      ],
      [
        'local_products_shop',
        'local_products_shop_atelier_story_post',
        'local_products_shop_shelf_vitrine_post',
        'product_reveal',
        'Haftalık vitrin',
      ],
    ] as const) {
      const a = mockSlot(sticky, 'post', {
        match_signals: { announcement_types: [announcement] },
      });
      const b = mockSlot(peer, 'post', {
        match_signals: { announcement_types: [announcement] },
      });
      const set = resolveBrandActiveSlotKeys({
        workspaceId: `ws-${sector}-recent`,
        sector,
        sectorSlots: [a, b],
        tenantAssignments: [
          mockAssignment(a.slot_key, true, a),
          mockAssignment(b.slot_key, true, b),
        ],
      });
      const matched = matchIdeaToBrandCatalogSlot({
        idea: {
          calendar_announcement_type: announcement,
          headline,
          content_type: 'instagram_post',
        },
        activeSlots: set,
        recentCatalogSlotKeys: [sticky],
      });
      expect(matched?.slotKey).toBe(peer);
    }
  });

  it('prefers dj-specific event shell over blanket events_calendar', () => {
    const calendar = mockSlot('beach_club_events_calendar_post', 'post', {
      design_template_type: 'event_special',
    });
    const dj = mockSlot('beach_club_dj_night_teaser_post', 'post', {
      design_template_type: 'event_special',
    });
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-dj-specificity',
      sector: 'beach_club',
      sectorSlots: [calendar, dj],
      tenantAssignments: [
        mockAssignment(calendar.slot_key, true, calendar),
        mockAssignment(dj.slot_key, true, dj),
      ],
    });
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        calendar_announcement_type: 'event_teaser',
        headline: 'DJ Night under the stars',
        caption: 'Live DJ set this Friday',
        content_type: 'instagram_post',
      },
      activeSlots: set,
    });
    expect(matched?.slotKey).toBe('beach_club_dj_night_teaser_post');
  });

  it('lets a better same-format peer beat soft preferred without large margin', () => {
    const sticky = mockSlot('beach_club_aerial_venue_post', 'post', {
      match_signals: { announcement_types: ['venue_showcase'] },
    });
    const sunset = mockSlot('beach_club_sunset_cocktail_post', 'post', {
      match_signals: {
        announcement_types: ['venue_showcase', 'product_reveal'],
        keywords: ['sunset', 'cocktail'],
      },
    });
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-soft-peer',
      sector: 'beach_club',
      sectorSlots: [sticky, sunset],
      tenantAssignments: [
        mockAssignment(sticky.slot_key, true, sticky),
        mockAssignment(sunset.slot_key, true, sunset),
      ],
    });
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        calendar_announcement_type: 'venue_showcase',
        headline: 'Sunset cocktail on the deck',
        caption: 'Golden hour cocktail hour',
        content_type: 'instagram_post',
      },
      activeSlots: set,
      preferredCatalogSlotKey: sticky.slot_key,
      preferredIsDurable: false,
    });
    expect(matched?.slotKey).toBe('beach_club_sunset_cocktail_post');
  });

  it('vetoes soft preferred social_proof when idea is DJ night (beach_club)', () => {
    const social = mockSlot('beach_club_guest_review_post', 'post', {
      design_template_type: 'social_proof',
      match_signals: { announcement_types: ['social_proof'] },
    });
    const dj = mockSlot('beach_club_dj_night_teaser_post', 'post', {
      design_template_type: 'event_special',
      match_signals: { announcement_types: ['event_teaser'], keywords: ['dj', 'night'] },
    });
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-soft-veto-dj',
      sector: 'beach_club',
      sectorSlots: [social, dj],
      tenantAssignments: [
        mockAssignment(social.slot_key, true, social),
        mockAssignment(dj.slot_key, true, dj),
      ],
    });
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        // Drifted FD/stamp label — copy is clearly an event.
        calendar_announcement_type: 'social_proof',
        headline: 'DJ Night under the stars',
        caption: 'Live DJ set this Friday — join us on the deck',
        content_type: 'instagram_post',
      },
      activeSlots: set,
      preferredCatalogSlotKey: social.slot_key,
      preferredIsDurable: false,
    });
    expect(matched?.slotKey).toBe('beach_club_dj_night_teaser_post');
  });

  it('keeps durable preferred social_proof even when idea is DJ night', () => {
    const social = mockSlot('beach_club_guest_review_post', 'post', {
      design_template_type: 'social_proof',
      match_signals: { announcement_types: ['social_proof'] },
    });
    const dj = mockSlot('beach_club_dj_night_teaser_post', 'post', {
      design_template_type: 'event_special',
      match_signals: { announcement_types: ['event_teaser'] },
    });
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-durable-pin',
      sector: 'beach_club',
      sectorSlots: [social, dj],
      tenantAssignments: [
        mockAssignment(social.slot_key, true, social),
        mockAssignment(dj.slot_key, true, dj),
      ],
    });
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        calendar_announcement_type: 'social_proof',
        headline: 'DJ Night under the stars',
        caption: 'Live DJ set this Friday',
        content_type: 'instagram_post',
      },
      activeSlots: set,
      preferredCatalogSlotKey: social.slot_key,
      preferredIsDurable: true,
    });
    expect(matched?.slotKey).toBe('beach_club_guest_review_post');
  });

  it('vetoes soft preferred social_proof for product idea (local_products_shop)', () => {
    const social = mockSlot('local_products_shop_guest_love_post', 'post', {
      sector_id: 'local_products_shop',
      design_template_type: 'social_proof',
      match_signals: { announcement_types: ['social_proof'] },
    });
    const product = mockSlot('local_products_shop_shelf_vitrine_post', 'post', {
      sector_id: 'local_products_shop',
      design_template_type: 'menu_highlight',
      match_signals: {
        announcement_types: ['product_reveal'],
        keywords: ['ürün', 'reçel', 'vitrin'],
      },
    });
    const set = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-soft-veto-product',
      sector: 'local_products_shop',
      sectorSlots: [social, product],
      tenantAssignments: [
        mockAssignment(social.slot_key, true, social),
        mockAssignment(product.slot_key, true, product),
      ],
    });
    const matched = matchIdeaToBrandCatalogSlot({
      idea: {
        calendar_announcement_type: 'social_proof',
        headline: 'Haftalık reçel vitrini',
        caption: 'Yeni sezon ürünleri rafta — ev yapımı reçel ve zeytin',
        content_type: 'instagram_post',
      },
      activeSlots: set,
      preferredCatalogSlotKey: social.slot_key,
      preferredIsDurable: false,
    });
    expect(matched?.slotKey).toBe('local_products_shop_shelf_vitrine_post');
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

  it('locks existing plan stamps across beach_club + local_products_shop (produce path)', () => {
    for (const [sector, sticky, peer, announcement] of [
      [
        'beach_club',
        'beach_club_events_calendar_post',
        'beach_club_private_event_post',
        'event_teaser',
      ],
      [
        'local_products_shop',
        'local_products_shop_atelier_story_post',
        'local_products_shop_shelf_vitrine_post',
        'product_reveal',
      ],
    ] as const) {
      const a = mockSlot(sticky, 'post', {
        sector_id: sector,
        match_signals: { announcement_types: [announcement] },
      });
      const b = mockSlot(peer, 'post', {
        sector_id: sector,
        match_signals: { announcement_types: [announcement] },
      });
      const activeSet = resolveBrandActiveSlotKeys({
        workspaceId: `ws-${sector}-lock`,
        sector,
        sectorSlots: [a, b],
        tenantAssignments: [
          mockAssignment(a.slot_key, true, a),
          mockAssignment(b.slot_key, true, b),
        ],
      });

      const stamped = stampIdeasWithBrandCatalogSlots(
        [{
          headline: 'Plan stamp',
          calendar_announcement_type: announcement,
          content_type: 'instagram_post',
          catalog_slot_key: sticky,
        }],
        activeSet,
        {
          recentCatalogSlotKeys: [sticky],
          lockExistingCatalogPins: true,
        },
      );
      expect(stamped[0]!.catalog_slot_key).toBe(sticky);

      const queue = enrichProductionQueueWithBrandSlots(
        [{
          queueIndex: 0,
          ideaIndex: 0,
          idea: {
            headline: 'Plan stamp',
            calendar_announcement_type: announcement,
            content_type: 'instagram_post',
            catalog_slot_key: sticky,
          },
          assignment: {
            idea_index: 0,
            slot_role: 'fal_designed_post',
            pipeline: 'fal_design',
            copy_bundle_id: 'week',
            publish_channel: 'instagram_organic',
            catalog_slot_key: sticky,
          },
        }],
        activeSet,
        {
          recentCatalogSlotKeys: [sticky],
          lockExistingCatalogPins: true,
          durablePreferredKeys: collectDurableCatalogPreferredKeys(
            [{
              queueIndex: 0,
              ideaIndex: 0,
              idea: { catalog_slot_key: sticky },
              assignment: {
                idea_index: 0,
                slot_role: 'fal_designed_post',
                pipeline: 'fal_design',
                copy_bundle_id: 'week',
                publish_channel: 'instagram_organic',
                catalog_slot_key: sticky,
              },
            }],
            { '0:fal_designed_post': sticky },
          ),
        },
      );
      expect(queue[0]!.assignment.catalog_slot_key).toBe(sticky);
      // Soft path without lock still rematches away from recent sticky.
      const soft = enrichProductionQueueWithBrandSlots(
        [{
          queueIndex: 0,
          ideaIndex: 0,
          idea: {
            headline: 'Plan stamp',
            calendar_announcement_type: announcement,
            content_type: 'instagram_post',
            catalog_slot_key: sticky,
          },
          assignment: {
            idea_index: 0,
            slot_role: 'fal_designed_post',
            pipeline: 'fal_design',
            copy_bundle_id: 'week',
            publish_channel: 'instagram_organic',
            catalog_slot_key: sticky,
          },
        }],
        activeSet,
        { recentCatalogSlotKeys: [sticky] },
      );
      expect(soft[0]!.assignment.catalog_slot_key).toBe(peer);
    }
  });

  it('collectDurableCatalogPreferredKeys covers role-drift via idea prefix', () => {
    const bindings = { '2:fal_designed_post': 'beach_club_dj_night_teaser_post' };
    const queue = [{
      queueIndex: 0,
      ideaIndex: 2,
      idea: { catalog_slot_key: 'beach_club_dj_night_teaser_post' },
      assignment: {
        idea_index: 2,
        slot_role: 'organic_carousel' as const,
        pipeline: 'fal_design' as const,
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic' as const,
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
      },
    }];
    const durable = collectDurableCatalogPreferredKeys(queue, bindings);
    expect(durable.has('2:fal_designed_post')).toBe(true);
    expect(durable.has('2:organic_carousel')).toBe(true);
    expect(isDurableCatalogQueuePin(queue[0]!, durable)).toBe(true);
  });

  it('rematches soft-preferred recent keys but keeps durable plan pins', () => {
    const sticky = mockSlot('beach_club_events_calendar_post', 'post', {
      design_template_type: 'event_special',
    });
    const peer = mockSlot('beach_club_private_event_post', 'post', {
      design_template_type: 'event_special',
    });
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-rematch',
      sector: 'beach_club',
      sectorSlots: [sticky, peer],
      tenantAssignments: [
        mockAssignment(sticky.slot_key, true, sticky),
        mockAssignment(peer.slot_key, true, peer),
      ],
    });

    const softRematch = enrichProductionQueueWithBrandSlots(
      [{
        queueIndex: 0,
        ideaIndex: 0,
        idea: {
          headline: 'Weekend gathering',
          calendar_announcement_type: 'event_teaser',
          content_type: 'instagram_post',
          catalog_slot_key: sticky.slot_key,
        },
        assignment: {
          idea_index: 0,
          slot_role: 'fal_designed_post',
          pipeline: 'fal_design',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
          catalog_slot_key: sticky.slot_key,
        },
      }],
      activeSet,
      { recentCatalogSlotKeys: [sticky.slot_key] },
    );
    expect(softRematch[0]!.assignment.catalog_slot_key).toBe(peer.slot_key);

    const durable = enrichProductionQueueWithBrandSlots(
      [{
        queueIndex: 0,
        ideaIndex: 0,
        idea: {
          headline: 'Weekend gathering',
          calendar_announcement_type: 'event_teaser',
          content_type: 'instagram_post',
          catalog_slot_key: sticky.slot_key,
        },
        assignment: {
          idea_index: 0,
          slot_role: 'fal_designed_post',
          pipeline: 'fal_design',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
          catalog_slot_key: sticky.slot_key,
        },
      }],
      activeSet,
      {
        recentCatalogSlotKeys: [sticky.slot_key],
        durablePreferredKeys: new Set(['0:fal_designed_post']),
      },
    );
    expect(durable[0]!.assignment.catalog_slot_key).toBe(sticky.slot_key);
  });

  it('dedupes repeated preferred catalog keys across designed posts (restaurant_cafe)', () => {
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-gelgor',
      sector: 'restaurant_cafe',
      sectorSlots: [
        mockSlot('restaurant_cafe_signature_dish_post', 'post', {
          design_template_type: 'menu_highlight',
          slot_role: 'fal_designed_post',
        }),
        mockSlot('restaurant_cafe_customer_review_post', 'post', {
          design_template_type: 'social_proof',
          slot_role: 'fal_designed_post',
        }),
        mockSlot('restaurant_cafe_dining_ambiance_post', 'post', {
          design_template_type: 'venue_showcase',
          slot_role: 'fal_designed_post',
        }),
      ],
      tenantAssignments: [
        mockAssignment('restaurant_cafe_signature_dish_post', true),
        mockAssignment('restaurant_cafe_customer_review_post', true),
        mockAssignment('restaurant_cafe_dining_ambiance_post', true),
      ],
    });

    const queue = enrichProductionQueueWithBrandSlots(
      [
        {
          queueIndex: 0,
          ideaIndex: 0,
          idea: {
            headline: 'Serpme kahvaltı',
            announcement_type: 'product_reveal',
            caption_draft: 'Bahçede serpme köy kahvaltısı',
            content_type: 'instagram_post',
            catalog_slot_key: 'restaurant_cafe_signature_dish_post',
          },
          assignment: {
            idea_index: 0,
            slot_role: 'fal_designed_post',
            pipeline: 'fal_design',
            copy_bundle_id: 'week',
            publish_channel: 'instagram_organic',
            catalog_slot_key: 'restaurant_cafe_signature_dish_post',
          },
        },
        {
          queueIndex: 1,
          ideaIndex: 2,
          idea: {
            headline: 'Müşteri yorumları',
            announcement_type: 'social_proof',
            caption_draft: 'Müşterilerimizden gelen geri bildirimler',
            content_type: 'instagram_post',
            catalog_slot_key: 'restaurant_cafe_signature_dish_post',
          },
          assignment: {
            idea_index: 2,
            slot_role: 'fal_designed_post',
            pipeline: 'fal_design',
            copy_bundle_id: 'week',
            publish_channel: 'instagram_organic',
            catalog_slot_key: 'restaurant_cafe_signature_dish_post',
          },
        },
        {
          queueIndex: 2,
          ideaIndex: 5,
          idea: {
            headline: 'Bahçe deneyimi',
            announcement_type: 'offer_campaign',
            caption_draft: 'Bu yaz bahçemizde eşsiz bir deneyim',
            content_type: 'instagram_post',
            catalog_slot_key: 'restaurant_cafe_signature_dish_post',
          },
          assignment: {
            idea_index: 5,
            slot_role: 'fal_designed_post',
            pipeline: 'fal_design',
            copy_bundle_id: 'week',
            publish_channel: 'instagram_organic',
            catalog_slot_key: 'restaurant_cafe_signature_dish_post',
          },
        },
      ],
      activeSet,
    );

    const keys = queue.map((row) => row.assignment.catalog_slot_key);
    expect(keys[0]).toBe('restaurant_cafe_signature_dish_post');
    expect(new Set(keys).size).toBe(3);
    expect(keys[1]).not.toBe('restaurant_cafe_signature_dish_post');
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

    const queueItems: ManifestProductionQueueItem[] = Array.from({ length: 8 }, (_, i) => ({
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

describe('catalog key ↔ role/pipeline alignment', () => {
  it('formatFromSlotRole maps reel/carousel/story roles', () => {
    expect(formatFromSlotRole('organic_reel')).toBe('reel');
    expect(formatFromSlotRole('campaign_reel_motion')).toBe('reel');
    expect(formatFromSlotRole('organic_carousel')).toBe('carousel');
    expect(formatFromSlotRole('fal_only_story')).toBe('story');
    expect(formatFromSlotRole('fal_designed_post')).toBe('post');
  });

  it('applyCatalogSlotToAssignment realigns carousel role when catalog key is reel (Yula drift)', () => {
    const reelSlot = mockSlot('restaurant_cafe_cocktail_bar_reel', 'reel', {
      sector_id: 'restaurant_cafe',
      slot_role: 'organic_reel',
      pipeline: 'fal_reel',
      library_slot_key: 'atmosphere_reel',
      design_template_type: 'reel_cover',
    });
    const active = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-yula',
      sector: 'restaurant_cafe',
      sectorSlots: [reelSlot],
      tenantAssignments: [mockAssignment(reelSlot.slot_key, true, reelSlot)],
    }).slots[0]!;

    const next = applyCatalogSlotToAssignment(
      {
        idea_index: 4,
        slot_role: 'organic_carousel',
        pipeline: 'carousel_gallery',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'restaurant_cafe_cocktail_bar_reel',
      },
      active,
    );

    expect(next.slot_role).toBe('organic_reel');
    expect(next.pipeline).toBe('fal_reel');
    expect(next.catalog_slot_key).toBe('restaurant_cafe_cocktail_bar_reel');
    expect(next.publish_channel).toBe('instagram_organic');
  });

  it('enrich realigns role/pipeline + idea format from catalog (restaurant_cafe + local_products)', () => {
    const cocktailReel = mockSlot('restaurant_cafe_cocktail_bar_reel', 'reel', {
      sector_id: 'restaurant_cafe',
      slot_role: 'organic_reel',
      pipeline: 'fal_reel',
      library_slot_key: 'atmosphere_reel',
    });
    const tastingCarousel = mockSlot('restaurant_cafe_menu_tasting_carousel', 'carousel', {
      sector_id: 'restaurant_cafe',
      slot_role: 'organic_carousel',
      pipeline: 'carousel_gallery',
      library_slot_key: 'menu_carousel',
    });
    const harvestPost = mockSlot('local_products_shop_harvest_post', 'post', {
      sector_id: 'ecommerce_retail',
      slot_role: 'fal_designed_post',
      pipeline: 'fal_design',
    });

    const cafeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-cafe',
      sector: 'restaurant_cafe',
      sectorSlots: [cocktailReel, tastingCarousel],
      tenantAssignments: [
        mockAssignment(cocktailReel.slot_key, true, cocktailReel),
        mockAssignment(tastingCarousel.slot_key, true, tastingCarousel),
      ],
    });
    const shopSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-shop',
      sector: 'local_products_shop',
      sectorSlots: [harvestPost],
      tenantAssignments: [mockAssignment(harvestPost.slot_key, true, harvestPost)],
    });

    const cafeQueue = enrichProductionQueueWithBrandSlots(
      [{
        queueIndex: 0,
        ideaIndex: 4,
        idea: {
          headline: 'Cocktail bar',
          catalog_slot_key: 'restaurant_cafe_cocktail_bar_reel',
          content_type: 'instagram_carousel',
          format: 'carousel',
        },
        assignment: {
          idea_index: 4,
          slot_role: 'organic_carousel',
          pipeline: 'carousel_gallery',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
          catalog_slot_key: 'restaurant_cafe_cocktail_bar_reel',
        },
      }],
      cafeSet,
    );

    expect(cafeQueue[0]!.assignment.slot_role).toBe('organic_reel');
    expect(cafeQueue[0]!.assignment.pipeline).toBe('fal_reel');
    expect(cafeQueue[0]!.idea.format).toBe('reel');
    expect(cafeQueue[0]!.idea.content_type).toBe('instagram_reel');

    const shopQueue = enrichProductionQueueWithBrandSlots(
      [{
        queueIndex: 0,
        ideaIndex: 0,
        idea: { headline: 'Harvest', content_type: 'instagram_post' },
        assignment: {
          idea_index: 0,
          slot_role: 'fal_designed_post',
          pipeline: 'fal_design',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
        },
      }],
      shopSet,
    );
    expect(shopQueue[0]!.assignment.catalog_slot_key).toBe('local_products_shop_harvest_post');
    expect(shopQueue[0]!.assignment.slot_role).toBe('fal_designed_post');
  });

  it('matchIdeaToBrandCatalogSlot does not cross-format without preferred key', () => {
    const story = mockSlot('beach_club_sunset_golden_story', 'story', {
      slot_role: 'fal_only_story',
      pipeline: 'fal_story',
    });
    const reel = mockSlot('beach_club_atmosphere_reel', 'reel', {
      slot_role: 'organic_reel',
      pipeline: 'fal_reel',
    });
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-1',
      sector: 'beach_club',
      sectorSlots: [story, reel],
      tenantAssignments: [
        mockAssignment(story.slot_key, true, story),
        mockAssignment(reel.slot_key, true, reel),
      ],
    });

    const matched = matchIdeaToBrandCatalogSlot({
      idea: { headline: 'Sunset', content_type: 'instagram_story', format: 'story' },
      assignment: {
        idea_index: 0,
        slot_role: 'fal_only_story',
        pipeline: 'fal_story',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic',
      },
      activeSlots: activeSet,
      usedSlotKeys: new Set([story.slot_key]),
    });
    // Story slot used — must not fall back to the only remaining reel slot.
    expect(matched).toBeNull();
  });
});

describe('summarizeCatalogSlotStampCoverage (Faz B)', () => {
  it('counts stamped vs missing catalog keys', () => {
    expect(summarizeCatalogSlotStampCoverage([
      { assignment: { catalog_slot_key: 'beach_club_dj_night_teaser_post' } },
      { idea: { catalog_slot_key: 'local_products_shop_harvest_post' } },
      { assignment: { catalog_slot_key: null }, idea: {} },
    ])).toEqual({ total: 3, stamped: 2, missing: 1 });
  });
});

describe('applyCatalogSlotBindingsToQueue (Faz 5 — production_jobs.slot_key)', () => {
  const makeQueueItem = (
    ideaIndex: number,
    slotRole: 'fal_designed_post' | 'fal_only_story' | 'designed_typography',
  ): ManifestProductionQueueItem => ({
    queueIndex: ideaIndex,
    ideaIndex,
    idea: {
      headline: `Idea ${ideaIndex}`,
      content_type: 'instagram_post',
    },
    assignment: {
      idea_index: ideaIndex,
      slot_role: slotRole,
      pipeline: 'fal_design',
      copy_bundle_id: 'week',
      publish_channel: 'instagram_organic',
    },
  });

  it('pins the persisted slot_key on idea + assignment (beach_club)', () => {
    const queue = applyCatalogSlotBindingsToQueue(
      [makeQueueItem(0, 'fal_designed_post'), makeQueueItem(1, 'fal_only_story')],
      {
        '0:fal_designed_post': 'beach_club_dj_night_teaser_post',
        '1:fal_only_story': 'beach_club_sunset_golden_story',
      },
    );

    expect(queue[0]!.idea.catalog_slot_key).toBe('beach_club_dj_night_teaser_post');
    expect(queue[0]!.assignment.catalog_slot_key).toBe('beach_club_dj_night_teaser_post');
    expect(queue[1]!.assignment.catalog_slot_key).toBe('beach_club_sunset_golden_story');
  });

  it('realigns fal_reel assignment when binding a story catalog key', () => {
    const item: ManifestProductionQueueItem = {
      queueIndex: 8,
      ideaIndex: 8,
      idea: { headline: 'Day pass', content_type: 'instagram_reel' },
      assignment: {
        idea_index: 8,
        slot_role: 'fal_reel_motion',
        pipeline: 'fal_reel',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic',
      },
    };
    const queue = applyCatalogSlotBindingsToQueue(
      [item],
      { '8:fal_reel_motion': 'beach_club_day_pass_story' },
    );
    expect(queue[0]!.assignment.catalog_slot_key).toBe('beach_club_day_pass_story');
    expect(queue[0]!.assignment.pipeline).toBe('fal_story');
    expect(queue[0]!.assignment.slot_role).toBe('campaign_story_motion');
  });

  it('leaves unbound rows untouched and is a no-op without bindings (local_products_shop)', () => {
    const items = [makeQueueItem(0, 'fal_designed_post'), makeQueueItem(1, 'designed_typography')];
    const partial = applyCatalogSlotBindingsToQueue(items, {
      '1:designed_typography': 'local_products_shop_harvest_post',
    });
    expect(partial[0]!.assignment.catalog_slot_key).toBeUndefined();
    expect(partial[1]!.assignment.catalog_slot_key).toBe('local_products_shop_harvest_post');

    expect(applyCatalogSlotBindingsToQueue(items, null)).toBe(items);
    expect(applyCatalogSlotBindingsToQueue(items, {})).toBe(items);
  });

  it('binding survives enrichment as the preferred catalog slot (beach_club)', () => {
    const djSlot = mockSlot('beach_club_dj_night_teaser_post', 'post', {
      design_template_type: 'event_special',
    });
    const sunsetSlot = mockSlot('beach_club_sunset_golden_story', 'story', {
      design_template_type: 'daily_story',
    });
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-1',
      sector: 'beach_club',
      sectorSlots: [djSlot, sunsetSlot],
      tenantAssignments: [
        mockAssignment('beach_club_dj_night_teaser_post', true, djSlot),
        mockAssignment('beach_club_sunset_golden_story', true, sunsetSlot),
      ],
    });

    const bound = applyCatalogSlotBindingsToQueue(
      [makeQueueItem(0, 'fal_designed_post')],
      { '0:fal_designed_post': 'beach_club_sunset_golden_story' },
    );
    const enriched = enrichProductionQueueWithBrandSlots(bound, activeSet);
    expect(enriched[0]!.assignment.catalog_slot_key).toBe('beach_club_sunset_golden_story');
  });
});

describe('alignAssignmentToCatalogSlotKey', () => {
  it('infers format from catalog key suffixes (multi-tenant)', () => {
    expect(inferFormatFromCatalogSlotKey('beach_club_day_pass_story')).toBe('story');
    expect(inferFormatFromCatalogSlotKey('beach_club_event_aftermovie_reel')).toBe('reel');
    expect(inferFormatFromCatalogSlotKey('local_products_shop_harvest_post')).toBe('post');
  });

  it('repairs fal_reel + day_pass_story drift to fal_story', () => {
    const aligned = alignAssignmentToCatalogSlotKey(
      {
        idea_index: 8,
        slot_role: 'campaign_story_motion',
        pipeline: 'fal_reel',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'beach_club_day_pass_story',
      },
      'beach_club_day_pass_story',
    );
    expect(aligned.pipeline).toBe('fal_story');
    expect(aligned.slot_role).toBe('campaign_story_motion');
    expect(aligned.catalog_slot_key).toBe('beach_club_day_pass_story');
  });

  it('repairs fal_story + event_aftermovie_reel drift to fal_reel', () => {
    const aligned = alignAssignmentToCatalogSlotKey(
      {
        idea_index: 6,
        slot_role: 'campaign_story_motion',
        pipeline: 'fal_story',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic',
      },
      'local_products_shop_atelier_process_reel',
    );
    expect(aligned.pipeline).toBe('fal_reel');
    expect(String(aligned.slot_role)).toMatch(/reel/);
  });
});

describe('resolveSlotBackfillProductionLoop', () => {
  it('repairs fal_reel_motion → campaign_story_motion with story catalog key pipeline', () => {
    const queue: ManifestProductionQueueItem[] = [{
      queueIndex: 8,
      ideaIndex: 8,
      idea: {
        headline: 'Day pass',
        content_type: 'instagram_story',
        catalog_slot_key: 'beach_club_day_pass_story',
      },
      assignment: {
        idea_index: 8,
        slot_role: 'fal_reel_motion',
        pipeline: 'fal_reel',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic',
        catalog_slot_key: 'beach_club_day_pass_story',
      },
    }];
    const loop = resolveSlotBackfillProductionLoop(
      queue,
      ['8:campaign_story_motion'],
      { '8:campaign_story_motion': 'beach_club_day_pass_story' },
    );
    expect(loop).toHaveLength(1);
    expect(loop[0]!.assignment.slot_role).toBe('campaign_story_motion');
    expect(loop[0]!.assignment.pipeline).toBe('fal_story');
    expect(loop[0]!.assignment.catalog_slot_key).toBe('beach_club_day_pass_story');
  });

  it('matches exact keys and repairs drifted slot_role by idea index', () => {
    const queue: ManifestProductionQueueItem[] = [
      {
        queueIndex: 0,
        ideaIndex: 0,
        idea: { headline: 'A', content_type: 'instagram_post' },
        assignment: {
          idea_index: 0,
          slot_role: 'organic_post',
          pipeline: 'gallery_photo',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
        },
      },
      {
        queueIndex: 1,
        ideaIndex: 1,
        idea: { headline: 'B', content_type: 'instagram_post' },
        assignment: {
          idea_index: 1,
          slot_role: 'fal_designed_post',
          pipeline: 'fal_design',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
        },
      },
    ];

    const loop = resolveSlotBackfillProductionLoop(
      queue,
      ['0:fal_designed_post', '1:fal_designed_post'],
      { '0:fal_designed_post': 'beach_club_guest_social_proof_post' },
    );

    expect(loop).toHaveLength(2);
    expect(loop[0]!.assignment.slot_role).toBe('fal_designed_post');
    expect(loop[0]!.assignment.catalog_slot_key).toBe('beach_club_guest_social_proof_post');
    expect(loop[1]!.assignment.slot_role).toBe('fal_designed_post');
  });

  it('returns empty when idea indexes are absent (local_products_shop keys)', () => {
    const queue: ManifestProductionQueueItem[] = [{
      queueIndex: 0,
      ideaIndex: 0,
      idea: { headline: 'Shop', content_type: 'instagram_post' },
      assignment: {
        idea_index: 0,
        slot_role: 'fal_designed_post',
        pipeline: 'fal_design',
        copy_bundle_id: 'week',
        publish_channel: 'instagram_organic',
      },
    }];
    expect(
      resolveSlotBackfillProductionLoop(queue, ['9:organic_carousel'], null),
    ).toEqual([]);
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

  it('enables photography slots only when wedding_photography facility is on', () => {
    const sectorSlots = [
      mockSlot('wedding_event_real_wedding_post', 'post', { sector_id: 'wedding_event' }),
      mockSlot('wedding_event_couple_portrait_post', 'post', {
        sector_id: 'wedding_event',
        optional_tags: ['requires:wedding_photography'],
      }),
    ];
    const off = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-wedding',
      sector: 'wedding_event',
      sectorSlots,
      slotFacilities: { wedding_photography: false },
    });
    expect(off.enabledSlotKeys.has('wedding_event_couple_portrait_post')).toBe(false);
    expect(off.enabledSlotKeys.has('wedding_event_real_wedding_post')).toBe(true);

    const on = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-wedding',
      sector: 'wedding_event',
      sectorSlots,
      slotFacilities: { wedding_photography: true },
    });
    expect(on.enabledSlotKeys.has('wedding_event_couple_portrait_post')).toBe(true);
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

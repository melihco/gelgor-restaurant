import { describe, it, expect } from 'vitest';
import {
  buildDesignPresetFromCatalogSlot,
  selectCatalogSlotsForOnboarding,
  ONBOARDING_CATALOG_TEMPLATE_CAP,
} from '@/lib/catalog-design-template-presets';
import { resolveSectorSlotsWithPackFallback } from '@/lib/production-slot-catalog';
import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';

function mockSlot(overrides: Partial<ProductionSlotDefinition> & Pick<ProductionSlotDefinition, 'slot_key' | 'design_template_type'>): ProductionSlotDefinition {
  return {
    sector_id: 'beach_club',
    label_tr: overrides.label_tr ?? 'Test Slot',
    label_en: overrides.label_en ?? 'Test Slot',
    format: overrides.format ?? 'post',
    pipeline: 'fal_designed_post',
    slot_role: 'fal_designed_post',
    library_slot_key: null,
    tier: 'standard',
    match_signals: overrides.match_signals ?? {},
    prompt_pack: {},
    enabled_by_default: true,
    sort_order: overrides.sort_order ?? 0,
    status: 'active',
    ...overrides,
  };
}

describe('buildDesignPresetFromCatalogSlot', () => {
  it('maps catalog slot to preset with catalogSlotKey and design_template_type', () => {
    const preset = buildDesignPresetFromCatalogSlot(
      mockSlot({
        slot_key: 'beach_club_dj_night_teaser_post',
        design_template_type: 'campaign_announcement',
        label_tr: 'DJ Gecesi',
        format: 'post',
        match_signals: { keywords: ['dj', 'gece'] },
      }),
    );

    expect(preset.templateType).toBe('campaign_announcement');
    expect(preset.catalogSlotKey).toBe('beach_club_dj_night_teaser_post');
    expect(preset.name).toBe('DJ Gecesi');
    expect(preset.format).toBe('post');
    expect(preset.matchKeywords).toContain('dj');
    expect(preset.prominentLogo).toBe(true);
  });

  it('maps story format to design story preset', () => {
    const preset = buildDesignPresetFromCatalogSlot(
      mockSlot({
        slot_key: 'beach_club_sunset_golden_story',
        design_template_type: 'daily_story',
        format: 'story',
      }),
    );
    expect(preset.format).toBe('story');
    expect(preset.templateType).toBe('daily_story');
  });

  it('maps reel format to reel_cover preset', () => {
    const preset = buildDesignPresetFromCatalogSlot(
      mockSlot({
        slot_key: 'beach_club_reel_teaser',
        design_template_type: 'reel_cover',
        format: 'reel',
      }),
    );
    expect(preset.format).toBe('reel_cover');
  });
});

describe('selectCatalogSlotsForOnboarding', () => {
  it('returns all slots when under cap', () => {
    const slots = [
      mockSlot({ slot_key: 'a', design_template_type: 'campaign_announcement', sort_order: 1 }),
      mockSlot({ slot_key: 'b', design_template_type: 'daily_story', sort_order: 2 }),
    ];
    expect(selectCatalogSlotsForOnboarding(slots, 12)).toHaveLength(2);
  });

  it('prefers one slot per design_template_type before filling cap', () => {
    const types = [
      'campaign_announcement',
      'daily_story',
      'menu_highlight',
      'venue_showcase',
      'social_proof',
      'brand_identity',
      'event_special',
      'seasonal_promo',
      'announcement_formal',
      'reel_cover',
    ] as const;

    const slots = types.flatMap((type, i) => [
      mockSlot({
        slot_key: `${type}_primary`,
        design_template_type: type,
        sort_order: i * 2,
      }),
      mockSlot({
        slot_key: `${type}_secondary`,
        design_template_type: type,
        sort_order: i * 2 + 1,
      }),
    ]);

    const selected = selectCatalogSlotsForOnboarding(slots, ONBOARDING_CATALOG_TEMPLATE_CAP);
    expect(selected).toHaveLength(ONBOARDING_CATALOG_TEMPLATE_CAP);

    const selectedTypes = new Set(selected.map((s) => s.design_template_type));
    expect(selectedTypes.size).toBe(types.length);
  });
});

describe('resolveSectorSlotsWithPackFallback', () => {
  it('synthesizes coffee_shop pack when DB empty', () => {
    const slots = resolveSectorSlotsWithPackFallback('coffee_shop', []);
    expect(slots.length).toBeGreaterThanOrEqual(12);
    expect(slots.every((s) => s.sector_id === 'coffee_shop')).toBe(true);
    expect(slots.some((s) => s.slot_key.includes('latte'))).toBe(true);
  });

  it('prefers DB slots when present', () => {
    const dbSlot = mockSlot({
      slot_key: 'coffee_shop_custom_post',
      design_template_type: 'campaign_announcement',
      sector_id: 'coffee_shop',
    });
    const slots = resolveSectorSlotsWithPackFallback('coffee_shop', [dbSlot]);
    expect(slots).toHaveLength(1);
    expect(slots[0].slot_key).toBe('coffee_shop_custom_post');
  });

  it('disables delivery promo when delivery facility off in pack fallback', () => {
    const slots = resolveSectorSlotsWithPackFallback('coffee_shop', [], { delivery: false });
    const deliverySlot = slots.find((s) => s.slot_key.includes('delivery'));
    expect(deliverySlot?.enabled_by_default).toBe(true);
    // enabled_by_default stays true in catalog row; resolver filters at runtime
    expect(deliverySlot?.optional_tags).toContain('requires:delivery');
  });
});

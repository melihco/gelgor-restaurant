import { describe, expect, it } from 'vitest';
import {
  applyCatalogSlotVisualDefaults,
  buildDesignedStoryPromptPack,
  slotRequiresPremiumComposition,
} from '@/lib/catalog-slot-visual-defaults';
import { synthesizeSectorSlotDefinitions } from '@/lib/sector-slot-pack';
import {
  enrichProductionQueueWithBrandSlots,
  resolveBrandActiveSlotKeys,
} from '@/lib/brand-active-slot-resolver';

describe('catalog-slot-visual-defaults', () => {
  it('buildDesignedStoryPromptPack flags require_premium_composition', () => {
    const pack = buildDesignedStoryPromptPack('Weekend booking story');
    expect(pack.require_premium_composition).toBe(true);
    expect(pack.visual_treatment).toBe('story_event');
    expect(pack.premium_composition_defaults.composition_type).toBe('poster_design');
  });

  it('applyCatalogSlotVisualDefaults injects premium_composition when missing', () => {
    const pack = buildDesignedStoryPromptPack('Weekend booking story');
    const out = applyCatalogSlotVisualDefaults(
      { headline: 'Book your table', content_type: 'story' },
      pack,
    );
    const vps = out.visual_production_spec as Record<string, unknown>;
    expect(vps.treatment).toBe('story_event');
    expect(vps.premium_composition).toBeTruthy();
    expect(slotRequiresPremiumComposition(pack)).toBe(true);
  });

  it('does not overwrite existing premium_composition', () => {
    const pack = buildDesignedStoryPromptPack('Weekend booking story');
    const existing = { composition_type: 'custom_layout' };
    const out = applyCatalogSlotVisualDefaults(
      { visual_production_spec: { premium_composition: existing } },
      pack,
    );
    expect((out.visual_production_spec as Record<string, unknown>).premium_composition).toEqual(existing);
  });
});

describe('weekend_booking_story sector pack', () => {
  it('restaurant_cafe weekend_booking has designed story prompt_pack', () => {
    const slots = synthesizeSectorSlotDefinitions('restaurant_cafe');
    const weekend = slots.find((s) => s.slot_key === 'restaurant_cafe_weekend_booking_story');
    expect(weekend).toBeTruthy();
    expect(weekend!.pipeline).toBe('fal_story');
    expect(weekend!.design_template_type).toBe('announcement_formal');
    expect(weekend!.prompt_pack.require_premium_composition).toBe(true);
  });

  it('enrichProductionQueue stamps premium_composition for weekend booking slot', () => {
    const sectorSlots = synthesizeSectorSlotDefinitions('restaurant_cafe');
    const weekendDef = sectorSlots.find((s) => s.slot_key === 'restaurant_cafe_weekend_booking_story')!;
    const activeSet = resolveBrandActiveSlotKeys({
      workspaceId: 'ws-yula',
      sector: 'restaurant_cafe',
      sectorSlots,
      tenantAssignments: [{
        id: 'a1',
        workspace_id: 'ws-yula',
        slot_key: weekendDef.slot_key,
        enabled: true,
        priority: 10,
        assignment_source: 'operator',
        notes: null,
        slot: weekendDef,
      }],
    });

    const queue = enrichProductionQueueWithBrandSlots(
      [{
        queueIndex: 7,
        ideaIndex: 7,
        idea: {
          headline: 'Crafting Our Signature Drinks',
          content_type: 'story',
          template_use_case: 'behind_the_scenes',
          visual_production_spec: { treatment: 'pure_photo' },
        },
        assignment: {
          idea_index: 7,
          slot_role: 'campaign_story_motion',
          pipeline: 'fal_story',
          copy_bundle_id: 'week',
          publish_channel: 'instagram_organic',
        },
      }],
      activeSet,
    );

    expect(queue).toHaveLength(1);
    const vps = queue[0]!.idea.visual_production_spec as Record<string, unknown>;
    expect(vps.premium_composition).toBeTruthy();
    expect(vps.treatment).toBe('story_event');
    expect(queue[0]!.assignment.catalog_slot_key).toBe('restaurant_cafe_weekend_booking_story');
  });
});

describe('local_products_shop — no cross-sector leak', () => {
  it('harvest post slot has no require_premium_composition', () => {
    const slots = synthesizeSectorSlotDefinitions('local_products_shop');
    const harvest = slots.find((s) => s.slot_key === 'local_products_shop_harvest_post');
    expect(harvest?.prompt_pack?.require_premium_composition).toBeFalsy();
  });
});

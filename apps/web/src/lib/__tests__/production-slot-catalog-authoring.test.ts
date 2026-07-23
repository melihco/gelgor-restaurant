import { describe, expect, it } from 'vitest';
import type {
  BrandCustomSlotCreateInput,
  CatalogSlotCreateInput,
  ProductionSlotDefinition,
} from '../production-slot-catalog';

describe('production-slot-catalog authoring types', () => {
  it('accepts sector-global create payload shape', () => {
    const input: CatalogSlotCreateInput = {
      sector_id: 'restaurant_cafe',
      suffix: 'brunch_social_post',
      label_tr: 'Brunç Sosyal',
      label_en: 'Brunch Social',
      format: 'post',
      design_template_type: 'social_proof',
      enabled_by_default: true,
    };
    expect(input.suffix).toMatch(/brunch/);
    expect(input.owner_workspace_id ?? null).toBeNull();
  });

  it('accepts brand-private custom slot payload shape', () => {
    const input: BrandCustomSlotCreateInput = {
      suffix: 'chef_table_story',
      label_tr: 'Şef Masası',
      label_en: 'Chef Table',
      format: 'story',
      design_template_type: 'event_special',
    };
    expect(input.format).toBe('story');
  });

  it('marks owner_workspace_id on brand-private definitions', () => {
    const row: ProductionSlotDefinition = {
      slot_key: 'restaurant_cafe_brand_0466adb9_chef_table_story',
      sector_id: 'restaurant_cafe',
      label_tr: 'Şef Masası',
      label_en: 'Chef Table',
      format: 'story',
      pipeline: 'fal_story',
      slot_role: 'campaign_story_motion',
      design_template_type: 'event_special',
      library_slot_key: 'event_story',
      tier: 'standard',
      match_signals: {},
      prompt_pack: {},
      enabled_by_default: false,
      sort_order: 0,
      status: 'active',
      owner_workspace_id: '0466adb9-1111-2222-3333-444444444444',
    };
    expect(row.owner_workspace_id).toBeTruthy();
    expect(row.enabled_by_default).toBe(false);
  });
});

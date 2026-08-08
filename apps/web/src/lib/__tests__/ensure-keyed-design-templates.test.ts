import { describe, expect, it } from 'vitest';
import { planKeyedDesignTemplateClones } from '../ensure-keyed-design-templates';
import type { BrandDesignTemplateRecord } from '../brand-design-template-matcher';

function tpl(
  overrides: Partial<BrandDesignTemplateRecord> & Pick<BrandDesignTemplateRecord, 'id' | 'catalog_slot_key' | 'format'>,
): BrandDesignTemplateRecord {
  return {
    template_type: 'campaign_announcement',
    template_name: overrides.template_name ?? 'Shell',
    thumbnail_url: 'https://cdn.example.com/t.jpg',
    design_spec: { prompt: 'x', intent: 'campaign' },
    status: 'active',
    ...overrides,
  };
}

describe('planKeyedDesignTemplateClones', () => {
  it('clones missing beach_club story keys from same-format peer', () => {
    const plans = planKeyedDesignTemplateClones({
      enabledSlots: [
        {
          slotKey: 'beach_club_day_pass_story',
          format: 'story',
          designTemplateType: 'campaign_announcement',
          labelTr: 'Gün pass story',
        },
        {
          slotKey: 'beach_club_cocktail_promo_story',
          format: 'story',
          designTemplateType: 'campaign_announcement',
          labelTr: 'Kokteyl promo story',
        },
      ],
      templates: [
        tpl({
          id: 'peer-dj',
          catalog_slot_key: 'beach_club_dj_event_story',
          format: 'story',
          template_type: 'event_special',
          template_name: 'DJ etkinlik story',
        }),
      ],
    });
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.catalogSlotKey).sort()).toEqual([
      'beach_club_cocktail_promo_story',
      'beach_club_day_pass_story',
    ]);
    expect(plans.every((p) => p.donorSource === 'active_peer')).toBe(true);
    expect(plans.every((p) => p.format === 'story')).toBe(true);
  });

  it('revives archived same-key template for local_products_shop story gap', () => {
    const plans = planKeyedDesignTemplateClones({
      enabledSlots: [
        {
          slotKey: 'local_products_shop_atelier_story',
          format: 'story',
          designTemplateType: 'daily_story',
          labelTr: 'Atölye story',
        },
      ],
      templates: [
        tpl({
          id: 'other',
          catalog_slot_key: 'local_products_shop_shelf_vitrine_post',
          format: 'post',
        }),
      ],
      archivedTemplates: [
        tpl({
          id: 'arch-story',
          catalog_slot_key: 'local_products_shop_atelier_story',
          format: 'story',
          template_type: 'daily_story',
          template_name: 'Atölye story',
          status: 'archived',
          thumbnail_url: 'https://cdn.example.com/arch.jpg',
        }),
      ],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.donorSource).toBe('archived_same_key');
    expect(plans[0]!.donorId).toBe('arch-story');
    expect(plans[0]!.catalogSlotKey).toBe('local_products_shop_atelier_story');
  });

  it('skips slots that already have an active keyed template', () => {
    const plans = planKeyedDesignTemplateClones({
      enabledSlots: [
        {
          slotKey: 'beach_club_dj_event_story',
          format: 'story',
          designTemplateType: 'event_special',
          labelTr: 'DJ',
        },
      ],
      templates: [
        tpl({
          id: 'dj',
          catalog_slot_key: 'beach_club_dj_event_story',
          format: 'story',
          template_type: 'event_special',
        }),
      ],
    });
    expect(plans).toHaveLength(0);
  });

  it('injects target-slot purpose brief (not donor brief) for local_products_shop', () => {
    const plans = planKeyedDesignTemplateClones({
      enabledSlots: [
        {
          slotKey: 'local_products_shop_atelier_story',
          format: 'story',
          designTemplateType: 'daily_story',
          labelTr: 'Atölye story',
        },
      ],
      templates: [
        tpl({
          id: 'peer',
          catalog_slot_key: 'local_products_shop_shelf_story',
          format: 'story',
          template_type: 'daily_story',
          design_spec: {
            prompt: 'peer shell',
            slot_creative_brief: {
              version: 1,
              creative_intent_tr: 'DONOR BRIEF MUST NOT SURVIVE',
            },
          },
        }),
      ],
      brandSeed: { brandName: 'Atelier X', location: 'Datça' },
    });
    expect(plans).toHaveLength(1);
    const brief = plans[0]!.designSpec.slot_creative_brief as {
      creative_intent_tr: string;
    };
    expect(brief.creative_intent_tr).not.toMatch(/DONOR BRIEF/);
    expect(brief.creative_intent_tr.toLowerCase()).toMatch(/atölye|atelier/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  isDesignTemplateHardPinEligible,
  isDesignTemplateLibraryLive,
  isDesignTemplateShellReady,
  resolveDesignTemplatePersistStatus,
} from '@/lib/design-template-library-gate';
import { seedDesignSpecLayout } from '@/lib/design-spec-layout';
import {
  diagnoseCatalogHardPinMiss,
  selectBrandDesignTemplate,
  type BrandDesignTemplateRecord,
} from '@/lib/brand-design-template-matcher';
import { requiresLibraryTemplateReplica } from '@/lib/brand-design-template-production';
import type { MatchedDesignTemplate } from '@/lib/brand-design-template-matcher';

const READY_PROMPT =
  'Design ONE portrait 4:5 feed post with brand color panel and venue photo for the slot.';

function readySpec(archetype: 'split_feature_panel' | 'product_hero_card' = 'split_feature_panel') {
  return {
    prompt: READY_PROMPT,
    canvaArchetypeId: archetype,
    layout: seedDesignSpecLayout({ archetypeId: archetype, format: 'post' }),
  };
}

describe('design-template-library-gate', () => {
  it('auto-approves complete shells (beach_club split panel)', () => {
    const input = {
      thumbnailUrl: 'https://cdn.example.com/preview.jpg',
      designSpec: readySpec('split_feature_panel'),
      format: 'post',
    };
    expect(isDesignTemplateShellReady(input)).toBe(true);
    expect(resolveDesignTemplatePersistStatus(input)).toBe('approved');
  });

  it('drafts incomplete product shells (local_products_shop)', () => {
    const input = {
      thumbnailUrl: null,
      designSpec: {
        prompt: READY_PROMPT,
        canvaArchetypeId: 'product_hero_card',
      },
      format: 'post',
    };
    expect(isDesignTemplateShellReady(input)).toBe(false);
    expect(resolveDesignTemplatePersistStatus(input)).toBe('draft');
  });

  it('treats legacy active as live; draft is not', () => {
    expect(isDesignTemplateLibraryLive('active')).toBe(true);
    expect(isDesignTemplateLibraryLive('approved')).toBe(true);
    expect(isDesignTemplateLibraryLive('draft')).toBe(false);
  });

  it('hard-pin requires layout for approved; legacy active needs thumb only', () => {
    expect(
      isDesignTemplateHardPinEligible({
        status: 'approved',
        thumbnailUrl: 'https://cdn.example.com/a.jpg',
        designSpec: { prompt: READY_PROMPT },
        format: 'post',
      }),
    ).toBe(false);

    expect(
      isDesignTemplateHardPinEligible({
        status: 'approved',
        thumbnailUrl: 'https://cdn.example.com/a.jpg',
        designSpec: readySpec(),
        format: 'post',
      }),
    ).toBe(true);

    expect(
      isDesignTemplateHardPinEligible({
        status: 'active',
        thumbnailUrl: 'https://cdn.example.com/a.jpg',
        designSpec: { prompt: READY_PROMPT },
        format: 'post',
      }),
    ).toBe(true);
  });

  it('approves shell with thumb + layout even without bake prompt', () => {
    const input = {
      thumbnailUrl: 'https://cdn.example.com/preview.jpg',
      designSpec: {
        canvaArchetypeId: 'split_feature_panel' as const,
        layout: seedDesignSpecLayout({ archetypeId: 'split_feature_panel', format: 'post' }),
      },
      format: 'post',
    };
    expect(isDesignTemplateShellReady(input)).toBe(true);
    expect(resolveDesignTemplatePersistStatus(input)).toBe('approved');
  });
});

describe('Phase D hard-pin approve gate', () => {
  function tpl(
    overrides: Partial<BrandDesignTemplateRecord> & Pick<BrandDesignTemplateRecord, 'id' | 'template_type' | 'format'>,
  ): BrandDesignTemplateRecord {
    return {
      template_name: overrides.template_name ?? overrides.id,
      thumbnail_url: overrides.thumbnail_url ?? 'https://cdn.example.com/preview.jpg',
      catalog_slot_key: overrides.catalog_slot_key ?? null,
      usage_count: 0,
      design_spec: overrides.design_spec ?? readySpec(),
      status: overrides.status ?? 'approved',
      ...overrides,
    } as BrandDesignTemplateRecord;
  }

  it('matcher hard-pins catalog key for draft rows; gate marks shell ineligible', () => {
    const draft = tpl({
      id: 'draft_dj',
      template_type: 'event_special',
      format: 'post',
      status: 'draft',
      catalog_slot_key: 'beach_club_dj_night_teaser_post',
      design_spec: {
        ...readySpec(),
        slot_creative_brief: {
          version: 1,
          creative_intent_tr: 'DJ teaser purpose shell',
          seed_source: 'auto_template_gen',
        },
      },
    });
    const sel = selectBrandDesignTemplate([draft], {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
    });
    expect(sel?.matchQuality).toBe('hard');
    expect(sel?.record.status).toBe('draft');
    expect(
      isDesignTemplateHardPinEligible({
        status: 'draft',
        thumbnailUrl: draft.thumbnail_url,
        designSpec: draft.design_spec,
        format: 'post',
      }),
    ).toBe(false);
  });

  it('hard-pins approved product shell (local_products_shop)', () => {
    const active = [
      tpl({
        id: 'harvest',
        template_type: 'menu_highlight',
        format: 'post',
        status: 'approved',
        catalog_slot_key: 'local_products_shop_harvest_post',
        design_spec: {
          ...readySpec('product_hero_card'),
          slot_creative_brief: {
            version: 1,
            creative_intent_tr: 'Harvest product purpose shell',
            seed_source: 'auto_template_gen',
          },
        },
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'local_products_shop_harvest_post',
    });
    expect(sel?.matchQuality).toBe('hard');
    expect(sel?.record.id).toBe('harvest');
  });

  it('renderable match requires replica; draft shells fail hard-pin eligibility', () => {
    const matched: MatchedDesignTemplate = {
      id: 'd1',
      templateType: 'daily_story',
      templateName: 'Draft shell',
      format: 'story',
      status: 'draft',
      galleryRef: null,
      prominentLogo: false,
      designSpecPrompt: READY_PROMPT,
      thumbnailUrl: 'https://cdn.example.com/preview.jpg',
      brandColors: null,
      logoUrl: undefined,
      directive: 'x',
      canvaArchetypeId: 'cinematic_full_bleed',
      layout: seedDesignSpecLayout({
        archetypeId: 'cinematic_full_bleed',
        format: 'story',
      }),
      matchQuality: 'hard',
    };
    expect(requiresLibraryTemplateReplica(matched)).toBe(true);
    expect(
      isDesignTemplateHardPinEligible({
        status: 'draft',
        thumbnailUrl: matched.thumbnailUrl,
        designSpec: {
          prompt: READY_PROMPT,
          layout: matched.layout,
          canvaArchetypeId: matched.canvaArchetypeId,
        },
        format: 'story',
      }),
    ).toBe(false);
  });
});

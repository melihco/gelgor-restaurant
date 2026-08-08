import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  diagnoseCatalogHardPinMiss,
  isRenderableDesignTemplateMatch,
  resolveDesignTemplateCandidateTypes,
  selectBrandDesignTemplate,
  type BrandDesignTemplateRecord,
} from '@/lib/brand-design-template-matcher';

const PURPOSE_BRIEF = {
  version: 1 as const,
  creative_intent_tr: 'Brand×slot purpose shell for hard pin',
  seed_source: 'auto_template_gen' as const,
};

function purposeSpec(extra: Record<string, unknown> = {}) {
  return {
    prompt: 'Brand design recipe for this catalog slot shell.',
    slot_creative_brief: PURPOSE_BRIEF,
    ...extra,
  };
}

function tpl(
  overrides: Partial<BrandDesignTemplateRecord> & Pick<BrandDesignTemplateRecord, 'id' | 'template_type' | 'format'>,
): BrandDesignTemplateRecord {
  return {
    template_name: overrides.template_name ?? overrides.id,
    thumbnail_url: overrides.thumbnail_url ?? 'https://cdn.example.com/preview.jpg',
    catalog_slot_key: overrides.catalog_slot_key ?? null,
    usage_count: overrides.usage_count ?? 0,
    design_spec: overrides.design_spec ?? {},
    status: overrides.status ?? 'active',
    ...overrides,
  } as BrandDesignTemplateRecord;
}

describe('resolveDesignTemplateCandidateTypes', () => {
  it('maps calendar event_teaser to event_special first', () => {
    const types = resolveDesignTemplateCandidateTypes({
      announcementType: 'event_teaser',
      format: 'post',
    });
    expect(types[0]).toBe('event_special');
    expect(types).toContain('campaign_announcement');
  });

  it('maps offer_campaign to campaign templates', () => {
    const types = resolveDesignTemplateCandidateTypes({
      announcementType: 'offer_campaign',
      format: 'post',
    });
    expect(types[0]).toBe('campaign_announcement');
  });

  it('maps library_slot_key campaign_post before caption heuristics', () => {
    const types = resolveDesignTemplateCandidateTypes({
      librarySlotKey: 'campaign_post',
      slotRole: 'fal_designed_post',
      format: 'post',
    });
    expect(types[0]).toBe('campaign_announcement');
  });

  it('maps event_story library key to event_special for story format', () => {
    const types = resolveDesignTemplateCandidateTypes({
      librarySlotKey: 'event_story',
      format: 'story',
    });
    expect(types[0]).toBe('event_special');
  });

  it('maps formal announcement copy to announcement_formal', () => {
    const types = resolveDesignTemplateCandidateTypes({
      headline: 'Önemli Duyuru',
      caption: 'Bilgilerinize sunarız',
      format: 'post',
    });
    expect(types[0]).toBe('announcement_formal');
  });

  it('prefers reel_cover for reel format when role hints reel', () => {
    const types = resolveDesignTemplateCandidateTypes({
      slotRole: 'fal_reel_motion',
      format: 'reel',
    });
    expect(types[0]).toBe('reel_cover');
  });

  it('overrides social_proof announcement when caption is DJ event (beach_club)', () => {
    const types = resolveDesignTemplateCandidateTypes({
      announcementType: 'social_proof',
      headline: 'DJ Night',
      caption: 'Live DJ set this Friday under the stars',
      format: 'post',
    });
    expect(types[0]).toBe('event_special');
  });

  it('overrides social_proof announcement when caption is product (local_products_shop)', () => {
    const types = resolveDesignTemplateCandidateTypes({
      announcementType: 'social_proof',
      headline: 'Haftalık reçel vitrini',
      caption: 'Ev yapımı ürünler — reçel ve zeytin rafta',
      format: 'post',
    });
    expect(types[0]).toBe('menu_highlight');
  });
});

describe('selectBrandDesignTemplate — 1A hard pin', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hard-pins the template whose catalog_slot_key matches the slot (restaurant_cafe)', () => {
    const active = [
      tpl({ id: 'daily', template_type: 'daily_story', format: 'story' }),
      tpl({
        id: 'event',
        template_type: 'event_special',
        format: 'story',
        catalog_slot_key: 'restaurant_cafe_event_announcement_story',
        design_spec: purposeSpec(),
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'campaign_story_motion',
      librarySlotKey: 'event_story',
      format: 'story',
      catalogSlotKey: 'restaurant_cafe_event_announcement_story',
    });
    expect(sel?.record.id).toBe('event');
    expect(sel?.matchQuality).toBe('hard');
  });

  it('hard-pins beach_club and local_products_shop catalog keys independently', () => {
    const beach = [
      tpl({
        id: 'dj',
        template_type: 'event_special',
        format: 'post',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        design_spec: purposeSpec(),
      }),
      tpl({ id: 'other', template_type: 'campaign_announcement', format: 'post' }),
    ];
    const shop = [
      tpl({
        id: 'harvest',
        template_type: 'menu_highlight',
        format: 'post',
        catalog_slot_key: 'local_products_shop_harvest_post',
        design_spec: purposeSpec(),
      }),
      tpl({ id: 'campaign', template_type: 'campaign_announcement', format: 'post' }),
    ];
    expect(selectBrandDesignTemplate(beach, {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
    })?.record.id).toBe('dj');
    expect(selectBrandDesignTemplate(shop, {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'local_products_shop_harvest_post',
    })?.record.id).toBe('harvest');
  });

  it('does not hard-pin holiday/orphan keyed shells without purpose brief (beach_club + shop)', () => {
    const beach = [
      tpl({
        id: 'holiday',
        template_name: '29 Ekim Cumhuriyet Bayramı',
        template_type: 'event_special',
        format: 'post',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        design_spec: { prompt: 'Holiday poster recipe without purpose brief.' },
      }),
    ];
    const shop = [
      tpl({
        id: 'orphan_harvest',
        template_type: 'menu_highlight',
        format: 'post',
        catalog_slot_key: 'local_products_shop_harvest_post',
        design_spec: { prompt: 'Orphan product shell without purpose brief.' },
      }),
    ];
    expect(selectBrandDesignTemplate(beach, {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
    })).toBeNull();
    expect(diagnoseCatalogHardPinMiss(beach, 'post', 'beach_club_dj_night_teaser_post').reason)
      .toBe('purpose_brief_missing');
    expect(selectBrandDesignTemplate(shop, {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'local_products_shop_harvest_post',
    })).toBeNull();
    expect(diagnoseCatalogHardPinMiss(shop, 'post', 'local_products_shop_harvest_post').reason)
      .toBe('purpose_brief_missing');
  });

  it('fail-closes purpose_brief_missing so foreign purpose shells cannot soft-hijack', () => {
    const active = [
      tpl({
        id: 'orphan_private',
        template_type: 'event_special',
        format: 'post',
        catalog_slot_key: 'beach_club_private_event_post',
        design_spec: { prompt: 'Orphan private event shell.' },
      }),
      tpl({
        id: 'dj_purpose',
        template_name: 'DJ gece teaser',
        template_type: 'event_special',
        format: 'post',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        design_spec: purposeSpec(),
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'beach_club_private_event_post',
      announcementType: 'event_teaser',
    });
    expect(sel).toBeNull();
    expect(diagnoseCatalogHardPinMiss(active, 'post', 'beach_club_private_event_post').reason)
      .toBe('purpose_brief_missing');
  });

  it('prefers purpose-brief shell over holiday keyed to the same catalog key', () => {
    const active = [
      tpl({
        id: 'holiday',
        template_name: '29 Ekim Cumhuriyet Bayramı',
        template_type: 'event_special',
        format: 'post',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        design_spec: { prompt: 'Holiday chrome.' },
      }),
      tpl({
        id: 'dj_purpose',
        template_name: 'DJ Night Teaser',
        template_type: 'event_special',
        format: 'post',
        catalog_slot_key: 'beach_club_dj_night_teaser_post',
        design_spec: purposeSpec(),
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_designed_post',
      format: 'post',
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
    });
    expect(sel?.record.id).toBe('dj_purpose');
    expect(sel?.matchQuality).toBe('hard');
  });

  it('Faz B: format-mismatch hard miss fails closed (no soft foreign template)', () => {
    // Data bug: a `post` template is keyed to a `story` slot — must not soft-bind daily_story.
    const active = [
      tpl({
        id: 'poster_post',
        template_type: 'campaign_announcement',
        format: 'post',
        catalog_slot_key: 'restaurant_cafe_typography_poster_story',
      }),
      tpl({ id: 'daily_story', template_type: 'daily_story', format: 'story' }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_only_story',
      librarySlotKey: 'campaign_post',
      format: 'story',
      catalogSlotKey: 'restaurant_cafe_typography_poster_story',
    });
    expect(sel).toBeNull();
    expect(diagnoseCatalogHardPinMiss(active, 'story', 'restaurant_cafe_typography_poster_story')).toEqual({
      reason: 'format_mismatch',
      catalogSlotKey: 'restaurant_cafe_typography_poster_story',
      foundFormats: ['post'],
    });
  });

  it('missing catalog template soft-binds same-format shell (under-provisioned tenant)', () => {
    const active = [
      tpl({ id: 'popular', template_type: 'campaign_announcement', format: 'post', usage_count: 99 }),
      tpl({ id: 'daily', template_type: 'daily_story', format: 'story', usage_count: 50 }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_designed_post',
      librarySlotKey: 'campaign_post',
      format: 'post',
      catalogSlotKey: 'beach_club_sunset_golden_story',
      announcementType: 'offer_campaign',
    });
    expect(sel?.record.id).toBe('popular');
    expect(sel?.matchQuality).toBe('soft');
    expect(sel?.hardPinMiss?.reason).toBe('missing_template');
    expect(
      diagnoseCatalogHardPinMiss(active, 'post', 'beach_club_sunset_golden_story').reason,
    ).toBe('missing_template');
  });

  it('local_products_shop: missing catalog key soft-binds post shell across sectors', () => {
    const active = [
      tpl({
        id: 'harvest_post',
        template_type: 'campaign_announcement',
        format: 'post',
        catalog_slot_key: 'local_products_shop_harvest_day_post',
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_designed_post',
      librarySlotKey: 'campaign_post',
      format: 'post',
      catalogSlotKey: 'local_products_shop_missing_catalog_key',
      announcementType: 'offer_campaign',
    });
    expect(sel?.record.id).toBe('harvest_post');
    expect(sel?.matchQuality).toBe('soft');
    expect(sel?.hardPinMiss?.reason).toBe('missing_template');
  });

  it('allowSoftFallbackWhenHardMiss re-enables soft path for migration/debug', () => {
    const active = [
      tpl({
        id: 'poster_post',
        template_type: 'campaign_announcement',
        format: 'post',
        catalog_slot_key: 'restaurant_cafe_typography_poster_story',
      }),
      tpl({ id: 'daily_story', template_type: 'daily_story', format: 'story' }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_only_story',
      format: 'story',
      catalogSlotKey: 'restaurant_cafe_typography_poster_story',
      allowSoftFallbackWhenHardMiss: true,
    });
    expect(sel?.record.id).toBe('daily_story');
    expect(sel?.matchQuality).toBe('soft');
    expect(sel?.hardPinMiss?.reason).toBe('format_mismatch');
  });
});

describe('selectBrandDesignTemplate — format gate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never lets a story template win a post slot (beach_club)', () => {
    const active = [
      tpl({
        id: 'campaign_story',
        template_type: 'campaign_announcement',
        format: 'story',
        usage_count: 30,
      }),
      tpl({ id: 'campaign_post', template_type: 'campaign_announcement', format: 'post' }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_designed_post',
      librarySlotKey: 'campaign_post',
      format: 'post',
      announcementType: 'offer_campaign',
    });
    expect(sel?.record.format).toBe('post');
    expect(sel?.record.id).toBe('campaign_post');
  });

  it('returns format_fallback quality when only an off-type same-format template exists', () => {
    const active = [
      tpl({ id: 'menu_post', template_type: 'menu_highlight', format: 'post' }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_reel_motion',
      librarySlotKey: null,
      format: 'reel',
    });
    // reel compat = reel_cover only; a post template is not format-compatible → no match.
    expect(sel).toBeNull();
  });

  it('never soft-binds a story template onto a reel slot', () => {
    const active = [
      tpl({
        id: 'golden_story',
        template_type: 'campaign_announcement',
        format: 'story',
        catalog_slot_key: 'beach_club_sunset_golden_story',
        usage_count: 40,
      }),
      tpl({
        id: 'atmosphere_reel',
        template_type: 'venue_showcase',
        format: 'reel_cover',
        catalog_slot_key: 'beach_club_atmosphere_reel',
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'organic_reel',
      format: 'reel',
      announcementType: 'venue_showcase',
    });
    expect(sel?.record.format).toBe('reel_cover');
    expect(sel?.record.id).toBe('atmosphere_reel');
  });

  it('hard-pins reel_cover by catalog key and rejects story shells', () => {
    const active = [
      tpl({
        id: 'wrong_story',
        template_type: 'campaign_announcement',
        format: 'story',
        catalog_slot_key: 'beach_club_cocktail_craft_reel',
      }),
      tpl({
        id: 'craft_reel',
        template_type: 'menu_highlight',
        format: 'reel_cover',
        catalog_slot_key: 'beach_club_cocktail_craft_reel',
        design_spec: purposeSpec(),
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'organic_reel',
      format: 'reel',
      catalogSlotKey: 'beach_club_cocktail_craft_reel',
    });
    expect(sel?.matchQuality).toBe('hard');
    expect(sel?.record.id).toBe('craft_reel');
  });

  it('without catalog key, soft match still works (pre-catalog brands)', () => {
    const active = [
      tpl({ id: 'campaign', template_type: 'campaign_announcement', format: 'post' }),
      tpl({ id: 'menu', template_type: 'menu_highlight', format: 'post' }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'fal_designed_post',
      librarySlotKey: 'campaign_post',
      format: 'post',
      announcementType: 'offer_campaign',
    });
    expect(sel?.matchQuality).toBe('soft');
    expect(sel?.record.id).toBe('campaign');
  });
});

describe('selectBrandDesignTemplate — off-season special-day exclude', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('excludes an out-of-window national-day template from a generic event slot', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T09:00:00Z'));
    const active = [
      tpl({
        id: 'noel',
        template_type: 'event_special',
        format: 'story',
        usage_count: 60,
        design_spec: { specialDay: { name: 'Noel', mmdd: '12-25', category: 'religious' } },
      }),
      tpl({ id: 'generic_event', template_type: 'event_special', format: 'story' }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'campaign_story_motion',
      librarySlotKey: 'event_story',
      format: 'story',
      announcementType: 'event_teaser',
    });
    expect(sel?.record.id).toBe('generic_event');
  });

  it('prefers an in-window special-day template when the occasion is imminent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T09:00:00Z'));
    const active = [
      tpl({ id: 'generic_event', template_type: 'event_special', format: 'story' }),
      tpl({
        id: 'imminent',
        template_type: 'event_special',
        format: 'story',
        design_spec: { specialDay: { name: 'Yaz Festivali', mmdd: '07-20', category: 'seasonal' } },
      }),
    ];
    const sel = selectBrandDesignTemplate(active, {
      slotRole: 'campaign_story_motion',
      librarySlotKey: 'event_story',
      format: 'story',
      announcementType: 'event_teaser',
    });
    expect(sel?.record.id).toBe('imminent');
  });
});

describe('isRenderableDesignTemplateMatch', () => {
  it('treats hard/soft pins as renderable (route to real designed pipeline)', () => {
    expect(isRenderableDesignTemplateMatch({ matchQuality: 'hard' })).toBe(true);
    expect(isRenderableDesignTemplateMatch({ matchQuality: 'soft' })).toBe(true);
  });

  it('treats format_fallback and null as non-renderable (cheap Satori path OK)', () => {
    expect(isRenderableDesignTemplateMatch({ matchQuality: 'format_fallback' })).toBe(false);
    expect(isRenderableDesignTemplateMatch(null)).toBe(false);
    expect(isRenderableDesignTemplateMatch(undefined)).toBe(false);
  });
});

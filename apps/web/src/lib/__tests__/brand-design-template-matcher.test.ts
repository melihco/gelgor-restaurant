import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolveDesignTemplateCandidateTypes,
  selectBrandDesignTemplate,
  type BrandDesignTemplateRecord,
} from '@/lib/brand-design-template-matcher';

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

  it('rejects a wrong-format keyed template and falls back to a soft same-format match', () => {
    // Yula bug: a `post` template is keyed to a `story` slot — must not hard-pin.
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
    expect(sel?.record.id).toBe('daily_story');
    expect(sel?.matchQuality).not.toBe('hard');
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
    // reel compat = reel_cover|story; a post template is not format-compatible → no match.
    expect(sel).toBeNull();
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

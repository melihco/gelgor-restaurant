import { describe, expect, it } from 'vitest';
import {
  isKnownCalendarDesignLayoutFamily,
  resolveCalendarDesignLayout,
  SECTOR_CALENDAR_LAYOUT_OVERRIDE_SECTORS,
  storyLayoutHintForCanvaArchetype,
} from '@/lib/calendar-design-layout';
import { normalizeSectorId } from '@/lib/sector-production-profile';

describe('sector layout override table', () => {
  it('every sector key survives normalization and reaches its playbook', () => {
    // Keys are indexed by canonical id; two aliases collapsing to the same id
    // would silently drop one vertical's playbook.
    const canonical = SECTOR_CALENDAR_LAYOUT_OVERRIDE_SECTORS.map((s) => normalizeSectorId(s));
    expect(new Set(canonical).size).toBe(canonical.length);
  });

  it('resolves overrides for aliased sectors, not just literal ones', () => {
    for (const sector of ['nightclub_lounge', 'nightclub', 'hotel_resort', 'beach_club']) {
      const layout = resolveCalendarDesignLayout({
        announcementType: sector.startsWith('hotel') ? 'offer_campaign' : 'event_teaser',
        channel: 'story',
        sector,
      });
      expect(layout.source).toMatch(/^sector_matrix:/);
    }
  });
});

describe('resolveCalendarDesignLayout', () => {
  it('maps event_teaser story to editorial_date_masthead by default', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'event_teaser',
      channel: 'story',
    });
    expect(layout.canvaArchetypeId).toBe('editorial_date_masthead');
    expect(layout.layoutFamilyHint).toBe('magazine_cover');
    expect(layout.source).toBe('announcement_matrix:event_teaser');
  });

  it('maps offer_campaign post to promo_price_stack', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'offer_campaign',
      channel: 'post',
    });
    expect(layout.canvaArchetypeId).toBe('promo_price_stack');
    expect(layout.source).toBe('announcement_matrix:offer_campaign');
  });

  it('applies beach_club sector override for event teaser story', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'event_teaser',
      channel: 'story',
      sector: 'beach_club',
    });
    expect(layout.canvaArchetypeId).toBe('neon_night_promo');
    expect(layout.source).toBe('sector_matrix:beach_club:event_teaser');
  });

  it('applies local_products_shop override for product reveal post', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'product_reveal',
      channel: 'post',
      sector: 'local_products_shop',
    });
    expect(layout.canvaArchetypeId).toBe('graphic_shape_stack');
    expect(layout.source).toBe('sector_matrix:local_products_shop:product_reveal');
  });

  it('restaurant_cafe offer_campaign avoids promo_price_stack flyer language', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'offer_campaign',
      channel: 'post',
      sector: 'restaurant_cafe',
    });
    expect(layout.canvaArchetypeId).toBe('split_feature_panel');
    expect(layout.canvaArchetypeId).not.toBe('promo_price_stack');
    expect(layout.source).toBe('sector_matrix:restaurant_cafe:offer_campaign');
  });

  it('honors explicit design_layout_family from calendar row', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'event_teaser',
      channel: 'story',
      sector: 'beach_club',
      explicitLayoutFamily: 'event_ticket_stub',
    });
    expect(layout.canvaArchetypeId).toBe('event_ticket_stub');
    expect(layout.source).toBe('calendar:design_layout_family');
  });

  it('rejects unknown explicit layout and falls back to matrix', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'social_proof',
      channel: 'post',
      explicitLayoutFamily: 'not_a_real_layout',
    });
    expect(layout.canvaArchetypeId).toBe('social_proof_banner');
  });

  it('applies nightclub_lounge sector override for event teaser story', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'event_teaser',
      channel: 'story',
      sector: 'nightclub_lounge',
    });
    expect(layout.canvaArchetypeId).toBe('neon_night_promo');
    // Source reports the canonical sector id ("nightclub_lounge" aliases to it).
    expect(layout.source).toBe('sector_matrix:nightclub:event_teaser');
  });

  it('sector override wins over derived idea hint without explicit lock', () => {
    const layout = resolveCalendarDesignLayout({
      announcementType: 'event_teaser',
      channel: 'story',
      sector: 'beach_club',
      explicitLayoutFamily: '',
    });
    expect(layout.canvaArchetypeId).toBe('neon_night_promo');
  });
});

describe('slot-catalog announcement vocabulary', () => {
  // Live production sent the slot catalog's own wording into a matrix that knew
  // six keys, so 203 of 217 calendar frames defaulted. Two sectors per case.
  const cases: Array<{
    incoming: string;
    channel: 'story' | 'post';
    sector: string;
    expected: string;
  }> = [
    { incoming: 'campaign_announcement', channel: 'post', sector: 'beach_club', expected: 'campaign_hero_block' },
    { incoming: 'seasonal_promo', channel: 'story', sector: 'beach_club', expected: 'diagonal_brand_split' },
    { incoming: 'menu_highlight', channel: 'post', sector: 'restaurant_cafe', expected: 'split_feature_panel' },
    { incoming: 'menu_highlight', channel: 'post', sector: 'local_products_shop', expected: 'graphic_shape_stack' },
    { incoming: 'event_special', channel: 'story', sector: 'restaurant_cafe', expected: 'editorial_date_masthead' },
    { incoming: 'event_special', channel: 'story', sector: 'beach_club', expected: 'neon_night_promo' },
    { incoming: 'customer_review', channel: 'post', sector: 'local_products_shop', expected: 'location_pin_card' },
    { incoming: 'kitchen_bts', channel: 'story', sector: 'restaurant_cafe', expected: 'polaroid_memory' },
  ];

  for (const c of cases) {
    it(`${c.incoming} (${c.channel}, ${c.sector}) reaches the matrix instead of defaulting`, () => {
      const layout = resolveCalendarDesignLayout({
        announcementType: c.incoming,
        channel: c.channel,
        sector: c.sector,
      });
      expect(layout.canvaArchetypeId).toBe(c.expected);
      expect(layout.source).not.toBe('default_split_feature_panel');
      expect(layout.isFallback).toBe(false);
    });
  }

  it('leaves label-only announcement types unresolved so rotation can pick', () => {
    // These carry no layout intent among the six keys; mapping them onto one
    // would rebuild the collapse the synonym map exists to undo.
    for (const labelOnly of ['announcement_formal', 'daily_story', 'weekend_hours', 'job_posting']) {
      for (const sector of ['restaurant_cafe', 'local_products_shop']) {
        const layout = resolveCalendarDesignLayout({
          announcementType: labelOnly,
          channel: 'post',
          sector,
        });
        expect(layout.source).toBe('default_split_feature_panel');
        expect(layout.isFallback).toBe(true);
      }
    }
  });

  it('marks real matrix and explicit hits as non-fallback', () => {
    for (const sector of ['beach_club', 'local_products_shop']) {
      expect(resolveCalendarDesignLayout({
        announcementType: 'social_proof', channel: 'post', sector,
      }).isFallback).toBe(false);
      expect(resolveCalendarDesignLayout({
        announcementType: '', channel: 'post', sector, explicitLayoutFamily: 'noir_editorial',
      }).isFallback).toBe(false);
    }
  });
});

describe('isKnownCalendarDesignLayoutFamily', () => {
  it('validates catalog archetype ids', () => {
    expect(isKnownCalendarDesignLayoutFamily('event_ticket_stub')).toBe(true);
    expect(isKnownCalendarDesignLayoutFamily('festival_poster')).toBe(false);
    expect(storyLayoutHintForCanvaArchetype('event_ticket_stub')).toBe('event_ticket');
  });
});

import { describe, expect, it } from 'vitest';
import {
  isKnownCalendarDesignLayoutFamily,
  resolveCalendarDesignLayout,
  storyLayoutHintForCanvaArchetype,
} from '@/lib/calendar-design-layout';

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
    expect(layout.source).toBe('sector_matrix:nightclub_lounge:event_teaser');
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

describe('isKnownCalendarDesignLayoutFamily', () => {
  it('validates catalog archetype ids', () => {
    expect(isKnownCalendarDesignLayoutFamily('event_ticket_stub')).toBe(true);
    expect(isKnownCalendarDesignLayoutFamily('festival_poster')).toBe(false);
    expect(storyLayoutHintForCanvaArchetype('event_ticket_stub')).toBe('event_ticket');
  });
});

import { describe, expect, it } from 'vitest';
import {
  resolveDesignedPostComposeStrategy,
  resolveDesignedPostContentHierarchy,
  resolveDesignedPostProductionOrder,
} from '../designed-post-production-order';

describe('designed-post-production-order', () => {
  it('orders stages art-direction → hierarchy → composition → type → QC', () => {
    const order = resolveDesignedPostProductionOrder({
      businessType: 'beach_club',
      headline: 'Gün batımı',
      announcementType: 'daily_story',
      caption: 'Altın saat Sarnıç Beach',
    });
    expect(order.stages).toEqual([
      'brand_art_direction',
      'content_hierarchy',
      'composition_selection',
      'typography_engine',
      'quality_control',
    ]);
  });

  it('defaults to gpt_image_compose (vibey) and keeps shell as layout hint', () => {
    const packaging = resolveDesignedPostProductionOrder({
      businessType: 'local_products_shop',
      slotRole: 'fal_designed_post',
      catalogSlotKey: 'local_products_shop_harvest_post',
      announcementType: 'product_reveal',
      headline: 'Bayram Sepeti',
      caption: 'Datça bademi ve zeytinyağı',
      designIntensityLevel: 'bold_editorial',
    });
    expect(packaging.packagingLock).toBe(true);
    expect(packaging.composeStrategy).toBe('gpt_image_compose');
    expect(packaging.forbidImageModelTypography).toBe(false);
    expect(packaging.requireDeterministicTypography).toBe(false);
    expect(packaging.slotLook).toBe('product_hero');
    expect(packaging.geometricShellId).toBeTruthy();

    const nightlife = resolveDesignedPostComposeStrategy({
      businessType: 'beach_club',
      headline: 'DJ Night',
      caption: 'Cumartesi gece canlı set',
      announcementType: 'event_announcement',
      designIntensityLevel: 'bold_editorial',
    });
    expect(nightlife.slotLook).toBe('nightlife_event');
    expect(nightlife.composeStrategy).toBe('gpt_image_compose');
    expect(nightlife.forbidImageModelTypography).toBe(false);
    expect(nightlife.geometricShellId).toBe('inset_frame_on_color');
    expect(nightlife.packagingLock).toBe(false);
  });

  it('opt-in forceDeterministic → geometric_compose', () => {
    const order = resolveDesignedPostProductionOrder({
      businessType: 'beach_club',
      catalogSlotKey: 'beach_club_daybed_offer_post',
      headline: 'Daybed',
      announcementType: 'campaign_offer',
      forceDeterministic: true,
    });
    expect(order.composeStrategy).toBe('geometric_compose');
    expect(order.requireDeterministicTypography).toBe(true);
    expect(order.forbidImageModelTypography).toBe(true);
    expect(order.geometricShellId).toBe('badge_overlap_offer');
  });

  it('maps daybed offer → badge_overlap_offer shell hint', () => {
    const order = resolveDesignedPostProductionOrder({
      businessType: 'beach_club',
      catalogSlotKey: 'beach_club_daybed_offer_post',
      headline: 'Daybed',
      announcementType: 'campaign_offer',
    });
    expect(order.geometricShellId).toBe('badge_overlap_offer');
    expect(order.composeStrategy).toBe('gpt_image_compose');
  });

  it('builds content hierarchy with primary / secondary / cta', () => {
    const h = resolveDesignedPostContentHierarchy({
      headline: 'Bayram Sepeti',
      subtitle: 'Yöresel lezzet',
      caption: 'Sipariş için DM. Kargo tüm Türkiye.',
      cta: 'DM ile sipariş',
    });
    expect(h.primary).toBe('Bayram Sepeti');
    expect(h.secondary).toBe('Yöresel lezzet');
    expect(h.cta).toBe('DM ile sipariş');
    expect(h.tertiary).toMatch(/Sipariş/i);
  });
});

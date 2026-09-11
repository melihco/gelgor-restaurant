import { describe, expect, it } from 'vitest';
import {
  adCreativeCopy,
  filterPaidAdCreatives,
  isDerivedAdCreative,
  isOrganicFeedArtifact,
} from '@/lib/ad-publish-utils';
import type { OutputArtifact } from '@/types';

function artifact(meta: Record<string, unknown>, title = 'Post'): OutputArtifact {
  return {
    id: 'a1',
    title,
    contentUrl: '/api/media?key=x.jpg',
    createdAt: '2026-09-06T12:00:00.000Z',
    metadata: meta,
    content: '{}',
  } as OutputArtifact;
}

describe('isDerivedAdCreative', () => {
  it('treats designed_post clones as ads, not organic feed cards', () => {
    const clone = artifact({
      derived_from: 'designed_post',
      ad_platform: 'meta_ads',
      production_role: 'paid_ad_creative',
    }, 'Hava güzel — Meta Ads');
    expect(isDerivedAdCreative(clone)).toBe(true);
    expect(isOrganicFeedArtifact(clone)).toBe(false);
  });

  it('keeps designed shop posts on the organic feed', () => {
    const post = artifact({
      catalog_slot_key: 'local_products_shop_product_hero_post',
      pipeline: 'fal_design',
      production_role: 'fal_designed_post',
      publish_channel: 'instagram_organic',
    });
    expect(isDerivedAdCreative(post)).toBe(false);
    expect(isOrganicFeedArtifact(post)).toBe(true);
  });
});

describe('filterPaidAdCreatives', () => {
  it('splits Meta and Google copies with the same card fields (shop + beach)', () => {
    const shopMeta = artifact({
      derived_from: 'designed_post',
      publish_channel: 'meta_ads',
      production_role: 'paid_ad_creative',
      ad_headline: 'Erken hasat',
      ad_primary_text: 'Datça zeytinyağı',
    }, 'Erken hasat — Meta Ads');
    const shopGoogle = artifact({
      derived_from: 'designed_post',
      publish_channel: 'google_ads',
      production_role: 'paid_ad_google_creative',
      ad_headline: 'Erken hasat',
      ad_primary_text: 'Datça zeytinyağı',
    }, 'Erken hasat — Google Ads');
    const beachMeta = artifact({
      derived_from: 'designed_post',
      ad_platform: 'meta_ads',
      production_role: 'paid_ad_creative',
      ad_headline: 'Gün batımı',
    }, 'Gün batımı — Meta Ads');
    const organic = artifact({
      production_role: 'fal_designed_post',
      publish_channel: 'instagram_organic',
    });

    const all = filterPaidAdCreatives([shopMeta, shopGoogle, beachMeta, organic], 'all');
    expect(all).toHaveLength(3);
    expect(filterPaidAdCreatives(all, 'google_ads')).toEqual([shopGoogle]);
    expect(filterPaidAdCreatives(all, 'meta_ads')).toHaveLength(2);
    expect(adCreativeCopy(shopGoogle).headline).toBe('Erken hasat');
    expect(adCreativeCopy(beachMeta).headline).toBe('Gün batımı');
  });
});

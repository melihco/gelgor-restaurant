import { describe, expect, it } from 'vitest';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import { resolveFeedSceneAction } from '@/lib/feed-scene-policy';

function standard(
  overrides: Partial<AiVisualProductionStandard> = {},
): AiVisualProductionStandard {
  return {
    enabled: true,
    level: 'moderate',
    useBrandIdentity: true,
    briefDrivesScene: true,
    embedLogo: true,
    formats: new Set(['post', 'story', 'carousel', 'reel']),
    visualSubject: 'product_hero',
    enhanceGallerySelected: true,
    adaptiveScene: true,
    adaptiveSceneMode: 'product_showcase',
    captionDrivenVisual: false,
    ...overrides,
  };
}

describe('resolveFeedSceneAction', () => {
  it('shop sell + enhance + adaptive → restage background', () => {
    expect(resolveFeedSceneAction({
      visualStandard: standard(),
      catalogSlotKey: 'local_products_shop_customer_favorite_post',
      caption: 'Müşterilerimizin en sevdiği lezzet: badem ezmesi.',
    })).toBe('restage_background');
  });

  it('shop sell with gallery_only / enhance off → none', () => {
    expect(resolveFeedSceneAction({
      visualStandard: standard({ enabled: false, adaptiveScene: true }),
      catalogSlotKey: 'local_products_shop_product_hero_post',
    })).toBe('none');
  });

  it('shop sell with adaptive off → none', () => {
    expect(resolveFeedSceneAction({
      visualStandard: standard({ adaptiveScene: false }),
      catalogSlotKey: 'local_products_shop_product_hero_post',
    })).toBe('none');
  });

  it('beach place + adaptive on → none (do not invent a venue)', () => {
    expect(resolveFeedSceneAction({
      visualStandard: standard({
        visualSubject: 'venue_ambiance',
        adaptiveSceneMode: 'lifestyle_composite',
      }),
      catalogSlotKey: 'beach_club_daybed_offer_post',
      slotJob: 'çim alan şemsiye şezlong',
      caption: 'Deniz duruyor. Alan açık.',
    })).toBe('none');
  });

  it('shop ambiance place stays none even when product_showcase is on', () => {
    expect(resolveFeedSceneAction({
      visualStandard: standard(),
      catalogSlotKey: 'local_products_shop_shop_ambiance_post',
      caption: 'Dükkanın sıcak atmosferi.',
    })).toBe('none');
  });

  it('process + product still + harvest copy → restage', () => {
    expect(resolveFeedSceneAction({
      visualStandard: standard(),
      catalogSlotKey: 'local_products_shop_craft_process_reel',
      caption: 'Hasat günü atölyede üretim.',
      evidenceNote: 'etiketli şişe, kavanoz',
      photoRole: 'product_for_sale',
    })).toBe('restage_background');
  });
});

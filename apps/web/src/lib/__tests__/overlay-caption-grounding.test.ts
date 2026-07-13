import { describe, it, expect } from 'vitest';
import {
  extractProductBiasedCaptionHook,
  isGenericRetailOverlayCta,
  isOffTopicTourismOverlay,
  overlayHeadlineGroundedInCaption,
  rebiasUngroundedOverlayCopy,
} from '@/lib/overlay-caption-grounding';

const KARAMAN_CAPTION =
  'Datça\'daki zeytinliklerimizde erken hasat zeytinyağımızı birlikte keşfedin. '
  + 'Soğuk sıkım, doğal üretim — sınırlı stok!';

describe('overlay-caption-grounding', () => {
  it('rejects agro-tourism headline for olive oil product caption', () => {
    expect(
      isOffTopicTourismOverlay(
        'Agro-Turizm ile Tanıştınız mı?',
        KARAMAN_CAPTION,
        'local_products_shop',
      ),
    ).toBe(true);
  });

  it('rejects generic fast-order CTA when caption has no order language', () => {
    expect(isGenericRetailOverlayCta('Hızlı sipariş verin', KARAMAN_CAPTION)).toBe(true);
  });

  it('prefers product-biased hook from caption', () => {
    const hook = extractProductBiasedCaptionHook(
      KARAMAN_CAPTION,
      'Çiftlik ziyareti story',
      'Karaman Datça',
      32,
    );
    expect(hook?.toLowerCase()).toMatch(/zeytin|hasat|datça/);
    expect(hook?.toLowerCase()).not.toMatch(/agro|turizm/);
  });

  it('rebias replaces off-topic tourism overlay with caption hook', () => {
    const result = rebiasUngroundedOverlayCopy({
      headline: 'Agro-Turizm ile Tanıştınız mı?',
      subtitle: 'Hızlı sipariş verin',
      caption: KARAMAN_CAPTION,
      brandName: 'Karaman Datça',
      businessType: 'local_products_shop',
      channel: 'feed_post',
    });
    expect(result.rebased).toBe(true);
    expect(result.headline.toLowerCase()).not.toMatch(/agro|turizm/);
    expect(result.subtitle?.toLowerCase()).not.toMatch(/hızlı sipariş|hizli siparis/);
    expect(overlayHeadlineGroundedInCaption(result.headline, KARAMAN_CAPTION)).toBe(true);
  });
});

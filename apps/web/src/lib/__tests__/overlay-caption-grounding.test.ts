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

  it('rebias never falls back to a truncated caption first sentence', () => {
    const caption = 'Müşterilerimiz kahvaltımızdan vazgeçemiyor. Gerçek lezzetlerden vazgeçmiyoruz.';
    const result = rebiasUngroundedOverlayCopy({
      headline: 'Agro-Turizm ile Tanıştınız mı?',
      caption,
      brandName: 'gel gör',
      businessType: 'restaurant_cafe',
      channel: 'feed_post',
    });
    expect(result.headline.toLowerCase()).not.toMatch(/müşterilerimiz kahvaltımızdan$/);
    expect(result.headline.toLowerCase()).toMatch(/kahvalt|serpme|keyfi|vazgeçilmez|lezzet|hasat/);
  });

  it('grounds sunset headline against caption that says Sunsets (plural)', () => {
    const caption =
      'Sunsets, cocktails, and great music await you at Yula Bodrum! '
      + 'See you on the dance floor!';
    expect(
      overlayHeadlineGroundedInCaption(
        'Get ready for a sunset like no other!',
        caption,
      ),
    ).toBe(true);
  });

  it('grounds short DJ punchline against Turkish DJ caption', () => {
    expect(
      overlayHeadlineGroundedInCaption(
        'DJ Night',
        'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
      ),
    ).toBe(true);
  });

  it('does not rebias sunset/DJ mission headline into Cocktail when caption mentions drinks', () => {
    const caption =
      'Sunsets, cocktails, and great music await you at Yula Bodrum! '
      + 'Join us under the stars and experience the magic. See you on the dance floor!';
    const result = rebiasUngroundedOverlayCopy({
      headline: 'Get ready for a sunset like no other!',
      subtitle: 'Join us for a vibrant evening at Yula Bodrum.',
      caption,
      brandName: 'Yula Bodrum',
      businessType: 'beach_club',
      channel: 'feed_post',
    });
    expect(result.headline.toLowerCase()).not.toMatch(/cocktail|kokteyl/);
    expect(
      result.rebased === false
      || /sunset|glow|night|dj|star/i.test(result.headline),
    ).toBe(true);
  });
});

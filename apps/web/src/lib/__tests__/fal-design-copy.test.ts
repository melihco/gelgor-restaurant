import { describe, it, expect } from 'vitest';
import { isLabelStyleHeadline } from '../production-headline-quality';
import { resolveMissionFalDesignCopy } from '../fal-design-copy';

describe('isLabelStyleHeadline — seasonal / occasion signals', () => {
  it('rejects calendar and season label headlines', () => {
    expect(isLabelStyleHeadline('Gündüz plaj/havuz')).toBe(true);
    expect(isLabelStyleHeadline('Yaz sezonu')).toBe(true);
    expect(isLabelStyleHeadline('15 Temmuz anması')).toBe(true);
    expect(isLabelStyleHeadline('Yaz zirvesi — plaj/havuz')).toBe(true);
    expect(isLabelStyleHeadline('Yeni Sezon')).toBe(true);
  });

  it('keeps real marketing hooks', () => {
    expect(isLabelStyleHeadline('Bu Yaz Keşfetmeye Hazır mısın?')).toBe(false);
    expect(isLabelStyleHeadline('Meet us under the stars')).toBe(false);
    expect(isLabelStyleHeadline('Sıcak gecelerde buluşalım')).toBe(false);
  });

  it('rejects catalog slot labels with format suffix', () => {
    expect(isLabelStyleHeadline('Çiftlik ziyareti story')).toBe(true);
    expect(isLabelStyleHeadline('DJ gecesi reel')).toBe(true);
    expect(isLabelStyleHeadline('Menü öne çıkar post')).toBe(true);
  });
});

describe('resolveMissionFalDesignCopy', () => {
  it('prefers concept_title over caption fragment headline', () => {
    const result = resolveMissionFalDesignCopy({
      idea: {
        concept_title: 'Dive into OUR SUNSET RITUAL!!',
        headline: 'Join us for a taste',
        canva_field_copy: {
          headline: 'Keşfetmeye Hazır mısın?',
        },
      },
      ideationHeadline: 'Dive into OUR SUNSET RITUAL!!',
      caption: 'Join us for a taste of paradise. Book your sunset ritual tonight.',
      brandName: 'Scorpios Bodrum',
      channel: 'feed_post',
      businessType: 'beach_club',
    });
    expect(result.source).toBe('ideation_title');
    expect(result.headline).toMatch(/SUNSET RITUAL/i);
    expect(result.headline).not.toMatch(/Join us for a taste|Keşfetmeye/i);
  });

  it('prefers canva_field_copy over label ideation headline', () => {
    const result = resolveMissionFalDesignCopy({
      idea: {
        headline: 'Yaz sezonu',
        canva_field_copy: {
          headline: 'Sıcak gecelerde buluşalım',
          subtitle: 'Yerini ayırt',
        },
      },
      ideationHeadline: 'Yaz sezonu',
      caption: 'Bu yaz sıcak geceleri DJ performanslarıyla renklendiriyoruz! 15 Temmuz\'da buluşalım!',
      brandName: 'Scorpios Bodrum',
      channel: 'reel',
      businessType: 'beach_club',
    });
    expect(result.source).toBe('canva_field_copy');
    expect(result.headline.toLowerCase()).not.toMatch(/sezon/);
    expect(result.headline.toLowerCase()).toMatch(/gece|buluş|sıcak/);
  });

  it('derives overlay from caption when ideation is a slot format label', () => {
    const result = resolveMissionFalDesignCopy({
      idea: { headline: 'Çiftlik ziyareti story' },
      ideationHeadline: 'Çiftlik ziyareti story',
      caption:
        'Datça\'daki zeytinliklerimizde erken hasat zeytinyağımızı birlikte keşfedin. '
        + 'Doğal üretim, soğuk sıkım — sınırlı stok!',
      brandName: 'Karaman Datça',
      channel: 'feed_post',
      businessType: 'local_products_shop',
    });
    expect(result.source).toMatch(/caption_design_copy/);
    expect(result.headline.toLowerCase()).not.toMatch(/çiftlik ziyareti|story/);
    expect(result.headline.length).toBeLessThanOrEqual(32);
  });

  it('derives overlay from caption when ideation is a season label', () => {
    const result = resolveMissionFalDesignCopy({
      idea: { headline: 'Gündüz plaj/havuz' },
      ideationHeadline: 'Gündüz plaj/havuz',
      caption:
        'Bu yaz, sıcak geceleri DJ performanslarıyla renklendiriyoruz! 15 Temmuz\'da buluşalım! Hızlıca yerini al!',
      brandName: 'Scorpios Bodrum',
      channel: 'feed_post',
      businessType: 'beach_club',
    });
    expect(result.source).toMatch(/caption_design_copy/);
    expect(result.headline.toLowerCase()).not.toMatch(/plaj\/havuz|gündüz/);
    expect(result.headline.length).toBeGreaterThan(4);
  });

  it('keeps English overlay language when caption is English', () => {
    const result = resolveMissionFalDesignCopy({
      idea: {
        canva_field_copy: { headline: 'Meet us under the stars', cta: 'Reserve' },
      },
      ideationHeadline: 'Summer season',
      caption: 'This summer we color hot nights with DJ sets. Join us on July 15.',
      brandName: 'Scorpios Bodrum',
      channel: 'story',
      businessType: 'beach_club',
    });
    expect(result.headline).toMatch(/Meet|stars|Reserve|Join|summer|nights/i);
    expect(result.headline).not.toMatch(/sezon|anması|plaj/i);
  });
});

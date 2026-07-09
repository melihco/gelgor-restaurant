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
});

describe('resolveMissionFalDesignCopy', () => {
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

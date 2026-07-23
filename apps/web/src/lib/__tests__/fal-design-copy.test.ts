import { describe, it, expect } from 'vitest';
import {
  isLabelStyleHeadline,
  isSoullessMenuHourHeadline,
} from '../production-headline-quality';
import {
  extractCaptionAlignedPunchline,
  resolveMissionFalDesignCopy,
} from '../fal-design-copy';
import {
  isIncompleteOverlayPhrase,
  resolveOverlayHeadlineWordBudget,
} from '../fal-caption-headline';

describe('isLabelStyleHeadline — seasonal / occasion signals', () => {
  it('rejects calendar and season label headlines', () => {
    expect(isLabelStyleHeadline('Gündüz plaj/havuz')).toBe(true);
    expect(isLabelStyleHeadline('Yaz sezonu')).toBe(true);
    expect(isLabelStyleHeadline('15 Temmuz anması')).toBe(true);
    expect(isLabelStyleHeadline('Yaz zirvesi — plaj/havuz')).toBe(true);
    expect(isLabelStyleHeadline('Yeni Sezon')).toBe(true);
  });

  it('rejects soulless menu-hour boards', () => {
    expect(isSoullessMenuHourHeadline('Klasik Pazar Kahvaltısı')).toBe(true);
    expect(isSoullessMenuHourHeadline('Öğlen Menüsü')).toBe(true);
    expect(isSoullessMenuHourHeadline('Akşam Kokteyli')).toBe(true);
    expect(isLabelStyleHeadline('Lunch Menu')).toBe(true);
  });

  it('keeps real marketing hooks and short atmosphere punchlines', () => {
    expect(isLabelStyleHeadline('Bu Yaz Keşfetmeye Hazır mısın?')).toBe(false);
    expect(isLabelStyleHeadline('Meet us under the stars')).toBe(false);
    expect(isLabelStyleHeadline('Sıcak gecelerde buluşalım')).toBe(false);
    expect(isLabelStyleHeadline('Bahçede Serpme Keyfi')).toBe(false);
    expect(isLabelStyleHeadline('Serpme Kahvaltı Keyfi')).toBe(false);
  });

  it('rejects catalog slot labels with format suffix', () => {
    expect(isLabelStyleHeadline('Çiftlik ziyareti story')).toBe(true);
    expect(isLabelStyleHeadline('DJ gecesi reel')).toBe(true);
    expect(isLabelStyleHeadline('Menü öne çıkar post')).toBe(true);
  });
});

describe('resolveOverlayHeadlineWordBudget', () => {
  it('keeps feed overlays at 3–4 words by intensity', () => {
    expect(resolveOverlayHeadlineWordBudget({ channel: 'feed_post', designIntensity: 'photo_first' }).maxWords).toBe(2);
    expect(resolveOverlayHeadlineWordBudget({ channel: 'feed_post', designIntensity: 'balanced' }).maxWords).toBe(3);
    expect(resolveOverlayHeadlineWordBudget({ channel: 'feed_post', designIntensity: 'bold_editorial' }).maxWords).toBe(4);
    expect(resolveOverlayHeadlineWordBudget({ channel: 'reel' }).maxWords).toBe(3);
  });
});

describe('extractCaptionAlignedPunchline', () => {
  it('builds a short breakfast hook for restaurant captions (not menu boards)', () => {
    const punch = extractCaptionAlignedPunchline({
      caption:
        "Gel Gör Restoran'da bahçemizde serpme köy kahvaltısını tadın! Taze yerel malzemelerle hazırlanır.",
      brandName: 'Gel Gör',
      maxWords: 3,
      maxLen: 36,
    });
    expect(punch.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(punch.toLowerCase()).toMatch(/serpme|kahvalt|bahçe/);
    expect(isSoullessMenuHourHeadline(punch)).toBe(false);
    expect(punch.toLowerCase()).not.toMatch(/öğlen menü|klasik pazar|gel gör/);
  });

  it('builds a cocktail hook for beach club captions', () => {
    const punch = extractCaptionAlignedPunchline({
      caption:
        'Yazın serinletici kokteyllerine hazır mısın? Sarnıç Beach’te ferahlatıcı lezzetler seni bekliyor.',
      brandName: 'Sarnıç Beach',
      maxWords: 3,
      maxLen: 36,
    });
    expect(punch.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(punch.toLowerCase()).toMatch(/kokteyl|cocktail|serin/);
    expect(punch.toLowerCase()).not.toMatch(/kahvalt|öğlen|menü/);
  });
});

describe('resolveMissionFalDesignCopy', () => {
  it('uses quoted calendar punchline as headline (Hadi tatlarına bak!)', () => {
    const result = resolveMissionFalDesignCopy({
      idea: {
        concept_title: 'Serinletici Yaz Kokteylleri!',
        headline: 'Serinletici Yaz Kokteylleri!',
        tagline: '"Hadi tatlarına bak!"',
        canva_field_copy: {
          headline: '"Hadi tatlarına bak!"',
          subtitle: 'Serinletici Yaz Kokteylleri!',
        },
        caption_draft:
          'Yazın serinletici kokteyllerine hazır mısın? Sarnıç Beach’te ferahlatıcı lezzetler seni bekliyor.',
      },
      ideationHeadline: 'Serinletici Yaz Kokteylleri!',
      caption:
        'Yazın serinletici kokteyllerine hazır mısın? Sarnıç Beach’te ferahlatıcı lezzetler seni bekliyor.',
      brandName: 'Sarnıç Beach',
      channel: 'feed_post',
      businessType: 'beach_club',
      designIntensity: 'balanced',
    });
    expect(result.source).toBe('mission_tagline');
    expect(result.headline.toLowerCase()).toMatch(/hadi|tat/);
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(4);
    expect(result.headline.toLowerCase()).not.toMatch(/sizi bekliyoruz|özlemle|serinletici yaz/);
  });

  it('tightens long mission taglines to the word budget on story', () => {
    const result = resolveMissionFalDesignCopy({
      idea: {
        concept_title: 'Crafting Citrus Cocktails',
        headline: 'Crafting Citrus Cocktails',
        tagline: 'Discover the art of cocktail making.',
        caption_draft:
          'Show our talented bartenders preparing cocktails, capturing the dynamic bar atmosphere.',
      },
      ideationHeadline: 'Crafting Citrus Cocktails',
      caption:
        'Show our talented bartenders preparing cocktails, capturing the dynamic bar atmosphere.',
      brandName: 'Yula',
      channel: 'story',
      businessType: 'beach_club',
      designIntensity: 'balanced',
    });
    expect(result.source).toBe('mission_tagline');
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(result.headline.toLowerCase()).toMatch(/discover|cocktail|art/);
  });

  it('prefers canva_field_copy marketing line over series-style ideation', () => {
    const result = resolveMissionFalDesignCopy({
      idea: {
        concept_title: 'Yerel Üretim Hikayeleri Serisi',
        headline: 'Yerel Üretim Hikayeleri Serisi',
        canva_field_copy: {
          headline: 'Doğal lezzetlerimizin tadını çıkarın.',
        },
      },
      ideationHeadline: 'Yerel Üretim Hikayeleri Serisi',
      caption: 'Çilek reçelimizi mutfağımızdan sofranıza taşıyoruz. Hızlı sipariş verin.',
      brandName: 'Karaman Datça',
      channel: 'feed_post',
      businessType: 'local_products_shop',
      designIntensity: 'balanced',
    });
    expect(result.source).toBe('canva_field_copy');
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(result.headline.toLowerCase()).toMatch(/doğal|lezzet|tad/);
    expect(result.headline.toLowerCase()).not.toMatch(/serisi|yaparken kargo|el yapımı$/);
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
      designIntensity: 'balanced',
    });
    expect(result.source).toBe('canva_field_copy');
    expect(result.headline.toLowerCase()).not.toMatch(/sezon/);
    expect(result.headline.toLowerCase()).toMatch(/gece|buluş|sıcak/);
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
  });

  it('derives short punchline from caption when ideation is a slot format label', () => {
    const result = resolveMissionFalDesignCopy({
      idea: { headline: 'Çiftlik ziyareti story' },
      ideationHeadline: 'Çiftlik ziyareti story',
      caption:
        'Datça\'daki zeytinliklerimizde erken hasat zeytinyağımızı birlikte keşfedin. '
        + 'Doğal üretim, soğuk sıkım — sınırlı stok!',
      brandName: 'Karaman Datça',
      channel: 'feed_post',
      businessType: 'local_products_shop',
      designIntensity: 'balanced',
    });
    expect(result.source).toMatch(/caption_/);
    expect(result.headline.toLowerCase()).not.toMatch(/çiftlik ziyareti|story/);
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(result.headline.toLowerCase()).toMatch(/hasat|zeytin|tadım|erken/);
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
      designIntensity: 'balanced',
    });
    expect(result.source).toMatch(/caption_/);
    expect(result.headline.toLowerCase()).not.toMatch(/plaj\/havuz|gündüz/);
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
  });

  it('never ships a long caption sentence as the feed overlay', () => {
    const result = resolveMissionFalDesignCopy({
      idea: { headline: 'Yaz sezonu / serinletici menü' },
      ideationHeadline: 'Yaz sezonu / serinletici menü',
      caption:
        "Gel Gör Restoran'da bahçemizde serpme köy kahvaltısını tadın! Taze yerel malzemelerle hazırlanır.",
      brandName: 'Gel Gör',
      channel: 'feed_post',
      businessType: 'restaurant_cafe',
      designIntensity: 'balanced',
    });
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(result.headline.length).toBeLessThanOrEqual(36);
    expect(result.headline.toLowerCase()).not.toMatch(/gel gör restoran|yaz sezonu|öğlen|menü/);
    expect(result.headline.toLowerCase()).toMatch(/serpme|kahvalt|bahçe|keyfi/);
  });

  it('never paints a truncated caption stub for social-proof breakfast copy', () => {
    const caption = 'Müşterilerimiz kahvaltımızdan vazgeçemiyor. Gerçek lezzetlerden...';
    const punch = extractCaptionAlignedPunchline({
      caption,
      brandName: 'gel gör',
      maxWords: 3,
      maxLen: 36,
    });
    expect(punch.toLowerCase()).not.toMatch(/müşterilerimiz kahvaltımızdan/);
    expect(isIncompleteOverlayPhrase(punch)).toBe(false);
    expect(punch.toLowerCase()).toMatch(/kahvalt|serpme|keyfi|vazgeçilmez|lezzet/);

    const result = resolveMissionFalDesignCopy({
      idea: { headline: 'Kahvaltı post' },
      ideationHeadline: 'Kahvaltı post',
      caption,
      brandName: 'gel gör',
      channel: 'feed_post',
      businessType: 'restaurant_cafe',
      designIntensity: 'balanced',
    });
    expect(result.headline.toLowerCase()).not.toMatch(/müşterilerimiz kahvaltımızdan/);
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(result.headline.toLowerCase()).toMatch(/kahvalt|serpme|keyfi|vazgeçilmez|lezzet/);
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
      designIntensity: 'balanced',
    });
    expect(result.headline).toMatch(/Meet|stars|night|Join|summer/i);
    expect(result.headline).not.toMatch(/sezon|anması|plaj/i);
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
  });
});

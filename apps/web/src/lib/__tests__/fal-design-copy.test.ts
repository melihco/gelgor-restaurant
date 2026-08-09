import { describe, it, expect } from 'vitest';
import {
  isLabelStyleHeadline,
  isSoullessMenuHourHeadline,
} from '../production-headline-quality';
import {
  extractCaptionAlignedPunchline,
  resolveMissionFalDesignCopy,
  shouldPreserveLockedPunchlineHeadline,
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
    expect(resolveOverlayHeadlineWordBudget({ channel: 'feed_post', designIntensity: 'photo_first' }).maxWords).toBe(3);
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

  it('locks punchline as headline under operator type_budget (beach_club + local_products)', () => {
    const typeBudget = {
      headline: { maxChars: 18, maxWords: 2, maxLines: 1 },
      subtitle: null,
      source: 'operator' as const,
    };
    for (const [businessType, brandName, tagline, title] of [
      [
        'beach_club',
        'Scorpios Bodrum',
        'Join us for a fun-filled evening under the stars!',
        'Summer Sunset Gathering',
      ],
      [
        'local_products_shop',
        'Karaman Datça',
        'Where friends gather and moments are shared.',
        'Haftalık Vitrin Hikayesi',
      ],
    ] as const) {
      const result = resolveMissionFalDesignCopy({
        idea: {
          concept_title: title,
          headline: title,
          tagline,
          caption_draft: `${tagline} Visit ${brandName} this weekend.`,
        },
        ideationHeadline: title,
        caption: `${tagline} Visit ${brandName} this weekend.`,
        brandName,
        channel: 'feed_post',
        businessType,
        designIntensity: 'balanced',
        typeBudget,
      });
      expect(result.source).toBe('mission_tagline');
      expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(2);
      expect(result.headline.length).toBeLessThanOrEqual(18);
      expect(isIncompleteOverlayPhrase(result.headline)).toBe(false);
      // Must stay punchline stem — never demote to mission title.
      expect(result.headline.toLowerCase()).not.toMatch(/summer sunset|haftalık|vitrin|gathering/);
      expect(result.headline.toLowerCase()).toMatch(/join|evening|friends|gather|moments|shared/);
    }
  });

  it('rescues live EN caption-prefix stubs into complete theme punchlines', () => {
    const guest = resolveMissionFalDesignCopy({
      idea: {
        concept_title: 'Customer Experiences',
        headline: 'Customer Experiences',
        tagline: 'Our guests are the heart of Sarnıç Beach',
      },
      ideationHeadline: 'Customer Experiences',
      caption: 'Our guests are the heart of Sarnıç Beach! With every smile, we celebrate those unforgettable moments.',
      brandName: 'Sarnıç Beach',
      channel: 'feed_post',
      language: 'en',
      designIntensity: 'balanced',
    });
    expect(isIncompleteOverlayPhrase(guest.headline)).toBe(false);
    expect(guest.headline.toLowerCase()).toMatch(/guest|smile|moment|heart/);
    expect(guest.headline.toLowerCase()).not.toMatch(/^(our guests|the heart of)$/);

    const dish = resolveMissionFalDesignCopy({
      idea: { headline: 'Indulge in Our Signature Dishes' },
      ideationHeadline: 'Indulge in Our Signature Dishes',
      caption: 'Dive into the rich flavors of our signature dishes at Scorpios Bodrum! Every meal is a celebration.',
      brandName: 'Scorpios Bodrum',
      channel: 'feed_post',
      language: 'en',
      designIntensity: 'balanced',
    });
    expect(isIncompleteOverlayPhrase(dish.headline)).toBe(false);
    expect(dish.headline.toLowerCase()).not.toBe('indulge in our');
    expect(dish.headline.toLowerCase()).toMatch(/signature|flavor|dish/);

    const community = resolveMissionFalDesignCopy({
      idea: {
        headline: "Our Community's Love",
        tagline: 'Guests make us who we are',
      },
      ideationHeadline: "Our Community's Love",
      caption: 'Our guests make us who we are! Thanks to each of you for being part of our Scorpios family.',
      brandName: 'Scorpios Bodrum',
      channel: 'story',
      language: 'en',
      designIntensity: 'balanced',
    });
    expect(isIncompleteOverlayPhrase(community.headline)).toBe(false);
    expect(community.headline.toLowerCase()).toMatch(/guest|moment|community|love/);
    expect(community.headline.toLowerCase()).not.toMatch(/who we|make us$/);
  });

  it('shouldPreserveLockedPunchlineHeadline covers tagline + canva sources', () => {
    expect(shouldPreserveLockedPunchlineHeadline('mission_tagline')).toBe(true);
    expect(shouldPreserveLockedPunchlineHeadline('canva_field_copy')).toBe(true);
    expect(shouldPreserveLockedPunchlineHeadline('agent_headline')).toBe(false);
    expect(shouldPreserveLockedPunchlineHeadline(null)).toBe(false);
  });

  it('keeps calendar tagline over caption clamp / title stub (local_products + beach_club)', () => {
    for (const [businessType, brandName, tagline, title, caption] of [
      [
        'local_products_shop',
        'Karaman Datça',
        'Her kavanozda meyvelerin gerçek tadı!',
        'Lezzetin Sırrını Paylaşıyoruz',
        "Datça'nın birbirinden özel reçel ve zeytinyağı ürünlerini keşfedin. Sipariş verin.",
      ],
      [
        'beach_club',
        'Scorpios Bodrum',
        'Hadi tatlarına bak!',
        'Serinletici Yaz Kokteylleri!',
        'Bu yaz plajda gün batımı kokteylleri sizi bekliyor. Rezervasyon yapın.',
      ],
    ] as const) {
      const result = resolveMissionFalDesignCopy({
        idea: {
          calendar_enriched: true,
          concept_title: title,
          headline: title,
          tagline,
          canva_field_copy: { headline: tagline, subtitle: title },
          caption_draft: caption,
        },
        ideationHeadline: title,
        caption,
        brandName,
        channel: 'feed_post',
        businessType,
        designIntensity: 'balanced',
      });
      expect(result.source).toBe('mission_tagline');
      expect(result.headline.toLowerCase()).not.toBe('lezzetin');
      expect(result.headline.toLowerCase()).not.toMatch(/birbirinden özel|sizi bekliyor/);
      expect(isIncompleteOverlayPhrase(result.headline)).toBe(false);
      expect(result.headline.toLowerCase()).toMatch(
        businessType === 'local_products_shop'
          ? /kavanoz|meyve|tad/
          : /hadi|tat/,
      );
    }
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
    // Balanced feed budget is 3 words; complete TR marketing lines may keep 4
    // when the punch floor / scene compress path preserves meaning.
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(4);
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

  it('prefers agent marketing headline over caption slice when canva is a season label', () => {
    const result = resolveMissionFalDesignCopy({
      idea: {
        concept_title: 'Yaz sezonu',
        headline: 'Sıcak gecelerde buluşalım',
        canva_field_copy: { headline: 'Yaz sezonu' },
        caption_draft:
          'Bu yaz sıcak geceleri DJ performanslarıyla renklendiriyoruz! 15 Temmuz\'da buluşalım!',
      },
      ideationHeadline: 'Sıcak gecelerde buluşalım',
      caption:
        'Bu yaz sıcak geceleri DJ performanslarıyla renklendiriyoruz! 15 Temmuz\'da buluşalım!',
      brandName: 'Scorpios Bodrum',
      channel: 'feed_post',
      businessType: 'beach_club',
      designIntensity: 'balanced',
    });
    expect(result.source).toBe('agent_headline');
    expect(result.headline.toLowerCase()).toMatch(/gece|buluş|sıcak/);
    expect(result.headline.toLowerCase()).not.toMatch(/sezon|yaz sezon/);
  });

  it('keeps agent headline for beach_club and local_products (multi-tenant)', () => {
    for (const businessType of ['beach_club', 'local_products_shop'] as const) {
      const result = resolveMissionFalDesignCopy({
        idea: {
          concept_title: 'Haftalık vitrin',
          headline: 'Erken hasat tadımı',
          caption_draft: 'Erken hasat zeytinyağımızı atölyede tadın. Sınırlı stok.',
        },
        ideationHeadline: 'Erken hasat tadımı',
        caption: 'Erken hasat zeytinyağımızı atölyede tadın. Sınırlı stok.',
        brandName: businessType === 'beach_club' ? 'Yula' : 'Karaman Datça',
        channel: 'feed_post',
        businessType,
        designIntensity: 'balanced',
      });
      expect(result.source).toBe('agent_headline');
      expect(result.headline.toLowerCase()).toMatch(/hasat|tadım/);
    }
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

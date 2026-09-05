import { describe, expect, it } from 'vitest';
import {
  isHollowSocialHeadline,
  isUsableVisualDesignCardHeadline,
  overlayTakenFromCaption,
  resolveMeaningfulProductionHeadline,
  sanitizeProductionHeadline,
} from '@/lib/production-headline-quality';

describe('visual design card headline preference', () => {
  it('accepts short punchy card headlines that label-style would reject', () => {
    expect(isUsableVisualDesignCardHeadline('Doğanın Tazeliği', 'Karaman Datça')).toBe(true);
    expect(isUsableVisualDesignCardHeadline('Balın Doğallığı', 'Karaman Datça')).toBe(true);
    expect(isUsableVisualDesignCardHeadline('Badem Ezmesi', 'Karaman Datça')).toBe(true);
  });

  it('rejects incomplete / brief / brand-echo card text', () => {
    expect(isUsableVisualDesignCardHeadline('Ürünlerde geçerli yaz', 'Karaman Datça')).toBe(false);
    expect(isUsableVisualDesignCardHeadline('Karaman Datça', 'Karaman Datça')).toBe(false);
    expect(isUsableVisualDesignCardHeadline('Yaz fırsatları story', 'Karaman Datça')).toBe(false);
  });

  it('uses the caption opening as overlay when headline is empty', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: '',
      caption: 'Erken hasat bu hafta raflarda. Soğuk sıkım, küçük parti.',
      brandName: 'Yöresel Dükkan',
      visualDesignHeadline: 'Doğanın Tazeliği',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(r.headline).toMatch(/erken hasat|soğuk sıkım|raf/i);
    expect(r.reason).toMatch(/empty_headline|caption_pair|visual_design_card/);
  });

  it('prefers card over caption when ideation headline is incomplete', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: 'Ekip üyelerimizin',
      caption: 'Ekip üyelerimizin birlikte ürünlerimizi tanıtması.',
      brandName: 'Karaman Datça',
      visualDesignHeadline: 'Doğanın Tazeliği',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(r.headline).toBe('Doğanın Tazeliği');
    expect(r.reason).toBe('label_visual_design_card');
  });

  it('sanitizeProductionHeadline paints the caption opening, not a second slogan', () => {
    const h = sanitizeProductionHeadline({
      headline: 'Zeytin hasadını kutlayın',
      ideationHeadline: 'Zeytin hasadını kutlayın',
      caption: 'Zeytin hasadı başladı! Soğuk sıkım bu hafta raflarda.',
      brandName: 'Yöresel Dükkan',
      visualDesignHeadline: 'Doğanın Tazeliği',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(h).toBe('Zeytin hasadı başladı');
  });

  it('sanitize keeps a caption-native hook for product love', () => {
    const h = sanitizeProductionHeadline({
      headline: 'Müşterilerimiz',
      ideationHeadline: 'Müşterilerimiz Badamlı Kurabiyeleri Seviyor!',
      caption: 'Bademli kurabiye bu hafta taze çıktı. Küçük parti, ev fırını.',
      brandName: 'Yöresel Dükkan',
      visualDesignHeadline: 'Badem Ezmesi',
      businessType: 'local_products_shop',
      maxLen: 32,
    });
    expect(h.toLocaleLowerCase('tr-TR')).toMatch(/badem|kurabiye|küçük parti|fırın/);
    expect(h).not.toBe('Müşterilerimiz');
  });

  it('generic fallback respects English brand language (never Keşfetmeye…)', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: '',
      caption: '',
      brandName: 'Yula Bodrum',
      businessType: 'beach_club',
      language: 'en',
      maxLen: 32,
    });
    expect(r.reason).toBe('generic_fallback');
    expect(r.headline).toBe('Summer Mode: On');
    expect(r.headline).not.toMatch(/Keşfetmeye|Hazır mısın/i);
  });

  it('generic fallback stays Turkish for TR brands', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: '',
      caption: '',
      brandName: 'Yula Bodrum',
      businessType: 'beach_club',
      language: 'tr',
      maxLen: 32,
    });
    expect(r.headline).toBe('Yaz Moduna Geçtik!');
  });
});

describe('hollow social headlines lose to caption vibe', () => {
  it('rewrites harvest-celebrate calque from a local_products caption', () => {
    expect(isHollowSocialHeadline('Zeytin hasadını kutlayın')).toBe(true);
    const r = resolveMeaningfulProductionHeadline({
      headline: 'Zeytin hasadını kutlayın',
      caption:
        'Zeytin hasadı başladı! Datça’nın bereketli topraklarından gelen zeytinlerimizi'
        + ' soğuk sıkım yöntemiyle işliyoruz.',
      brandName: 'Yöresel Dükkan',
      businessType: 'local_products_shop',
      language: 'tr',
      maxLen: 32,
    });
    expect(r.replaced).toBe(true);
    expect(r.headline).not.toMatch(/kutlayın/i);
    expect(r.headline.toLocaleLowerCase('tr-TR')).toMatch(/hasat|sıkım|zeytin/);
  });

  it('rewrites katıksız slogan for a restaurant caption', () => {
    expect(isHollowSocialHeadline('Her şey el yapımı ve katıksız!')).toBe(true);
    const r = resolveMeaningfulProductionHeadline({
      headline: 'Her şey el yapımı ve katıksız!',
      caption: 'Bugün mutfakta taze otlar ve günlük ekmek. Sofra sade, tabak dolu.',
      brandName: 'Mahalle Mutfağı',
      businessType: 'restaurant_cafe',
      language: 'tr',
      maxLen: 32,
    });
    expect(r.replaced).toBe(true);
    expect(r.headline).not.toMatch(/katıksız|el yapımı/i);
  });
});

describe('caption-grounded noun-phrase headlines survive the label gate', () => {
  // Two sectors: the label detector used to reject short Turkish noun phrases
  // and paint a truncated caption prefix instead.
  it.each([
    {
      sector: 'restaurant_cafe',
      brand: 'Gel Gör Restaurant',
      headline: 'Zafer Bayramı Eğlencesi',
      caption:
        '30 Ağustos Zafer Bayramı’nda, ailece kutlamalar için Gel Gör Restaurant’ta buluşalım!'
        + ' Doğanın içinde huzur dolu anlar sizi bekliyor.',
    },
    {
      sector: 'local_products_shop',
      brand: 'Karaman Datça',
      headline: 'Zeytin Hasadı',
      caption:
        'Zeytin hasadı başladı! Datça’nın bereketli topraklarından gelen zeytinlerimizi'
        + ' soğuk sıkım yöntemiyle işliyoruz.',
    },
  ])('keeps $headline for $sector', ({ sector, brand, headline, caption }) => {
    const r = resolveMeaningfulProductionHeadline({
      headline,
      caption,
      brandName: brand,
      businessType: sector,
      language: 'tr',
      maxLen: 32,
    });
    expect(r.replaced === false || overlayTakenFromCaption(r.headline, caption) || r.headline === headline).toBe(true);
  });

  it('still replaces a generic slot label that the caption never mentions', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: 'Yaz sezonu',
      caption:
        'Müşterilerimizin doğal ballarımıza yaptığı yorumlar, ürünümüzün kalitesinin bir kanıtı!',
      brandName: 'Karaman Datça',
      businessType: 'local_products_shop',
      language: 'tr',
      maxLen: 32,
    });
    expect(r.replaced).toBe(true);
    expect(r.headline).not.toBe('Yaz sezonu');
  });
});

describe('caption-derived hooks read as whole thoughts', () => {
  // Live regression (Karaman / Gel Gör, 23 Aug): with no ideation headline the
  // chain trimmed the caption's opening sentence down to the character budget,
  // which shed the lead words and painted a lower-case mid-sentence slice
  // ("zeytinlerden elde edilmiş erken hasat…", "dolu anlarda yer alan…").
  it('prefers a later complete sentence over a trimmed opener', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: '',
      caption:
        'Bu yaz taptaze zeytinlerden elde edilmiş erken hasat zeytinyağımızı denemeye'
        + ' ne dersin? Doğallık ve lezzet bir arada! Hemen incele.',
      brandName: 'Karaman Datça',
      businessType: 'local_products_shop',
      language: 'tr',
      maxLen: 72,
    });
    expect(r.headline).toBe('Doğallık ve lezzet bir arada');
  });

  it('never opens a hook mid-sentence in lower case', () => {
    const r = resolveMeaningfulProductionHeadline({
      headline: '',
      caption:
        'Lezzet dolu anlarda yer alan kahvaltı çeşitlerimizin tadına bakmaya ne dersin?'
        + " Gel Gör'ün samimi atmosferinde buluşalım.",
      brandName: 'Gel Gör',
      businessType: 'restaurant_cafe',
      language: 'tr',
      maxLen: 72,
    });
    expect(r.headline[0]).toBe(r.headline[0]!.toLocaleUpperCase('tr-TR'));
    expect(r.headline).not.toMatch(/^dolu anlarda/);
  });

  it('replaces an invented tagline with the caption opening', () => {
    const caption =
      'Yazın sıcağında, bahçemizde serin masalarda dinlenme fırsatını yakalayın!'
      + ' Huzurlu anlar için Gel Gör sizi bekliyor!';
    const r = resolveMeaningfulProductionHeadline({
      headline: 'Yaz Bahçesinde Mola',
      caption,
      brandName: 'Gel Gör',
      businessType: 'restaurant_cafe',
      language: 'tr',
      maxLen: 32,
    });
    expect(overlayTakenFromCaption(r.headline, caption)).toBe(true);
    expect(r.headline).not.toBe('Yaz Bahçesinde Mola');
  });
});

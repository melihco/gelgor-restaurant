import { describe, it, expect } from 'vitest';
import {
  correctTurkishSpelling,
  resolveFalDisplayHeadline,
  resolveFalVideoHeadline,
  resolveFalSubtitle,
  sanitizeFalOverlayText,
  isMeaningfulFalOverlayText,
  ensureMeaningfulFalOverlayText,
  extractCaptionThemePunchline,
  formatFalOnImageHeadlineDirective,
  clampFalOverlayHeadlineForCanvas,
  isInternalStrategyBriefing,
  isIncompleteOverlayPhrase,
  stripDanglingOverlayTail,
  resolveFalProductionOverlayHeadline,
  buildFalOnCanvasTextContract,
  buildFalLogoPlacementContract,
  buildFalBrandMarkPlacementDirective,
  resolveBrandMarkLockup,
  truncateAtWordBoundary,
  shortenFalOverlayForImageRetry,
  areFalOverlayTextsRedundant,
  resolveFalOverlayCopy,
  detectOverlayLocale,
  containsFalCanvasMetaLeak,
  isFalCanvasMetaOnlyHeadline,
  isBareGenericOverlayCta,
  fitMissionOverlayToTemplateBudget,
  fitPunchlineUnderBudget,
  isAcceptablePunchlineStem,
} from '../fal-caption-headline';
import { resolveFalCanvasChannel } from '../fal-designer-production';

describe('correctTurkishSpelling', () => {
  it('fixes "Koketyl" → "Kokteyl"', () => {
    expect(correctTurkishSpelling('Yaz Koketyl Gecesi')).toBe('Yaz Kokteyl Gecesi');
  });

  it('fixes "KOKETYL" → "KOKTEYL" (preserves uppercase)', () => {
    expect(correctTurkishSpelling('YAZ KOKETYL GECESİ')).toBe('YAZ KOKTEYL GECESİ');
  });

  it('fixes "haftasonu" → "Hafta Sonu"', () => {
    expect(correctTurkishSpelling('haftasonu İndirimi')).toBe('hafta sonu İndirimi');
  });

  it('preserves already-correct text', () => {
    expect(correctTurkishSpelling('Yaz Kokteyl Gecesi')).toBe('Yaz Kokteyl Gecesi');
  });
});

describe('resolveFalDisplayHeadline', () => {
  it('extracts a unique hook from caption (not the mission title)', () => {
    const result = resolveFalDisplayHeadline({
      caption: 'Bu yazın en lezzetli kokteylleri nerede? Yula Bodrum sahne alıyor!',
      missionTitle: 'Yaz Kokteyl Gecesi',
      brandName: 'Yula Bodrum',
    });
    expect(result.source).not.toBe('mission_title');
    expect(result.headline).not.toBe('Yaz Kokteyl Gecesi');
  });

  it('extracts action hook from caption', () => {
    const result = resolveFalDisplayHeadline({
      caption: 'Müşterilerimiz bu yazın lezzetlerine bayılıyor! Macera dolu akşamlar için Yula Bodrum\'da yerini al!',
      missionTitle: 'Yaz Kokteyl Gecesi',
      brandName: 'Yula Bodrum',
    });
    expect(result.source).not.toBe('mission_title');
    expect(result.headline).not.toBe('Yaz Kokteyl Gecesi');
  });

  it('falls back to mission title (with spellcheck) when caption is empty', () => {
    const result = resolveFalDisplayHeadline({
      caption: '',
      missionTitle: 'Yaz Koketyl Gecesi',
      brandName: 'Yula Bodrum',
    });
    expect(result.source).toBe('mission_title');
    expect(result.headline).toBe('Yaz Kokteyl Gecesi');
  });

  it('uses CTA when caption has no good hook', () => {
    const result = resolveFalDisplayHeadline({
      caption: 'Yula Bodrum güzel bir mekan.',
      missionTitle: 'Yaz Kokteyl Gecesi',
      brandName: 'Yula Bodrum',
      cta: 'Yerinizi Ayırtın',
    });
    expect(result.headline).toBe('Yerinizi Ayırtın');
    expect(result.source).toBe('caption_cta');
  });

  it('avoids brand name in headline', () => {
    const result = resolveFalDisplayHeadline({
      caption: 'Yula Bodrum bu yaz çok güzel etkinlikler hazırladı.',
      missionTitle: 'Yaz Kokteyl Gecesi',
      brandName: 'Yula Bodrum',
    });
    expect(result.headline.toLowerCase()).not.toContain('yula bodrum');
  });

  it('produces different headlines for different captions', () => {
    const r1 = resolveFalDisplayHeadline({
      caption: 'Yenilikleri keşfetmek için davetlisiniz! Enerjik bir atmosfer sizi bekliyor.',
      missionTitle: 'Yaz Kokteyl Gecesi',
      brandName: 'Yula Bodrum',
    });
    const r2 = resolveFalDisplayHeadline({
      caption: 'Hafta sonu indirimi başlıyor! Tüm kokteyllerde %20 indirim.',
      missionTitle: 'Yaz Kokteyl Gecesi',
      brandName: 'Yula Bodrum',
    });
    expect(r1.headline).not.toBe(r2.headline);
  });
});

describe('resolveFalOverlayCopy', () => {
  it('realigns kitchen ideation headline to DJ caption theme', () => {
    const result = resolveFalOverlayCopy({
      headline: 'Mutfağımızda Neler',
      cta: 'Hikayemizi keşfet',
      caption:
        'Bu yaz, sıcak geceleri DJ performanslarıyla renklendiriyoruz! 15 Temmuz\'da buluşalım! Hızlıca yerini al!',
      channel: 'reel',
      lockIdeationCopy: true,
    });
    expect(result.headline.toLowerCase()).not.toMatch(/mutfak/);
    expect(
      /dj|gece|performans|temmuz|buluş|yerini/i.test(result.headline),
    ).toBe(true);
  });

  it('locks ideation headline + English CTA when caption is English', () => {
    const result = resolveFalOverlayCopy({
      headline: 'Meet the Maker',
      cta: 'Share Details',
      caption: 'Discover the story behind our Bodrum citrus artisans this weekend.',
      channel: 'feed_post',
      lockIdeationCopy: true,
    });
    expect(result.headline).toBe('Meet the Maker');
    expect(result.subtitle).toBe('Share Details');
  });

  it('drops Turkish CTA when caption and headline are English', () => {
    const result = resolveFalOverlayCopy({
      headline: 'Meet the Maker',
      cta: 'İletişime Geç',
      caption: 'Share details about our artisan citrus makers in Bodrum.',
      channel: 'feed_post',
      lockIdeationCopy: true,
    });
    expect(result.headline).toBe('Meet the Maker');
    expect(result.subtitle).toBeUndefined();
  });

  it('does not rewrite English headline via Turkish spellcheck', () => {
    const result = resolveFalOverlayCopy({
      headline: 'Weekend Cocktail Night',
      cta: 'Book Now',
      caption: 'Join us for signature cocktails by the sea.',
      channel: 'feed_post',
      lockIdeationCopy: true,
    });
    expect(result.headline).toContain('Cocktail');
    expect(result.headline).not.toContain('Kokteyl');
  });

  it('keeps English reel headline verbatim (no cocktail → Kokteyl on clamp)', () => {
    const result = resolveFalOverlayCopy({
      headline: 'Cocktail Preparation',
      cta: 'DM to book',
      caption:
        'Ever wondered how your favorite cocktails are made? Watch as our talented bartenders create refreshing drinks, one shake at a time!',
      channel: 'reel',
      lockIdeationCopy: true,
    });
    expect(result.headline).toBe('Cocktail Preparation');
    expect(result.subtitle).toBe('DM to book');
  });
});

describe('detectOverlayLocale', () => {
  it('detects English caption', () => {
    expect(detectOverlayLocale('Share details about the maker')).toBe('en');
  });

  it('detects Turkish caption', () => {
    expect(detectOverlayLocale('Bodrum mandalinasının ferahlığını keşfedin')).toBe('tr');
  });
});

describe('resolveFalSubtitle', () => {
  it('returns a line from caption that differs from headline', () => {
    const result = resolveFalSubtitle({
      caption: 'Lezzet dolu akşamlar. Enerjik atmosferde eğlence garantisi. Yerinizi şimdi ayırtın!',
      headline: 'Lezzet Dolu Akşamlar',
      brandName: 'Yula Bodrum',
    });
    expect(result).toBeDefined();
    expect(result!.toLowerCase()).not.toContain('lezzet dolu akşamlar');
  });

  it('returns undefined when no meaningful subtitle exists', () => {
    const result = resolveFalSubtitle({
      caption: 'Yaz.',
      headline: 'Yaz Kokteyl',
    });
    expect(result).toBeUndefined();
  });
});

describe('resolveFalVideoHeadline', () => {
  it('compresses long caption-derived hooks into video-safe text', () => {
    const result = resolveFalVideoHeadline({
      caption: 'Bu yaz serinletici kokteyllerimizi tatmaya gelin ve Bodrum mandalinasinin ferahligini kesfedin.',
      missionTitle: 'Yaz Kokteyl Gecesi',
      brandName: 'Yula Bodrum',
      cta: 'Yerini ayirt',
    });
    expect(result.headline.length).toBeLessThanOrEqual(22);
    expect(result.headline.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(result.headline.toLowerCase()).not.toContain('yula bodrum');
  });

  it('never returns dangling fragments like "This weekend just"', () => {
    const result = resolveFalVideoHeadline({
      caption: 'This weekend just got better — sunset sessions and fresh cocktails await.',
      missionTitle: 'Weekend Launch',
      brandName: 'Sarnıç Beach',
    });
    expect(result.headline).not.toBe('This weekend just');
    expect(isIncompleteOverlayPhrase(result.headline)).toBe(false);
    expect(result.headline.split(/\s+/).length).toBeGreaterThanOrEqual(2);
  });
});

describe('sanitizeFalOverlayText', () => {
  it('strips instruction leak words', () => {
    expect(sanitizeFalOverlayText('EXACTLY')).toBe('');
    expect(sanitizeFalOverlayText('reads exactly Yaz Lezzetleri')).toBe('Yaz Lezzetleri');
  });

  it('rejects non-meaningful overlay copy', () => {
    expect(isMeaningfulFalOverlayText('EXACTLY')).toBe(false);
    expect(isMeaningfulFalOverlayText('Yaz Lezzetleri')).toBe(true);
  });

  it('prompt directive avoids the word EXACTLY', () => {
    const line = formatFalOnImageHeadlineDirective('Yaz Lezzetleri', 'bold serif');
    expect(line.toLowerCase()).not.toMatch(/\bexactly\b/);
    expect(line).toContain('"Yaz Lezzetleri"');
    expect(line).not.toContain('«');
  });

  it('ensureMeaningfulFalOverlayText falls back to caption sentence', () => {
    const result = ensureMeaningfulFalOverlayText('EXACTLY', ['Serinletici kokteyller sizi bekliyor'], 28);
    expect(result.toLowerCase()).not.toBe('exactly');
    expect(result.length).toBeGreaterThan(6);
  });
});

describe('truncateAtWordBoundary', () => {
  it('never slices mid-word', () => {
    expect(truncateAtWordBoundary('Sarnıç Beach Club', 12)).toBe('Sarnıç Beach');
    expect(truncateAtWordBoundary('Sarnıç Beach Club', 12)).not.toBe('Sarnıç Be');
  });

  it('strips dangling modifiers', () => {
    expect(truncateAtWordBoundary('This weekend just got better', 18)).toBe('This weekend');
  });
});

describe('shortenFalOverlayForImageRetry', () => {
  it('returns complete shorter hooks on retry attempts', () => {
    const original = 'This weekend just got better at the beach';
    const first = shortenFalOverlayForImageRetry(original, 0, 'reel');
    const retry = shortenFalOverlayForImageRetry(original, 1, 'reel');
    expect(isIncompleteOverlayPhrase(first)).toBe(false);
    if (retry) expect(isIncompleteOverlayPhrase(retry)).toBe(false);
    expect(first).not.toMatch(/\bjust$/i);
  });
});

describe('clampFalOverlayHeadlineForCanvas', () => {
  it('shortens long reel headlines to ≤3 words / 22 chars', () => {
    const result = clampFalOverlayHeadlineForCanvas(
      'What Our Happy Excellent Customers Are Saying',
      'reel',
    );
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(3);
    expect(result.length).toBeLessThanOrEqual(22);
  });

  it('keeps complete Turkish marketing sentences on feed (≤48)', () => {
    const line = 'Doğal lezzetlerimizin tadını çıkarın.';
    // sanitize strips trailing punctuation for canvas paint
    expect(clampFalOverlayHeadlineForCanvas(line, 'feed_post')).toBe(
      'Doğal lezzetlerimizin tadını çıkarın',
    );
    expect(isIncompleteOverlayPhrase('Artık alışveriş yaparken kargo')).toBe(true);
    expect(isIncompleteOverlayPhrase('Karaman Datçanın el yapımı')).toBe(true);
  });

  it('corrects siparis → sipariş', () => {
    expect(correctTurkishSpelling('Hızlı siparis ver')).toMatch(/sipariş/i);
  });

  it('preserves short Turkish hooks', () => {
    expect(clampFalOverlayHeadlineForCanvas('Yaz Lezzetleri', 'reel')).toBe('Yaz Lezzetleri');
  });

  it('rejects internal strategy briefing and dangling "and"', () => {
    expect(
      clampFalOverlayHeadlineForCanvas('Highlight the exclusivity and premium menu', 'feed_post'),
    ).toBe('');
    expect(isInternalStrategyBriefing('Highlight the exclusivity and')).toBe(true);
    expect(isIncompleteOverlayPhrase('Highlight the exclusivity and')).toBe(true);
    expect(stripDanglingOverlayTail('Deniz Lezzetleri ve')).toBe('Deniz Lezzetleri');
  });

  it('ensureMeaningfulFalOverlayText returns empty when all candidates are invalid', () => {
    expect(ensureMeaningfulFalOverlayText('Highlight the exclusivity and', [], 32)).toBe('');
  });

  it('resolveFalProductionOverlayHeadline returns empty for briefing fragments', () => {
    expect(
      resolveFalProductionOverlayHeadline(
        'Highlight the exclusivity and premium positioning',
        ['Taze deniz ürünleri menüsü'],
        'feed_post',
      ),
    ).toMatch(/deniz|Taze/);
    expect(
      resolveFalProductionOverlayHeadline('Highlight the exclusivity and', [], 'feed_post'),
    ).toBe('');
  });

  it('rejects ablative caption stubs like "Müşterilerimiz kahvaltımızdan"', () => {
    expect(isIncompleteOverlayPhrase('Müşterilerimiz kahvaltımızdan')).toBe(true);
    expect(isIncompleteOverlayPhrase('Müşterilerimiz')).toBe(true);
    expect(isMeaningfulFalOverlayText('Müşterilerimiz kahvaltımızdan')).toBe(false);
    const punch = extractCaptionThemePunchline({
      caption: 'Müşterilerimiz kahvaltımızdan vazgeçemiyor. Gerçek lezzetlerden...',
      maxWords: 3,
      maxLen: 36,
    });
    expect(punch.toLowerCase()).toMatch(/kahvalt|serpme|keyfi/);
    expect(punch.toLowerCase()).not.toMatch(/müşterilerimiz kahvaltımızdan/);
    expect(
      resolveFalDisplayHeadline({
        caption: 'Müşterilerimiz kahvaltımızdan vazgeçemiyor. Gerçek lezzetlerden...',
        missionTitle: 'Kahvaltı',
        brandName: 'gel gör',
        maxLen: 36,
      }).headline.toLowerCase(),
    ).not.toMatch(/müşterilerimiz kahvaltımızdan/);
  });

  it('rejects truncated Turkish participle fragments like "Kartta yeni gelen"', () => {
    expect(isIncompleteOverlayPhrase('Kartta yeni gelen')).toBe(true);
    expect(isMeaningfulFalOverlayText('Kartta yeni gelen')).toBe(false);
    expect(
      resolveFalProductionOverlayHeadline(
        'Kartta yeni gelen',
        ['Gel Gör serpme kahvaltısı ile güne başlayın'],
        'reel',
      ),
    ).not.toBe('Kartta yeni gelen');
    expect(
      resolveFalProductionOverlayHeadline(
        'Kartta yeni gelen',
        ['Gel Gör serpme kahvaltısı ile güne başlayın'],
        'reel',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('rejects Turkish plan-brief sentences ("göstereceğiz" leak) as internal briefing', () => {
    expect(isInternalStrategyBriefing('Mutfaktaki aşçılarımızı ve taze malzemelerimizi göstereceğiz')).toBe(true);
    expect(isInternalStrategyBriefing('Yeni menümüzü yakında paylaşacağız')).toBe(true);
    expect(isInternalStrategyBriefing('Yaz fırsatlarının tanıtımını yapacağız')).toBe(true);
    expect(isMeaningfulFalOverlayText('Mutfaktaki aşçılarımızı ve taze malzemelerimizi göstereceğiz')).toBe(false);
    expect(
      resolveFalProductionOverlayHeadline(
        'Mutfaktaki aşçılarımızı ve taze malzemelerimizi göstereceğiz',
        [],
        'feed_post',
      ),
    ).toBe('');
    // Real consumer copy with similar words must still pass.
    expect(isInternalStrategyBriefing('Taze malzemelerle hazırlanan lezzetler')).toBe(false);
    expect(isInternalStrategyBriefing('Şeflerimizden taze lezzetler sofranızda!')).toBe(false);
  });

  it('rejects truncated accusative-object fragments ("…malzemelerimizi") as incomplete', () => {
    // Verb-final Turkish: a headline ending in a possessive-accusative object lost its verb.
    expect(isIncompleteOverlayPhrase('Mutfaktaki aşçılarımızı ve taze malzemelerimizi')).toBe(true);
    expect(isIncompleteOverlayPhrase('Taze malzemelerimizi')).toBe(true);
    expect(isMeaningfulFalOverlayText('Mutfaktaki aşçılarımızı')).toBe(false);
    // Complete phrases must still pass.
    expect(isIncompleteOverlayPhrase('Ferahlatan Kokteyller')).toBe(false);
    expect(isIncompleteOverlayPhrase('Lezzet dolu bir gün sizi bekliyor!')).toBe(false);
  });

  it('rejects live feed stubs: infinitive tails and short accusative clamps', () => {
    expect(isIncompleteOverlayPhrase('Müşterilerimiz sürekli geri dönmek')).toBe(true);
    expect(isIncompleteOverlayPhrase('Yazın tadını')).toBe(true);
    expect(isIncompleteOverlayPhrase('Yazın tazeliğini lezzetini')).toBe(true);
    expect(isMeaningfulFalOverlayText('Müşterilerimiz sürekli geri dönmek')).toBe(false);
    expect(isMeaningfulFalOverlayText('Yazın tadını')).toBe(false);
    // Complete verb-final / noun punches still pass.
    expect(isIncompleteOverlayPhrase('Yazın tadını çıkarın')).toBe(false);
    expect(isIncompleteOverlayPhrase('DJ Performansı')).toBe(false);
  });

  it('rejects bare Detaylar-style overlay CTAs', () => {
    expect(isBareGenericOverlayCta('Detaylar')).toBe(true);
    expect(isBareGenericOverlayCta('Learn more')).toBe(true);
    expect(isBareGenericOverlayCta('Yerini ayırt')).toBe(false);
    const fitted = fitMissionOverlayToTemplateBudget({
      headline: 'Yazın tadını çıkarın birlikte',
      subtitle: 'Detaylar',
      channel: 'feed_post',
      designIntensity: 'photo_first',
      sampleHeadline: 'Yaz Lezzeti',
      sampleSubtitle: 'Detaylar',
      showSubline: true,
    });
    expect(fitted.subtitle).toBeUndefined();
    expect(fitted.headline.length).toBeGreaterThan(0);
    expect(isIncompleteOverlayPhrase(fitted.headline)).toBe(false);
  });

  it('fits punchline stems under tight operator budgets without dangling tails', () => {
    const stem = fitPunchlineUnderBudget(
      'Join us for a fun-filled evening under the stars!',
      18,
      2,
    );
    expect(stem).toBe('Join us');
    expect(isAcceptablePunchlineStem(stem)).toBe(true);
    expect(isIncompleteOverlayPhrase(stem)).toBe(false);

    const fitted = fitMissionOverlayToTemplateBudget({
      headline: 'Join us for a fun-filled evening under the stars!',
      channel: 'feed_post',
      designIntensity: 'balanced',
      typeBudget: {
        headline: { maxChars: 18, maxWords: 2, maxLines: 1 },
        subtitle: null,
        source: 'operator',
      },
    });
    expect(fitted.headline).toBe('Join us');
    expect(fitted.budget.source).toBe('operator_type_budget');
  });

  it('corrects misplaced apostrophes in plural suffixes', () => {
    expect(correctTurkishSpelling("Ferahlatan Koktey'ller", { locale: 'tr' })).toBe('Ferahlatan Kokteyller');
  });
});

describe('resolveBrandMarkLockup', () => {
  it('keeps short names intact', () => {
    expect(resolveBrandMarkLockup('Yula')).toBe('Yula');
    expect(resolveBrandMarkLockup('Sarnıç Beach')).toBe('Sarnıç Beach');
  });

  it('shortens long legal names to a legible lockup', () => {
    expect(resolveBrandMarkLockup('Yula Drink & Chill Bodrum')).toBe('Yula Drink');
    expect(resolveBrandMarkLockup('Local Products Shop Karaman Artisan Collective')).toBe(
      'Local Products',
    );
  });
});

describe('buildFalBrandMarkPlacementDirective', () => {
  it('locks exact spelling and slot vibe for feed vs reel', () => {
    const feed = buildFalBrandMarkPlacementDirective({
      brandName: 'Sarnıç Beach',
      channel: 'feed_post',
    });
    const reel = buildFalBrandMarkPlacementDirective({
      brandName: 'Sarnıç Beach',
      channel: 'reel',
    });
    expect(feed).toContain('exact wordmark "Sarnıç Beach"');
    expect(feed).toContain('CHARACTER LOCK');
    expect(feed).toContain('quiet watermark');
    expect(reel).toContain('motion-safe tiny lockup');
    expect(reel).toContain('omit the wordmark entirely');
  });
});

describe('buildFalOnCanvasTextContract', () => {
  it('lists explicit headline words and forbids gibberish', () => {
    const contract = buildFalOnCanvasTextContract({
      headline: 'Sunset Session',
      subtitle: 'Rezervasyon açık',
      brandName: 'Sarnıç Beach',
      channel: 'feed_post',
    });
    expect(contract).toContain('HEADLINE: "Sunset Session"');
    expect(contract).toContain('1="Sunset"');
    expect(contract).toContain('SUBTITLE');
    expect(contract).toContain('BRAND MARK (small corner wordmark only');
    expect(contract).toContain('Brand mark channel: feed_post');
    expect(contract).toContain('FORBIDDEN on canvas: gibberish');
  });

  it('forbids typing brand name when logo is provided', () => {
    const contract = buildFalOnCanvasTextContract({
      headline: 'Sunset Session',
      brandName: 'Sarnıç Beach',
      logoProvided: true,
    });
    expect(contract).not.toContain('BRAND MARK (small corner');
    expect(contract).toContain('BRAND NAME LOCK');
    expect(contract).toContain('do NOT type');
  });
});

describe('buildFalLogoPlacementContract', () => {
  it('requires reserved logo zone and forbids AI-drawn marks', () => {
    const contract = buildFalLogoPlacementContract({
      logoProvided: true,
      brandName: 'Sarnıç Beach',
      channel: 'feed_post',
    });
    expect(contract).toContain('BRAND LOGO CONTRACT');
    expect(contract).toContain('DO NOT draw, generate');
    expect(contract).toContain('abbreviate the brand name');
    expect(contract).toContain('RESERVED LOGO ZONE');
    expect(contract).toContain('Photo hero rule');
    expect(contract).toContain('never over the dish');
    expect(contract).toMatch(/white.*square|white logo plate/i);
  });

  it('returns empty string when no logo', () => {
    expect(buildFalLogoPlacementContract({ logoProvided: false })).toBe('');
  });
});

describe('areFalOverlayTextsRedundant', () => {
  it('flags near-duplicate reservation hooks', () => {
    expect(areFalOverlayTextsRedundant('Masani ayır', 'Masani ayırt')).toBe(true);
    expect(areFalOverlayTextsRedundant('Masanızı ayırtın', 'Yerini ayırt')).toBe(true);
  });

  it('allows distinct headline and subtitle', () => {
    expect(areFalOverlayTextsRedundant('Lezzetli Akşamlar', 'Rezervasyon için DM')).toBe(false);
  });
});

describe('fal canvas meta leak guards', () => {
  it('detects platform meta words on canvas', () => {
    expect(containsFalCanvasMetaLeak('ÜNLÜ STORY')).toBe(true);
    expect(containsFalCanvasMetaLeak('Summer Festival')).toBe(false);
  });

  it('rejects meta-only headlines', () => {
    expect(isFalCanvasMetaOnlyHeadline('ÜNLÜ STORY')).toBe(true);
    expect(isFalCanvasMetaOnlyHeadline('INSTAGRAM REEL')).toBe(true);
    expect(isMeaningfulFalOverlayText('ÜNLÜ STORY')).toBe(false);
  });

  it('allows real marketing headlines', () => {
    expect(isMeaningfulFalOverlayText('Summer Festival')).toBe(true);
    expect(isMeaningfulFalOverlayText('Yaz Kokteyl Gecesi')).toBe(true);
  });

  it('buildFalOnCanvasTextContract forbids meta labels', () => {
    const contract = buildFalOnCanvasTextContract({
      headline: 'Summer Festival',
      brandName: 'Yula Bodrum',
    });
    expect(contract).toContain('FORBIDDEN META WORDS');
    expect(contract).toContain('STORY');
  });
});

describe('resolveFalCanvasChannel', () => {
  it('maps fal_story pipeline to story channel', () => {
    expect(resolveFalCanvasChannel({ pipeline: 'fal_story', aspectRatio: '9:16' })).toBe('story');
  });

  it('maps fal_reel pipeline to reel channel', () => {
    expect(resolveFalCanvasChannel({ pipeline: 'fal_reel', aspectRatio: '9:16' })).toBe('reel');
  });

  it('defaults 9:16 without pipeline to story', () => {
    expect(resolveFalCanvasChannel({ aspectRatio: '9:16' })).toBe('story');
  });
});

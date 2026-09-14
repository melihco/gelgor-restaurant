import { describe, expect, it } from 'vitest';
import {
  resolvePaintCanvasHeadline,
  resolveSlotPaintOverlay,
  shouldKeepProductionGalleryPin,
  shortenLockedPunchlineForImageRetry,
} from '@/lib/slot-production-bundle';
import { fitMissionOverlayToTemplateBudget } from '@/lib/fal-caption-headline';

describe('slot-production-bundle', () => {
  it('shop: locked mission tagline fits the operator box without the sample motto', () => {
    const tagline = "Datça'nın eşsiz balını hemen deneyin.";
    const result = resolveSlotPaintOverlay({
      headline: tagline,
      caption: 'Bu hafta Datça balları raflarda. Tadım için bekleriz.',
      channel: 'feed_post',
      brandName: 'Karaman Datça',
      businessType: 'local_products_shop',
      punchlineLockSource: 'mission_tagline',
      typeBudget: {
        source: 'operator',
        headline: { maxChars: 16, maxWords: 2, maxLines: 1 },
        subtitle: { maxChars: 16, maxWords: 3, maxLines: 1 },
      },
      sampleHeadline: 'Bal',
    });
    expect(result.preserved).toBe(true);
    expect(result.headline.toLowerCase()).toMatch(/eşsiz|bal/);
    expect(result.headline.toLowerCase()).not.toBe('bal');
    expect(result.headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(2);
    expect(result.headline.length).toBeLessThanOrEqual(16);
    expect(result.coherence.repaired).toBe(false);
  });

  it('preserves beach_club canva punchline without coherence rewrite', () => {
    const punch = 'DJ Night';
    const result = resolveSlotPaintOverlay({
      headline: punch,
      caption: 'Cuma gece deck’te live set — rezervasyon açık.',
      channel: 'feed_post',
      brandName: 'Yula',
      businessType: 'beach_club',
      punchlineLockSource: 'canva_field_copy',
      sampleHeadline: 'Guest Love',
      designMatchIsSoft: true,
    });
    expect(result.preserved).toBe(true);
    expect(result.headline).toBe(punch);
  });

  it('shop: locked motto that already fits the zone stays whole', () => {
    const motto = 'Yağın en sakin hali';
    const result = resolveSlotPaintOverlay({
      headline: motto,
      caption: 'Yağın en sakin hali. Natürel sızma.',
      channel: 'feed_post',
      brandName: 'Yerel dükkan',
      businessType: 'local_products_shop',
      punchlineLockSource: 'feed_slot_pack',
      designIntensity: 'balanced',
      typeBudget: {
        source: 'generated',
        headline: { maxChars: 22, maxWords: 4, maxLines: 1 },
        subtitle: { maxChars: 16, maxWords: 3, maxLines: 1 },
      },
    });
    expect(result.preserved).toBe(true);
    expect(result.headline.toLowerCase()).toContain('sakin');
    expect(result.headline.toLowerCase()).toContain('hali');
  });

  it('shop: locked pack overflow fits the type box, not the template sample', () => {
    const long = 'Doğanın sunduğu en doğal lezzetleri yansıtan Karaman Datça Süzme Çiçek Balı ile tanışın!';
    const result = resolveSlotPaintOverlay({
      headline: long,
      caption: `${long} Tadım için bekleriz.`,
      channel: 'story',
      brandName: 'Yerel dükkan',
      businessType: 'local_products_shop',
      punchlineLockSource: 'feed_slot_pack',
      designIntensity: 'designed',
      sampleHeadline: 'Doğanın Mucizesi',
      typeBudget: {
        source: 'operator',
        headline: { maxChars: 32, maxWords: 5, maxLines: 1 },
        subtitle: { maxChars: 16, maxWords: 3, maxLines: 1 },
      },
    });
    expect(result.headline.toLocaleLowerCase('tr-TR')).not.toBe('doğanın mucizesi');
    expect(result.headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(5);
    expect(result.headline.length).toBeLessThanOrEqual(32);
    expect(result.headline.toLocaleLowerCase('tr-TR')).toMatch(/bal|çiçek|doğal|süzme/);
  });

  it('fitMissionOverlay preserveHeadline shortens to the operator box', () => {
    const tagline = 'Erken hasat zeytinyağı şişede.';
    const fitted = fitMissionOverlayToTemplateBudget({
      headline: tagline,
      subtitle: 'Datça',
      channel: 'feed_post',
      typeBudget: {
        source: 'operator',
        headline: { maxChars: 22, maxWords: 3, maxLines: 1 },
        subtitle: { maxChars: 12, maxWords: 2, maxLines: 1 },
      },
      preserveHeadline: true,
    });
    expect(fitted.headline.toLowerCase()).toMatch(/erken|hasat|zeytinyağ/);
    expect(fitted.headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(3);
    expect(fitted.headline.length).toBeLessThanOrEqual(22);
    expect(fitted.headline.toLowerCase()).not.toBe('datça');
  });

  it('honors production gallery pin over rematch', () => {
    expect(shouldKeepProductionGalleryPin({
      preferredUrl: 'https://cdn.example/a.jpg',
      preferredUsable: true,
    })).toBe(true);
    expect(shouldKeepProductionGalleryPin({
      preferredUrl: null,
      preferredUsable: false,
    })).toBe(false);
  });

  it('repairs caption_pair hashtag lock from the same caption', () => {
    const result = resolveSlotPaintOverlay({
      headline: '#PazarKeyfi #Datça #yöresel',
      caption: 'Pazar günlerinde dükkanımızda taze zeytinyağından, ballara kadar en güzel yöresel ürünlerimizi bulabilirsiniz.',
      channel: 'feed_post',
      brandName: 'Datça Dükkan',
      businessType: 'local_products_shop',
      punchlineLockSource: 'caption_pair',
    });
    expect(result.headline).not.toMatch(/#/);
    expect(result.headline.toLowerCase()).toMatch(/pazar|yöresel|zeytinyağ|dükkan/);
    expect(result.preserved).toBe(false);
  });

  it('shop story: planned honey line is shortened into the story box', () => {
    const line = 'Kekik ve Çiçek Balı çeşitlerimizle sağlıklı bir tat deneyimi yaşayın';
    const result = resolveSlotPaintOverlay({
      headline: line,
      caption: 'Kekik ve çiçek balı raflarda. Tadım için bekleriz.',
      channel: 'story',
      brandName: 'Yerel dükkan',
      businessType: 'local_products_shop',
      designIntensity: 'designed',
    });
    expect(result.headline.toLocaleLowerCase('tr-TR')).toMatch(/kekik|çiçek|bal/);
    expect(result.headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(8);
  });

  it('beach story: keeps the planned sunset sentence', () => {
    const line = 'Sunset cocktails on the deck tonight';
    const result = resolveSlotPaintOverlay({
      headline: line,
      caption: 'Sunset cocktails on the deck tonight. Come early.',
      channel: 'story',
      brandName: 'Beach Club',
      businessType: 'beach_club',
      designIntensity: 'bold_editorial',
    });
    expect(result.headline.toLowerCase()).toContain('sunset cocktails');
    expect(result.headline.toLowerCase()).not.toBe('come early');
  });

  it('shop story locked punchline fits the box from the same honey claim', () => {
    const line = 'Kekik ve Çiçek Balı çeşitlerimizle sağlıklı bir tat deneyimi yaşayın';
    const result = resolveSlotPaintOverlay({
      headline: line,
      caption: 'Kekik ve çiçek balı raflarda.',
      channel: 'story',
      brandName: 'Yerel dükkan',
      businessType: 'local_products_shop',
      punchlineLockSource: 'feed_slot_pack',
      designIntensity: 'designed',
      typeBudget: {
        source: 'operator',
        headline: { maxChars: 32, maxWords: 5, maxLines: 1 },
        subtitle: null,
      },
    });
    expect(result.preserved).toBe(true);
    expect(result.headline.toLocaleLowerCase('tr-TR')).toMatch(/kekik|çiçek|bal/);
    expect(result.headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(5);
    expect(result.headline.length).toBeLessThanOrEqual(32);
  });

  it('beach story: locked long sunset line fits the operator box', () => {
    const line = 'Sunset cocktails on the deck tonight under the golden hour sky';
    const result = resolveSlotPaintOverlay({
      headline: line,
      caption: `${line}. Come early.`,
      channel: 'story',
      brandName: 'Beach Club',
      businessType: 'beach_club',
      punchlineLockSource: 'feed_slot_pack',
      designIntensity: 'bold_editorial',
      sampleHeadline: 'Guest Love',
      typeBudget: {
        source: 'operator',
        headline: { maxChars: 32, maxWords: 5, maxLines: 1 },
        subtitle: null,
      },
    });
    expect(result.headline.toLowerCase()).toMatch(/sunset|cocktail|deck|golden/);
    expect(result.headline.toLowerCase()).not.toBe('guest love');
    expect(result.headline.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(5);
    expect(result.headline.length).toBeLessThanOrEqual(32);
  });

  it('shop: locked pack paint never takes the jar label', () => {
    expect(resolvePaintCanvasHeadline({
      paintHeadline: '',
      plannedHeadline: 'Sızma zeytinyağımız raflarda',
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
      punchlineLockSource: 'feed_slot_pack',
    })).toBe('Sızma zeytinyağımız raflarda');
  });

  it('beach: locked pack paint keeps the planned line, not a caption stem', () => {
    expect(resolvePaintCanvasHeadline({
      paintHeadline: 'Sunset on the deck',
      plannedHeadline: 'Sunset on the deck',
      caption: 'Sunset cocktails on the deck tonight. Come early for a table.',
      punchlineLockSource: 'feed_slot_pack',
    })).toBe('Sunset on the deck');
  });

  it('unlocked shop paint may rescue from the caption', () => {
    const rescued = resolvePaintCanvasHeadline({
      paintHeadline: '',
      plannedHeadline: '',
      caption: 'Sızma zeytinyağımız raflarda. Sofraya bir damla yeter.',
    }).toLocaleLowerCase('tr-TR');
    expect(rescued).toMatch(/sızma|zeytinyağ|sofraya|damla/);
  });

  it('locked retry shorten uses soft-clamp only', () => {
    const line = 'Sunset cocktails on the deck tonight.';
    expect(shortenLockedPunchlineForImageRetry(line, 'feed_post')).toContain('Sunset');
    expect(shortenLockedPunchlineForImageRetry(line, 'feed_post')).not.toBe('Sunset');
  });
});

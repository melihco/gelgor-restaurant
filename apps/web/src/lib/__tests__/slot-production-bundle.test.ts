import { describe, expect, it } from 'vitest';
import {
  resolvePaintCanvasHeadline,
  resolveSlotPaintOverlay,
  shouldKeepProductionGalleryPin,
  shortenLockedPunchlineForImageRetry,
} from '@/lib/slot-production-bundle';
import { fitMissionOverlayToTemplateBudget } from '@/lib/fal-caption-headline';

describe('slot-production-bundle', () => {
  it('preserves local_products mission tagline through paint (no type_budget stem)', () => {
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
        headline: { maxChars: 12, maxWords: 2, maxLines: 1 },
        subtitle: { maxChars: 16, maxWords: 3, maxLines: 1 },
      },
      sampleHeadline: 'Bal',
    });
    expect(result.preserved).toBe(true);
    // Soft sanitize may normalize apostrophe/period — must not stem to "Datça'nın".
    expect(result.headline.toLowerCase()).toContain('eşsiz');
    expect(result.headline.toLowerCase()).toContain('bal');
    expect(result.headline.split(/\s+/).length).toBeGreaterThanOrEqual(4);
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

  it('preserves a locked feed motto and does not saw the last word', () => {
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
        headline: { maxChars: 18, maxWords: 2, maxLines: 1 },
        subtitle: { maxChars: 16, maxWords: 3, maxLines: 1 },
      },
    });
    expect(result.preserved).toBe(true);
    expect(result.headline.toLowerCase()).toContain('sakin');
    expect(result.headline.toLowerCase()).toContain('hali');
  });

  it('fitMissionOverlay preserveHeadline keeps full tagline', () => {
    const tagline = 'Erken hasat zeytinyağı şişede.';
    const fitted = fitMissionOverlayToTemplateBudget({
      headline: tagline,
      subtitle: 'Datça',
      channel: 'feed_post',
      typeBudget: {
        source: 'operator',
        headline: { maxChars: 10, maxWords: 2, maxLines: 1 },
        subtitle: { maxChars: 12, maxWords: 2, maxLines: 1 },
      },
      preserveHeadline: true,
    });
    expect(fitted.headline.toLowerCase()).toContain('erken');
    expect(fitted.headline.toLowerCase()).toContain('zeytinyağı');
    expect(fitted.headline.split(/\s+/).length).toBeGreaterThanOrEqual(3);
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

  it('shop story: keeps the planned honey sentence', () => {
    const line = 'Kekik ve Çiçek Balı çeşitlerimizle sağlıklı bir tat deneyimi yaşayın';
    const result = resolveSlotPaintOverlay({
      headline: line,
      caption: 'Kekik ve çiçek balı raflarda. Tadım için bekleriz.',
      channel: 'story',
      brandName: 'Yerel dükkan',
      businessType: 'local_products_shop',
      designIntensity: 'designed',
    });
    expect(result.headline.toLocaleLowerCase('tr-TR')).toContain('çeşitlerimizle');
    expect(result.headline.toLocaleLowerCase('tr-TR')).toContain('kekik');
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

  it('shop story locked punchline stays the planned sentence', () => {
    const line = 'Kekik ve Çiçek Balı çeşitlerimizle sağlıklı bir tat deneyimi yaşayın';
    const result = resolveSlotPaintOverlay({
      headline: line,
      caption: 'Kekik ve çiçek balı raflarda.',
      channel: 'story',
      brandName: 'Yerel dükkan',
      businessType: 'local_products_shop',
      punchlineLockSource: 'feed_slot_pack',
      designIntensity: 'designed',
    });
    expect(result.preserved).toBe(true);
    expect(result.headline.toLocaleLowerCase('tr-TR')).toContain('çeşitlerimizle');
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

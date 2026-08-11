import { describe, expect, it } from 'vitest';
import {
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

  it('locked retry shorten uses soft-clamp only', () => {
    const line = 'Sunset cocktails on the deck tonight.';
    expect(shortenLockedPunchlineForImageRetry(line, 'feed_post')).toContain('Sunset');
    expect(shortenLockedPunchlineForImageRetry(line, 'feed_post')).not.toBe('Sunset');
  });
});

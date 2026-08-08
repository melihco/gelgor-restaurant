import { describe, expect, it } from 'vitest';
import { evaluateCaptionDesignPostCoherence } from '@/lib/caption-design-post-coherence';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

const FOOD_META: GalleryPhotoMeta = {
  contentTags: ['food', 'burger', 'plate'],
  description: 'Plated burger with fries on a wooden table',
  suggestedAssetType: 'food_drink_photo',
};

const DJ_META: GalleryPhotoMeta = {
  contentTags: ['dj', 'night', 'party', 'crowd'],
  description: 'DJ booth and dancing crowd at night beach party',
  suggestedAssetType: 'event_photo',
};

describe('caption-design-post-coherence', () => {
  it('beach_club: DJ caption + food photo + kitchen overlay fails closed', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
      overlayHeadline: 'Şef Özel Menü',
      brandName: 'Aqua Club',
      businessType: 'beach_club',
      photoUrl: 'https://cdn.example.com/burger.jpg',
      galleryMeta: FOOD_META,
      designSampleHeadline: 'DJ Night',
      designMatchIsSoft: true,
    });
    expect(result.ok).toBe(false);
    expect(result.breaks.length).toBeGreaterThan(0);
  });

  it('beach_club: DJ caption + DJ photo + grounded overlay ships', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Bu gece DJ seti ve beach party — dans için sahilde buluşalım.',
      overlayHeadline: 'DJ Night',
      brandName: 'Aqua Club',
      businessType: 'beach_club',
      photoUrl: 'https://cdn.example.com/dj.jpg',
      galleryMeta: DJ_META,
      designSampleHeadline: 'DJ Night',
      designMatchIsSoft: false,
    });
    expect(result.ok).toBe(true);
    expect(result.breaks).toEqual([]);
  });

  it('local_products_shop: tourism overlay is repaired or fail-closed', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Erken hasat zeytinyağımız soğuk sıkım — Datça\'dan sofranıza.',
      overlayHeadline: 'Agro Turizm Deneyimi',
      brandName: 'Köy Pazarı',
      businessType: 'local_products_shop',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      galleryMeta: {
        contentTags: ['olive', 'oil', 'product'],
        description: 'Bottle of olive oil on rustic table',
        suggestedAssetType: 'product_photo',
      },
    });
    expect(result.overlayHeadline.toLowerCase()).not.toMatch(/turizm|tourism/);
    if (result.ok) {
      expect(result.repaired).toBe(true);
    } else {
      expect(result.breaks.some((b) => b.startsWith('overlay_'))).toBe(true);
    }
  });

  it('repairs ungrounded overlay toward caption when possible', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Gün batımında terasta altın saat — deniz manzarası eşliğinde kokteyl.',
      overlayHeadline: 'Highlight the exclusivity of the venue experience',
      brandName: 'Aqua Club',
      businessType: 'beach_club',
      photoUrl: 'https://cdn.example.com/sunset.jpg',
      galleryMeta: {
        contentTags: ['sunset', 'terrace', 'cocktail'],
        description: 'Golden hour terrace with sea view and cocktail glass',
        suggestedAssetType: 'venue_photo',
      },
    });
    // Either repaired to a grounded line, or fails closed — never ships briefing text.
    expect(result.overlayHeadline.toLowerCase()).not.toContain('highlight the');
    if (result.ok) {
      expect(result.repaired).toBe(true);
    } else {
      expect(result.breaks.length).toBeGreaterThan(0);
    }
  });

  it('force-repairs briefing-style overlay via caption punchline (second pass)', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Live music sunset session on the beach — cocktails and golden hour vibes.',
      overlayHeadline: 'Optimize engagement with exclusive hospitality storytelling',
      brandName: 'Scorpios',
      businessType: 'beach_club',
      photoUrl: 'https://cdn.example.com/sunset.jpg',
      galleryMeta: {
        contentTags: ['sunset', 'beach', 'music'],
        description: 'Sunset beach live music with crowd',
        suggestedAssetType: 'event_photo',
      },
    });
    expect(result.overlayHeadline.toLowerCase()).not.toMatch(/optimize|engagement|storytelling/);
    // Prefer ship after force punchline when caption has scene nouns.
    expect(result.ok || result.repaired).toBe(true);
  });
});

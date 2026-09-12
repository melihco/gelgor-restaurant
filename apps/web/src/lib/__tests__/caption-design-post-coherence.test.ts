import { describe, expect, it } from 'vitest';
import {
  evaluateArtifactPublishCoherence,
  evaluateCaptionDesignPostCoherence,
  isHardDesignWithholdBreak,
} from '@/lib/caption-design-post-coherence';
import { overlayHeadlineGroundedInCaption } from '@/lib/overlay-caption-grounding';
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

  it.each([
    {
      sector: 'restaurant_cafe',
      caption: 'Mutfağımızın imza lezzetleri bugün sofranızda, mevsimin en taze ürünleriyle hazırlandı.',
      photoUrl: 'https://cdn.example.com/dish.jpg',
      meta: {
        contentTags: ['food', 'plate', 'dish'],
        description: 'Signature plated dish on a restaurant table',
        suggestedAssetType: 'food_drink_photo',
      } satisfies GalleryPhotoMeta,
    },
    {
      sector: 'local_products_shop',
      caption: 'Mevsimin ilk hasadı raflarda, köy pazarından gelen ürünler sınırlı sayıda.',
      photoUrl: 'https://cdn.example.com/harvest.jpg',
      meta: {
        contentTags: ['product', 'harvest', 'shelf'],
        description: 'Seasonal harvest products on a shop shelf',
        suggestedAssetType: 'product_photo',
      } satisfies GalleryPhotoMeta,
    },
  ])(
    '$sector: empty overlay recovers a caption-grounded line instead of overlay_meaningless',
    ({ sector, caption, photoUrl, meta }) => {
      const result = evaluateCaptionDesignPostCoherence({
        caption,
        overlayHeadline: '',
        brandName: 'Test Marka',
        businessType: sector,
        photoUrl,
        galleryMeta: meta,
      });
      expect(result.breaks).not.toContain('overlay_meaningless');
      expect(result.repaired).toBe(true);
      expect(result.overlayHeadline.trim().length).toBeGreaterThan(0);
      expect(overlayHeadlineGroundedInCaption(result.overlayHeadline, caption)).toBe(true);
    },
  );

  it('does not SKU-veto a matcher pin when gallery analysis is unbound', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Diken balımızı denediniz mi? Harika bir tat deneyimi sunuyor.',
      overlayHeadline: 'Diken balımızı denediniz mi',
      brandName: 'Datça Dükkan',
      businessType: 'local_products_shop',
      photoUrl: 'https://cdn.example.com/WhatsApp-Image-2025-10-26-at-13.39.10-4.jpeg',
    });
    expect(result.breaks).not.toContain('photo_theme_conflict');
  });

  it('adaptive favorite caption on an oil bottle is a restage gap, not a withhold', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Müşterilerimizden gelen yorumlara göre, bizim sızma zeytinyağımız sofrada kalıyor.',
      overlayHeadline: 'Sızma zeytinyağımız sofrada',
      brandName: 'Datça Dükkan',
      businessType: 'local_products_shop',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      catalogSlotKey: 'local_products_shop_customer_favorite_post',
      adaptiveScene: true,
      galleryMeta: {
        contentTags: ['olive oil', 'zeytinyağı', 'bottle'],
        description: 'Dark glass bottle of olive oil',
        suggestedAssetType: 'product_image',
        primarySubject: 'olive_oil',
        visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        subjectConfidence: 1,
      },
    });
    expect(result.breaks).not.toContain('photo_theme_conflict');
  });

  it('adaptive farm caption on an oil bottle is a restage gap, not a withhold', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Çiftlikte hasat günü, üretimde iş başındayız. Sızma raflarda.',
      overlayHeadline: 'Hasat günü iş başında',
      brandName: 'Datça Dükkan',
      businessType: 'local_products_shop',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      catalogSlotKey: 'local_products_shop_farm_visit_story',
      adaptiveScene: true,
      galleryMeta: {
        contentTags: ['olive oil', 'zeytinyağı', 'bottle'],
        description: 'Dark glass bottle of olive oil',
        suggestedAssetType: 'product_image',
        primarySubject: 'olive_oil',
        visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        subjectConfidence: 1,
      },
    });
    expect(result.breaks).not.toContain('photo_theme_conflict');
  });

  it('beach: adaptive sunset caption on a table product still is a restage gap', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Gün batımında masada kal. Altın saat açık denizde duruyor.',
      overlayHeadline: 'Gün batımında masada kal',
      brandName: 'Yula',
      businessType: 'beach_club',
      photoUrl: 'https://cdn.example.com/table-drink.jpg',
      catalogSlotKey: 'beach_club_sunset_ambiance_story',
      adaptiveScene: true,
      galleryMeta: {
        contentTags: ['table', 'glass', 'bottle'],
        description: 'Labeled bottle on a set table',
        suggestedAssetType: 'product_image',
        primarySubject: 'table_drink',
        visibleLabelText: 'YULA',
        subjectConfidence: 0.7,
      },
    });
    expect(result.breaks).not.toContain('photo_theme_conflict');
  });

  it('adaptive still withholds honey caption on an oil bottle', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Diken balımızı denediniz mi? Harika bir tat deneyimi sunuyor.',
      overlayHeadline: 'Diken balımızı denediniz mi',
      brandName: 'Datça Dükkan',
      businessType: 'local_products_shop',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      catalogSlotKey: 'local_products_shop_farm_visit_story',
      adaptiveScene: true,
      galleryMeta: {
        contentTags: ['olive oil', 'zeytinyağı', 'bottle'],
        description: 'Dark glass bottle of olive oil',
        suggestedAssetType: 'product_image',
        primarySubject: 'olive_oil',
        subjectConfidence: 1,
      },
    });
    expect(result.breaks).toContain('photo_theme_conflict');
  });

  it('still withholds honey caption on an analyzed olive-oil photo', () => {
    const result = evaluateCaptionDesignPostCoherence({
      caption: 'Diken balımızı denediniz mi? Harika bir tat deneyimi sunuyor.',
      overlayHeadline: 'Diken balımızı denediniz mi',
      brandName: 'Datça Dükkan',
      businessType: 'local_products_shop',
      photoUrl: 'https://cdn.example.com/oil.jpg',
      galleryMeta: {
        contentTags: ['olive oil', 'zeytinyağı', 'bottle'],
        description: 'Dark glass bottle of olive oil',
        suggestedAssetType: 'product_image',
        primarySubject: 'olive_oil',
        subjectConfidence: 1,
      },
    });
    expect(result.breaks).toContain('photo_theme_conflict');
  });

  it('treats hashtag-only overlay as unshippable and repairs from caption', () => {
    const caption = 'Pazar günlerinde dükkanımızda taze zeytinyağı ve bal bulunur.';
    const result = evaluateCaptionDesignPostCoherence({
      caption,
      overlayHeadline: '#PazarKeyfi #Datça #yöresel',
      brandName: 'Datça Dükkan',
      businessType: 'local_products_shop',
    });
    expect(result.overlayHeadline).not.toMatch(/#/);
    expect(result.repaired).toBe(true);
    expect(overlayHeadlineGroundedInCaption(result.overlayHeadline, caption)).toBe(true);
  });

  it('publish artifact reads adaptive_scene from the produce stamp', () => {
    const result = evaluateArtifactPublishCoherence({
      adaptive_scene: true,
      catalog_slot_key: 'local_products_shop_farm_visit_story',
      business_type: 'local_products_shop',
      reference_photo_url: 'https://cdn.example.com/oil.jpg',
      gallery_photo_meta: {
        contentTags: ['olive oil', 'zeytinyağı', 'bottle'],
        description: 'Dark glass bottle of olive oil',
        suggestedAssetType: 'product_image',
        primarySubject: 'olive_oil',
        visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
      },
    }, {
      caption: 'Çiftlikte hasat günü, üretimde iş başındayız. Sızma raflarda.',
      headline: 'Hasat günü iş başında',
      design_overlay_headline: 'Hasat günü iş başında',
    });
    expect(result?.breaks).not.toContain('photo_theme_conflict');
  });

  it('withholds only photo/sample fights — overlay-only breaks can still paint', () => {
    expect(isHardDesignWithholdBreak(['photo_theme_conflict'])).toBe(true);
    expect(isHardDesignWithholdBreak(['design_sample_theme_conflict'])).toBe(true);
    expect(isHardDesignWithholdBreak(['overlay_meaningless'])).toBe(false);
    expect(isHardDesignWithholdBreak(['overlay_ungrounded', 'overlay_theme_conflict'])).toBe(false);
  });
});

/**
 * Golden tests — deterministic caption ↔ gallery photo matching (Faz 3.2).
 *
 * The matcher is the SSOT for MissionContentFactory, AutoProductionFeed and
 * auto-produce. These tests lock its current scoring/selection so any future
 * quality tuning is a deliberate, reviewable snapshot change rather than a
 * silent regression. If a change is intentional: `npm run test -- -u`.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyMatch,
  galleryMediaFingerprint,
  enrichTagsFromDescription,
  matchPhotoToContent,
  assignPhotosToContents,
  rankPhotosForContent,
  buildGalleryLookup,
  pickScoredCarouselSlides,
  isHardGalleryThemeMismatch,
  MIN_ACCEPT_SCORE,
  STRONG_MATCH_SCORE,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';

const FOOD_PHOTO = 'https://cdn.example.com/gallery/food-plate-01.jpg';
const GYM_PHOTO = 'https://cdn.example.com/gallery/gym-equipment-02.jpg';
const VENUE_PHOTO = 'https://cdn.example.com/gallery/interior-terrace-03.jpg';
const NIGHTLIFE_PHOTO = 'https://cdn.example.com/gallery/dj-crowd-night-04.jpg';
const FALLBACK_PHOTO = 'https://cdn.example.com/gallery/fallback-generic-05.jpg';

function restaurantGallery(): Record<string, GalleryPhotoMeta> {
  return {
    [FOOD_PHOTO]: {
      contentTags: ['food', 'dish', 'plate', 'pasta', 'gourmet'],
      description: 'A beautifully plated gourmet pasta dish served on a white plate at a restaurant table.',
      mood: 'warm',
      bestFor: ['food_showcase', 'feed_post'],
      suggestedAssetType: 'food_photo',
    },
    [GYM_PHOTO]: {
      contentTags: ['gym', 'equipment', 'dumbbell', 'workout'],
      description: 'Gym equipment with dumbbells and a workout bench in a fitness studio.',
      mood: 'energetic',
      bestFor: ['equipment_showcase'],
      suggestedAssetType: 'equipment_photo',
    },
    [VENUE_PHOTO]: {
      contentTags: ['interior', 'terrace', 'ambiance', 'cozy'],
      description: 'A cozy restaurant interior with a terrace and warm ambient lighting.',
      mood: 'warm',
      bestFor: ['venue_photo', 'feed_post'],
      suggestedAssetType: 'venue_photo',
    },
  };
}

function beachClubGallery(): Record<string, GalleryPhotoMeta> {
  return {
    [FOOD_PHOTO]: {
      contentTags: ['food', 'burger', 'fries', 'plate', 'drink'],
      description: 'Burger and fries served on a plate beside summer drinks on a table.',
      mood: 'warm',
      bestFor: ['food_showcase', 'feed_post'],
      suggestedAssetType: 'food_photo',
    },
    [NIGHTLIFE_PHOTO]: {
      contentTags: ['dj', 'crowd', 'dance', 'party', 'beach', 'night'],
      description: 'A crowded beach party at night with a DJ booth, dancing guests and stage lights.',
      mood: 'energetic',
      bestFor: ['event_announcement', 'story_format', 'feed_post'],
      suggestedAssetType: 'event_photo',
      hasPeople: true,
    },
    [FALLBACK_PHOTO]: {
      contentTags: ['galeri', 'brand gallery', 'website image'],
      description: 'Metadata fallback analysis for a brand gallery image. URL tokens suggest: galeri. A real vision pass should replace this entry when provider quota is available.',
      mood: 'warm',
      bestFor: ['feed_post'],
      suggestedAssetType: 'brand_background',
    },
  };
}

describe('classifyMatch — score → quality bands', () => {
  it('pins the quality classification at each threshold', () => {
    const samples = [70, STRONG_MATCH_SCORE, 56, MIN_ACCEPT_SCORE, 27, 0].map((score) => ({
      score,
      ...classifyMatch(score),
    }));
    expect(samples).toMatchInlineSnapshot(`
      [
        {
          "label": "Güçlü eşleşme",
          "needsReview": false,
          "quality": "strong",
          "score": 70,
          "usable": true,
        },
        {
          "label": "Güçlü eşleşme",
          "needsReview": false,
          "quality": "strong",
          "score": 52,
          "usable": true,
        },
        {
          "label": "Güçlü eşleşme",
          "needsReview": false,
          "quality": "strong",
          "score": 56,
          "usable": true,
        },
        {
          "label": "Zayıf eşleşme — gözden geçirin",
          "needsReview": false,
          "quality": "weak",
          "score": 28,
          "usable": true,
        },
        {
          "label": "Eşleşme yok",
          "needsReview": true,
          "quality": "rejected",
          "score": 27,
          "usable": false,
        },
        {
          "label": "Eşleşme yok",
          "needsReview": true,
          "quality": "rejected",
          "score": 0,
          "usable": false,
        },
      ]
    `);
  });
});

describe('galleryMediaFingerprint — stable across CDN variants', () => {
  it('collapses resize/query variants of the same media to one fingerprint', () => {
    const a = galleryMediaFingerprint('https://cdn.example.com/upload/w_800/gallery/food-plate-01.jpg');
    const b = galleryMediaFingerprint('https://cdn.example.com/upload/w_1600,q_80/gallery/food-plate-01.jpg?v=2');
    expect(a).toBe(b);
  });

  it('pins the fingerprint scheme for wix/file/path forms', () => {
    expect({
      wix: galleryMediaFingerprint('https://static.wixstatic.com/media/abc123~mv2.jpg/v1/fill/w_1.jpg'),
      file: galleryMediaFingerprint('https://example.com/photos/terrace-03.png?token=x'),
    }).toMatchInlineSnapshot(`
      {
        "file": "file:terrace-03.png",
        "wix": "wix:abc123~mv2.jpg",
      }
    `);
  });
});

describe('enrichTagsFromDescription — sector-agnostic enrichment', () => {
  it('derives bestFor + tags from a food description', () => {
    const patch = enrichTagsFromDescription({
      description: 'Fresh seasonal food plated at the restaurant, served to happy guests at a table.',
    });
    expect({
      bestFor: [...(patch.bestFor ?? [])].sort(),
      hasFoodTag: (patch.contentTags ?? []).includes('food'),
    }).toMatchInlineSnapshot(`
      {
        "bestFor": [
          "feed_post",
          "food_showcase",
          "social_proof",
        ],
        "hasFoodTag": true,
      }
    `);
  });

  it('returns empty patch when already well-enriched', () => {
    const patch = enrichTagsFromDescription({
      description: 'something',
      contentTags: ['a', 'b', 'c'],
      bestFor: ['feed_post'],
    });
    expect(patch).toEqual({});
  });
});

describe('matchPhotoToContent — picks the semantically aligned photo', () => {
  it('matches a food caption to the food photo (strong), not the gym photo', () => {
    const result = matchPhotoToContent(
      {
        caption: 'Şefin imza makarnası bugün masanızda — taze ve lezzetli pasta dish.',
        headline: 'Gourmet pasta',
        contentType: 'instagram_post',
        businessType: 'restaurant',
      },
      [FOOD_PHOTO, GYM_PHOTO, VENUE_PHOTO],
      restaurantGallery(),
    );
    expect(result?.url).toBe(FOOD_PHOTO);
    expect(result && result.score >= STRONG_MATCH_SCORE).toBe(true);
  });

  it('returns null when nothing clears MIN_ACCEPT (no random pick)', () => {
    const result = matchPhotoToContent(
      { caption: 'xyzzy plugh frobnicate qux', contentType: 'instagram_post' },
      [GYM_PHOTO],
      { [GYM_PHOTO]: { description: 'unrelated abstract texture' } },
    );
    expect(result).toBeNull();
  });

  it('bestEffort does not pick a random pool photo when semantic score is too weak', () => {
    const result = matchPhotoToContent(
      { caption: 'xyzzy plugh frobnicate qux', contentType: 'instagram_post' },
      [GYM_PHOTO],
      { [GYM_PHOTO]: { description: 'unrelated abstract texture' } },
      { bestEffort: true },
    );
    expect(result).toBeNull();
  });

  it('prefers a real nightlife photo over a food shot for DJ-night captions', () => {
    const result = matchPhotoToContent(
      {
        caption: 'Create excitement about our upcoming DJ nights with visuals of a lively beach atmosphere, showcasing people dancing and enjoying cocktails.',
        headline: 'Weekend DJ Nights',
        contentType: 'instagram_reel',
        businessType: 'beach_club',
      },
      [FOOD_PHOTO, NIGHTLIFE_PHOTO],
      beachClubGallery(),
    );
    expect(result?.url).toBe(NIGHTLIFE_PHOTO);
    expect(result && result.score >= STRONG_MATCH_SCORE).toBe(true);
  });

  it('penalizes generic fallback gallery metadata when a more specific analyzed match exists', () => {
    const result = matchPhotoToContent(
      {
        caption: 'Weekend DJ nights with dancing guests and beach party energy.',
        headline: 'Weekend DJ Nights',
        contentType: 'instagram_reel',
        businessType: 'beach_club',
      },
      [FALLBACK_PHOTO, NIGHTLIFE_PHOTO],
      beachClubGallery(),
    );
    expect(result?.url).toBe(NIGHTLIFE_PHOTO);
  });
});

describe('assignPhotosToContents — 1:1 within a post-type bucket', () => {
  it('does not assign the same photo twice in the same bucket', () => {
    const assigned = assignPhotosToContents(
      [
        { key: 'idea-0', input: { caption: 'gourmet pasta food dish plate', businessType: 'restaurant' }, postType: 'feed' },
        { key: 'idea-1', input: { caption: 'cozy restaurant interior terrace ambiance', businessType: 'restaurant' }, postType: 'feed' },
      ],
      [FOOD_PHOTO, VENUE_PHOTO],
      restaurantGallery(),
    );
    const urls = [...assigned.values()].filter(Boolean).map((r) => r!.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('strength-first: a weak idea does not starve a stronger idea of its best photo', () => {
    // Both ideas rank FOOD_PHOTO highest, but `weak` is listed first. Input-order
    // greedy would let `weak` claim FOOD_PHOTO and leave `strong` with the venue
    // (or nothing). Strength-first assigns FOOD_PHOTO to the stronger match and
    // routes the weaker idea to the still-acceptable venue photo.
    const assigned = assignPhotosToContents(
      [
        {
          key: 'weak',
          input: { caption: 'lezzetli food in our cozy restaurant interior terrace ambiance', businessType: 'restaurant' },
          postType: 'feed',
        },
        {
          key: 'strong',
          input: {
            caption: 'gourmet pasta food dish plate gourmet pasta plated gourmet',
            headline: 'Gourmet pasta dish',
            businessType: 'restaurant',
          },
          postType: 'feed',
        },
      ],
      [FOOD_PHOTO, VENUE_PHOTO],
      restaurantGallery(),
    );
    expect(assigned.get('strong')?.url).toBe(FOOD_PHOTO);
    expect(assigned.get('weak')?.url).toBe(VENUE_PHOTO);
    // Map iteration order still matches input order (weak first).
    expect([...assigned.keys()]).toEqual(['weak', 'strong']);
  });

  it('applies global usage-count penalty to ranked photos', () => {
    const counts = new Map<string, number>([[FOOD_PHOTO, 5]]);
    const caption = 'gourmet pasta food dish plate gourmet';
    const lookup = buildGalleryLookup(restaurantGallery(), [FOOD_PHOTO, VENUE_PHOTO]);
    const rankedPlain = rankPhotosForContent(
      { caption, businessType: 'restaurant' },
      [FOOD_PHOTO, VENUE_PHOTO],
      lookup,
      new Set(),
      restaurantGallery(),
    );
    const rankedPenalized = rankPhotosForContent(
      { caption, businessType: 'restaurant', globalUsageCounts: counts },
      [FOOD_PHOTO, VENUE_PHOTO],
      lookup,
      new Set(),
      restaurantGallery(),
    );
    const foodPlain = rankedPlain.find((r) => r.url === FOOD_PHOTO)!.score;
    const foodPenalized = rankedPenalized.find((r) => r.url === FOOD_PHOTO)!.score;
    expect(foodPenalized).toBe(foodPlain - 60);
  });

  it('does not assign the same photo across post-type buckets (mission-wide)', () => {
    const assigned = assignPhotosToContents(
      [
        { key: 'post', input: { caption: 'gourmet pasta food dish plate', businessType: 'restaurant' }, postType: 'feed' },
        { key: 'story', input: { caption: 'gourmet pasta food dish plate special', businessType: 'restaurant' }, postType: 'story' },
      ],
      [FOOD_PHOTO, VENUE_PHOTO],
      restaurantGallery(),
    );
    const urls = [...assigned.values()].filter(Boolean).map((r) => r!.url);
    expect(urls.length).toBeGreaterThanOrEqual(1);
    if (urls.length === 2) {
      expect(new Set(urls).size).toBe(2);
    }
  });

  it('assigns unique photos to all slots when pool exceeds strict-match count', () => {
    const PHOTO_A = 'https://cdn.example.com/gallery/product-a.jpg';
    const PHOTO_B = 'https://cdn.example.com/gallery/product-b.jpg';
    const PHOTO_C = 'https://cdn.example.com/gallery/product-c.jpg';
    const PHOTO_D = 'https://cdn.example.com/gallery/product-d.jpg';
    const gallery: Record<string, GalleryPhotoMeta> = {
      [PHOTO_A]: { contentTags: ['olive', 'oil', 'product'], description: 'Olive oil bottle on wooden table.' },
      [PHOTO_B]: { contentTags: ['fig', 'jam', 'product'], description: 'Fig jam jar with spoon.' },
      [PHOTO_C]: { contentTags: ['cheese', 'local', 'product'], description: 'Local artisan cheese board.' },
      [PHOTO_D]: { contentTags: ['herb', 'tea', 'product'], description: 'Dried herbs and tea blend.' },
    };
    const assigned = assignPhotosToContents(
      [
        { key: '0', input: { caption: 'Zeytinyağı hakkında', businessType: 'local_products_shop' }, postType: 'feed' },
        { key: '1', input: { caption: 'İncir reçeli tanıtımı', businessType: 'local_products_shop' }, postType: 'feed' },
        { key: '2', input: { caption: 'Yerel peynir çeşitleri', businessType: 'local_products_shop' }, postType: 'feed' },
        { key: '3', input: { caption: 'Bitki çayı koleksiyonu', businessType: 'local_products_shop' }, postType: 'feed' },
      ],
      [PHOTO_A, PHOTO_B, PHOTO_C, PHOTO_D],
      gallery,
    );
    const urls = [...assigned.values()].filter(Boolean).map((r) => r!.url);
    expect(urls).toHaveLength(4);
    expect(new Set(urls).size).toBe(4);
  });
});

describe('local product carousel — honey caption must not pick olive oil', () => {
  const HONEY_PHOTO = 'https://cdn.example.com/gallery/petek-bal-01.jpg';
  const OIL_PHOTO = 'https://cdn.example.com/gallery/zeytinyagi-3lt-tin.jpg';

  const gallery: Record<string, GalleryPhotoMeta> = {
    [HONEY_PHOTO]: {
      contentTags: ['product', 'honey', 'jar'],
      description: 'Flower honey jar and honeycomb on wooden table.',
      mood: 'warm',
    },
    [OIL_PHOTO]: {
      contentTags: ['product', 'bottle', 'tin'],
      description: 'Three liter olive oil tin cans on wooden table with olives.',
      mood: 'natural',
    },
  };

  it('hard-vetoes olive oil photo for honey caption', () => {
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Datça\'nın en özel süzme çiçek balını keşfedin',
          headline: 'Saf Lezzet',
          businessType: 'local_products_shop',
        },
        gallery[OIL_PHOTO],
        OIL_PHOTO,
      ),
    ).toBe(true);
  });

  it('hard-vetoes unlabeled oil tins for honey caption (empty product tags)', () => {
    const unlabeledOil = 'https://cdn.example.com/gallery/product-tins-01.jpg';
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Süzme çiçek balımızın özelliklerini ve faydalarını keşfedin',
          headline: 'Süzme çiçek balımızın',
          businessType: 'local_products_shop',
        },
        {
          contentTags: ['product', 'tin', 'packaging'],
          description: 'Three metal cans on a wooden table.',
          mood: 'natural',
        },
        unlabeledOil,
      ),
    ).toBe(true);
  });

  it('vetoes via vision primary_subject even when tags/description are generic', () => {
    const genericTinsMeta: GalleryPhotoMeta = {
      contentTags: ['product', 'packaging', 'wooden table'],
      description: 'Three metal cans arranged on a rustic wooden surface.',
      primarySubject: 'olive_oil',
    };
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Süzme çiçek balımızın faydaları',
          headline: 'Süzme çiçek balı',
          businessType: 'local_products_shop',
        },
        genericTinsMeta,
        'https://cdn.example.com/gallery/product-tins-02.jpg',
      ),
    ).toBe(true);
  });

  it('canonical subjectKey drives matching regardless of caption language', () => {
    const honeyMeta: GalleryPhotoMeta = {
      contentTags: ['jar', 'amber', 'wooden table'],
      description: 'An amber jar on a wooden table.',
      primarySubject: 'honey',
    };
    // English caption + explicit subject key still matches the honey photo.
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Discover the benefits of our raw flower honey',
          headline: 'Pure taste',
          businessType: 'local_products_shop',
          subjectKey: 'honey',
        },
        honeyMeta,
        'https://cdn.example.com/gallery/jar-amber.jpg',
      ),
    ).toBe(false);
    // Same photo, olive-oil subject key → hard mismatch.
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Cold pressed premium',
          headline: 'Premium',
          businessType: 'local_products_shop',
          subjectKey: 'olive_oil',
        },
        honeyMeta,
        'https://cdn.example.com/gallery/jar-amber.jpg',
      ),
    ).toBe(true);
  });

  it('pickScoredCarouselSlides returns only honey-matching slides', () => {
    const slides = pickScoredCarouselSlides(
      {
        caption: 'Datça\'nın en özel süzme çiçek balını keşfedin',
        headline: 'Saf Lezzet',
        businessType: 'local_products_shop',
      },
      [OIL_PHOTO, HONEY_PHOTO],
      gallery,
      [],
      3,
      STRONG_MATCH_SCORE,
    );
    expect(slides.length).toBeGreaterThanOrEqual(1);
    expect(slides.every((s) => s.url === HONEY_PHOTO)).toBe(true);
    expect(slides.some((s) => s.url === OIL_PHOTO)).toBe(false);
  });
});

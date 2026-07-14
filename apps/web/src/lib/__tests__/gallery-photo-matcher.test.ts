/**
 * Golden tests — deterministic caption ↔ gallery photo matching (Faz 3.2).
 *
 * The matcher is the SSOT for MissionContentFactory, AutoProductionFeed and
 * auto-produce. These tests lock its current scoring/selection so any future
 * quality tuning is a deliberate, reviewable snapshot change rather than a
 * silent regression. If a change is intentional: `npm run test -- -u`.
 */
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
  resolveGalleryPhotoMeta,
  preferSubjectAlignedCandidates,
  canonicalSubjectRelation,
  canonicalSubjectFromText,
  resolveGalleryMatchSubjectKey,
  isJamFamilySubject,
  MIN_ACCEPT_SCORE,
  STRONG_MATCH_SCORE,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import { rematchGalleryAfterHardThemeConflict } from '@/app/api/auto-produce/caption-publish-resolver';
import { describe, it, expect } from 'vitest';

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

  it('reserves a subject-aligned photo for its product slot — generic captions cannot take it (local_products_shop)', () => {
    const JAM_PHOTO = 'https://cdn.example.com/gallery/fig-jam-jar.jpg';
    const gallery: Record<string, GalleryPhotoMeta> = {
      // Sparse meta → the jam slot scores below MIN_ACCEPT (stays pending),
      // while the generic promo caption would happily take the photo in the
      // relaxed/diversity rounds without reservations.
      [JAM_PHOTO]: { primarySubject: 'fig_jam', contentTags: [], description: '' },
    };
    const assigned = assignPhotosToContents(
      [
        { key: 'promo', input: { caption: 'Hafta sonu indirimleri kaçmaz', businessType: 'local_products_shop' }, postType: 'feed' },
        { key: 'jam', input: { caption: 'Reçel çeşitlerimiz', headline: 'Reçel', businessType: 'local_products_shop', subjectKey: 'jam' }, postType: 'feed' },
      ],
      [JAM_PHOTO],
      gallery,
    );
    // The only jam photo must NOT leak to the generic promo slot.
    expect(assigned.get('promo')?.url).toBeUndefined();
  });

  it('reservation logic is sector-agnostic — beauty photo held for its service slot', () => {
    const NAIL_PHOTO = 'https://cdn.example.com/gallery/nail-art.jpg';
    const gallery: Record<string, GalleryPhotoMeta> = {
      [NAIL_PHOTO]: { primarySubject: 'nail_art', contentTags: [], description: '' },
    };
    const assigned = assignPhotosToContents(
      [
        { key: 'promo', input: { caption: 'Yeni sezon fırsatları başladı', businessType: 'beauty_wellness' }, postType: 'feed' },
        { key: 'nails', input: { caption: 'Nail art tasarımlarımız', headline: 'Nail art', businessType: 'beauty_wellness', subjectKey: 'nail_art' }, postType: 'feed' },
      ],
      [NAIL_PHOTO],
      gallery,
    );
    expect(assigned.get('promo')?.url).toBeUndefined();
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
      primarySubject: 'honey',
    },
    [OIL_PHOTO]: {
      contentTags: ['product', 'bottle', 'tin'],
      description: 'Three liter olive oil tin cans on wooden table with olives.',
      mood: 'natural',
      primarySubject: 'olive_oil',
    },
  };

  it('resolveGalleryPhotoMeta matches CDN/R2 display URLs to Wix analysis keys', () => {
    const mirroredOil = 'https://r2.smartagency.io/tenant/ws/gallery/zeytinyagi-3lt-tin.jpg?w=1200';
    const meta = resolveGalleryPhotoMeta(mirroredOil, gallery, [mirroredOil, OIL_PHOTO]);
    expect(meta?.primarySubject).toBe('olive_oil');
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Erken hasat zeytinyağı faydaları',
          headline: 'Erken hasat',
          businessType: 'local_products_shop',
          subjectKey: 'olive_oil',
        },
        meta,
        mirroredOil,
      ),
    ).toBe(false);
  });

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

  it('sector-agnostic: vetoes cross-subject for non-dictionary sectors (beauty)', () => {
    // nail_service caption on a haircut photo — no food dictionary involved.
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Kışa özel manikür ve nail art randevuları',
          headline: 'Nail art',
          businessType: 'beauty_salon',
          subjectKey: 'nail_service',
        },
        {
          contentTags: ['salon', 'hair'],
          description: 'A stylist finishing a fresh haircut.',
          primarySubject: 'haircut',
          subjectConfidence: 0.9,
        },
        'https://cdn.example.com/gallery/haircut-01.jpg',
      ),
    ).toBe(true);
  });

  it('sector-agnostic: related subjects (haircut vs hair_color) are NOT vetoed', () => {
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Yeni sezon saç boyama trendleri',
          headline: 'Saç rengi',
          businessType: 'beauty_salon',
          subjectKey: 'hair_color',
        },
        {
          contentTags: ['salon', 'hair'],
          description: 'Balayage hair color result.',
          primarySubject: 'haircut',
          subjectConfidence: 0.9,
        },
        'https://cdn.example.com/gallery/hair-02.jpg',
      ),
    ).toBe(false);
  });

  it('sector-agnostic: abstract/none subject never hard-vetoes', () => {
    expect(
      isHardGalleryThemeMismatch(
        {
          caption: 'Ekibimizle tanışın',
          headline: 'Ekibimiz',
          businessType: 'gym',
          subjectKey: 'none',
        },
        {
          contentTags: ['gym', 'equipment'],
          description: 'Dumbbells on a rack.',
          primarySubject: 'dumbbell',
          subjectConfidence: 0.8,
        },
        'https://cdn.example.com/gallery/gym-01.jpg',
      ),
    ).toBe(false);
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

  it('preferSubjectAlignedCandidates keeps only primarySubject matches', () => {
    const aligned = preferSubjectAlignedCandidates(
      [OIL_PHOTO, HONEY_PHOTO],
      gallery,
      'olive_oil',
    );
    expect(aligned).toEqual([OIL_PHOTO]);
  });

  it('rankPhotosForContent with subjectKey prefers olive_oil primarySubject', () => {
    const ranked = rankPhotosForContent(
      {
        caption: 'Cold pressed premium olive oil',
        headline: 'Erken hasat',
        businessType: 'local_products_shop',
        subjectKey: 'olive_oil',
      },
      [HONEY_PHOTO, OIL_PHOTO],
      buildGalleryLookup(gallery, [HONEY_PHOTO, OIL_PHOTO]),
      new Set(),
      gallery,
    );
    expect(ranked[0]?.url).toBe(OIL_PHOTO);
  });

  it('rematchGalleryAfterHardThemeConflict swaps rejected honey for olive_oil', () => {
    const rematched = rematchGalleryAfterHardThemeConflict({
      caption: 'Cold pressed premium olive oil',
      headline: 'Erken hasat',
      mood: 'natural',
      galleryAnalysis: gallery,
      candidateUrls: [HONEY_PHOTO, OIL_PHOTO],
      excludeUrls: [],
      rejectedUrl: HONEY_PHOTO,
      contentType: 'feed',
      businessType: 'local_products_shop',
      subjectKey: 'olive_oil',
      maxAttempts: 3,
    });
    expect(rematched).toBe(OIL_PHOTO);
  });
});

describe('jam family + gallery subject_key alignment (local_products_shop + gym)', () => {
  const FIG_JAM = 'https://cdn.example.com/fig-jam.jpg';
  const STRAWBERRY_JAM = 'https://cdn.example.com/strawberry-jam.jpg';
  const HONEY_PHOTO_JAM = 'https://cdn.example.com/honey-jam-test.jpg';

  const localShopGallery = (): Record<string, GalleryPhotoMeta> => ({
    [FIG_JAM]: {
      primarySubject: 'fig_jam',
      subjectConfidence: 0.9,
      contentTags: ['fig', 'jam', 'reçel'],
      description: 'Fig jam jars on wooden table.',
    },
    [STRAWBERRY_JAM]: {
      primarySubject: 'strawberry_jam',
      subjectConfidence: 0.9,
      contentTags: ['strawberry', 'jam', 'reçel'],
      description: 'Strawberry jam collection.',
    },
    [HONEY_PHOTO_JAM]: {
      primarySubject: 'honey',
      subjectConfidence: 0.9,
      contentTags: ['honey', 'bal'],
      description: 'Honey jars.',
    },
  });

  it('isJamFamilySubject covers generic jam and variants', () => {
    expect(isJamFamilySubject('jam')).toBe(true);
    expect(isJamFamilySubject('fig_jam')).toBe(true);
    expect(isJamFamilySubject('olive_oil')).toBe(false);
  });

  it('generic jam subject_key ranks fig_jam / strawberry_jam above MIN_ACCEPT', () => {
    const gallery = localShopGallery();
    const urls = [FIG_JAM, STRAWBERRY_JAM];
    const ranked = rankPhotosForContent(
      {
        caption: 'Geleneksel reçeller',
        headline: 'Reçel çeşitleri',
        businessType: 'local_products_shop',
        subjectKey: 'jam',
      },
      urls,
      buildGalleryLookup(gallery, urls),
      new Set(),
      gallery,
    );
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(MIN_ACCEPT_SCORE);
    expect([FIG_JAM, STRAWBERRY_JAM]).toContain(ranked[0]?.url);
  });

  it('resolveGalleryMatchSubjectKey prefers caption product over conflicting subject_key', () => {
    expect(resolveGalleryMatchSubjectKey({
      caption: 'Karaman Datça reçellerini keşfedin — doğal lezzet',
      headline: 'Doğanın Mucizesi Bir Kavanozda!',
      subjectKey: 'honey',
    })).toBe('jam');
    expect(resolveGalleryMatchSubjectKey({
      caption: 'Müşterilerimiz bal çeşitlerimizi çok seviyor',
      headline: 'Gelenekten Geleceğe: Reçel Yapımı',
      subjectKey: 'honey',
    })).toBe('honey');
  });

  it('canonicalSubjectRelation treats jam variants as related', () => {
    expect(canonicalSubjectRelation('jam', 'fig_jam')).toBe('match');
    expect(canonicalSubjectRelation('jam', 'strawberry_jam')).toBe('match');
  });

  it('herbal_tea subject hard-conflicts honey primarySubject', () => {
    const gallery = localShopGallery();
    expect(isHardGalleryThemeMismatch(
      {
        caption: 'Geleneksel bitki çayları hakkında bilgi',
        businessType: 'local_products_shop',
        subjectKey: 'herbal_tea',
      },
      gallery[HONEY_PHOTO_JAM],
      HONEY_PHOTO_JAM,
    )).toBe(true);
  });

  it('gym sector: olive_oil subject_key hard-conflicts with honey primarySubject', () => {
    const gallery = localShopGallery();
    expect(isHardGalleryThemeMismatch(
      {
        caption: 'Antrenman sonrası beslenme',
        businessType: 'gym',
        subjectKey: 'olive_oil',
      },
      gallery[HONEY_PHOTO_JAM],
      HONEY_PHOTO_JAM,
    )).toBe(true);
  });
});

describe('canonicalSubjectFromText — language-neutral intent extraction', () => {
  it('maps Turkish product wording to canonical english', () => {
    expect(canonicalSubjectFromText('Doğal zeytinyağımız raflarda')).toBe('olive_oil');
    expect(canonicalSubjectFromText('Süzme çiçek balı')).toBe('honey');
    expect(canonicalSubjectFromText('Ev yapımı incir reçeli')).toBe('jam');
  });

  it('maps English wording to the same canonical token', () => {
    expect(canonicalSubjectFromText('Cold pressed extra virgin olive oil')).toBe('olive_oil');
    expect(canonicalSubjectFromText('Pure flower honey jar')).toBe('honey');
  });

  it('maps mixed TR/EN wording consistently', () => {
    expect(canonicalSubjectFromText('Our best zeytinyağı — premium olive oil')).toBe('olive_oil');
    expect(canonicalSubjectFromText('Herbal tea / bitki çayı seçkisi')).toBe('herbal_tea');
  });

  it('returns undefined when no concrete product subject is present', () => {
    expect(canonicalSubjectFromText('Ekibimizle harika bir gün')).toBeUndefined();
    expect(canonicalSubjectFromText('A beautiful sunset over the terrace')).toBeUndefined();
    expect(canonicalSubjectFromText('')).toBeUndefined();
  });
});

describe('subject aliases / family feed multilingual matching', () => {
  const VARIANT_JAM = 'https://cdn.example.com/variant-jam.jpg';

  it('generic jam caption matches a variant photo via subjectAliases (no dictionary term in tags)', () => {
    const gallery: Record<string, GalleryPhotoMeta> = {
      [VARIANT_JAM]: {
        primarySubject: 'blackberry_preserve',
        subjectAliases: ['jam'],
        subjectFamily: 'jam',
        contentTags: ['jar', 'spread', 'breakfast'],
        description: 'Artisan preserve jar on a table.',
      },
    };
    const urls = [VARIANT_JAM];
    const ranked = rankPhotosForContent(
      {
        caption: 'Our homemade jams',
        headline: 'Jam selection',
        businessType: 'local_products_shop',
        subjectKey: 'jam',
      },
      urls,
      buildGalleryLookup(gallery, urls),
      new Set(),
      gallery,
    );
    expect(ranked[0]?.url).toBe(VARIANT_JAM);
    expect(ranked[0]?.score).toBeGreaterThanOrEqual(MIN_ACCEPT_SCORE);
  });

  it('visibleLabelText participates so an olive_oil caption matches an unlabeled-tag photo', () => {
    const OIL_LABEL = 'https://cdn.example.com/oil-label.jpg';
    const gallery: Record<string, GalleryPhotoMeta> = {
      [OIL_LABEL]: {
        primarySubject: 'olive_oil',
        visibleLabelText: 'NATUREL SIZMA ZEYTİNYAĞI',
        contentTags: ['bottle', 'kitchen'],
        description: 'A glass bottle on a shelf.',
      },
    };
    expect(isHardGalleryThemeMismatch(
      {
        caption: 'Erken hasat zeytinyağı',
        businessType: 'local_products_shop',
        subjectKey: 'olive_oil',
      },
      gallery[OIL_LABEL],
      OIL_LABEL,
    )).toBe(false);
  });
});

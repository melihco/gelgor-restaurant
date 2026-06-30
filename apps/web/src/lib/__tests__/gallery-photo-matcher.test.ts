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
  MIN_ACCEPT_SCORE,
  STRONG_MATCH_SCORE,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';

const FOOD_PHOTO = 'https://cdn.example.com/gallery/food-plate-01.jpg';
const GYM_PHOTO = 'https://cdn.example.com/gallery/gym-equipment-02.jpg';
const VENUE_PHOTO = 'https://cdn.example.com/gallery/interior-terrace-03.jpg';

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
    expect(foodPenalized).toBe(foodPlain - 20);
  });
});

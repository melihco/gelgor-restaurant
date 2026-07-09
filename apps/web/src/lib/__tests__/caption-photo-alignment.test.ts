import { describe, it, expect } from 'vitest';
import {
  captionPhotoConflictPenalty,
  captionRequiresStrictGalleryMatch,
  isHardCaptionPhotoConflict,
  HARD_CAPTION_PHOTO_CONFLICT,
} from '../caption-photo-alignment';
import {
  isHardGalleryThemeMismatch,
  matchPhotoToContent,
  assignPhotosToContents,
  type GalleryPhotoMeta,
} from '../gallery-photo-matcher';

const FOOD_PHOTO = 'https://cdn.example.com/gallery/food-plate-01.jpg';
const NIGHTLIFE_PHOTO = 'https://cdn.example.com/gallery/dj-crowd-night-04.jpg';
const FOOD_WITH_PEOPLE_META: GalleryPhotoMeta = {
  contentTags: ['food', 'dish', 'plate', 'people', 'guest', 'serving'],
  description: 'A plated gourmet dish with guests visible in soft background.',
  mood: 'warm',
  bestFor: ['food_showcase', 'feed_post'],
};

const NIGHTLIFE_META: GalleryPhotoMeta = {
  contentTags: ['dj', 'stage', 'crowd', 'dancing', 'night', 'party'],
  description: 'DJ performing on stage with dancing crowd under neon lights.',
  mood: 'energetic',
  bestFor: ['nightlife', 'reel'],
};

const FOOD_ONLY_META: GalleryPhotoMeta = {
  contentTags: ['food', 'dish', 'plate', 'pasta', 'gourmet'],
  description: 'A beautifully plated gourmet pasta dish on a white plate.',
  mood: 'warm',
  bestFor: ['food_showcase'],
};

describe('captionPhotoConflictPenalty — nightlife vs food', () => {
  it('hard-vetoes DJ caption against food-only gallery meta', () => {
    const penalty = captionPhotoConflictPenalty(
      'Bu yaz, sıcak geceleri DJ performanslarıyla renklendiriyoruz! 15 Temmuz\'da buluşalım!',
      'food dish plate gourmet pasta kitchen restaurant table',
    );
    expect(penalty).toBeGreaterThanOrEqual(HARD_CAPTION_PHOTO_CONFLICT);
    expect(isHardCaptionPhotoConflict(
      'Bu yaz, sıcak geceleri DJ performanslarıyla renklendiriyoruz!',
      'food dish plate gourmet pasta kitchen',
    )).toBe(true);
  });

  it('hard-vetoes DJ caption even when food meta includes soft people/guest tags', () => {
    const searchable = [
      ...(FOOD_WITH_PEOPLE_META.contentTags ?? []),
      FOOD_WITH_PEOPLE_META.description,
    ].join(' ');
    expect(
      isHardCaptionPhotoConflict(
        'Weekend DJ nights with dancing guests and beach party energy.',
        searchable,
      ),
    ).toBe(true);
  });

  it('does not penalize DJ caption against nightlife crowd photo', () => {
    const penalty = captionPhotoConflictPenalty(
      'Bu yaz, sıcak geceleri DJ performanslarıyla renklendiriyoruz!',
      'dj stage crowd dancing night party lights beach',
    );
    expect(penalty).toBe(0);
  });

  it('hard-vetoes food caption against nightlife stage photo', () => {
    expect(
      isHardCaptionPhotoConflict(
        'Taze deniz ürünleri menümüzü keşfedin — şef özel tabaklar',
        'dj stage dancing nightlife neon concert',
      ),
    ).toBe(true);
  });
});

describe('captionRequiresStrictGalleryMatch', () => {
  it('flags nightlife and strong food captions', () => {
    expect(captionRequiresStrictGalleryMatch(
      'DJ performanslarıyla renklendiriyoruz',
      'DJ Gecesi',
    )).toBe(true);
    expect(captionRequiresStrictGalleryMatch(
      'Şef özel menü ve lezzet dolu tabaklar',
      'Menü',
    )).toBe(true);
    expect(captionRequiresStrictGalleryMatch(
      'Bodrumda gün batımı keyfi',
      'Sunset',
    )).toBe(false);
  });
});

describe('matcher hard veto — DJ never picks food', () => {
  const gallery: Record<string, GalleryPhotoMeta> = {
    [FOOD_PHOTO]: FOOD_WITH_PEOPLE_META,
    [NIGHTLIFE_PHOTO]: NIGHTLIFE_META,
  };

  it('matchPhotoToContent prefers nightlife and never returns food for DJ', () => {
    const result = matchPhotoToContent(
      {
        caption: 'Create excitement about our upcoming DJ nights with people dancing.',
        headline: 'Weekend DJ Nights',
        contentType: 'instagram_reel',
        businessType: 'beach_club',
      },
      [FOOD_PHOTO, NIGHTLIFE_PHOTO],
      gallery,
    );
    expect(result?.url).toBe(NIGHTLIFE_PHOTO);
  });

  it('returns null when only food photos exist for a DJ caption', () => {
    const result = matchPhotoToContent(
      {
        caption: 'Bu yaz sıcak geceleri DJ performanslarıyla renklendiriyoruz!',
        headline: 'DJ Gecesi',
        contentType: 'instagram_reel',
        businessType: 'beach_club',
      },
      [FOOD_PHOTO],
      { [FOOD_PHOTO]: FOOD_ONLY_META },
    );
    expect(result).toBeNull();
  });

  it('assignPhotosToContents leaves DJ slot null rather than diversity-assign food', () => {
    const assigned = assignPhotosToContents(
      [
        {
          key: 'dj',
          input: {
            caption: 'DJ performanslarıyla sıcak geceler — 15 Temmuz',
            headline: 'DJ Night',
            businessType: 'beach_club',
          },
          postType: 'feed',
        },
      ],
      [FOOD_PHOTO],
      { [FOOD_PHOTO]: FOOD_ONLY_META },
    );
    expect(assigned.get('dj')).toBeNull();
  });

  it('isHardGalleryThemeMismatch detects food plate for DJ input', () => {
    expect(
      isHardGalleryThemeMismatch(
        { caption: 'DJ nights this weekend', headline: 'DJ' },
        FOOD_WITH_PEOPLE_META,
        FOOD_PHOTO,
      ),
    ).toBe(true);
  });
});

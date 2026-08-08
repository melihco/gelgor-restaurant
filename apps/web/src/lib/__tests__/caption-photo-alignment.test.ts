import { describe, it, expect } from 'vitest';
import {
  captionPhotoConflictPenalty,
  captionRequiresAiGalleryJudge,
  captionRequiresStrictGalleryMatch,
  isHardCaptionPhotoConflict,
  themeConflictNeedsAiJudge,
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

describe('captionPhotoConflictPenalty — drink vs food (AI owns hard reject)', () => {
  it('soft-penalizes cocktail caption vs plated meat — does not hard-veto via keywords', () => {
    expect(
      isHardCaptionPhotoConflict(
        'Yazın serinletici kokteyllerine hazır mısın? Hadi tatlarına bak!',
        'steak meat beef plate dish food grilled herbs fork dining',
      ),
    ).toBe(false);
    const penalty = captionPhotoConflictPenalty(
      'Vibrant cocktail with a refreshing appearance. Serinletici yaz kokteylleri.',
      'food dish plate steak meat roast beef kitchen',
    );
    expect(penalty).toBeGreaterThan(0);
    expect(penalty).toBeLessThan(HARD_CAPTION_PHOTO_CONFLICT);
    expect(themeConflictNeedsAiJudge(
      'Yazın serinletici kokteyllerine hazır mısın?',
      'steak meat beef plate dish food',
    )).toBe(true);
  });

  it('does not penalize cocktail caption against drink photo', () => {
    const penalty = captionPhotoConflictPenalty(
      'Yazın serinletici kokteyllerine hazır mısın?',
      'cocktail drink glass bar beverage ice garnish',
    );
    expect(penalty).toBe(0);
  });

  it('does not hard-veto nightlife photo when caption mentions cocktails (AI theme rule)', () => {
    const nightlifeSearchable = [
      ...(NIGHTLIFE_META.contentTags ?? []),
      NIGHTLIFE_META.description,
      'event_photo energetic feed_post',
    ].join(' ');
    expect(isHardCaptionPhotoConflict(
      'DJ nights with dancing guests enjoying cocktails.',
      nightlifeSearchable,
    )).toBe(false);
    // Cross-theme signal may still ask the judge — nightlife proof + cocktails is OK for AI to accept.
    expect(themeConflictNeedsAiJudge(
      'DJ nights with dancing guests enjoying cocktails.',
      nightlifeSearchable,
    )).toBe(false);
  });
});

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

  it('hard-vetoes DJ caption against décor-only interior (lamp / still-life)', () => {
    expect(
      isHardCaptionPhotoConflict(
        'Hafta sonu bize katıl! Bitez’de en iyi DJ’ler ile doyasıya eğleneceksin.',
        'interior decorative tiffany lamp ceramic pedestal glass jar shelf still life',
      ),
    ).toBe(true);
  });

  it('hard-vetoes seafood caption against empty loungers / closed umbrellas', () => {
    expect(
      isHardCaptionPhotoConflict(
        'Yazın tadını çıkarmak için yeni deniz ürünlerimizde %20 indirim fırsatını kaçırma!',
        'beach lounge sun lounger closed umbrella seating ambiance empty terrace patio',
      ),
    ).toBe(true);
  });

  it('does not hard-veto ambiance photo when caption is venue atmosphere only', () => {
    expect(
      isHardCaptionPhotoConflict(
        'Bitez’de gün batımını izlemeye gelin — sahil atmosferi sizi bekliyor.',
        'beach lounge sun lounger closed umbrella seating ambiance patio',
      ),
    ).toBe(false);
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
    expect(captionRequiresAiGalleryJudge(
      'Dive into the rich flavors of our signature dishes!',
      'Signature Dishes',
    )).toBe(true);
    // Product SKUs are not keyword-listed — gray/mismatch AI path + subject_key own them.
    expect(captionRequiresStrictGalleryMatch(
      'Datça\'nın en özel süzme çiçek balını keşfedin',
      '',
    )).toBe(false);
  });

  it('does not treat kids birthday parti copy as nightlife-strict', () => {
    expect(captionRequiresStrictGalleryMatch(
      'Doğum günü partisi için renkli tema odaları hazır!',
      'Parti Paketi',
    )).toBe(false);
  });
});

describe('kids party captions vs cake/venue photos', () => {
  it('does not hard-veto birthday parti caption against cake table photo', () => {
    expect(
      isHardCaptionPhotoConflict(
        'Doğum günü partisi paketi — pasta masası ve balon süsleme',
        'birthday cake pasta balon decoration kids party table venue_reference',
      ),
    ).toBe(false);
  });
});

describe('captionPhotoConflictPenalty — food/drink vs person-fashion', () => {
  const FASHION_PORTRAIT =
    'woman dress fashion portrait posing outdoor patio evening wear model guest people has_people_flag';
  const FOOD_WITH_GUESTS =
    'food dish plate gourmet pasta dining guests people serving restaurant table';

  it('hard-vetoes signature-dishes caption against fashion portrait (beach_club)', () => {
    const caption =
      'Dive into the rich flavors of our signature dishes at Scorpios Bodrum! Every meal is a celebration of Aegean taste.';
    expect(isHardCaptionPhotoConflict(caption, FASHION_PORTRAIT)).toBe(true);
    expect(captionPhotoConflictPenalty(caption, FASHION_PORTRAIT))
      .toBeGreaterThanOrEqual(HARD_CAPTION_PHOTO_CONFLICT);
    expect(themeConflictNeedsAiJudge(caption, FASHION_PORTRAIT)).toBe(true);
  });

  it('allows plated food with guests in soft background', () => {
    const caption =
      'Şef özel menü ve lezzet dolu tabaklar — imza yemeklerimizi keşfedin.';
    expect(isHardCaptionPhotoConflict(caption, FOOD_WITH_GUESTS)).toBe(false);
  });

  it('hard-vetoes cocktail caption against dress portrait without drink proof', () => {
    expect(
      isHardCaptionPhotoConflict(
        'Yazın serinletici kokteyllerine hazır mısın? Hadi tatlarına bak!',
        FASHION_PORTRAIT,
      ),
    ).toBe(true);
  });

  it('does not hard-veto product SKU captions via keyword lists (AI owns meaning)', () => {
    // Growing bal/zeytinyağı dictionaries is not scalable — subject_key + AI judge.
    expect(
      isHardCaptionPhotoConflict(
        'Datça\'nın en özel süzme çiçek balını keşfedin',
        FASHION_PORTRAIT,
      ),
    ).toBe(false);
    expect(captionRequiresAiGalleryJudge(
      'Datça\'nın en özel süzme çiçek balını keşfedin',
      '',
    )).toBe(false);
  });

  it('matchPhotoToContent never returns fashion for food caption when food exists', () => {
    const fashionUrl = 'https://cdn.example.com/gallery/woman-dress-01.jpg';
    const foodUrl = 'https://cdn.example.com/gallery/food-plate-02.jpg';
    const gallery: Record<string, GalleryPhotoMeta> = {
      [fashionUrl]: {
        contentTags: ['woman', 'dress', 'fashion', 'portrait', 'posing'],
        description: 'Woman in a silk slip dress posing on a patio at golden hour.',
        mood: 'elegant',
        hasPeople: true,
        suggestedAssetType: 'event_photo',
        bestFor: ['lifestyle'],
      },
      [foodUrl]: FOOD_ONLY_META,
    };
    const result = matchPhotoToContent(
      {
        caption:
          'Dive into the rich flavors of our signature dishes! Every meal is a celebration.',
        headline: 'Signature Dishes',
        contentType: 'instagram_post',
        businessType: 'beach_club',
      },
      [fashionUrl, foodUrl],
      gallery,
    );
    expect(result?.url).toBe(foodUrl);
  });

  it('returns null when only fashion photos exist for a food caption', () => {
    const fashionUrl = 'https://cdn.example.com/gallery/woman-dress-02.jpg';
    const result = matchPhotoToContent(
      {
        caption: 'Signature dishes and Aegean flavors on the menu tonight.',
        headline: 'Signature Dishes',
        businessType: 'beach_club',
      },
      [fashionUrl],
      {
        [fashionUrl]: {
          contentTags: ['woman', 'dress', 'fashion', 'portrait'],
          description: 'Fashion portrait of a guest in evening wear.',
          hasPeople: true,
          suggestedAssetType: 'event_photo',
        },
      },
    );
    expect(result).toBeNull();
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

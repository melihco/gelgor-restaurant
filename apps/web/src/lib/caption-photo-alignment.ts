/**
 * Caption ↔ photo alignment helpers.
 * Ideation copy is authoritative — gallery photos are matched TO mission headlines,
 * not the other way around. Do not rewrite headlines from photo vision descriptions.
 */

import {
  matchPhotoToContent,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';

const FOOD_CAPTION_HINTS = [
  'seafood', 'fish', 'shrimp', 'lobster', 'oyster', 'platter', 'dish', 'menu',
  'cuisine', 'meal', 'dining', 'chef', 'kitchen', 'flavor', 'flavour', 'taste the',
  'ocean', 'bounty', 'mediterranean', 'aegean', 'fresh catch', 'savor', 'savour',
  'yemek', 'balık', 'balik', 'deniz', 'ürünü', 'urunu', 'meze', 'tabak', 'menü',
  'menu', 'gastronomi', 'lezzet',
];

const EVENT_PHOTO_HINTS = [
  'wedding', 'bride', 'groom', 'ceremony', 'couple', 'formal', 'gala', 'invitation',
  'düğün', 'dugun', 'gelin', 'damat', 'nisan', 'nişan', 'event dress', 'tuxedo',
  'gown', 'wedding dress',
];

const DRINK_PHOTO_HINTS = [
  'cocktail', 'cocktails', 'drink', 'beverage', 'bar', 'wine', 'champagne', 'beer',
  'kokteyl', 'içecek', 'icecek', 'glass', 'bottle', 'spirits',
];

const NIGHTLIFE_CAPTION_HINTS = [
  'dj', 'dj night', 'dj nights', 'party', 'beach party', 'nightlife', 'night',
  'dance', 'dancing', 'crowd', 'live music', 'concert', 'festival', 'opening night',
  'weekend nights', 'gece', 'geceleri', 'parti', 'dans', 'kalabalık', 'canlı müzik',
  'etkinlik', 'organizasyon', 'sahne', 'hafta sonu',
];

const NIGHTLIFE_PHOTO_HINTS = [
  'dj', 'stage', 'dance', 'dancing', 'crowd', 'concert', 'performance', 'party',
  'night', 'lights', 'neon', 'festival', 'event', 'celebration', 'people',
  'group', 'live music', 'sahne', 'dans', 'kalabalık', 'parti', 'gece',
];

const PEOPLE_EVENT_PHOTO_HINTS = [
  'people', 'person', 'crowd', 'group', 'guest', 'guests', 'audience',
  'dancing', 'dance', 'celebration', 'event', 'party', 'festival',
  'insan', 'kalabalık', 'misafir', 'dans',
];

const FOOD_PHOTO_HINTS = [
  'food', 'dish', 'plate', 'meal', 'seafood', 'fish', 'cuisine', 'menu', 'chef',
  'kitchen', 'yemek', 'tabak', 'balık', 'deniz', 'platter', 'serving', 'dessert',
  'pasta', 'steak', 'sushi',
];

// ── Beauty sub-service clusters ────────────────────────────────────────────
// Each cluster: caption signals → exclusive photo signals they conflict with.
// A nail caption should NOT match a lash/hair photo, and vice versa.

const BEAUTY_NAIL_CAPTION = [
  'nail', 'tırnak', 'tirnak', 'manikür', 'manikyur', 'manicure',
  'pedikür', 'pedikyur', 'pedicure', 'oje', 'nail art', 'kalıcı oje',
  'kali oje', 'jel tırnak', 'protez tırnak', 'nail studio',
];

const BEAUTY_LASH_PHOTO = [
  'lash', 'kirpik', 'eyelash', 'lash extension', 'kirpik uzatma',
  'ipek kirpik', 'lash lift', 'kirpik perma', 'brow lamination',
];

const BEAUTY_HAIR_PHOTO = [
  'hair', 'saç', 'sac', 'haircut', 'hairstyle', 'blowout', 'balayage',
  'highlight', 'saç kesim', 'saç boyama', 'keratin', 'fön', 'kuaförlük',
];

const BEAUTY_LASH_CAPTION = [
  'lash', 'kirpik', 'eyelash', 'ipek kirpik', 'lash lift', 'kirpik uzatma',
  'kirpik perma', 'brow lamination', 'kaş tasarım', 'kas tasarim',
];

const BEAUTY_HAIR_CAPTION = [
  'hair', 'saç', 'sac', 'haircut', 'hairstyle', 'balayage', 'highlight',
  'saç kesim', 'saç boyama', 'keratin', 'fön',
];

const BEAUTY_NAIL_PHOTO = [
  'nail', 'tırnak', 'tirnak', 'manikür', 'manikyur', 'oje', 'nail art',
  'nail polish', 'jel tırnak', 'protez tırnak',
];

function textHits(text: string, hints: string[]): number {
  const lower = text.toLowerCase();
  return hints.filter(h => lower.includes(h)).length;
}

/** Penalty applied inside gallery-photo-matcher scoring (0 = no conflict). */
export function captionPhotoConflictPenalty(
  captionText: string,
  photoSearchable: string,
): number {
  const caption = captionText.toLowerCase();
  const photo = photoSearchable.toLowerCase();
  const captionFood = textHits(caption, FOOD_CAPTION_HINTS);
  const captionNightlife = textHits(caption, NIGHTLIFE_CAPTION_HINTS);
  const photoFood = textHits(photo, FOOD_PHOTO_HINTS);
  const photoEvent = textHits(photo, EVENT_PHOTO_HINTS);
  const photoDrink = textHits(photo, DRINK_PHOTO_HINTS);
  const photoNightlife = textHits(photo, NIGHTLIFE_PHOTO_HINTS);
  const photoPeopleEvent = textHits(photo, PEOPLE_EVENT_PHOTO_HINTS);

  if (captionFood >= 2 && photoEvent >= 1 && photoFood === 0) {
    return 48;
  }
  if (captionFood >= 2 && photoDrink >= 2 && photoFood === 0) {
    return 42;
  }
  if (captionFood >= 1 && photoDrink >= 1 && photoFood === 0 && photoEvent === 0) {
    return 28;
  }
  const emptyVenue =
    (photo.includes('interior') || photo.includes('seating') || photo.includes('booth')
      || photo.includes('lounge') || photo.includes('restaurant'))
    && photoFood === 0;
  if (captionFood >= 2 && emptyVenue) {
    return 22;
  }

  // Nightlife / DJ / party captions should not land on food-only hero shots.
  const foodDominantPhoto =
    photoFood >= 2
    || (photoFood >= 1 && photoDrink >= 1);
  const nightlifeProofMissing =
    photoNightlife === 0 && photoPeopleEvent === 0 && photoEvent === 0;
  if (captionNightlife >= 2 && foodDominantPhoto && nightlifeProofMissing) {
    return 56;
  }
  if (captionNightlife >= 3 && photoDrink >= 1 && nightlifeProofMissing) {
    return 34;
  }

  // ── Beauty sub-service cross-service conflict ────────────────────────────
  // Nail caption + lash/hair photo → strong mismatch
  const captionNail = textHits(caption, BEAUTY_NAIL_CAPTION);
  const captionLash = textHits(caption, BEAUTY_LASH_CAPTION);
  const captionHair = textHits(caption, BEAUTY_HAIR_CAPTION);
  const photoNail = textHits(photo, BEAUTY_NAIL_PHOTO);
  const photoLash = textHits(photo, BEAUTY_LASH_PHOTO);
  const photoHair = textHits(photo, BEAUTY_HAIR_PHOTO);

  // Nail caption but photo is lash-dominant and has no nail signals
  if (captionNail >= 1 && photoLash >= 1 && photoNail === 0) {
    return 45;
  }
  // Nail caption but photo is hair-dominant and has no nail signals
  if (captionNail >= 1 && photoHair >= 2 && photoNail === 0) {
    return 38;
  }
  // Lash caption but photo is nail-dominant and has no lash signals
  if (captionLash >= 1 && photoNail >= 1 && photoLash === 0) {
    return 40;
  }
  // Hair caption but photo is nail-dominant
  if (captionHair >= 2 && photoNail >= 1 && photoHair === 0) {
    return 35;
  }

  return 0;
}

function resolveMetaForUrl(
  photoUrl: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): GalleryPhotoMeta | undefined {
  const base = normalizeGalleryUrl(photoUrl);
  for (const [key, meta] of Object.entries(galleryAnalysis)) {
    if (normalizeGalleryUrl(key) === base) return meta;
  }
  return undefined;
}

import {
  buildInstagramCaptionFromGalleryMeta,
  isVisionAnalysisDescription,
} from '@/lib/feed-display-caption';

/** Build Instagram copy from gallery meta — hooks/mood TR; vision description → prompts only. */
export function buildCaptionFromPhotoMeta(
  meta: GalleryPhotoMeta | undefined,
  brandName: string,
  location?: string,
): { caption: string; headline: string; sceneDescription: string } {
  const raw = meta as GalleryPhotoMeta & Record<string, unknown> | undefined;
  const built = buildInstagramCaptionFromGalleryMeta(
    raw as Record<string, unknown> | undefined,
    brandName,
    location,
  );
  const desc = meta?.description?.trim() ?? '';
  if (desc && isVisionAnalysisDescription(desc) && built.caption) {
    return {
      caption: built.caption,
      headline: built.headline,
      sceneDescription: desc,
    };
  }
  return {
    caption: built.caption,
    headline: built.headline,
    sceneDescription: built.sceneDescription || desc,
  };
}

/** Score how well a gallery photo supports mission ideation copy (no text rewrite). */
export function scoreIdeationPhotoMatch(params: {
  caption: string;
  headline: string;
  photoUrl: string;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  businessType?: string;
  mood?: string;
  contentType?: string;
  storySequenceRole?: 'hook' | 'proof' | 'cta';
}): number {
  const match = matchPhotoToContent(
    {
      caption: params.caption,
      headline: params.headline,
      mood: params.mood,
      contentType: params.contentType,
      businessType: params.businessType,
      storySequenceRole: params.storySequenceRole,
    },
    [params.photoUrl],
    params.galleryAnalysis,
    { minScore: 0 },
  );
  return match?.score ?? 0;
}

/**
 * @deprecated Prefer scoreIdeationPhotoMatch — never overwrites ideation headline/caption.
 */
export function alignCaptionToSelectedPhoto(params: {
  caption: string;
  headline: string;
  photoUrl: string;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  brandName: string;
  location?: string;
  businessType?: string;
  minAlignScore?: number;
}): {
  caption: string;
  headline: string;
  matchScore: number;
  aligned: boolean;
  alignReason?: string;
} {
  const score = scoreIdeationPhotoMatch({
    caption: params.caption,
    headline: params.headline,
    photoUrl: params.photoUrl,
    galleryAnalysis: params.galleryAnalysis,
    businessType: params.businessType,
  });

  return {
    caption: params.caption,
    headline: params.headline,
    matchScore: score,
    aligned: false,
  };
}

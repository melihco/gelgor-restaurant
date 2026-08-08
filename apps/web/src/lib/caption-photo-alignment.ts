/**
 * Caption ↔ photo alignment helpers.
 *
 * Architecture (multi-tenant, sector-agnostic):
 * - Keyword lists below are MINIMAL CATEGORY TRIGGERS only — not sector/SKU
 *   dictionaries. Do not grow them with shrimp/aegean/honey-jar synonyms.
 * - Meaning ("which gallery photo fits this caption?") is owned by
 *   `gallery-ai-match-judge` (+ vision) and ideation `subject_key` /
 *   vision `primary_subject`.
 * - Hard vetoes cover only universal category collisions
 *   (nightlife↔food, food/drink↔fashion-only, empty venue under food/nightlife).
 * - Concrete product SKUs (bal ↔ zeytinyağı) live in subject clusters /
 *   the AI judge — not in expanding hint arrays here.
 *
 * Ideation copy is authoritative — gallery photos are matched TO mission
 * headlines, not the other way around.
 */

import {
  matchPhotoToContent,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';

/** Minimal food-topic trigger — one hit is enough to route to AI / hard gates. */
const FOOD_CAPTION_TRIGGERS = [
  'dish', 'dishes', 'food', 'meal', 'menu', 'menü', 'cuisine', 'chef', 'dining',
  'yemek', 'tabak', 'lezzet', 'meze', 'flavor', 'flavour', 'platter', 'seafood',
  'deniz ürün', 'deniz urun', 'kahvaltı', 'kahvalti', 'brunch', 'breakfast',
];

/** Minimal drink-topic trigger. */
const DRINK_CAPTION_TRIGGERS = [
  'cocktail', 'cocktails', 'kokteyl', 'mocktail', 'drink', 'drinks',
  'wine', 'champagne', 'beer', 'içecek', 'icecek', 'happy hour',
];

/** Drink proof on a photo (not caption). */
const DRINK_PHOTO_PROOF = [
  'cocktail', 'drink', 'beverage', 'wine', 'champagne', 'beer',
  'kokteyl', 'içecek', 'icecek', 'mocktail', 'glass', 'bar',
];

/** Soft meat-plate cues — drink↔steak stays soft (AI owns reject). */
const MEAT_FOOD_PHOTO_HINTS = [
  'steak', 'meat', 'beef', 'lamb', 'grill', 'bbq', 'roast', 'burger',
  'ızgara', 'izgara', 'biftek', 'kebap', 'kebab',
];

/**
 * Nightlife trigger — NOT bare "parti"/"party" (kids birthday false-positive).
 * Avoid vague stems like bare "gece" / "performans".
 */
const NIGHTLIFE_CAPTION_TRIGGERS = [
  'dj', 'nightlife', 'dancing', 'dance', 'live music', 'concert', 'lineup',
  'beach party', 'club night', 'nightclub', 'party night', 'after party',
  'canlı müzik', 'gece parti', 'parti gecesi', 'dans',
];

/** Hard nightlife proof on a photo — people/crowd alone is not enough. */
const NIGHTLIFE_HARD_PHOTO_PROOF = [
  'dj', 'stage', 'dancing', 'dance', 'concert', 'nightlife', 'neon',
  'live music', 'sahne', 'dans', 'nightclub', 'club night', 'dancefloor',
  'dance floor', 'party crowd',
];

/** Plated / prepared food proof on a photo. */
const FOOD_PHOTO_PROOF = [
  'food', 'dish', 'plate', 'meal', 'cuisine', 'menu', 'chef', 'kitchen',
  'yemek', 'tabak', 'platter', 'pasta', 'seafood', 'meze', 'dessert',
  'breakfast', 'brunch', 'kahvaltı', 'kahvalti', 'serving',
];

/** Empty venue / lounge-only — must not ship under food or DJ captions. */
const EMPTY_VENUE_PHOTO_HINTS = [
  'interior', 'seating', 'lounge', 'lounger', 'sunbed', 'sun lounger',
  'empty terrace', 'empty venue', 'ambiance', 'ambience', 'şezlong', 'sezlong',
  'patio', 'closed umbrella',
];

const DECOR_ONLY_PHOTO_HINTS = [
  'lamp', 'tiffany', 'vase', 'decor', 'décor', 'still life', 'still-life',
  'ceramic', 'decorative', 'pedestal', 'stained glass', 'stained-glass',
];

/**
 * Fashion / portrait on the photo — not "guests dining with plates".
 * Hard-vetoes food/drink captions that lack plated-food or drink proof.
 */
const PERSON_FASHION_PHOTO_HINTS = [
  'dress', 'gown', 'fashion', 'model', 'posing', 'pose', 'portrait',
  'lookbook', 'runway', 'elbise', 'portre', 'moda', 'woman in', 'man in',
];

/** Human-subject signals (vision tags / hasPeople flag). */
const PERSON_SUBJECT_PHOTO_HINTS = [
  'woman', 'man', 'girl', 'boy', 'person', 'people', 'guest', 'guests',
  'model', 'portrait', 'selfie', 'couple', 'posing',
  'kadın', 'kadin', 'erkek', 'misafir', 'has_people_flag',
];

/** Penalty at/above this is a hard veto — photo must never ship for that caption. */
export const HARD_CAPTION_PHOTO_CONFLICT = 40;

// ── Beauty sub-service clusters (closed taxonomy — keep small) ─────────────

const BEAUTY_NAIL_CAPTION = [
  'nail', 'tırnak', 'tirnak', 'manikür', 'manikyur', 'manicure',
  'pedikür', 'pedikyur', 'pedicure', 'oje', 'nail art',
];

const BEAUTY_LASH_PHOTO = [
  'lash', 'kirpik', 'eyelash', 'lash extension', 'ipek kirpik', 'lash lift',
];

const BEAUTY_HAIR_PHOTO = [
  'hair', 'saç', 'sac', 'haircut', 'hairstyle', 'balayage', 'saç kesim',
];

const BEAUTY_LASH_CAPTION = [
  'lash', 'kirpik', 'eyelash', 'ipek kirpik', 'lash lift', 'kirpik uzatma',
];

const BEAUTY_HAIR_CAPTION = [
  'hair', 'saç', 'sac', 'haircut', 'hairstyle', 'balayage', 'saç kesim',
];

const BEAUTY_NAIL_PHOTO = [
  'nail', 'tırnak', 'tirnak', 'manikür', 'oje', 'nail art', 'nail polish',
];

function textHits(text: string, hints: string[]): number {
  const lower = text.toLowerCase();
  return hints.filter(h => lower.includes(h)).length;
}

/** Flatten gallery meta (+ optional URL) for conflict scoring. */
export function buildGalleryPhotoSearchable(
  meta: GalleryPhotoMeta | undefined,
  url?: string,
): string {
  if (!meta && !url) return '';
  const urlTokens = url
    ? url
      .split(/[/_.-]+/)
      .map((t) => t.replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, ''))
      .filter((t) => t.length >= 3)
      .join(' ')
    : '';
  return [
    ...(meta?.contentTags ?? []),
    ...(meta?.captionHooks ?? []),
    ...(meta?.pairingKeywords ?? []),
    meta?.description ?? '',
    meta?.usageContext ?? '',
    meta?.mood ?? '',
    ...(meta?.bestFor ?? []),
    meta?.suggestedAssetType ?? '',
    meta?.primarySubject ? meta.primarySubject.replace(/_/g, ' ') : '',
    ...((meta?.subjectAliases ?? []).map((a) => String(a).replace(/_/g, ' '))),
    meta?.subjectFamily ? meta.subjectFamily.replace(/_/g, ' ') : '',
    meta?.visibleLabelText ?? '',
    // Explicit people flag from vision — feeds food↔person hard veto without
    // relying only on free-text descriptions.
    meta?.hasPeople === true ? 'has_people_flag person people guest' : '',
    urlTokens,
    url ?? '',
  ].join(' ').toLowerCase();
}

/** True when penalty is severe enough that the pair must never produce. */
export function isHardCaptionPhotoConflict(
  captionText: string,
  photoSearchable: string,
): boolean {
  return captionPhotoConflictPenalty(captionText, photoSearchable) >= HARD_CAPTION_PHOTO_CONFLICT;
}

/**
 * Captions that must never accept relaxed / diversity gallery fallbacks.
 * Uses minimal category triggers only — SKU meaning belongs to subject_key + AI.
 */
export function captionRequiresStrictGalleryMatch(
  caption: string,
  headline = '',
): boolean {
  const text = `${caption} ${headline}`.toLowerCase();
  if (textHits(text, NIGHTLIFE_CAPTION_TRIGGERS) >= 1) return true;
  if (textHits(text, DRINK_CAPTION_TRIGGERS) >= 1) return true;
  if (textHits(text, FOOD_CAPTION_TRIGGERS) >= 1) return true;
  if (textHits(text, BEAUTY_NAIL_CAPTION) >= 1) return true;
  if (textHits(text, BEAUTY_LASH_CAPTION) >= 1) return true;
  if (textHits(text, BEAUTY_HAIR_CAPTION) >= 1) return true;
  return false;
}

/**
 * Captions that must always go through the AI gallery picker (meaning gate).
 * Minimal category triggers only (food/drink/nightlife/beauty).
 *
 * Product SKUs / arbitrary subjects are NOT keyword-listed here — they rely on
 * ideation `subject_key` + vision `primary_subject` alignment and the gray-zone
 * AI path in `gallery-ai-match-judge` (misaligned / sub-threshold → judge).
 * Never grow hint arrays for new sectors or SKUs.
 */
export function captionRequiresAiGalleryJudge(
  caption: string,
  headline = '',
  _opts?: { subjectKey?: string | null },
): boolean {
  void _opts;
  return captionRequiresStrictGalleryMatch(caption, headline);
}

/**
 * Vision `suggestedAssetType` slugs like `food_drink_photo` contain the
 * substring "drink" and must not count as drink-hero proof.
 */
function photoBodyForThemeHints(photoSearchable: string): string {
  return photoSearchable
    .toLowerCase()
    .replace(/\bfood_drink_photo\b/g, 'food_photo')
    .replace(/\bevent_photo\b/g, 'event')
    .replace(/\bbrand_background\b/g, 'background');
}

/**
 * Cheap cross-category signal used ONLY to trigger the AI gallery judge.
 * Meaning for arbitrary captions belongs to the judge + canonical subject.
 */
export function themeConflictNeedsAiJudge(
  captionText: string,
  photoSearchable: string,
): boolean {
  const caption = captionText.toLowerCase();
  const photo = photoBodyForThemeHints(photoSearchable);
  const captionFood = textHits(caption, FOOD_CAPTION_TRIGGERS);
  const captionNightlife = textHits(caption, NIGHTLIFE_CAPTION_TRIGGERS);
  const captionDrink = textHits(caption, DRINK_CAPTION_TRIGGERS);
  const photoFood = textHits(photo, FOOD_PHOTO_PROOF);
  const photoDrink = textHits(photo, DRINK_PHOTO_PROOF);
  const photoNightlifeHard = textHits(photo, NIGHTLIFE_HARD_PHOTO_PROOF);
  const captionNail = textHits(caption, BEAUTY_NAIL_CAPTION);
  const captionLash = textHits(caption, BEAUTY_LASH_CAPTION);
  const captionHair = textHits(caption, BEAUTY_HAIR_CAPTION);
  const photoNail = textHits(photo, BEAUTY_NAIL_PHOTO);
  const photoLash = textHits(photo, BEAUTY_LASH_PHOTO);
  const photoHair = textHits(photo, BEAUTY_HAIR_PHOTO);

  const photoEmptyVenue = textHits(photo, EMPTY_VENUE_PHOTO_HINTS);
  const photoDecorOnly = textHits(photo, DECOR_ONLY_PHOTO_HINTS);
  const photoPersonFashion = textHits(photo, PERSON_FASHION_PHOTO_HINTS);
  const photoPersonSubject = textHits(photo, PERSON_SUBJECT_PHOTO_HINTS);
  const personDominantNoProduct =
    photoFood === 0
    && photoDrink === 0
    && (
      (photoPersonFashion >= 1 && photoPersonSubject >= 1)
      || photoPersonFashion >= 2
      || photoPersonSubject >= 2
    );

  if (captionNightlife >= 1 && photoFood >= 1) return true;
  if (captionFood >= 1 && photoNightlifeHard >= 1) return true;
  if (captionDrink >= 1 && photoFood >= 1 && photoDrink === 0) return true;
  if (captionNightlife >= 1 && photoDrink >= 1 && photoNightlifeHard === 0) return true;
  if (captionFood >= 1 && personDominantNoProduct) return true;
  if (captionDrink >= 1 && personDominantNoProduct) return true;
  if (
    (captionNightlife >= 1 || captionFood >= 1 || captionDrink >= 1)
    && (photoEmptyVenue >= 1 || photoDecorOnly >= 1)
    && photoFood === 0
    && photoNightlifeHard === 0
    && (photoDrink === 0 || photoDecorOnly >= 1)
  ) {
    return true;
  }
  if (captionNail >= 1 && (photoLash >= 1 || photoHair >= 1) && photoNail === 0) return true;
  if (captionLash >= 1 && (photoNail >= 1 || photoHair >= 1) && photoLash === 0) return true;
  if (captionHair >= 1 && (photoNail >= 1 || photoLash >= 1) && photoHair === 0) return true;
  return false;
}

/**
 * Deterministic conflict scoring.
 *
 * Hard vetoes: nightlife ↔ plated-food, food/drink ↔ person-fashion-only,
 * and food/drink/nightlife ↔ empty venue / décor-only frames.
 * Product SKUs and gray beauty cases stay soft — AI judge owns those rejects.
 */
export function captionPhotoConflictPenalty(
  captionText: string,
  photoSearchable: string,
): number {
  const caption = captionText.toLowerCase();
  const photo = photoBodyForThemeHints(photoSearchable);
  const captionFood = textHits(caption, FOOD_CAPTION_TRIGGERS);
  const captionNightlife = textHits(caption, NIGHTLIFE_CAPTION_TRIGGERS);
  const captionDrink = textHits(caption, DRINK_CAPTION_TRIGGERS);
  const photoFood = textHits(photo, FOOD_PHOTO_PROOF);
  const photoDrink = textHits(photo, DRINK_PHOTO_PROOF);
  const photoNightlifeHard = textHits(photo, NIGHTLIFE_HARD_PHOTO_PROOF);
  const photoMeat = textHits(photo, MEAT_FOOD_PHOTO_HINTS);

  const photoEmptyVenue = textHits(photo, EMPTY_VENUE_PHOTO_HINTS);
  const photoDecorOnly = textHits(photo, DECOR_ONLY_PHOTO_HINTS);
  const photoPersonFashion = textHits(photo, PERSON_FASHION_PHOTO_HINTS);
  const photoPersonSubject = textHits(photo, PERSON_SUBJECT_PHOTO_HINTS);
  // Person/fashion dominant with zero food/drink proof — dining-with-guests
  // (photoFood ≥ 1) and bartender-with-glass (photoDrink ≥ 1) stay allowed.
  const personDominantNoProduct =
    photoFood === 0
    && photoDrink === 0
    && (
      (photoPersonFashion >= 1 && photoPersonSubject >= 1)
      || photoPersonFashion >= 2
      || photoPersonSubject >= 2
    );
  // Décor still-lifes often mention "glass jar" — bare glass/bottle must not
  // count as cocktail proof that cancels the empty/décor hard veto.
  const emptyOrDecorOnly =
    (photoEmptyVenue >= 1 || photoDecorOnly >= 1)
    && photoFood === 0
    && photoNightlifeHard === 0
    && (photoDrink === 0 || photoDecorOnly >= 1);

  // ── Hard (universal category collisions) ─────────────────────────────────
  if (captionNightlife >= 1 && photoFood >= 1 && photoNightlifeHard === 0) {
    return captionNightlife >= 2 ? 80 : 72;
  }
  if (captionFood >= 1 && photoNightlifeHard >= 1 && photoFood === 0) {
    return 64;
  }
  // Food / drink must never ship a fashion-portrait-only frame.
  if (captionFood >= 1 && personDominantNoProduct) {
    return 74;
  }
  if (captionDrink >= 1 && personDominantNoProduct) {
    return 68;
  }
  // Empty lounge / décor still-life under food, drink, or nightlife copy.
  if (captionNightlife >= 1 && emptyOrDecorOnly) {
    return captionNightlife >= 2 ? 78 : 70;
  }
  if (captionFood >= 1 && emptyOrDecorOnly) {
    return 68;
  }
  if (captionDrink >= 1 && emptyOrDecorOnly && photoDecorOnly >= 1) {
    return 62;
  }
  if (captionDrink >= 1 && emptyOrDecorOnly && photoEmptyVenue >= 1 && photoDrink === 0) {
    return 62;
  }

  // ── Soft (AI judge owns hard reject) ─────────────────────────────────────
  let soft = 0;
  if (captionDrink >= 1 && photoFood >= 1 && photoDrink === 0) {
    soft = Math.max(soft, 28);
  }
  if (captionDrink >= 1 && photoMeat >= 1 && photoDrink === 0) {
    soft = Math.max(soft, 28);
  }
  if (captionNightlife >= 1 && photoDrink >= 1 && photoNightlifeHard === 0 && photoFood === 0) {
    soft = Math.max(soft, 24);
  }
  if (captionFood >= 1 && photoDrink >= 2 && photoFood === 0) {
    soft = Math.max(soft, 26);
  }

  const captionNail = textHits(caption, BEAUTY_NAIL_CAPTION);
  const captionLash = textHits(caption, BEAUTY_LASH_CAPTION);
  const captionHair = textHits(caption, BEAUTY_HAIR_CAPTION);
  const photoNail = textHits(photo, BEAUTY_NAIL_PHOTO);
  const photoLash = textHits(photo, BEAUTY_LASH_PHOTO);
  const photoHair = textHits(photo, BEAUTY_HAIR_PHOTO);

  if (captionNail >= 1 && photoLash >= 1 && photoNail === 0) soft = Math.max(soft, 32);
  if (captionNail >= 1 && photoHair >= 1 && photoNail === 0) soft = Math.max(soft, 30);
  if (captionLash >= 1 && photoNail >= 1 && photoLash === 0) soft = Math.max(soft, 30);
  if (captionHair >= 1 && photoNail >= 1 && photoHair === 0) soft = Math.max(soft, 28);

  return Math.min(soft, HARD_CAPTION_PHOTO_CONFLICT - 1);
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
  /** Canonical product subject from ideation — SSOT for product↔photo matching. */
  subjectKey?: string;
  visualDirection?: string;
  strategicPurpose?: string;
}): number {
  const match = matchPhotoToContent(
    {
      caption: params.caption,
      headline: params.headline,
      mood: params.mood,
      contentType: params.contentType,
      businessType: params.businessType,
      storySequenceRole: params.storySequenceRole,
      subjectKey: params.subjectKey,
      visualDirection: params.visualDirection,
      strategicPurpose: params.strategicPurpose,
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

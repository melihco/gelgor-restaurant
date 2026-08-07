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
  'yemek', 'balık', 'balik', 'deniz ürün', 'deniz urun', 'ürünü', 'urunu',
  'ürünler', 'urunler', 'meze', 'tabak', 'menü', 'menu', 'gastronomi', 'lezzet',
  'deniz', // keep last among TR food stems — pairs with ürün* for seafood captions
];

const EVENT_PHOTO_HINTS = [
  'wedding', 'bride', 'groom', 'ceremony', 'couple', 'formal', 'gala', 'invitation',
  'düğün', 'dugun', 'gelin', 'damat', 'nisan', 'nişan', 'event dress', 'tuxedo',
  'gown', 'wedding dress',
];

const DRINK_PHOTO_HINTS = [
  'cocktail', 'cocktails', 'drink', 'beverage', 'bar', 'wine', 'champagne', 'beer',
  'kokteyl', 'içecek', 'icecek', 'glass', 'bottle', 'spirits', 'mocktail', 'aperol',
];

/** Caption / tagline signals that the on-canvas topic is drink/cocktail (not plated food). */
const DRINK_CAPTION_HINTS = [
  'cocktail', 'cocktails', 'kokteyl', 'kokteyller', 'mocktail', 'drink', 'drinks',
  'beverage', 'bar', 'wine', 'champagne', 'beer', 'içecek', 'icecek', 'aperitif',
  'serinletici', 'serinletici yaz', 'happy hour',
];

const MEAT_FOOD_PHOTO_HINTS = [
  'steak', 'meat', 'beef', 'lamb', 'grill', 'bbq', 'roast', 'burger', 'ızgara',
  'izgara', 'biftek', 'kırmızı et', 'kirmizi et', 'kebap', 'kebab', 'pirzola',
  // Bare "et" is too short for includes() — it false-positives inside event_photo /
  // energetic / announcement. Match as a word only via spaced tokens below.
  ' et ', ' et,', ' et.',
];

/**
 * Cross-category nightlife intent (DJ / club night / live music) — NOT kids
 * birthday "parti" / generic celebration copy. Bare `parti`/`party` false-positives
 * kids_party_venue captions and hard-vetoes cake/venue gallery photos.
 */
const NIGHTLIFE_CAPTION_HINTS = [
  'dj', 'dj night', 'dj nights', 'beach party', 'nightlife',
  'dance', 'dancing', 'live music', 'concert', 'festival', 'opening night',
  'weekend nights', 'gece', 'geceleri', 'gece parti', 'parti gecesi',
  'dans', 'canlı müzik', 'sahne', 'performans', 'lineup', 'after party',
  'club night', 'nightclub', 'party night',
];

/**
 * Hard nightlife proof on a photo — generic "people/crowd/event" alone is NOT enough
 * (food plating metas often include guest/people and were escaping the veto).
 */
const NIGHTLIFE_HARD_PHOTO_HINTS = [
  'dj', 'stage', 'dance', 'dancing', 'concert', 'performance', 'nightlife',
  'neon', 'festival', 'live music', 'sahne', 'dans', 'nightclub', 'club night',
  'beach party', 'party crowd', 'dancefloor', 'dance floor',
];

/** Plated / prepared food proof (category, not a brand scenario). */
const FOOD_PHOTO_HINTS = [
  'food', 'dish', 'plate', 'meal', 'seafood', 'fish', 'cuisine', 'menu', 'chef',
  'kitchen', 'yemek', 'tabak', 'balık', 'deniz', 'platter', 'serving', 'dessert',
  'pasta', 'steak', 'sushi', 'soup', 'bowl', 'gazpacho', 'meze',
  'breakfast', 'brunch', 'kahvaltı', 'kahvalti',
];

/**
 * Empty venue / décor / lounge-only frames — no plated food, no nightlife subject.
 * Soft ambiance affinity often boosts these for beach_club; they must not ship
 * under food or DJ captions.
 */
const EMPTY_VENUE_PHOTO_HINTS = [
  'interior', 'seating', 'booth', 'lounge', 'lounger', 'sunbed', 'sun bed',
  'sun lounger', 'umbrella', 'closed umbrella', 'empty terrace', 'empty venue',
  'ambiance', 'ambience', 'furniture', 'şezlong', 'sezlong', 'şezlonglar',
  'patio', 'deck chairs', 'beach chairs',
];

const DECOR_ONLY_PHOTO_HINTS = [
  'lamp', 'tiffany', 'vase', 'jar', 'decor', 'décor', 'ornament', 'still life',
  'still-life', 'ceramic', 'shelf detail', 'wall art', 'interior detail',
  'decorative', 'pedestal', 'stained glass', 'stained-glass',
];

/** Penalty at/above this is a hard veto — photo must never ship for that caption. */
export const HARD_CAPTION_PHOTO_CONFLICT = 40;

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

/** Named local-product SKUs — carousel/feed must not cross-match (bal ↔ zeytinyağı). */
const LOCAL_PRODUCT_CAPTION_HINTS = [
  'bal', 'honey', 'petek', 'süzme bal', 'suzme bal', 'çiçek balı', 'cicek bali',
  'zeytinyağı', 'zeytinyagi', 'zeytin yagi', 'olive oil', 'extra virgin', 'sızma', 'sizma',
  'reçel', 'recel', 'pekmez', 'incir', 'kayısı', 'kayisi', 'badem', 'ceviz', 'fındık', 'findik',
  'tarhana', 'salça', 'salca', 'turşu', 'tursu', 'peynir', 'tahin', 'keçiboynuzu', 'keciboynuzu',
];

const BEAUTY_NAIL_PHOTO = [
  'nail', 'tırnak', 'tirnak', 'manikür', 'manikyur', 'oje', 'nail art',
  'nail polish', 'jel tırnak', 'protez tırnak',
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
 * Captions that must never accept relaxed / diversity gallery fallbacks
 * (nightlife, explicit beauty service, strong food/menu).
 */
export function captionRequiresStrictGalleryMatch(
  caption: string,
  headline = '',
): boolean {
  const text = `${caption} ${headline}`.toLowerCase();
  if (textHits(text, NIGHTLIFE_CAPTION_HINTS) >= 1) return true;
  if (textHits(text, DRINK_CAPTION_HINTS) >= 1) return true;
  if (textHits(text, FOOD_CAPTION_HINTS) >= 2) return true;
  if (textHits(text, BEAUTY_NAIL_CAPTION) >= 1) return true;
  if (textHits(text, BEAUTY_LASH_CAPTION) >= 1) return true;
  if (textHits(text, BEAUTY_HAIR_CAPTION) >= 2) return true;
  if (textHits(text, LOCAL_PRODUCT_CAPTION_HINTS) >= 1) return true;
  return false;
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
 * Meaning for arbitrary captions belongs to the judge + canonical subject —
 * not venue/campaign keyword lists.
 */
export function themeConflictNeedsAiJudge(
  captionText: string,
  photoSearchable: string,
): boolean {
  const caption = captionText.toLowerCase();
  const photo = photoBodyForThemeHints(photoSearchable);
  const captionFood = textHits(caption, FOOD_CAPTION_HINTS);
  const captionNightlife = textHits(caption, NIGHTLIFE_CAPTION_HINTS);
  const captionDrink = textHits(caption, DRINK_CAPTION_HINTS);
  const photoFood = textHits(photo, FOOD_PHOTO_HINTS);
  const photoDrink = textHits(photo, DRINK_PHOTO_HINTS);
  const photoNightlifeHard = textHits(photo, NIGHTLIFE_HARD_PHOTO_HINTS);
  const captionNail = textHits(caption, BEAUTY_NAIL_CAPTION);
  const captionLash = textHits(caption, BEAUTY_LASH_CAPTION);
  const captionHair = textHits(caption, BEAUTY_HAIR_CAPTION);
  const photoNail = textHits(photo, BEAUTY_NAIL_PHOTO);
  const photoLash = textHits(photo, BEAUTY_LASH_PHOTO);
  const photoHair = textHits(photo, BEAUTY_HAIR_PHOTO);

  const photoEmptyVenue = textHits(photo, EMPTY_VENUE_PHOTO_HINTS);
  const photoDecorOnly = textHits(photo, DECOR_ONLY_PHOTO_HINTS);

  if (captionNightlife >= 1 && photoFood >= 1) return true;
  if (captionFood >= 2 && photoNightlifeHard >= 1) return true;
  if (captionDrink >= 1 && photoFood >= 1 && photoDrink === 0) return true;
  if (captionNightlife >= 1 && photoDrink >= 1 && photoNightlifeHard === 0) return true;
  if (
    (captionNightlife >= 1 || captionFood >= 2 || captionDrink >= 1)
    && (photoEmptyVenue >= 1 || photoDecorOnly >= 1)
    && photoFood === 0
    && photoNightlifeHard === 0
    && (photoDrink === 0 || photoDecorOnly >= 1)
  ) {
    return true;
  }
  if (captionNail >= 1 && (photoLash >= 1 || photoHair >= 1) && photoNail === 0) return true;
  if (captionLash >= 1 && (photoNail >= 1 || photoHair >= 1) && photoLash === 0) return true;
  if (captionHair >= 2 && (photoNail >= 1 || photoLash >= 1) && photoHair === 0) return true;
  return false;
}

/**
 * Deterministic conflict scoring.
 *
 * Hard vetoes: nightlife ↔ plated-food, and food/drink/nightlife ↔ empty
 * venue / décor-only frames. Beauty gray cases stay soft (< HARD) — the AI
 * gallery judge owns those rejects.
 */
export function captionPhotoConflictPenalty(
  captionText: string,
  photoSearchable: string,
): number {
  const caption = captionText.toLowerCase();
  const photo = photoBodyForThemeHints(photoSearchable);
  const captionFood = textHits(caption, FOOD_CAPTION_HINTS);
  const captionNightlife = textHits(caption, NIGHTLIFE_CAPTION_HINTS);
  const captionDrink = textHits(caption, DRINK_CAPTION_HINTS);
  const photoFood = textHits(photo, FOOD_PHOTO_HINTS);
  const photoDrink = textHits(photo, DRINK_PHOTO_HINTS);
  const photoNightlifeHard = textHits(photo, NIGHTLIFE_HARD_PHOTO_HINTS);
  const photoMeat = textHits(photo, MEAT_FOOD_PHOTO_HINTS);

  const photoEmptyVenue = textHits(photo, EMPTY_VENUE_PHOTO_HINTS);
  const photoDecorOnly = textHits(photo, DECOR_ONLY_PHOTO_HINTS);
  // Décor still-lifes often mention "glass jar" — bare glass/bottle must not
  // count as cocktail proof that cancels the empty/décor hard veto.
  const emptyOrDecorOnly =
    (photoEmptyVenue >= 1 || photoDecorOnly >= 1)
    && photoFood === 0
    && photoNightlifeHard === 0
    && (photoDrink === 0 || photoDecorOnly >= 1);

  // ── Hard (clear nightlife ↔ plated food) — category, not a campaign scene ─
  if (captionNightlife >= 1 && photoFood >= 1 && photoNightlifeHard === 0) {
    return captionNightlife >= 2 ? 80 : 72;
  }
  if (captionFood >= 2 && photoNightlifeHard >= 1 && photoFood === 0) {
    return 64;
  }
  // Empty lounge / décor still-life under food, drink, or nightlife copy.
  if (captionNightlife >= 1 && emptyOrDecorOnly) {
    return captionNightlife >= 2 ? 78 : 70;
  }
  if (captionFood >= 2 && emptyOrDecorOnly) {
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
  if (captionNightlife >= 2 && photoDrink >= 1 && photoNightlifeHard === 0 && photoFood === 0) {
    soft = Math.max(soft, 24);
  }
  if (captionFood >= 2 && photoDrink >= 2 && photoFood === 0) {
    soft = Math.max(soft, 26);
  }

  const captionNail = textHits(caption, BEAUTY_NAIL_CAPTION);
  const captionLash = textHits(caption, BEAUTY_LASH_CAPTION);
  const captionHair = textHits(caption, BEAUTY_HAIR_CAPTION);
  const photoNail = textHits(photo, BEAUTY_NAIL_PHOTO);
  const photoLash = textHits(photo, BEAUTY_LASH_PHOTO);
  const photoHair = textHits(photo, BEAUTY_HAIR_PHOTO);

  if (captionNail >= 1 && photoLash >= 1 && photoNail === 0) soft = Math.max(soft, 32);
  if (captionNail >= 1 && photoHair >= 2 && photoNail === 0) soft = Math.max(soft, 30);
  if (captionLash >= 1 && photoNail >= 1 && photoLash === 0) soft = Math.max(soft, 30);
  if (captionHair >= 2 && photoNail >= 1 && photoHair === 0) soft = Math.max(soft, 28);

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

/**
 * Caption-scene fit — weekly copy vs selected still.
 *
 * Category triggers only (process / BTS / product still). No SKU or brand
 * dictionaries. When the brand flag is on, a process sentence may stay even
 * if the still is a bottle — enhance places that bottle in the scene.
 */
import {
  deriveHeadlineFromCaption,
  isCaptionOpeningHeadline,
  lockFeedCardCopy,
} from '@/lib/feed-slot-pack';
import { overlayHeadlineGroundedInCaption } from '@/lib/overlay-caption-grounding';
import { groundPublishCopyToVisual } from '@/lib/photo-claim-grounding';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';

/** Process / BTS / “at work today” — not a product-on-shelf claim. */
const PROCESS_SCENE_TRIGGERS = [
  'üretim', 'uretim', 'iş başı', 'is basi', 'işbası', 'at work',
  'atölye', 'atolye', 'workshop', 'kulis', 'behind the scenes',
  'bts', 'production', 'process', 'farm visit', 'çiftlik ziyaret',
  'ciftlik ziyaret', 'hasat gün', 'hasat gun', 'harvest day',
  'ekip iş', 'team at work', 'craft process',
];

/** Place / venue scene — setting, not a SKU dictionary. */
const PLACE_SCENE_TRIGGERS = [
  'ambiance', 'atmosphere', 'atmosfer', 'pazar', 'market day',
  'shop tour', 'shop interior', 'dükkan', 'dukkan', 'gün batım',
  'gun batim', 'terrace', 'teras', 'venue', 'sunset',
];

/** Still is a packaged hero, not the process floor. */
const PRODUCT_STILL_TRIGGERS = [
  'şişe', 'sise', 'bottle', 'jar', 'kavanoz', 'ambalaj', 'packaging',
  'etiket', 'label', 'closeup', 'close-up', 'rafta', 'still life',
  'still-life', 'product hero',
];

function fold(text: string): string {
  return String(text ?? '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTrigger(text: string, triggers: readonly string[]): boolean {
  const bag = fold(text);
  if (!bag) return false;
  return triggers.some((t) => bag.includes(fold(t)));
}

export function isProcessOrBtsSceneText(text: string | null | undefined): boolean {
  return hasTrigger(String(text ?? ''), PROCESS_SCENE_TRIGGERS);
}

export function isPlaceSceneText(text: string | null | undefined): boolean {
  return hasTrigger(String(text ?? ''), PLACE_SCENE_TRIGGERS);
}

/**
 * Brand flags: AI photo enhance is already required for `adaptiveScene`.
 * Nearest labeled still + later high restage may pass the match gate.
 * Service / SKU fights still fail-close.
 */
export function canRestageNearestGallery(input: {
  adaptiveScene?: boolean;
  captionServiceConflict?: boolean;
}): boolean {
  return Boolean(input.adaptiveScene) && !input.captionServiceConflict;
}

const IDENTITY_SEED_ASSET_TYPES = [
  'product_image',
  'food_drink_photo',
  'food_photo',
  'food_image',
] as const;

export type AdaptiveIdentitySeed = {
  visibleLabelText?: string | null;
  description?: string | null;
  suggestedAssetType?: string | null;
};

/** WhatsApp leftover / URL-token stub — not a restage seed. */
export function isFallbackGalleryAnalysis(
  description: string | null | undefined,
): boolean {
  return /metadata fallback analysis/i.test(String(description ?? ''));
}

/**
 * Identity the restage contract accepts. Label, plated/product type,
 * or a real analysis note. Fallback leftovers are not identity.
 */
export function isAdaptiveIdentitySeed(
  meta?: AdaptiveIdentitySeed | null,
): boolean {
  if (!meta || isFallbackGalleryAnalysis(meta.description)) return false;
  if (String(meta.visibleLabelText ?? '').trim().length >= 3) return true;
  const type = String(meta.suggestedAssetType ?? '').trim().toLowerCase();
  if ((IDENTITY_SEED_ASSET_TYPES as readonly string[]).includes(type)) return true;
  return String(meta.description ?? '').trim().length >= 12;
}

export type AdaptiveGalleryContract = {
  restage: boolean;
  seedIndexes: number[];
  /**
   * Restage on + seeds: pick lives on the ranked identity shortlist.
   * The model may choose among seeds; it cannot return null.
   * Restage off: the model's pick (including null) stands.
   */
  bindPickIndex: (modelPick: number | null) => number | null;
};

function readRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** Brand flag on a produced artifact — Hub theme or produce stamp. */
export function readAdaptiveSceneFromMeta(
  meta?: Record<string, unknown> | null,
): boolean {
  if (!meta) return false;
  if (meta.adaptive_scene === true || meta.ai_adaptive_scene === true) return true;
  const standard = readRecord(meta.ai_visual_standard);
  return standard?.adaptive_scene === true;
}

export function readGalleryIdentityFromMeta(
  meta?: Record<string, unknown> | null,
): AdaptiveIdentitySeed | null {
  if (!meta) return null;
  if (meta.gallery_identity_seed === true) {
    return { description: 'stamped-identity-seed' };
  }
  const gallery = readRecord(meta.gallery_photo_meta);
  return gallery as AdaptiveIdentitySeed | null;
}

/**
 * Same restage contract the look used — Akış must not re-ask the scene gap.
 * SKU / service / class still fail in the photo withhold.
 */
export function canRestageStampedPack(
  meta?: Record<string, unknown> | null,
): boolean {
  if (!readAdaptiveSceneFromMeta(meta)) return false;
  return isAdaptiveIdentitySeed(readGalleryIdentityFromMeta(meta));
}

/** One brand-parameter contract for look pick + later match gates. */
export function resolveAdaptiveGalleryContract(input: {
  adaptiveScene?: boolean;
  captionServiceConflict?: boolean;
  candidates: readonly AdaptiveIdentitySeed[];
}): AdaptiveGalleryContract {
  const restage = canRestageNearestGallery(input);
  const seedIndexes = input.candidates
    .map((candidate, index) => (isAdaptiveIdentitySeed(candidate) ? index : -1))
    .filter((index) => index >= 0);
  return {
    restage,
    seedIndexes,
    bindPickIndex(modelPick) {
      if (!restage || seedIndexes.length === 0) return modelPick;
      if (modelPick != null && seedIndexes.includes(modelPick)) return modelPick;
      return seedIndexes[0] ?? null;
    },
  };
}

export function isProductStillEvidence(
  evidenceNote: string | null | undefined,
  photoRole?: string | null,
): boolean {
  if (photoRole === 'product_for_sale') return true;
  return hasTrigger(String(evidenceNote ?? ''), PRODUCT_STILL_TRIGGERS);
}

export function captionSceneNeedsRestage(input: {
  adaptiveScene?: boolean;
  caption?: string | null;
  slotJob?: string | null;
  catalogSlotKey?: string | null;
  evidenceNote?: string | null;
  photoRole?: string | null;
}): boolean {
  if (!input.adaptiveScene) return false;
  const sceneText = `${input.caption ?? ''} ${input.slotJob ?? ''} ${input.catalogSlotKey ?? ''}`;
  if (!isProcessOrBtsSceneText(sceneText) && !isPlaceSceneText(sceneText)) return false;
  return isProductStillEvidence(input.evidenceNote, input.photoRole);
}

function firstCompleteSentence(text: string): string {
  const cut = text.trim().split(/[.!?…\n—–]/)[0]?.trim() ?? '';
  return cut;
}

/**
 * Flag on: keep the weekly process / place sentence; strip unproven SKU grades only.
 * Flag off: leave look copy as-is (photo is the claim source).
 */
export function keepWeeklySceneCopy(input: {
  adaptiveScene: boolean;
  ideationHint?: string | null;
  caption: string;
  headline: string;
  evidenceNote?: string | null;
  photoSideText?: string | null;
  photoUrl?: string | null;
}): { caption: string; headline: string } {
  const caption = String(input.caption ?? '').trim();
  const headline = String(input.headline ?? '').trim();
  if (!input.adaptiveScene) {
    return { caption, headline };
  }
  const hint = String(input.ideationHint ?? '').trim();
  if (!isProcessOrBtsSceneText(hint) && !isPlaceSceneText(hint)) {
    return { caption, headline };
  }
  const sceneSource = isProcessOrBtsSceneText(caption) && caption.length >= 16
    ? caption
    : firstCompleteSentence(hint);
  if (sceneSource.length < 16) {
    return { caption, headline };
  }

  const pinUrl = String(input.photoUrl ?? 'caption-scene-pin').trim() || 'caption-scene-pin';
  const meta: GalleryPhotoMeta = {
    visibleLabelText: String(input.evidenceNote ?? '').trim() || undefined,
    description: String(input.photoSideText ?? '').trim() || undefined,
  };
  const grounded = groundPublishCopyToVisual({
    caption: sceneSource,
    headline: sceneSource,
    photoUrl: pinUrl,
    galleryMeta: { [pinUrl]: meta },
  });
  const nextCaption = grounded.caption.trim();
  if (nextCaption.length < 16) {
    return { caption, headline };
  }
  const nextHeadline = grounded.headline.trim().length >= 4
    ? grounded.headline.trim()
    : deriveHeadlineFromCaption(nextCaption);
  const locked = lockFeedCardCopy({ caption: nextCaption, headline: nextHeadline });
  if (!isCaptionOpeningHeadline(locked.headline, locked.caption)) {
    return locked;
  }
  const later = deriveHeadlineFromCaption(locked.caption);
  if (later) return { caption: locked.caption, headline: later };
  const evidence = String(input.evidenceNote ?? '').trim();
  const prior = headline;
  if (
    prior
    && !isCaptionOpeningHeadline(prior, locked.caption)
    && (
      overlayHeadlineGroundedInCaption(prior, locked.caption)
      || overlayHeadlineGroundedInCaption(prior, evidence)
    )
  ) {
    return { caption: locked.caption, headline: prior };
  }
  const fromEvidence = deriveHeadlineFromCaption(evidence);
  if (fromEvidence && !isCaptionOpeningHeadline(fromEvidence, locked.caption)) {
    return { caption: locked.caption, headline: fromEvidence };
  }
  return { caption: locked.caption, headline: '' };
}

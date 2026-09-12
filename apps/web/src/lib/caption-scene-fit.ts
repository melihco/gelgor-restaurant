/**
 * Caption-scene fit — weekly copy vs selected still.
 *
 * Category triggers only (process / BTS / product still). No SKU or brand
 * dictionaries. When the brand flag is on, a process sentence may stay even
 * if the still is a bottle — enhance places that bottle in the scene.
 */
import {
  deriveHeadlineFromCaption,
  lockFeedCardCopy,
} from '@/lib/feed-slot-pack';
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
  return lockFeedCardCopy({ caption: nextCaption, headline: nextHeadline });
}

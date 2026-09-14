/**
 * SlotProductionBundle — immutable bind contract for feed item production.
 *
 * Bind once (catalog + template + photo + caption + headline), then paint
 * must only read. Late stages may reject a slot; they must not invent a new
 * punchline / photo / template for the same idea.
 *
 * Multi-tenant: no brand UUID / name branches — sector + slot + brand_context only.
 */

import {
  canShipCaptionDesignPost,
  type CaptionDesignPostCoherenceResult,
} from '@/lib/caption-design-post-coherence';
import {
  clampMissionTaglineForCanvas,
  fitMissionOverlayToTemplateBudget,
  resolveFalOverlayCopy,
  type OverlayHeadlineChannel,
} from '@/lib/fal-caption-headline';
import { shouldPreserveLockedPunchlineHeadline } from '@/lib/fal-design-copy';
import { deriveHeadlineFromCaption } from '@/lib/feed-slot-pack';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { resolveSlotSublineForRender } from '@/lib/slot-subline-policy';
import type { TemplateTypeBudget } from '@/lib/template-type-budget';

export type PunchlineLockSource =
  | 'mission_tagline'
  | 'canva_field_copy'
  | string
  | null;

export interface SlotPaintOverlayInput {
  headline: string;
  subtitle?: string | null;
  caption: string;
  cta?: string | null;
  channel: OverlayHeadlineChannel;
  brandName?: string;
  businessType?: string | null;
  /** From production-loop lockedFalPunchlineSource. */
  punchlineLockSource?: PunchlineLockSource;
  /**
   * When false, allow caption-aware overlay rewrite (weak captions).
   * Locked punchlines always preserve regardless.
   */
  captionAwareHeadline?: boolean;
  designIntensity?: string | null;
  sampleHeadline?: string | null;
  sampleSubtitle?: string | null;
  showSubline?: boolean | null;
  typeBudget?: TemplateTypeBudget | null;
  /** Matched gallery URL for coherence gate. */
  photoUrl?: string | null;
  galleryPhotoMeta?: GalleryPhotoMeta | null;
  designMatchIsSoft?: boolean;
  adaptiveScene?: boolean;
  subjectKey?: string | null;
  catalogSlotKey?: string | null;
}

export interface SlotPaintOverlayResult {
  headline: string;
  subtitle?: string;
  preserved: boolean;
  coherence: CaptionDesignPostCoherenceResult;
  budgetSource?: string;
}

/**
 * Single paint-time overlay resolve after template bind.
 * Locked punchlines: keep the planned sentence (no motto stem, no coherence rewrite).
 * Unlocked: sanitize + optional template fit + coherence repair.
 */
export function resolveSlotPaintOverlay(
  input: SlotPaintOverlayInput,
): SlotPaintOverlayResult {
  const preserved = shouldPreserveLockedPunchlineHeadline(input.punchlineLockSource);
  const lockIdeationCopy = input.captionAwareHeadline !== true || preserved;

  const overlayCopy = resolveFalOverlayCopy({
    headline: input.headline,
    cta: input.subtitle || input.cta || undefined,
    caption: input.caption,
    channel: input.channel,
    lockIdeationCopy,
    preservePlannedHeadline: preserved,
    brandName: input.brandName,
    businessType: input.businessType ?? undefined,
  });

  let headline = overlayCopy.headline;
  let subtitle = overlayCopy.subtitle;
  if (preserved) {
    headline = clampMissionTaglineForCanvas(headline, input.channel) || headline;
  }
  // Same claim as the pack — but always fit the template type zone.
  // preserveHeadline blocks sample-motto swap, not the box.
  const fitted = fitMissionOverlayToTemplateBudget({
    headline,
    subtitle,
    channel: input.channel,
    designIntensity: input.designIntensity,
    sampleHeadline: input.sampleHeadline,
    sampleSubtitle: input.sampleSubtitle,
    showSubline: input.showSubline,
    typeBudget: input.typeBudget,
    preserveHeadline: preserved,
  });
  headline = fitted.headline;
  subtitle = fitted.subtitle;
  const budgetSource = fitted.budget.source;

  const gatedSub = resolveSlotSublineForRender(subtitle, {
    catalogSlotKey: input.catalogSlotKey,
    matchedShowSubline: input.showSubline,
  });
  subtitle = gatedSub || undefined;

  const coherence = canShipCaptionDesignPost({
    caption: input.caption,
    overlayHeadline: headline,
    brandName: input.brandName,
    businessType: input.businessType ?? undefined,
    photoUrl: input.photoUrl,
    galleryMeta: input.galleryPhotoMeta,
    designSampleHeadline: input.sampleHeadline,
    designMatchIsSoft: input.designMatchIsSoft,
    adaptiveScene: input.adaptiveScene,
    subjectKey: input.subjectKey,
    catalogSlotKey: input.catalogSlotKey,
  });

  const captionDerivedLock = isCaptionDerivedPunchlineLock(input.punchlineLockSource);
  // Locked punchline: fail-closed on hard breaks, never rewrite canvas text —
  // except caption_pair / caption_aware. Those locks still come from the same
  // caption; if coherence repaired the line, paint the repaired phrase.
  const applyRepair = Boolean(
    coherence.repaired
    && coherence.overlayHeadline
    && (!preserved || captionDerivedLock),
  );
  if (applyRepair) {
    headline = coherence.overlayHeadline;
  }

  const keepLock = preserved && !applyRepair;
  return {
    headline,
    subtitle,
    preserved: keepLock,
    coherence: keepLock
      ? { ...coherence, repaired: false, overlayHeadline: headline }
      : { ...coherence, overlayHeadline: headline },
    budgetSource,
  };
}

function isCaptionDerivedPunchlineLock(source?: PunchlineLockSource): boolean {
  const s = String(source ?? '').trim();
  return s === 'caption_pair' || s === 'caption_aware';
}

/**
 * Production-loop gallery pin wins for Premium Editorial when usable.
 * Rematch only if pin missing/unreachable — never swap on moderate score.
 */
export function shouldKeepProductionGalleryPin(input: {
  preferredUrl?: string | null;
  preferredUsable: boolean;
}): boolean {
  return Boolean(input.preferredUsable && input.preferredUrl);
}

/**
 * Canvas headline after template bind. Locked packs keep the planned line.
 * Unlocked slots may take a caption-derived rescue — never the jar label.
 */
export function resolvePaintCanvasHeadline(input: {
  paintHeadline: string;
  plannedHeadline: string;
  caption: string;
  punchlineLockSource?: PunchlineLockSource;
}): string {
  const painted = input.paintHeadline.trim();
  const planned = input.plannedHeadline.trim();
  if (shouldPreserveLockedPunchlineHeadline(input.punchlineLockSource)) {
    return painted || planned;
  }
  return painted || deriveHeadlineFromCaption(input.caption) || planned;
}

/** Retry shorten for locked punchlines — clamp only, never invent a stem. */
export function shortenLockedPunchlineForImageRetry(
  headline: string,
  channel: OverlayHeadlineChannel,
): string {
  return clampMissionTaglineForCanvas(headline, channel) || headline.trim();
}

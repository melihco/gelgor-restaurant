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
 * Locked punchlines: soft-clamp only (no type_budget stem, no coherence rewrite).
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
  let budgetSource: string | undefined;

  if (preserved) {
    headline = clampMissionTaglineForCanvas(headline, input.channel) || headline;
    // Subtitle may still fit the template zone; headline stays Hub/canva phrase.
    if (subtitle) {
      const fitted = fitMissionOverlayToTemplateBudget({
        headline,
        subtitle,
        channel: input.channel,
        designIntensity: input.designIntensity,
        sampleHeadline: input.sampleHeadline,
        sampleSubtitle: input.sampleSubtitle,
        showSubline: input.showSubline,
        typeBudget: input.typeBudget,
        preserveHeadline: true,
      });
      subtitle = fitted.subtitle;
      budgetSource = fitted.budget.source;
    }
  } else {
    const fitted = fitMissionOverlayToTemplateBudget({
      headline,
      subtitle,
      channel: input.channel,
      designIntensity: input.designIntensity,
      sampleHeadline: input.sampleHeadline,
      sampleSubtitle: input.sampleSubtitle,
      showSubline: input.showSubline,
      typeBudget: input.typeBudget,
    });
    headline = fitted.headline;
    subtitle = fitted.subtitle;
    budgetSource = fitted.budget.source;
  }

  const gatedSub = resolveSlotSublineForRender(subtitle, {
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
  });

  // Locked punchline: fail-closed on hard breaks, never rewrite canvas text.
  if (!preserved && coherence.repaired && coherence.overlayHeadline) {
    headline = coherence.overlayHeadline;
  }

  return {
    headline,
    subtitle,
    preserved,
    coherence: preserved
      ? { ...coherence, repaired: false, overlayHeadline: headline }
      : coherence,
    budgetSource,
  };
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

/** Retry shorten for locked punchlines — clamp only, never invent a stem. */
export function shortenLockedPunchlineForImageRetry(
  headline: string,
  channel: OverlayHeadlineChannel,
): string {
  return clampMissionTaglineForCanvas(headline, channel) || headline.trim();
}

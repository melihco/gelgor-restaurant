/**
 * Caption → design → photo → overlay coherence gate.
 *
 * A designed post must not ship when any link in the chain fights the publish
 * caption. Multi-tenant: theme/cluster + grounding helpers only — no brand UUIDs.
 */

import {
  buildGalleryPhotoSearchable,
  isHardCaptionPhotoConflict,
} from '@/lib/caption-photo-alignment';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { isHardGalleryThemeMismatch } from '@/lib/gallery-photo-matcher';
import { hasCaptionHeadlineThemeConflict } from '@/lib/headline-theme-clusters';
import {
  isOffTopicTourismOverlay,
  overlayHeadlineGroundedInCaption,
  rebiasUngroundedOverlayCopy,
} from '@/lib/overlay-caption-grounding';
import {
  isMeaningfulFalOverlayText,
  isIncompleteOverlayPhrase,
} from '@/lib/fal-caption-headline';
import {
  isMeaninglessBrandEchoHeadline,
  isSoullessMenuHourHeadline,
} from '@/lib/production-headline-quality';

export type CoherenceBreak =
  | 'overlay_ungrounded'
  | 'overlay_theme_conflict'
  | 'overlay_meaningless'
  | 'photo_theme_conflict'
  | 'design_sample_theme_conflict';

export interface CaptionDesignPostCoherenceInput {
  caption: string;
  /** On-canvas / mission overlay headline. */
  overlayHeadline: string;
  brandName?: string;
  businessType?: string;
  /** Gallery photo URL locked for this slot. */
  photoUrl?: string | null;
  galleryMeta?: GalleryPhotoMeta | null;
  /**
   * Template library sample headline (design intent). Soft conflict only —
   * hard catalog pins can still render when mission overlay is caption-grounded.
   */
  designSampleHeadline?: string | null;
  /** When true, design_sample conflict is a hard break (soft template match). */
  designMatchIsSoft?: boolean;
  /** Overlay channel — drives rebias max length. */
  channel?: 'reel' | 'feed_post' | 'story';
}

export interface CaptionDesignPostCoherenceResult {
  ok: boolean;
  breaks: CoherenceBreak[];
  /** Repaired overlay when rebias succeeded; otherwise original. */
  overlayHeadline: string;
  repaired: boolean;
}

function overlayLooksBad(
  headline: string,
  brandName: string,
  caption: string,
  businessType?: string,
): boolean {
  const h = headline.trim();
  if (!h) return true;
  if (!isMeaningfulFalOverlayText(h)) return true;
  if (isIncompleteOverlayPhrase(h)) return true;
  // Note: do not use isLabelStyleHeadline here — designed punchlines are often
  // 2-word scene hooks ("DJ Night", "Altın Saat") that that helper rejects.
  if (isSoullessMenuHourHeadline(h)) return true;
  if (brandName && isMeaninglessBrandEchoHeadline(h, brandName)) return true;
  if (isOffTopicTourismOverlay(h, caption, businessType)) return true;
  if (caption.trim().length >= 24 && hasCaptionHeadlineThemeConflict(caption, h)) return true;
  if (caption.trim().length >= 24 && !overlayHeadlineGroundedInCaption(h, caption)) return true;
  return false;
}

/**
 * Evaluate (and lightly repair) caption ↔ overlay ↔ photo ↔ design coherence.
 * Callers must fail-closed when `ok === false`.
 */
export function evaluateCaptionDesignPostCoherence(
  input: CaptionDesignPostCoherenceInput,
): CaptionDesignPostCoherenceResult {
  const caption = String(input.caption ?? '').trim();
  let overlay = String(input.overlayHeadline ?? '').trim();
  const brandName = String(input.brandName ?? '').trim();
  const breaks: CoherenceBreak[] = [];
  let repaired = false;

  const channel = input.channel ?? 'feed_post';

  if (caption.length >= 24 && overlay) {
    if (
      hasCaptionHeadlineThemeConflict(caption, overlay)
      || !overlayHeadlineGroundedInCaption(overlay, caption)
      || isOffTopicTourismOverlay(overlay, caption, input.businessType)
      || overlayLooksBad(overlay, brandName, caption, input.businessType)
    ) {
      const rebiased = rebiasUngroundedOverlayCopy({
        headline: overlay,
        caption,
        brandName: brandName || undefined,
        businessType: input.businessType,
        channel,
      });
      if (
        rebiased.headline
        && rebiased.headline !== overlay
        && !overlayLooksBad(rebiased.headline, brandName, caption, input.businessType)
      ) {
        overlay = rebiased.headline;
        repaired = true;
      }
    }
  }

  if (overlayLooksBad(overlay, brandName, caption, input.businessType) && caption.length >= 24) {
    breaks.push(
      !isMeaningfulFalOverlayText(overlay) || isIncompleteOverlayPhrase(overlay)
        ? 'overlay_meaningless'
        : isOffTopicTourismOverlay(overlay, caption, input.businessType)
          || hasCaptionHeadlineThemeConflict(caption, overlay)
          ? 'overlay_theme_conflict'
          : 'overlay_ungrounded',
    );
  }

  const sample = String(input.designSampleHeadline ?? '').trim();
  if (
    input.designMatchIsSoft
    && sample
    && caption.length >= 24
    && hasCaptionHeadlineThemeConflict(caption, sample)
  ) {
    breaks.push('design_sample_theme_conflict');
  }

  const photoUrl = String(input.photoUrl ?? '').trim();
  if (photoUrl && caption.length >= 12) {
    const meta = input.galleryMeta ?? undefined;
    const searchable = buildGalleryPhotoSearchable(meta, photoUrl);
    const hard =
      isHardGalleryThemeMismatch(
        {
          caption,
          headline: overlay,
          businessType: input.businessType,
        },
        meta,
        photoUrl,
      )
      || isHardCaptionPhotoConflict(`${caption} ${overlay}`, searchable);
    if (hard) breaks.push('photo_theme_conflict');
  }

  return {
    ok: breaks.length === 0,
    breaks,
    overlayHeadline: overlay,
    repaired,
  };
}

/** True when a designed fal/GPT post is safe to paint. */
export function canShipCaptionDesignPost(
  input: CaptionDesignPostCoherenceInput,
): CaptionDesignPostCoherenceResult {
  return evaluateCaptionDesignPostCoherence(input);
}

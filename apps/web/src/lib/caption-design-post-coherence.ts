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
import { isSlotPhotoNeedUnmet } from '@/lib/catalog-slot-photo-fit';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { isHardGalleryThemeMismatch } from '@/lib/gallery-photo-matcher';
import { hasCaptionHeadlineThemeConflict } from '@/lib/headline-theme-clusters';
import {
  isOffTopicTourismOverlay,
  overlayHeadlineGroundedInCaption,
  rebiasUngroundedOverlayCopy,
} from '@/lib/overlay-caption-grounding';
import {
  extractCaptionThemePunchline,
  isMeaningfulFalOverlayText,
  isIncompleteOverlayPhrase,
  resolveFalDisplayHeadline,
  resolveFalProductionOverlayHeadline,
} from '@/lib/fal-caption-headline';
import {
  isHollowSocialHeadline,
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
  /** Catalog slot — hiring/plated families fail-closed on the wrong photo class. */
  catalogSlotKey?: string | null;
  /**
   * Paint-time may rebias an ungrounded overlay. Publish-time must judge the
   * painted headline as-is — a repaired line is not what the customer sees.
   */
  allowRepair?: boolean;
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
  const withoutSocialMeta = h.replace(/[#@]\S+/g, '').replace(/\s+/g, ' ').trim();
  if (!withoutSocialMeta || withoutSocialMeta.length < 6) return true;
  if (!isMeaningfulFalOverlayText(h)) return true;
  if (isIncompleteOverlayPhrase(h)) return true;
  // Note: do not use isLabelStyleHeadline here — designed punchlines are often
  // 2-word scene hooks ("DJ Night", "Altın Saat") that that helper rejects.
  if (isSoullessMenuHourHeadline(h) || isHollowSocialHeadline(h)) return true;
  if (brandName && isMeaninglessBrandEchoHeadline(h, brandName)) return true;
  if (isOffTopicTourismOverlay(h, caption, businessType)) return true;
  if (caption.trim().length >= 24 && hasCaptionHeadlineThemeConflict(caption, h)) return true;
  if (caption.trim().length >= 24 && !overlayHeadlineGroundedInCaption(h, caption)) return true;
  return false;
}

const OVERLAY_FALLBACK_MAX_CLAUSES = 4;
const OVERLAY_FALLBACK_MAX_STARTS = 4;

/**
 * Last-resort overlay drawn verbatim from the caption, so it is grounded by
 * construction. A single 3-word probe is not enough: the incomplete-phrase rules
 * reject many word windows on morphology alone (Turkish case/genitive tails), and
 * one rejected probe used to leave the slot with no shippable overlay at all.
 * Scanning several windows per clause finds a phrase that satisfies every gate
 * without loosening any of them.
 */
function deriveGroundedOverlayFallback(
  caption: string,
  maxLen: number,
  brandName: string,
  businessType?: string,
): string {
  const clauses = caption
    .replace(/[#@]\S+/g, ' ')
    .split(/[.!?\n|—–,;:]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .slice(0, OVERLAY_FALLBACK_MAX_CLAUSES);

  for (const clause of clauses) {
    const words = clause.split(/\s+/).filter(Boolean);
    for (let start = 0; start < Math.min(words.length, OVERLAY_FALLBACK_MAX_STARTS); start++) {
      // Longer windows first — more informative than a bare two-word stub.
      for (let size = 5; size >= 2; size--) {
        if (start + size > words.length) continue;
        const candidate = words.slice(start, start + size).join(' ');
        if (candidate.length > maxLen) continue;
        if (!overlayHeadlineGroundedInCaption(candidate, caption)) continue;
        if (overlayLooksBad(candidate, brandName, caption, businessType)) continue;
        return candidate;
      }
    }
  }
  return '';
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
  const allowRepair = input.allowRepair !== false;

  if (allowRepair && caption.length >= 24 && overlay) {
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

  // Second pass — force a caption-derived punchline so overlay_ungrounded does not
  // exhaust the factory slot when a short theme line exists in the publish caption.
  if (
    allowRepair
    && overlayLooksBad(overlay, brandName, caption, input.businessType)
    && caption.length >= 24
  ) {
    const maxLen = channel === 'reel' ? 22 : channel === 'story' ? 28 : 32;
    const themePunch = extractCaptionThemePunchline({
      caption,
      maxLen,
      maxWords: 3,
      missionTitle: overlay,
    });
    const resolved = resolveFalDisplayHeadline({
      caption,
      missionTitle: '', // ignore briefing-style mission title — derive from caption only
      brandName: brandName || '',
      maxLen,
    });
    const captionClause = caption
      .replace(/[#@]\S+/g, ' ')
      .split(/[.!?\n|—–\-]+/)
      .map((s) => s.trim())
      .find((s) => s.length >= 8);
    // Prefer 2–3 caption words (not char-truncated mid-phrase — that fails incomplete checks).
    const clauseHook = captionClause
      ? captionClause.split(/\s+/).filter(Boolean).slice(0, 3).join(' ')
      : '';
    const candidates = [themePunch, resolved.headline, clauseHook]
      .filter((v): v is string => Boolean(v && v.trim()))
      .filter((v) =>
        overlayHeadlineGroundedInCaption(v, caption)
        && !isOffTopicTourismOverlay(v, caption, input.businessType)
        && !overlayLooksBad(v, brandName, caption, input.businessType),
      );
    const forced = candidates[0]
      ? resolveFalProductionOverlayHeadline(
          candidates[0],
          candidates,
          channel,
        )
      : '';
    if (forced && !overlayLooksBad(forced, brandName, caption, input.businessType)) {
      overlay = forced;
      repaired = true;
    } else if (
      clauseHook
      && overlayHeadlineGroundedInCaption(clauseHook, caption)
      && !overlayLooksBad(clauseHook, brandName, caption, input.businessType)
    ) {
      // Last resort: 2–3 caption words — grounded by construction.
      overlay = clauseHook;
      repaired = true;
    } else {
      const derived = deriveGroundedOverlayFallback(
        caption,
        maxLen,
        brandName,
        input.businessType,
      );
      if (derived) {
        overlay = derived;
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
    const hasSubjectEvidence = Boolean(
      meta?.primarySubject
      || (meta?.contentTags && meta.contentTags.length > 0)
      || String(meta?.description ?? '').trim(),
    );
    // SKU veto (bal ↔ zeytinyağı) needs vision evidence. A matcher-accepted
    // pin with no bound analysis must not die here — that hid every shop feed
    // post behind photo_theme_conflict while the photo was already the SKU.
    const hard = hasSubjectEvidence
      ? (
        isHardGalleryThemeMismatch(
          {
            caption,
            headline: overlay,
            businessType: input.businessType,
          },
          meta,
          photoUrl,
        )
        || isHardCaptionPhotoConflict(`${caption} ${overlay}`, searchable)
        || isSlotPhotoNeedUnmet(input.catalogSlotKey, meta)
      )
      : (
        isHardCaptionPhotoConflict(`${caption} ${overlay}`, searchable)
        || isSlotPhotoNeedUnmet(input.catalogSlotKey, meta)
      );
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

/**
 * Photo / soft-template sample fights — do not paint. Overlay-only breaks
 * can still ship after a caption-derived repair (or Satori last resort).
 */
export function isHardDesignWithholdBreak(breaks: readonly CoherenceBreak[]): boolean {
  return breaks.includes('photo_theme_conflict')
    || breaks.includes('design_sample_theme_conflict');
}

/**
 * Publish-time: caption ↔ painted headline fights also hide the card.
 * Overlay-only "meaningless/ungrounded" may still have a photo-first still.
 */
export function isPublishCoherenceBlock(breaks: readonly CoherenceBreak[]): boolean {
  return isHardDesignWithholdBreak(breaks)
    || breaks.includes('overlay_theme_conflict')
    || breaks.includes('overlay_ungrounded');
}

function readGalleryMeta(raw: unknown): GalleryPhotoMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as GalleryPhotoMeta;
}

/** Bound package on a produced artifact — null when there is nothing to judge. */
export function coherenceInputFromPublishArtifact(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
): CaptionDesignPostCoherenceInput | null {
  const caption = String(content.caption ?? meta.caption ?? '').trim();
  const overlayHeadline = String(
    content.design_overlay_headline
    ?? meta.design_overlay_headline
    ?? content.headline
    ?? meta.headline
    ?? '',
  ).trim();
  if (caption.length < 12 && !overlayHeadline) return null;

  const galleryMeta = readGalleryMeta(meta.gallery_photo_meta);
  const photoUrl = String(
    meta.reference_photo_url
    ?? meta.gallery_photo_url
    ?? '',
  ).trim() || (galleryMeta ? 'bound://gallery' : '');
  const matchQuality = String(meta.brand_design_template_match_quality ?? '').toLowerCase();

  return {
    caption,
    overlayHeadline,
    brandName: String(meta.brand_name ?? '').trim() || undefined,
    businessType: String(meta.business_type ?? meta.sector ?? '').trim() || undefined,
    photoUrl: photoUrl || undefined,
    galleryMeta,
    designSampleHeadline: String(
      meta.brand_design_template_sample_headline ?? '',
    ).trim() || undefined,
    designMatchIsSoft: matchQuality === 'soft' || matchQuality === 'format_fallback',
    catalogSlotKey: String(meta.catalog_slot_key ?? '').trim() || undefined,
  };
}

/** Re-run the paint gate on a saved artifact. Null = not enough package fields. */
export function evaluateArtifactPublishCoherence(
  meta: Record<string, unknown>,
  content: Record<string, unknown>,
): CaptionDesignPostCoherenceResult | null {
  const input = coherenceInputFromPublishArtifact(meta, content);
  if (!input) return null;
  return evaluateCaptionDesignPostCoherence({ ...input, allowRepair: false });
}

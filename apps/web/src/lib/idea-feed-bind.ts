/**
 * IdeaFeedBind — single SSOT for feed-item coherence:
 * calendar/Hub tagline ↔ gallery match ↔ canvas punchline ↔ catalog pin.
 *
 * Production-loop, gallery-orchestrator, and capacity reroute must read
 * the same bind so batch ≠ drain headline drift cannot ship wrong photos.
 */

import { isCalendarProductionIdea } from '@/lib/calendar-production-pack';
import {
  clampMissionTaglineForCanvas,
  isIncompleteOverlayPhrase,
  type OverlayHeadlineChannel,
} from '@/lib/fal-caption-headline';
import {
  isLabelStyleHeadline,
  isMeaninglessBrandEchoHeadline,
} from '@/lib/production-headline-quality';
import {
  resolveIdeationHeadline,
  resolveIdeationOverlayHeadline,
  resolveIdeationTagline,
} from '@/lib/production-idea-parse';
import { enforceDisplayHeadline } from '@/lib/grafiker-quality';
import { isCaptionOpeningHeadline } from '@/lib/feed-slot-pack';
import { lookJobKind } from '@/lib/look-job-kind';
import type { PunchlineLockSource } from '@/lib/slot-production-bundle';

const ABSTRACT_SUBJECTS = new Set([
  '',
  'none',
  'other',
  'brand',
  'logo',
  'n/a',
  'na',
  'unknown',
  'misc',
  'general',
  'atmosphere',
  'lifestyle',
  'venue',
  'background',
]);

export function isConcreteProductSubject(subjectKey?: string | null): boolean {
  return !ABSTRACT_SUBJECTS.has(String(subjectKey ?? '').trim().toLowerCase());
}

/**
 * Sell + a real SKU: gallery / photo score stays on the weekly product.
 * The Hub motto may still be the on-canvas punchline (inviting line).
 */
export function sellSlotLocksProductGallery(input: {
  catalogSlotKey?: string | null;
  subjectKey?: string | null;
}): boolean {
  if (!isConcreteProductSubject(input.subjectKey)) return false;
  return lookJobKind({ catalogSlotKey: String(input.catalogSlotKey ?? '').trim() }) === 'sell';
}

export type IdeaFeedBind = {
  /** Unwrapped Hub/calendar quote (may be empty). */
  tagline: string;
  /** Canvas-clamped Hub quote — empty when the quote is not renderable. */
  canvasTagline: string;
  /** True when the clamped tagline is the punchline SSOT for this slot. */
  taglinePublishable: boolean;
  /** On-canvas marketing line (Hub motto when publishable). */
  paintHeadline: string;
  /**
   * Gallery scorer headline. On sell + SKU this is the product line, even when
   * paintHeadline is the motto — photo pick must not score a greeting.
   */
  galleryMatchHeadline: string;
  /** Gallery MatchIntent caption blob (never content_brief). */
  galleryMatchCaption: string;
  punchlineLockSource: PunchlineLockSource | null;
  subjectKey?: string;
  catalogSlotKey?: string;
  isCalendar: boolean;
};

/**
 * Publishable = renderable. The lock is only taken when the canvas clamp can
 * emit the exact Hub line; otherwise paint would silently fall through to
 * another copy source while the gallery scored against the quote.
 */
function resolveCanvasTagline(
  tagline: string,
  channel: OverlayHeadlineChannel,
  brandName?: string | null,
): string {
  const t = tagline.trim();
  if (!t) return '';
  if (isMeaninglessBrandEchoHeadline(t, brandName ?? '')) return '';
  if (isLabelStyleHeadline(t)) return '';
  if (isIncompleteOverlayPhrase(t)) return '';
  return clampMissionTaglineForCanvas(t, channel);
}

/**
 * Gallery MatchIntent caption — tagline-led for calendar; caption ± mood otherwise.
 * Never includes content_brief (scene brief pollutes ranking).
 */
export function resolveGalleryMatchCaptionForIdea(
  idea: Record<string, unknown>,
  opts?: { catalogSlotKey?: string | null },
): string {
  const tagline = resolveIdeationTagline(idea);
  const caption = String(idea.caption_draft ?? idea.caption ?? '').trim();
  const subjectKey = String(idea.subject_key ?? idea.subjectKey ?? '').trim();
  const subject = subjectKey.replace(/_/g, ' ');
  const mood = String(idea.photo_mood ?? idea.mood ?? idea.visual_direction ?? '').trim();
  const planning = String(idea.headline ?? idea.concept_title ?? '').trim();
  const catalogSlotKey = String(opts?.catalogSlotKey ?? idea.catalog_slot_key ?? '').trim();
  if (sellSlotLocksProductGallery({ catalogSlotKey, subjectKey })) {
    return [caption, subject, planning, mood].filter(Boolean).join(' — ');
  }
  if (isCalendarProductionIdea(idea) || tagline) {
    return [tagline, caption, subject, planning, mood].filter(Boolean).join(' — ');
  }
  return [caption, subject, planning, mood].filter(Boolean).join(' — ');
}

/**
 * Resolve the immutable bind contract for one production idea.
 */
export function resolveIdeaFeedBind(
  idea: Record<string, unknown>,
  opts?: {
    brandName?: string | null;
    catalogSlotKey?: string | null;
    /** Canvas channel for the clamp check; slot paint re-clamps per channel. */
    channel?: OverlayHeadlineChannel;
  },
): IdeaFeedBind {
  const tagline = resolveIdeationTagline(idea);
  const isCalendar = isCalendarProductionIdea(idea);
  const canvasTagline = resolveCanvasTagline(
    tagline,
    opts?.channel ?? 'feed_post',
    opts?.brandName,
  );
  const catalogSlotKey = String(
    opts?.catalogSlotKey
      ?? idea.catalog_slot_key
      ?? '',
  ).trim() || undefined;
  const subjectKey = String(idea.subject_key ?? idea.subjectKey ?? '').trim() || undefined;
  const productLocksGallery = sellSlotLocksProductGallery({
    catalogSlotKey,
    subjectKey,
  });
  const taglinePublishable = canvasTagline.length > 0;
  const caption = String(idea.caption_draft ?? idea.caption ?? '').trim();
  const overlay = resolveIdeationOverlayHeadline(idea);
  const planning = resolveIdeationHeadline(idea);
  const productLine = enforceDisplayHeadline(planning.trim(), 72);
  let paintHeadline = taglinePublishable
    ? canvasTagline
    : enforceDisplayHeadline((overlay || planning).trim(), 72);
  if (!taglinePublishable && paintHeadline && isCaptionOpeningHeadline(paintHeadline, caption)) {
    paintHeadline = '';
  }

  return {
    tagline,
    canvasTagline,
    taglinePublishable,
    paintHeadline,
    galleryMatchHeadline: productLocksGallery
      ? productLine
      : (paintHeadline || productLine),
    galleryMatchCaption: resolveGalleryMatchCaptionForIdea(idea, { catalogSlotKey }),
    punchlineLockSource: taglinePublishable ? 'mission_tagline' : null,
    subjectKey,
    catalogSlotKey,
    isCalendar,
  };
}

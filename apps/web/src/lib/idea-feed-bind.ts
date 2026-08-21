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
import type { PunchlineLockSource } from '@/lib/slot-production-bundle';

export type IdeaFeedBind = {
  /** Unwrapped Hub/calendar quote (may be empty). */
  tagline: string;
  /** Canvas-clamped Hub quote — empty when the quote is not renderable. */
  canvasTagline: string;
  /** True when the clamped tagline is the punchline SSOT for this slot. */
  taglinePublishable: boolean;
  /** On-canvas marketing line (clamped Hub quote when locked). */
  paintHeadline: string;
  /** Gallery scorer headline — identical to paintHeadline (no batch/drain drift). */
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
export function resolveGalleryMatchCaptionForIdea(idea: Record<string, unknown>): string {
  const tagline = resolveIdeationTagline(idea);
  const caption = String(idea.caption_draft ?? idea.caption ?? '').trim();
  const subject = String(idea.subject_key ?? idea.subjectKey ?? '')
    .replace(/_/g, ' ')
    .trim();
  const mood = String(idea.photo_mood ?? idea.mood ?? idea.visual_direction ?? '').trim();
  const planning = String(idea.headline ?? idea.concept_title ?? '').trim();
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
  const taglinePublishable = canvasTagline.length > 0;
  const overlay = resolveIdeationOverlayHeadline(idea);
  const planning = resolveIdeationHeadline(idea);
  // Locked slots paint the clamped Hub line, so the gallery must score against
  // that exact string — otherwise batch (orchestrator) and drain (loop) diverge.
  const paintHeadline = taglinePublishable
    ? canvasTagline
    : enforceDisplayHeadline((overlay || planning).trim(), 72);

  const catalogSlotKey = String(
    opts?.catalogSlotKey
      ?? idea.catalog_slot_key
      ?? '',
  ).trim() || undefined;
  const subjectKey = String(idea.subject_key ?? idea.subjectKey ?? '').trim() || undefined;

  return {
    tagline,
    canvasTagline,
    taglinePublishable,
    paintHeadline,
    galleryMatchHeadline: paintHeadline,
    galleryMatchCaption: resolveGalleryMatchCaptionForIdea(idea),
    punchlineLockSource: taglinePublishable ? 'mission_tagline' : null,
    subjectKey,
    catalogSlotKey,
    isCalendar,
  };
}

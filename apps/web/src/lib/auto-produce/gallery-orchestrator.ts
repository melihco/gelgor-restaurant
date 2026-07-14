/**
 * Gallery orchestrator for mission-level batch photo assignment.
 *
 * Builds a semantic gallery assignment map for all production queue slots
 * before the per-idea production loop runs, so each idea gets the best
 * matching gallery photo without competing with siblings.
 */

import {
  assignPhotosToContents,
  resolveGalleryMatchSubjectKey,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
  type PhotoMatchResult,
  MIN_ACCEPT_SCORE,
} from '@/lib/gallery-photo-matcher';
import { gatePhotoMatchResult } from '@/lib/gallery-ai-match-judge';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';
import {
  isMeaninglessBrandEchoHeadline,
  resolveMeaningfulProductionHeadline,
} from '@/lib/production-headline-quality';
import { enforceDisplayHeadline } from '@/lib/grafiker-quality';
import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
import { buildSlotGalleryMatchInput, assignmentPostType } from '@/lib/gallery-first-production';
import type { UsedGalleryUsage } from '@/lib/gallery-usage-tracker';
import { buildGlobalGalleryUsageCounts, getMissionWideExcludeUrls } from '@/lib/gallery-usage-tracker';

/** Stable per-slot key: used to match gallery assignments to production loop items. */
export function missionGallerySlotKey(ideaIndex: number, slotRole: string): string {
  return `${ideaIndex}::${slotRole}`;
}

/** Returns true when this pipeline type needs a real gallery photo as input. */
export function assignmentUsesGalleryPhoto(
  assignment: { pipeline?: string; slot_role?: string },
): boolean {
  const pipeline = String(assignment.pipeline ?? '');
  const role = String(assignment.slot_role ?? '');
  if (pipeline === 'meta_ad' || pipeline === 'google_ad') return false;
  if (role === 'paid_ad_creative' || role === 'paid_ad_google_creative') return false;
  if (
    pipeline === 'fal_design'
    || role === 'designed_post'
    || role === 'designed_typography'
    || role === 'fal_designed_post'
  ) {
    return true;
  }
  return (
    pipeline === 'gallery_photo'
    || pipeline === 'story_still'
    || pipeline === 'carousel_gallery'
    || pipeline === 'remotion_story'
    || pipeline === 'fal_story'
    || pipeline === 'runway_reel'
    || pipeline === 'fal_reel'
  );
}

export interface GalleryOrchestrationInput {
  workspaceId?: string;
  missionId: string | undefined;
  productionLoop: ManifestProductionQueueItem[];
  galleryPhotos: string[];
  galleryMeta: Record<string, GalleryPhotoMeta>;
  brandBusinessType: string;
  resolvedBrandName: string;
  hasGallery: boolean;
  hasRealBrandPhotos: boolean;
  brandDescription?: string;
  creativeBrief?: string;
  /** Already-used gallery URLs from existing artifacts — seeded into batch matcher. */
  galleryUsage?: UsedGalleryUsage;
}

/**
 * Build a semantic gallery assignment map for all production slots.
 * Gray-zone batch picks are confirmed by the AI judge before reservation.
 * Returns a Map keyed by `missionGallerySlotKey(ideaIndex, slotRole)`.
 */
export async function buildMissionGalleryAssignments(
  input: GalleryOrchestrationInput,
): Promise<Map<string, PhotoMatchResult | null>> {
  const result = new Map<string, PhotoMatchResult | null>();

  if (
    !input.missionId
    || !input.hasGallery
    || !input.hasRealBrandPhotos
    || input.productionLoop.length === 0
  ) {
    return result;
  }

  const assignItems: Array<{
    key: string;
    input: MatchPhotoInput;
    storyIndex: number;
    postType: import('@/lib/gallery-usage-tracker').PostTypeBucket;
  }> = [];
  let storyOrdinal = 0;

  const globalUsageCounts = input.galleryUsage
    ? buildGlobalGalleryUsageCounts(input.galleryUsage)
    : undefined;

  for (const queueItem of input.productionLoop) {
    if (!assignmentUsesGalleryPhoto(queueItem.assignment)) continue;

    const idea = queueItem.idea as Record<string, unknown>;
    const caption = String(idea.caption_draft ?? idea.caption ?? '').trim();
    const rawHeadline = resolveIdeationHeadline(idea);
    let headline = rawHeadline;

    if (!rawHeadline || isMeaninglessBrandEchoHeadline(rawHeadline, input.resolvedBrandName)) {
      headline = resolveMeaningfulProductionHeadline({
        headline: rawHeadline,
        caption,
        brandName: input.resolvedBrandName,
        conceptTitle: String(idea.concept_title ?? idea.idea_title ?? idea.title ?? ''),
        maxLen: 72,
      }).headline;
    } else {
      headline = enforceDisplayHeadline(rawHeadline, 72);
    }

    const isStory = String(queueItem.assignment.slot_role ?? '').includes('story')
      || queueItem.assignment.pipeline === 'remotion_story'
      || queueItem.assignment.pipeline === 'story_still';
    const storyIndex = isStory ? storyOrdinal++ : 0;

    const subjectKey = resolveGalleryMatchSubjectKey({
      caption,
      headline,
      subjectKey: String(idea.subject_key ?? idea.subjectKey ?? '').trim() || undefined,
    });
    const matchInput = {
      ...buildSlotGalleryMatchInput({
        assignment: queueItem.assignment,
        storyIndex,
        brandName: input.resolvedBrandName,
        brandDescription: input.brandDescription,
        businessType: input.brandBusinessType,
        visualSubjectHint: String(queueItem.assignment.visual_subject_hint ?? ''),
        creativeBrief: input.creativeBrief,
        ideationCaption: caption,
        ideationHeadline: headline,
        subjectKey,
      }),
      ...(globalUsageCounts ? { globalUsageCounts } : {}),
    };

    assignItems.push({
      key: missionGallerySlotKey(queueItem.ideaIndex, String(queueItem.assignment.slot_role)),
      input: matchInput,
      storyIndex,
      postType: assignmentPostType(queueItem.assignment),
    });
  }

  if (assignItems.length === 0) return result;

  const seedExclude = input.galleryUsage
    ? getMissionWideExcludeUrls(input.galleryUsage, {
      feed: [],
      story: [],
      reel: [],
      carousel: [],
    })
    : [];

  const batchAssigned = assignPhotosToContents(
    assignItems.map(({ key, input: matchIn, postType }) => ({ key, input: matchIn, postType })),
    input.galleryPhotos,
    input.galleryMeta,
    { minScore: MIN_ACCEPT_SCORE, excludeUrls: seedExclude },
  );

  let judgeRejected = 0;
  let judgeSwapped = 0;
  for (const [key, val] of batchAssigned) {
    const item = assignItems.find((i) => i.key === key);
    if (!item || !val) {
      result.set(key, val);
      continue;
    }
    const gated = await gatePhotoMatchResult(val, item.input, input.galleryMeta, input.galleryPhotos, {
      excludeUrls: seedExclude,
      workspaceId: input.workspaceId,
      missionId: input.missionId,
      slotKey: key,
    });
    if (val && !gated) judgeRejected += 1;
    if (gated && gated.url !== val.url) judgeSwapped += 1;
    result.set(key, gated);
  }

  const assignedCount = [...result.values()].filter(Boolean).length;
  const diversityCount = [...result.values()].filter(
    (v) => v?.reason?.includes('mission_diversity_fallback'),
  ).length;

  console.log(
    `[auto-produce] Mission gallery batch assign: ${assignItems.length} slots, ` +
    `${assignedCount} assigned (${assignedCount - diversityCount} semantic, ${diversityCount} diversity)` +
    (judgeRejected || judgeSwapped
      ? `, judge: ${judgeRejected} rejected, ${judgeSwapped} swapped`
      : ''),
  );

  return result;
}

/**
 * Gallery orchestrator for mission-level batch photo assignment.
 *
 * Builds a semantic gallery assignment map for all production queue slots
 * before the per-idea production loop runs, so each idea gets the best
 * matching gallery photo without competing with siblings.
 */

import {
  assignPhotosToContents,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
  type PhotoMatchResult,
  MIN_ACCEPT_SCORE,
} from '@/lib/gallery-photo-matcher';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';
import {
  isMeaninglessBrandEchoHeadline,
  resolveMeaningfulProductionHeadline,
} from '@/lib/production-headline-quality';
import { enforceDisplayHeadline } from '@/lib/remotion-quality';
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
  if (pipeline === 'remotion_poster' || role === 'designed_post') return false;
  if (pipeline.startsWith('fal_only_') || role.startsWith('fal_only_')) return false;
  if (pipeline === 'meta_ad' || pipeline === 'google_ad') return false;
  if (role === 'paid_ad_creative' || role === 'paid_ad_google_creative') return false;
  return (
    pipeline === 'gallery_photo'
    || pipeline === 'story_still'
    || pipeline === 'carousel_gallery'
    || pipeline === 'remotion_story'
    || pipeline === 'runway_reel'
  );
}

export interface GalleryOrchestrationInput {
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
 * Returns a Map keyed by `missionGallerySlotKey(ideaIndex, slotRole)`.
 */
export function buildMissionGalleryAssignments(
  input: GalleryOrchestrationInput,
): Map<string, PhotoMatchResult | null> {
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

  for (const [key, val] of batchAssigned) {
    result.set(key, val);
  }

  console.log(
    `[auto-produce] Mission gallery batch assign: ${assignItems.length} slots, ` +
    `${[...batchAssigned.values()].filter(Boolean).length} matched (≥${MIN_ACCEPT_SCORE})`,
  );

  return result;
}

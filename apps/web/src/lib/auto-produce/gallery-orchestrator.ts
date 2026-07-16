/**
 * Gallery orchestrator for mission-level batch photo assignment.
 *
 * Builds a semantic gallery assignment map for all production queue slots
 * before the per-idea production loop runs, so each idea gets the best
 * matching gallery photo without competing with siblings.
 */

import {
  assignPhotosToContents,
  canonicalSubjectRelationForMeta,
  resolveGalleryMatchSubjectKey,
  resolveGalleryPhotoMeta,
  type CanonicalSubjectRelation,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
  type PhotoMatchResult,
  MIN_ACCEPT_SCORE,
} from '@/lib/gallery-photo-matcher';
import { captionRequiresStrictGalleryMatch } from '@/lib/caption-photo-alignment';
import { escalateSubjectAlignedPick, gatePhotoMatchResult } from '@/lib/gallery-ai-match-judge';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';
import {
  isMeaninglessBrandEchoHeadline,
  resolveMeaningfulProductionHeadline,
} from '@/lib/production-headline-quality';
import { enforceDisplayHeadline } from '@/lib/grafiker-quality';
import { resolveIdeationHeadline } from '@/lib/production-idea-parse';
import { buildSlotGalleryMatchInput, assignmentPostType } from '@/lib/gallery-first-production';
import type { UsedGalleryUsage } from '@/lib/gallery-usage-tracker';
import {
  buildGlobalGalleryUsageCounts,
  getMissionWideExcludeUrls,
  normalizeGalleryUrl,
} from '@/lib/gallery-usage-tracker';

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
    || pipeline === 'fal_story'
    || pipeline === 'runway_reel'
    || pipeline === 'fal_reel'
  );
}

/** Non-photo pipeline a zero-capacity slot falls back to, by post format.
 *
 * Returns null for carousel because plan-time capacity reroutes preserve the
 * multi-photo diversity fallback; runtime escalation uses `tryGalleryFailureEscalation`
 * which additionally allows carousel → fal_only_post as a last resort.
 */
export function falOnlyPipelineForPostType(
  postType: 'feed' | 'story' | 'reel' | 'carousel',
): string | null {
  if (postType === 'carousel') return null; // capacity reroutes: keep diversity fallback
  if (postType === 'story') return 'fal_only_story';
  if (postType === 'reel') return 'fal_only_reel';
  return 'fal_only_post';
}

/**
 * Last-resort pipeline mapping used only in runtime escalation (after gallery
 * gating actually fires). Carousel escalates to fal_only_post (single AI image)
 * rather than exhausting — one solid image is better than a permanent failure
 * when the gallery has no suitable photos for the slot (e.g. testimonial carousel
 * with no customer review photos in the gallery).
 */
function falLastResortPipelineForPostType(
  postType: 'feed' | 'story' | 'reel' | 'carousel',
): string {
  if (postType === 'story') return 'fal_only_story';
  if (postType === 'reel') return 'fal_only_reel';
  // carousel → single AI-generated post (format downgrade, but avoids exhaustion)
  return 'fal_only_post';
}

/** Runtime gallery gate failure → reroute to AI visual instead of permanent withhold. */
export function tryGalleryFailureEscalation<
  A extends { pipeline?: string; slot_role?: string },
>(input: {
  assignment: A;
  postType: 'feed' | 'story' | 'reel' | 'carousel';
  missionId?: string;
  stage: string;
}): {
  assignment: A;
  referenceUrl: null;
  pickedFromBrandGallery: false;
  galleryMatchScore: null;
  captionDrivenGenerated: false;
  agentIdeationGalleryLock: false;
} | null {
  if (!input.missionId?.trim()) return null;
  const fallbackPipeline = falLastResortPipelineForPostType(input.postType);
  return {
    // fal_only_* is a valid ProductionPipeline for every assignment shape used here.
    assignment: { ...input.assignment, pipeline: fallbackPipeline } as A,
    referenceUrl: null,
    pickedFromBrandGallery: false,
    galleryMatchScore: null,
    captionDrivenGenerated: false,
    agentIdeationGalleryLock: false,
  };
}

/**
 * Capacity-aware manifest (faz 3.7): slots whose STRICT caption demands a
 * concrete subject the gallery simply does not contain are doomed to
 * `gallery_theme_mismatch` before any photo is picked — the veto/judge chain
 * can only confirm the absence. Instead of enqueueing guaranteed-permanent
 * failures, reroute those slots to the format's fal_only (AI visual) pipeline.
 *
 * Deterministic and vision-driven (canonical subject relations only), so the
 * plan phase and every drain call compute the same verdict for any tenant or
 * sector. Slot roles are preserved — factory job bookkeeping stays intact.
 *
 * Returns a Map of `missionGallerySlotKey` → replacement pipeline.
 */
export function resolveQueueGalleryCapacityReroutes(input: {
  productionLoop: ManifestProductionQueueItem[];
  galleryMeta: Record<string, GalleryPhotoMeta>;
  galleryPhotos: string[];
  hasRealBrandPhotos: boolean;
  resolvedBrandName: string;
}): Map<string, string> {
  const out = new Map<string, string>();
  if (!input.hasRealBrandPhotos || input.galleryPhotos.length === 0) return out;

  // Canonical subject relations per slot — alias/family aware, no dictionary.
  const relationsForSubject = (subjectKey: string): CanonicalSubjectRelation[] =>
    input.galleryPhotos.map((url) => {
      const meta = resolveGalleryPhotoMeta(url, input.galleryMeta, input.galleryPhotos);
      return canonicalSubjectRelationForMeta(subjectKey, meta);
    });

  for (const queueItem of input.productionLoop) {
    if (!assignmentUsesGalleryPhoto(queueItem.assignment)) continue;
    const postType = assignmentPostType(queueItem.assignment);
    const fallbackPipeline = falOnlyPipelineForPostType(postType);
    if (!fallbackPipeline) continue;

    const idea = queueItem.idea as Record<string, unknown>;
    const caption = String(idea.caption_draft ?? idea.caption ?? '').trim();
    const headline = resolveIdeationHeadline(idea);

    const subjectKey = resolveGalleryMatchSubjectKey({
      caption,
      headline,
      subjectKey: String(idea.subject_key ?? idea.subjectKey ?? '').trim() || undefined,
    });
    if (!subjectKey) continue;

    const relations = relationsForSubject(subjectKey);
    if (relations.includes('match')) continue;

    // Doom is guaranteed only when NO alternative pick path remains:
    // - strict captions forbid relaxed/diversity fallbacks entirely, OR
    // - every photo hard-conflicts with the subject (veto fires on any pick).
    // 'unknown' relations + non-strict caption → diversity + judge may still
    // ship a photo; leave those slots on the gallery pipeline.
    const strict = captionRequiresStrictGalleryMatch(caption, headline);
    const allConflict = relations.length > 0 && relations.every((r) => r === 'conflict');
    if (!strict && !allConflict) continue;

    out.set(
      missionGallerySlotKey(queueItem.ideaIndex, String(queueItem.assignment.slot_role)),
      fallbackPipeline,
    );
  }

  return out;
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
  /**
   * Photos already reserved by plan-time (factory) slot assignments — excluded
   * so a drain-time recompute for uncovered slots cannot double-book them.
   */
  preassignedUrls?: string[];
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

  const seedExclude = [
    ...(input.galleryUsage
      ? getMissionWideExcludeUrls(input.galleryUsage, {
        feed: [],
        story: [],
        reel: [],
        carousel: [],
      })
      : []),
    ...(input.preassignedUrls ?? []),
  ];

  const batchAssigned = assignPhotosToContents(
    assignItems.map(({ key, input: matchIn, postType }) => ({ key, input: matchIn, postType })),
    input.galleryPhotos,
    input.galleryMeta,
    { minScore: MIN_ACCEPT_SCORE, excludeUrls: seedExclude },
  );

  let judgeRejected = 0;
  let judgeSwapped = 0;
  let judgeEscalated = 0;
  let redistributed = 0;
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

  // Redistribution: judge rejections release their photos back into the pool.
  // Slots that starved in the greedy pass (photo taken by a rejected sibling)
  // get one deterministic re-assignment round over the freed pool; each new
  // pick passes the same judge gate. Single round — no reject/retry loops.
  if (judgeRejected > 0) {
    const openItems = assignItems.filter((i) => !result.get(i.key)?.url);
    if (openItems.length > 0) {
      const reservedNow = [
        ...seedExclude,
        ...[...result.values()].flatMap((v) => (v?.url ? [v.url] : [])),
      ];
      const secondPass = assignPhotosToContents(
        openItems.map(({ key, input: matchIn, postType }) => ({ key, input: matchIn, postType })),
        input.galleryPhotos,
        input.galleryMeta,
        { minScore: MIN_ACCEPT_SCORE, excludeUrls: reservedNow },
      );
      for (const item of openItems) {
        const val = secondPass.get(item.key);
        if (!val?.url) continue;
        const gated = await gatePhotoMatchResult(val, item.input, input.galleryMeta, input.galleryPhotos, {
          excludeUrls: reservedNow,
          workspaceId: input.workspaceId,
          missionId: input.missionId,
          slotKey: `${item.key}::redistribute`,
        });
        if (gated?.url) {
          result.set(item.key, { ...gated, reason: `${gated.reason},redistributed` });
          reservedNow.push(gated.url);
          redistributed += 1;
        }
      }
    }
  }

  // Judge escalation: slots the greedy batch left empty may still have a
  // subject-aligned gallery photo whose deterministic score fell below the
  // acceptance floor (e.g. honey caption vs thyme_honey jar). Fail-closed —
  // only a confirmed judge verdict assigns the photo.
  const usedBases = new Set(seedExclude.map(normalizeGalleryUrl));
  for (const v of result.values()) {
    if (v?.url) usedBases.add(normalizeGalleryUrl(v.url));
  }
  for (const item of assignItems) {
    if (result.get(item.key)?.url) continue;
    const escalatedPick = await escalateSubjectAlignedPick(
      item.input,
      input.galleryMeta,
      input.galleryPhotos,
      {
        excludeUrls: [...usedBases],
        workspaceId: input.workspaceId,
        missionId: input.missionId,
        slotKey: item.key,
      },
    );
    if (escalatedPick?.url) {
      result.set(item.key, escalatedPick);
      usedBases.add(normalizeGalleryUrl(escalatedPick.url));
      judgeEscalated += 1;
    }
  }

  const assignedCount = [...result.values()].filter(Boolean).length;
  const diversityCount = [...result.values()].filter(
    (v) => v?.reason?.includes('mission_diversity_fallback'),
  ).length;

  console.log(
    `[auto-produce] Mission gallery batch assign: ${assignItems.length} slots, ` +
    `${assignedCount} assigned (${assignedCount - diversityCount} semantic, ${diversityCount} diversity)` +
    (judgeRejected || judgeSwapped || judgeEscalated || redistributed
      ? `, judge: ${judgeRejected} rejected, ${judgeSwapped} swapped, `
        + `${judgeEscalated} escalated, ${redistributed} redistributed`
      : ''),
  );

  return result;
}

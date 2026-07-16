/**
 * APO-1/2 — Feed Art Director assignment → production pipeline routing.
 */
import {
  buildMissionProductionManifest,
  isContentScopedMissionProduction,
  isIdeaDrivenMissionProduction,
  MISSION_WEEKLY_PACKAGE_COUNTS,
  resolveMissionRequiredSlotCount,
  pipelineForSlotRole,
  normalizeProductionPipeline,
  type MissionProductionManifest,
  type ProductionAssignment,
  type ProductionPipeline,
  type ProductionSlotRole,
} from './mission-production-manifest';
import { isPromoOfferCopy } from './poster-quality';
import {
  applyMissionFalStoryAssignment,
  shouldApplyMissionFalStory,
} from './mission-fal-story';
import {
  applyMissionFalAdAssignment,
  shouldApplyMissionFalAd,
} from './mission-fal-ad';
import {
  mapProductionContextToLibrarySlotKey,
  resolveStandardLibrarySlotKey,
} from './brand-template-library';
import { isAgencyServiceSector } from './agency-production-defaults';
import {
  isCalendarProductionIdea,
  resolveCalendarSlotAssignment,
} from './calendar-production-pack';
import {
  detectIdeaPackageFormat,
  type FeedArtDirectorReport,
} from './weekly-publish-package';
import {
  isFeedDirectorFallback,
  type ProductionProfile,
} from './production-profile';
import { resolveContentIntent } from './brand-motion-profile';
import { resolveIdeationHeadline } from './production-idea-parse';

export type { ProductionAssignment } from './mission-production-manifest';

/** Strategist — normalize headline for within-mission diversity checks. */
export function strategistHeadlineKey(idea: Record<string, unknown>): string {
  return resolveIdeationHeadline(idea)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
}

/**
 * Prefer unused ideas with distinct headlines before round-robin reuse.
 * When ideation pool < manifest slots, reuse is unavoidable but order is shuffled.
 */
export function pickStrategistIdeaIndex(
  ideas: Record<string, unknown>[],
  usedIndices: Set<number>,
  usedHeadlines: Set<string>,
  slotOrdinal: number,
): number {
  if (ideas.length === 0) return -1;

  for (let i = 0; i < ideas.length; i++) {
    if (usedIndices.has(i)) continue;
    const key = strategistHeadlineKey(ideas[i]!);
    if (key && !usedHeadlines.has(key)) return i;
  }

  const unused = findUnusedIdeaIndex(usedIndices, ideas.length);
  if (unused >= 0) return unused;

  return slotOrdinal % ideas.length;
}

const CAMPAIGN_ROLES = new Set<ProductionSlotRole>([
  'campaign_story_motion',
  'campaign_reel_motion',
]);

function defaultCopyBundleId(missionId: string): string {
  return missionId ? `${missionId.slice(0, 8)}-week` : 'default-week';
}

function publishChannelForRole(role: ProductionSlotRole): ProductionAssignment['publish_channel'] {
  if (role === 'paid_ad_google_creative') return 'google_ads';
  if (role === 'paid_ad_creative') return 'meta_ads';
  if (CAMPAIGN_ROLES.has(role)) return 'instagram_campaign';
  return 'instagram_organic';
}

function isCampaignIdea(idea: Record<string, unknown>): boolean {
  const useCase = String(idea.template_use_case || '').toLowerCase();
  const headline = String(idea.headline || idea.concept_title || '');
  const caption = String(idea.caption_draft || idea.caption || '');
  return useCase.includes('campaign')
    || useCase.includes('event')
    || useCase.includes('announcement')
    || isPromoOfferCopy(headline, caption);
}

/** Heuristic slot when FD did not assign (backward compatible). */
export function inferProductionAssignment(
  ideaIndex: number,
  idea: Record<string, unknown>,
  missionId: string,
  postIndex: number,
  storyIndex: number,
  reelIndex: number,
  sector?: string,
): ProductionAssignment {
  const fmt = detectIdeaPackageFormat(idea);
  const campaign = isCampaignIdea(idea);
  const bundleId = defaultCopyBundleId(missionId);

  if (fmt === 'reel') {
    const role: ProductionSlotRole = campaign ? 'campaign_reel_motion' : 'organic_reel';
    return {
      idea_index: ideaIndex,
      slot_role: role,
      pipeline: pipelineForSlotRole(role),
      copy_bundle_id: bundleId,
      publish_channel: publishChannelForRole(role),
      rationale: 'heuristic_reel',
    };
  }

  if (fmt === 'story') {
    const base: ProductionAssignment = {
      idea_index: ideaIndex,
      slot_role: 'campaign_story_motion',
      pipeline: 'fal_story',
      copy_bundle_id: bundleId,
      publish_channel: publishChannelForRole('campaign_story_motion'),
      rationale: 'heuristic_fal_story',
    };
    return applyMissionFalStoryAssignment(base, storyIndex);
  }

  if (fmt === 'carousel') {
    return {
      idea_index: ideaIndex,
      slot_role: 'organic_carousel',
      pipeline: 'carousel_gallery',
      copy_bundle_id: bundleId,
      publish_channel: 'instagram_organic',
      rationale: 'heuristic_carousel',
    };
  }

  // post: berber/ajans → tüm postlar tasarımsal; diğer sektörlerde 2.+ post designed
  const agencyPosts = sector ? isAgencyServiceSector(sector) : false;
  if (campaign || postIndex > 0 || agencyPosts) {
    return {
      idea_index: ideaIndex,
      slot_role: 'designed_post',
      pipeline: 'fal_design',
      copy_bundle_id: bundleId,
      publish_channel: campaign ? 'instagram_campaign' : 'instagram_organic',
      rationale: campaign
        ? 'heuristic_campaign_post'
        : agencyPosts
          ? 'heuristic_agency_designed_post'
          : 'heuristic_designed_post',
    };
  }

  return {
    idea_index: ideaIndex,
    slot_role: 'organic_post',
    pipeline: 'gallery_photo',
    copy_bundle_id: bundleId,
    publish_channel: 'instagram_organic',
    rationale: 'heuristic_organic_post',
  };
}

/**
 * Ad-hoc "New Brief" → fal.ai art-director track (designed post / designed reel).
 * Uses brand DNA + user intent; legacy engine heuristics yok.
 */
export function inferAdHocBriefAssignment(
  ideaIndex: number,
  idea: Record<string, unknown>,
  missionId: string,
): ProductionAssignment {
  const fmt = detectIdeaPackageFormat(idea);
  const bundleId = defaultCopyBundleId(missionId);
  const sceneHint = String(
    idea.visual_direction ?? idea.visual_subject_hint ?? idea.visual_direction_hint ?? '',
  ).trim();

  if (fmt === 'reel' || fmt === 'story') {
    const isStory = fmt === 'story';
    const role: ProductionSlotRole = isStory ? 'campaign_story_motion' : 'fal_reel_motion';
    const pipeline = isStory ? 'fal_story' : 'fal_reel';
    return {
      idea_index: ideaIndex,
      slot_role: role,
      pipeline,
      copy_bundle_id: bundleId,
      publish_channel: publishChannelForRole(role),
      visual_subject_hint: sceneHint || undefined,
      rationale: isStory ? 'ad_hoc_brief_fal_story' : 'ad_hoc_brief_fal_reel',
    };
  }

  return {
    idea_index: ideaIndex,
    slot_role: 'fal_designed_post',
    pipeline: pipelineForSlotRole('fal_designed_post'),
    copy_bundle_id: bundleId,
    publish_channel: publishChannelForRole('fal_designed_post'),
    visual_subject_hint: sceneHint || undefined,
    rationale: 'ad_hoc_brief_fal_designed_post',
  };
}

export function parseProductionAssignments(
  report: FeedArtDirectorReport | null | undefined,
): ProductionAssignment[] {
  const raw = report?.production_assignments;
  if (!Array.isArray(raw)) return [];
  const out: ProductionAssignment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const ideaIndex = Number((item as ProductionAssignment).idea_index);
    const role = (item as ProductionAssignment).slot_role;
    if (!Number.isFinite(ideaIndex) || ideaIndex < 0 || !role) continue;
    const pipeline = (item as ProductionAssignment).pipeline
      ?? pipelineForSlotRole(role);
    out.push({
      idea_index: ideaIndex,
      slot_role: role,
      pipeline,
      copy_bundle_id: String((item as ProductionAssignment).copy_bundle_id || ''),
      publish_channel: (item as ProductionAssignment).publish_channel
        ?? publishChannelForRole(role),
      layout_family_hint: (item as ProductionAssignment).layout_family_hint,
      library_slot_key: (item as ProductionAssignment).library_slot_key
        ? String((item as ProductionAssignment).library_slot_key)
        : undefined,
      catalog_slot_key: (item as ProductionAssignment).catalog_slot_key
        ? String((item as ProductionAssignment).catalog_slot_key)
        : undefined,
      visual_subject_hint: (item as ProductionAssignment).visual_subject_hint
        ? String((item as ProductionAssignment).visual_subject_hint)
        : undefined,
      fal_design_hint: (item as ProductionAssignment).fal_design_hint
        ? String((item as ProductionAssignment).fal_design_hint)
        : undefined,
      rationale: (item as ProductionAssignment).rationale,
    });
  }
  return out;
}

function resolveDeterministicLibrarySlotKey(input: {
  assignment: ProductionAssignment;
  idea: Record<string, unknown>;
  storyOrdinal?: number;
  posterOrdinal?: number;
}): string | undefined {
  const { assignment, idea } = input;
  if (assignment.library_slot_key) return assignment.library_slot_key;

  const hasEventDetails = Boolean(
    (idea.event_details as Record<string, unknown> | undefined)?.artist_name
    || (idea.event_details as Record<string, unknown> | undefined)?.date
    || (idea.event_details as Record<string, unknown> | undefined)?.event_date,
  );

  const mappedKey = mapProductionContextToLibrarySlotKey({
    slotRole: assignment.slot_role,
    intent: resolveContentIntent({
      templateUseCase: String(idea.template_use_case || ''),
      treatment: String(
        idea.treatment
        ?? (idea.visual_production_spec as Record<string, unknown> | undefined)?.treatment
        ?? '',
      ),
      headline: String(idea.headline || idea.concept_title || ''),
    }),
    templateUseCase: String(idea.template_use_case || ''),
    treatment: String(
      idea.treatment
      ?? (idea.visual_production_spec as Record<string, unknown> | undefined)?.treatment
      ?? '',
    ),
    hasEventDetails,
  });

  const standardKey = resolveStandardLibrarySlotKey({
    slotRole: assignment.slot_role,
    pipeline: assignment.pipeline,
    storyOrdinal: input.storyOrdinal,
    posterOrdinal: input.posterOrdinal,
  });
  if (standardKey) {
    // Standard wins for Remotion roles so every brand follows the same
    // slot-to-template contract from Brand Settings.
    return standardKey;
  }

  if (shouldApplyMissionFalStory(assignment)) {
    return mappedKey;
  }

  return undefined;
}

function enrichAssignment(
  assignment: ProductionAssignment,
  idea: Record<string, unknown>,
  opts?: {
    storyOrdinal?: number;
    posterOrdinal?: number;
  },
): ProductionAssignment {
  const catalogKey = assignment.catalog_slot_key
    ?? (idea.catalog_slot_key as string | undefined);

  // library_slot_key stays a LEGACY Remotion/library key (event_story, campaign_post…)
  // for LIBRARY_SLOT_TO_TEMPLATE_TYPES routing + typography lookup. The catalog id
  // travels only in catalog_slot_key (SSOT hard pin) — never copied into library_slot_key.
  const librarySlotKey = resolveDeterministicLibrarySlotKey({
    assignment,
    idea,
    storyOrdinal: opts?.storyOrdinal,
    posterOrdinal: opts?.posterOrdinal,
  });

  if (!catalogKey && !librarySlotKey) return assignment;
  return {
    ...assignment,
    ...(catalogKey ? { catalog_slot_key: catalogKey } : {}),
    ...(librarySlotKey ? { library_slot_key: librarySlotKey } : {}),
  };
}

/**
 * Canonicalize legacy fal story slot names — keep fal_story pipeline (do NOT downgrade to reel).
 */
export function normalizeVideoTrackAssignment(assignment: ProductionAssignment): ProductionAssignment {
  if (assignment.slot_role === 'fal_story_motion' || assignment.pipeline === 'fal_story') {
    return {
      ...assignment,
      slot_role: 'campaign_story_motion',
      pipeline: 'fal_story',
      publish_channel: publishChannelForRole('campaign_story_motion'),
    };
  }
  if (assignment.slot_role === 'fal_only_story' || assignment.pipeline === 'fal_only_story') {
    return {
      ...assignment,
      slot_role: 'fal_only_story',
      pipeline: 'fal_only_story',
      publish_channel: publishChannelForRole('fal_only_story'),
    };
  }
  return assignment;
}

export function resolveProductionAssignment(input: {
  ideaIndex: number;
  idea: Record<string, unknown>;
  report?: FeedArtDirectorReport | null;
  missionId: string;
  postIndex: number;
  storyIndex: number;
  reelIndex: number;
  sector?: string;
  /** New Brief form — route to fal.ai art-director pipelines. */
  adHocBrief?: boolean;
}): ProductionAssignment {
  const fromReport = parseProductionAssignments(input.report).find(
    (a) => a.idea_index === input.ideaIndex,
  );
  let assignment: ProductionAssignment;
  if (fromReport?.slot_role) {
    const pipeline = normalizeProductionPipeline(fromReport.pipeline || pipelineForSlotRole(fromReport.slot_role));
    assignment = enrichAssignment({
      ...fromReport,
      pipeline,
      copy_bundle_id: fromReport.copy_bundle_id || defaultCopyBundleId(input.missionId),
      publish_channel: fromReport.publish_channel || publishChannelForRole(fromReport.slot_role),
    }, input.idea, {
      storyOrdinal: input.storyIndex,
      posterOrdinal: input.postIndex,
    });
  } else if (input.adHocBrief) {
    assignment = inferAdHocBriefAssignment(input.ideaIndex, input.idea, input.missionId);
  } else {
    assignment = inferProductionAssignment(
      input.ideaIndex,
      input.idea,
      input.missionId,
      input.postIndex,
      input.storyIndex,
      input.reelIndex,
      input.sector,
    );
  }
  assignment = enrichAssignment(assignment, input.idea, {
    storyOrdinal: input.storyIndex,
    posterOrdinal: input.postIndex,
  });
  assignment = normalizeVideoTrackAssignment(assignment);
  // Ad-hoc brief stays on fal.ai — never downgrade to Remotion story.
  if (input.adHocBrief) {
    return assignment;
  }
  if (shouldApplyMissionFalAd(assignment)) {
    return applyMissionFalAdAssignment(assignment);
  }
  if (shouldApplyMissionFalStory(assignment)) {
    return applyMissionFalStoryAssignment(assignment, input.storyIndex);
  }
  if (
    detectIdeaPackageFormat(input.idea) === 'story'
    && assignmentImpliesStoryFormat(assignment.slot_role)
    && assignment.slot_role !== 'organic_story_still'
  ) {
    return applyMissionFalStoryAssignment(assignment, input.storyIndex);
  }
  return assignment;
}

/** Reel production follows FD slot, not only content_kind=instagram_reel. */
export function assignmentImpliesReel(role: ProductionSlotRole): boolean {
  return role === 'organic_reel'
    || role === 'campaign_reel_motion'
    || role === 'fal_reel_motion'
    || role === 'fal_only_reel';
}

export function assignmentImpliesStoryFormat(role: ProductionSlotRole): boolean {
  return role === 'campaign_story_motion'
    || role === 'organic_story_still'
    || role === 'product_showcase_story';
}

/**
 * Story slots that must publish a designed overlay — never a raw gallery photo
 * when the design pipeline fails silently.
 */
export function assignmentRequiresDesignedStoryVisual(
  assignment: Pick<ProductionAssignment, 'pipeline' | 'slot_role'>,
): boolean {
  return assignment.pipeline === 'fal_story'
    || assignment.pipeline === 'fal_only_story'
    || assignment.slot_role === 'campaign_story_motion';
}

export function shouldUseGalleryOnlyPost(assignment: ProductionAssignment): boolean {
  return assignment.pipeline === 'gallery_photo';
}

export interface ManifestProductionQueueItem {
  queueIndex: number;
  ideaIndex: number;
  idea: Record<string, unknown>;
  assignment: ProductionAssignment;
}

function findUnusedIdeaIndex(used: Set<number>, ideasLen: number): number {
  if (ideasLen <= 0) return -1;
  for (let i = 0; i < ideasLen; i++) {
    if (!used.has(i)) return i;
  }
  return -1;
}

/** Manifest slotları için fikir havuzu yetersizse round-robin (aynı fikir farklı formatta). */
function resolveIdeaIndexForSlot(
  slotOrdinal: number,
  used: Set<number>,
  ideasLen: number,
): number {
  if (ideasLen <= 0) return -1;
  const unused = findUnusedIdeaIndex(used, ideasLen);
  if (unused >= 0) return unused;
  return slotOrdinal % ideasLen;
}

function backfillAssignmentsFromManifest(
  assignments: ProductionAssignment[],
  missionId: string,
  missionType: MissionProductionManifest['missionType'],
  ideas: Record<string, unknown>[],
  sector?: string,
  opts?: {
    requireCampaignReel?: boolean;
    productionProfile?: ProductionProfile | null;
    packageSlug?: string | null;
  },
): ProductionAssignment[] {
  const validation = validateManifestAgainstAssignments(
    missionId,
    assignments,
    missionType,
    opts,
  );
  if (!validation.missingRoles.length) return assignments;

  const manifest = buildMissionProductionManifest({
    missionId,
    missionType,
    includeAds: missionType === 'ads_focus',
    requireCampaignReel: opts?.requireCampaignReel,
    productionProfile: opts?.productionProfile,
    packageSlug: opts?.packageSlug,
  });
  const usedIdeas = new Set(
    assignments
      .map((a) => a.idea_index)
      .filter((i) => Number.isFinite(i) && i >= 0),
  );
  const result = [...assignments];
  let postIdx = 0;
  let storyIdx = 0;
  let reelIdx = 0;

  for (const role of validation.missingRoles) {
    const ideaIdx = resolveIdeaIndexForSlot(result.length, usedIdeas, ideas.length);
    if (ideaIdx < 0) break;
    usedIdeas.add(ideaIdx);
    const idea = ideas[ideaIdx]!;
    const slot = manifest.slots.find((s) => s.role === role);
    const inferred = inferProductionAssignment(
      ideaIdx,
      idea,
      missionId,
      postIdx,
      storyIdx,
      reelIdx,
      sector,
    );
    const fmt = detectIdeaPackageFormat(idea);
    if (fmt === 'post' || fmt === 'carousel') postIdx += 1;
    else if (fmt === 'story') storyIdx += 1;
    else if (fmt === 'reel') reelIdx += 1;

    result.push({
      idea_index: ideaIdx,
      slot_role: role,
      pipeline: slot?.pipeline ?? inferred.pipeline,
      copy_bundle_id: defaultCopyBundleId(missionId),
      publish_channel: publishChannelForRole(role),
      rationale: 'manifest_backfill',
    });
  }
  return result;
}

/** FD veya manifest ataması hedef slot sayısından kısaysa eksik rolleri manifest'ten tamamla. */
function expandAssignmentsToWeeklyTotal(
  assignments: ProductionAssignment[],
  missionId: string,
  missionType: MissionProductionManifest['missionType'],
  ideas: Record<string, unknown>[],
  sector?: string,
  opts?: {
    requireCampaignReel?: boolean;
    productionProfile?: ProductionProfile | null;
    packageSlug?: string | null;
  },
): ProductionAssignment[] {
  let expanded = backfillAssignmentsFromManifest(
    assignments,
    missionId,
    missionType,
    ideas,
    sector,
    opts,
  );
  const slotTarget = resolveMissionRequiredSlotCount({
    missionType,
    requireCampaignReel: opts?.requireCampaignReel,
    productionProfile: opts?.productionProfile,
    packageSlug: opts?.packageSlug,
  });
  if (expanded.length >= slotTarget || ideas.length === 0) {
    return expanded.slice(0, slotTarget);
  }

  const manifest = buildMissionProductionManifest({
    missionId,
    missionType,
    includeAds: missionType === 'ads_focus',
    requireCampaignReel: opts?.requireCampaignReel,
    productionProfile: opts?.productionProfile,
    packageSlug: opts?.packageSlug,
  });
  const required = manifest.slots.filter((s) => s.required);
  let postIdx = 0;
  let storyIdx = 0;
  let reelIdx = 0;

  while (expanded.length < slotTarget) {
    const slot = required[expanded.length];
    if (!slot) break;
    const ideaIdx = expanded.length % ideas.length;
    const idea = ideas[ideaIdx]!;
    const inferred = inferProductionAssignment(
      ideaIdx,
      idea,
      missionId,
      postIdx,
      storyIdx,
      reelIdx,
      sector,
    );
    const fmt = detectIdeaPackageFormat(idea);
    if (fmt === 'post' || fmt === 'carousel') postIdx += 1;
    else if (fmt === 'story') storyIdx += 1;
    else if (fmt === 'reel') reelIdx += 1;

    expanded.push({
      idea_index: ideaIdx,
      slot_role: slot.role,
      pipeline: slot.pipeline ?? inferred.pipeline,
      copy_bundle_id: defaultCopyBundleId(missionId),
      publish_channel: publishChannelForRole(slot.role),
      rationale: 'weekly_slot_expand',
    });
  }

  return expanded.slice(0, slotTarget);
}

export interface FinalMissionAssignment {
  ideaIndex: number;
  assignment: ProductionAssignment;
}

export interface ResolveFinalAssignmentsInput {
  missionId: string;
  ideas: Record<string, unknown>[];
  report?: FeedArtDirectorReport | null;
  manifestMissionType: MissionProductionManifest['missionType'];
  sector?: string;
  requireCampaignReel?: boolean;
  productionProfile?: ProductionProfile | null;
  packageSlug?: string | null;
}

function enrichResolvedAssignment(
  raw: ProductionAssignment,
  ideaIdx: number,
  idea: Record<string, unknown>,
  missionId: string,
  counters: { storyOrdinal: number; posterOrdinal: number },
): ProductionAssignment {
  let assignment = enrichAssignment({
    ...raw,
    idea_index: ideaIdx,
    pipeline: normalizeProductionPipeline(raw.pipeline || pipelineForSlotRole(raw.slot_role)),
    copy_bundle_id: raw.copy_bundle_id || defaultCopyBundleId(missionId),
    publish_channel: raw.publish_channel || publishChannelForRole(raw.slot_role),
  }, idea, {
    storyOrdinal: counters.storyOrdinal,
    posterOrdinal: counters.posterOrdinal,
  });

  if (shouldApplyMissionFalAd(assignment)) {
    assignment = applyMissionFalAdAssignment(assignment);
  } else if (shouldApplyMissionFalStory(assignment)) {
    assignment = applyMissionFalStoryAssignment(assignment, counters.storyOrdinal);
    counters.storyOrdinal += 1;
  }

  return assignment;
}

/** One production slot per ideation idea — no manifest expansion to 16. */
function resolveIdeaDrivenFinalAssignments(
  input: ResolveFinalAssignmentsInput,
): FinalMissionAssignment[] {
  const rawAssignments = parseProductionAssignments(input.report);
  let normalized = input.productionProfile
    ? normalizeAssignmentsForProductionProfile(rawAssignments, input.productionProfile)
    : rawAssignments;

  const fdByIdea = new Map<number, ProductionAssignment>();
  for (const assignment of normalized) {
    const idx = assignment.idea_index;
    if (Number.isFinite(idx) && idx >= 0 && idx < input.ideas.length && !fdByIdea.has(idx)) {
      fdByIdea.set(idx, assignment);
    }
  }

  const result: FinalMissionAssignment[] = [];
  const counters = { storyOrdinal: 0, posterOrdinal: 0 };
  let postIdx = 0;
  let storyIdx = 0;
  let reelIdx = 0;

  for (let ideaIdx = 0; ideaIdx < input.ideas.length; ideaIdx++) {
    const idea = input.ideas[ideaIdx]!;
    const fmt = detectIdeaPackageFormat(idea);
    const postIndex = fmt === 'post' || fmt === 'carousel' ? postIdx : 0;
    const storyIndex = fmt === 'story' ? storyIdx : 0;
    const reelIndex = fmt === 'reel' ? reelIdx : 0;
    if (fmt === 'post' || fmt === 'carousel') postIdx += 1;
    else if (fmt === 'story') storyIdx += 1;
    else if (fmt === 'reel') reelIdx += 1;

    const base = isCalendarProductionIdea(idea)
      ? resolveCalendarSlotAssignment(idea, storyIndex)
      : fdByIdea.get(ideaIdx) ?? inferProductionAssignment(
        ideaIdx,
        idea,
        input.missionId,
        postIndex,
        storyIndex,
        reelIndex,
        input.sector,
      );

    result.push({
      ideaIndex: ideaIdx,
      assignment: enrichResolvedAssignment(
        { ...base, idea_index: ideaIdx },
        ideaIdx,
        idea,
        input.missionId,
        counters,
      ),
    });
  }

  return result;
}

/**
 * SSOT — produce the final, fully-enriched mission assignment list.
 *
 * This is the *single* place that resolves FD assignments → manifest backfill →
 * heuristic → idea-index assignment → `enrichAssignment` (library slot) →
 * `applyMissionFalStoryAssignment` (story rotation). Both the production
 * queue (`buildManifestProductionQueue`) and the gate/stack-context prep
 * (`prepareMissionFdAssignments`) consume this so the gate validates exactly what
 * is produced. Extracted behaviour-identical from the queue builder — golden
 * tests in `production-pipeline-router.test.ts` pin the output.
 */
export function resolveFinalMissionAssignments(
  input: ResolveFinalAssignmentsInput,
): FinalMissionAssignment[] {
  if (!input.missionId || input.ideas.length === 0) return [];

  if (
    isContentScopedMissionProduction(input.manifestMissionType)
    || isIdeaDrivenMissionProduction(input.manifestMissionType)
  ) {
    return resolveIdeaDrivenFinalAssignments(input);
  }

  const organicTarget = resolveMissionRequiredSlotCount({
    missionType: input.manifestMissionType,
    requireCampaignReel: input.requireCampaignReel,
    productionProfile: input.productionProfile,
    packageSlug: input.packageSlug,
  });
  // Legacy manifest path: fixed weekly package geometry (opportunity / ads_focus).
  const maxSlots = organicTarget;

  let assignments = parseProductionAssignments(input.report);
  if (input.productionProfile) {
    assignments = normalizeAssignmentsForProductionProfile(assignments, input.productionProfile);
  }
  if (assignments.length) {
    assignments = expandAssignmentsToWeeklyTotal(
      assignments,
      input.missionId,
      input.manifestMissionType,
      input.ideas,
      input.sector,
      {
        requireCampaignReel: input.requireCampaignReel,
        productionProfile: input.productionProfile,
        packageSlug: input.packageSlug,
      },
    );
  } else {
    const manifest = buildMissionProductionManifest({
      missionId: input.missionId,
      missionType: input.manifestMissionType,
      includeAds: input.manifestMissionType === 'ads_focus',
      requireCampaignReel: input.requireCampaignReel,
        productionProfile: input.productionProfile,
        packageSlug: input.packageSlug,
    });
    const required = manifest.slots.filter((s) => s.required);
    let postIdx = 0;
    let storyIdx = 0;
    let reelIdx = 0;
    assignments = required.slice(0, maxSlots).map((slot, slotIdx) => {
      const ideaIdx = slotIdx % input.ideas.length;
      const idea = input.ideas[ideaIdx]!;
      if (slot.format === 'post' || slot.format === 'carousel') postIdx += 1;
      else if (slot.format === 'story') storyIdx += 1;
      else if (slot.format === 'reel') reelIdx += 1;
      return {
        idea_index: ideaIdx,
        slot_role: slot.role,
        pipeline: slot.pipeline,
        copy_bundle_id: defaultCopyBundleId(input.missionId),
        publish_channel: publishChannelForRole(slot.role),
        rationale: 'manifest_slot_map',
      };
    });
  }

  const result: FinalMissionAssignment[] = [];
  const usedSlotKeys = new Set<string>();
  let storyOrdinal = 0;
  let posterOrdinal = 0;

  for (const raw of assignments) {
    if (result.length >= maxSlots) break;
    let ideaIdx = raw.idea_index;
    if (!Number.isFinite(ideaIdx) || ideaIdx < 0 || ideaIdx >= input.ideas.length) {
      ideaIdx = resolveIdeaIndexForSlot(
        result.length,
        new Set(result.map((q) => q.ideaIndex)),
        input.ideas.length,
      );
    }
    if (ideaIdx < 0 || ideaIdx >= input.ideas.length) continue;

    const slotKey = `${raw.slot_role}:${ideaIdx}`;
    if (usedSlotKeys.has(slotKey)) continue;
    usedSlotKeys.add(slotKey);

    const idea = input.ideas[ideaIdx]!;
    let assignment = enrichAssignment({
      ...raw,
      idea_index: ideaIdx,
      pipeline: normalizeProductionPipeline(raw.pipeline || pipelineForSlotRole(raw.slot_role)),
      copy_bundle_id: raw.copy_bundle_id || defaultCopyBundleId(input.missionId),
      publish_channel: raw.publish_channel || publishChannelForRole(raw.slot_role),
    }, idea, {
      storyOrdinal,
      posterOrdinal,
    });

    if (shouldApplyMissionFalAd(assignment)) {
      assignment = applyMissionFalAdAssignment(assignment);
    } else if (shouldApplyMissionFalStory(assignment)) {
      assignment = applyMissionFalStoryAssignment(assignment, storyOrdinal);
      storyOrdinal += 1;
    }

    result.push({ ideaIndex: ideaIdx, assignment });
  }

  return result;
}

/**
 * P1-4 — Drive auto-produce from manifest slots instead of all merged ideas.
 * Thin wrapper over {@link resolveFinalMissionAssignments} that attaches the idea
 * record to each slot for the production loop.
 */
export function buildManifestProductionQueue(input: {
  missionId: string;
  ideas: Record<string, unknown>[];
  report?: FeedArtDirectorReport | null;
  manifestMissionType: MissionProductionManifest['missionType'];
  sector?: string;
  maxSlots?: number;
  requireCampaignReel?: boolean;
  productionProfile?: ProductionProfile | null;
  packageSlug?: string | null;
}): ManifestProductionQueueItem[] {
  const finalAssignments = resolveFinalMissionAssignments({
    missionId: input.missionId,
    ideas: input.ideas,
    report: input.report,
    manifestMissionType: input.manifestMissionType,
    sector: input.sector,
    requireCampaignReel: input.requireCampaignReel,
    productionProfile: input.productionProfile,
    packageSlug: input.packageSlug,
  });

  return finalAssignments.map((item, queueIndex) => ({
    queueIndex,
    ideaIndex: item.ideaIndex,
    idea: input.ideas[item.ideaIndex]!,
    assignment: item.assignment,
  }));
}

/** Legacy FD `runway_reel` → `fal_reel`; mevcut fal reel slotları korunur. */
export function normalizeAssignmentsForProductionProfile(
  assignments: ProductionAssignment[],
  _profile: ProductionProfile,
): ProductionAssignment[] {
  return assignments.map((a) => {
    if (a.slot_role !== 'organic_reel' && a.slot_role !== 'campaign_reel_motion') return a;
    if (String(a.pipeline ?? '').trim() !== 'runway_reel') return a;
    return {
      ...a,
      pipeline: 'fal_reel',
      publish_channel: publishChannelForRole(a.slot_role),
      rationale: a.rationale
        ? `${a.rationale}; runway_to_fal_reel`
        : 'runway_to_fal_reel',
    };
  });
}

/** P3 — Manifest slot drives content kind, not stale idea content_type. */
export function resolveContentKindForAssignment(
  idea: Record<string, unknown>,
  assignment: ProductionAssignment,
): string {
  // Manifest slot role wins over stale ideation content_type (e.g. story idea → organic_post slot).
  if (assignment.slot_role === 'organic_post' || assignment.pipeline === 'gallery_photo') {
    return 'instagram_post';
  }
  if (
    assignment.slot_role === 'designed_post'
    || assignment.slot_role === 'designed_typography'
  ) {
    return 'instagram_post';
  }
  if (assignment.pipeline === 'carousel_gallery' || assignment.slot_role === 'organic_carousel') {
    return 'instagram_carousel';
  }
  if (assignment.pipeline === 'fal_reel' || assignment.slot_role === 'fal_reel_motion') {
    return 'instagram_reel';
  }
  if (
    assignment.pipeline === 'fal_story'
    || assignment.slot_role === 'fal_story_motion'
    || assignment.slot_role === 'campaign_story_motion'
  ) {
    return 'instagram_story';
  }
  if (assignment.pipeline === 'fal_design' || assignment.slot_role === 'fal_designed_post') {
    return 'instagram_post';
  }
  if (assignment.slot_role === 'paid_ad_creative' || assignment.slot_role === 'paid_ad_google_creative') {
    return 'instagram_post';
  }
  if (assignment.pipeline === 'fal_only_post' || assignment.slot_role === 'fal_only_post') {
    return 'instagram_post';
  }
  if (assignment.pipeline === 'fal_only_story' || assignment.slot_role === 'fal_only_story') {
    return 'instagram_reel';
  }
  if (assignment.pipeline === 'fal_only_reel' || assignment.slot_role === 'fal_only_reel') {
    return 'instagram_reel';
  }
  if (assignmentImpliesStoryFormat(assignment.slot_role)) return 'instagram_story';
  if (assignmentImpliesReel(assignment.slot_role)) return 'instagram_reel';
  const fmt = detectIdeaPackageFormat(idea);
  if (fmt === 'story') return 'instagram_story';
  if (fmt === 'reel') return 'instagram_reel';
  if (fmt === 'carousel') return 'instagram_carousel';
  const ct = String(idea.content_type ?? idea.content_kind ?? 'post').toLowerCase();
  if (ct.includes('reel')) return 'instagram_reel';
  if (ct.includes('story') || ct.includes('canvas')) return 'instagram_story';
  if (ct.includes('carousel')) return 'instagram_carousel';
  return 'instagram_post';
}

const FD_MANIFEST_COVERAGE_BLOCK_THRESHOLD = 85;

export interface FeedDirectorProductionGate {
  allowed: boolean;
  warnOnly: boolean;
  warnings: string[];
  code?: string;
  message?: string;
  coveragePct: number;
  assignmentCount: number;
  requiredSlots: number;
  filledRequired: number;
}

export function evaluateFeedDirectorProductionGate(input: {
  missionId: string | null | undefined;
  report: FeedArtDirectorReport | Record<string, unknown> | null | undefined;
  assignments: ProductionAssignment[];
  rawAssignmentCount: number;
  ideasCount: number;
  manifestMissionType?: MissionProductionManifest['missionType'];
  productionProfile: ProductionProfile;
  packageSlug?: string | null;
  requireCampaignReel?: boolean;
  validation: {
    requiredSlots: number;
    filledRequired: number;
    missingRoles: ProductionSlotRole[];
    coveragePct: number;
  };
}): FeedDirectorProductionGate {
  const reportObj = (input.report ?? null) as Record<string, unknown> | null;
  const reportCoverage = typeof reportObj?.manifest_coverage_pct === 'number'
    ? reportObj.manifest_coverage_pct
    : null;
  const effectiveCoverage = reportCoverage ?? input.validation.coveragePct;
  const warnings: string[] = [];
  const blockPolicy = input.productionProfile.fdFallbackPolicy === 'block';
  /** Mission runs require a full manifest slot map — not warn-only incomplete slots. */
  const hardBlockIncomplete = blockPolicy || Boolean(input.missionId);
  /** Relax only FD assignment heuristics on mission path, not slot completeness. */
  const missionRelaxed = Boolean(input.missionId);

  if (!input.missionId) {
    return {
      allowed: true,
      warnOnly: false,
      warnings: [],
      coveragePct: effectiveCoverage,
      assignmentCount: input.assignments.length,
      requiredSlots: input.validation.requiredSlots,
      filledRequired: input.validation.filledRequired,
    };
  }

  if (input.ideasCount <= 0) {
    return {
      allowed: false,
      warnOnly: false,
      warnings: [],
      code: 'fd_no_ideas',
      message: 'Üretim için fikir havuzu boş — ideation tamamlanmadı.',
      coveragePct: effectiveCoverage,
      assignmentCount: input.assignments.length,
      requiredSlots: input.validation.requiredSlots,
      filledRequired: input.validation.filledRequired,
    };
  }

  if (input.report && isFeedDirectorFallback(reportObj)) {
    // fd_fallback_blocked handled upstream; gate stays open for allow_warn profiles.
    if (!blockPolicy) {
      warnings.push('Feed Art Director yedek routing kullandı');
    }
  }

  const hasFdPayload = Boolean(
    input.report
    && (
      reportObj?.feed_score != null
      || reportObj?.production_package
      || input.rawAssignmentCount > 0
    ),
  );
  if (hasFdPayload && input.rawAssignmentCount === 0) {
    if (missionRelaxed && input.ideasCount > 0) {
      warnings.push(
        input.assignments.length > 0
          ? 'Feed Art Director slot ataması eksik — manifest heuristic routing kullanıldı'
          : 'Feed Art Director slot ataması eksik — manifest slot map ile devam ediliyor',
      );
    } else {
      return {
        allowed: false,
        warnOnly: false,
        warnings: [],
        code: 'fd_no_assignments',
        message: 'Feed Art Director raporu var ama slot ataması (production_assignments) eksik.',
        coveragePct: effectiveCoverage,
        assignmentCount: 0,
        requiredSlots: input.validation.requiredSlots,
        filledRequired: input.validation.filledRequired,
      };
    }
  }

  const organicTarget = input.validation.requiredSlots;
  if (
    hasFdPayload
    && input.assignments.length < organicTarget
  ) {
    const msg = `FD atamaları eksik (${input.assignments.length}/${organicTarget})`;
    const assignRatio = organicTarget > 0
      ? input.assignments.length / organicTarget
      : 0;
    if (hardBlockIncomplete && assignRatio < 0.75) {
      return {
        allowed: false,
        warnOnly: false,
        warnings: [],
        code: 'fd_incomplete_assignments',
        message: msg,
        coveragePct: effectiveCoverage,
        assignmentCount: input.assignments.length,
        requiredSlots: input.validation.requiredSlots,
        filledRequired: input.validation.filledRequired,
      };
    }
    warnings.push(msg);
  }

  if (input.validation.filledRequired < input.validation.requiredSlots) {
    const msg = `Manifest slotları eksik (${input.validation.filledRequired}/${input.validation.requiredSlots})`;
    const fillRatio = input.validation.requiredSlots > 0
      ? input.validation.filledRequired / input.validation.requiredSlots
      : 0;
    if (hardBlockIncomplete && fillRatio < 0.75) {
      return {
        allowed: false,
        warnOnly: false,
        warnings: [],
        code: 'fd_incomplete_manifest',
        message: msg,
        coveragePct: effectiveCoverage,
        assignmentCount: input.assignments.length,
        requiredSlots: input.validation.requiredSlots,
        filledRequired: input.validation.filledRequired,
      };
    }
    warnings.push(msg);
  }

  if (
    hasFdPayload
    && reportCoverage != null
    && reportCoverage < FD_MANIFEST_COVERAGE_BLOCK_THRESHOLD
    && hardBlockIncomplete
  ) {
    return {
      allowed: false,
      warnOnly: false,
      warnings: [],
      code: 'fd_low_manifest_coverage',
      message: `FD manifest kapsamı düşük (${reportCoverage}% < ${FD_MANIFEST_COVERAGE_BLOCK_THRESHOLD}%)`,
      coveragePct: effectiveCoverage,
      assignmentCount: input.assignments.length,
      requiredSlots: input.validation.requiredSlots,
      filledRequired: input.validation.filledRequired,
    };
  }

  if (
    hasFdPayload
    && input.rawAssignmentCount > 0
    && input.rawAssignmentCount < organicTarget
    && input.assignments.length >= organicTarget
  ) {
    warnings.push(
      `FD ham atama ${input.rawAssignmentCount}/${organicTarget} — manifest backfill uygulandı`,
    );
  }

  if (hasFdPayload && effectiveCoverage < 100 && !hardBlockIncomplete) {
    warnings.push(`FD manifest kapsamı ${effectiveCoverage}%`);
  }

  return {
    allowed: true,
    warnOnly: warnings.length > 0,
    warnings,
    coveragePct: effectiveCoverage,
    assignmentCount: input.assignments.length,
    requiredSlots: input.validation.requiredSlots,
    filledRequired: input.validation.filledRequired,
  };
}

/** P3 — Parse → economy normalize → expand to 7 → validate → gate. */
export function prepareMissionFdAssignments(input: {
  missionId: string | null | undefined;
  report: FeedArtDirectorReport | null | undefined;
  ideas: Record<string, unknown>[];
  manifestMissionType: MissionProductionManifest['missionType'];
  sector?: string;
  productionProfile: ProductionProfile;
  packageSlug?: string | null;
  requireCampaignReel?: boolean;
  /**
   * @deprecated No longer used. Cross-mission headline dedupe is applied upstream
   * to the idea pool (`applyCrossMissionHeadlineDedupe` in plan-phase); the gate now
   * resolves assignments via the shared `resolveFinalMissionAssignments` producer,
   * which never consumed this. Kept for call-site compatibility.
   */
  blockedHeadlineKeys?: Set<string>;
}): {
  assignments: ProductionAssignment[];
  rawAssignmentCount: number;
  validation: ReturnType<typeof validateManifestAgainstAssignments>;
  gate: FeedDirectorProductionGate;
} {
  const raw = parseProductionAssignments(input.report);
  // SSOT: on the mission path the gate must validate exactly what the production
  // queue will render, so we resolve the same enriched assignment list the queue
  // consumes (`resolveFinalMissionAssignments`) instead of recomputing a parallel,
  // less-enriched list here. The non-mission (workspace) path keeps its original
  // behaviour: profile-normalised raw FD assignments, no manifest expansion.
  let assignments: ProductionAssignment[];
  if (input.missionId && input.ideas.length > 0) {
    assignments = resolveFinalMissionAssignments({
      missionId: input.missionId,
      ideas: input.ideas,
      report: input.report,
      manifestMissionType: input.manifestMissionType,
      sector: input.sector,
      requireCampaignReel: input.requireCampaignReel,
      productionProfile: input.productionProfile,
      packageSlug: input.packageSlug,
    }).map((item) => item.assignment);
  } else {
    assignments = normalizeAssignmentsForProductionProfile(raw, input.productionProfile);
  }
  const contentScoped = isContentScopedMissionProduction(input.manifestMissionType)
    || isIdeaDrivenMissionProduction(input.manifestMissionType);
  const validation = contentScoped
    ? validateIdeaDrivenAssignments(assignments, input.ideas.length)
    : validateManifestAgainstAssignments(
      input.missionId || 'workspace',
      assignments,
      input.manifestMissionType,
      {
        requireCampaignReel: input.requireCampaignReel,
        productionProfile: input.productionProfile,
        packageSlug: input.packageSlug,
      },
    );
  const gate = evaluateFeedDirectorProductionGate({
    missionId: input.missionId,
    report: input.report,
    assignments,
    rawAssignmentCount: raw.length,
    ideasCount: input.ideas.length,
    manifestMissionType: input.manifestMissionType,
    productionProfile: input.productionProfile,
    packageSlug: input.packageSlug,
    requireCampaignReel: input.requireCampaignReel,
    validation,
  });
  return { assignments, rawAssignmentCount: raw.length, validation, gate };
}

export function validateManifestAgainstAssignments(
  missionId: string,
  assignments: ProductionAssignment[],
  missionType?: MissionProductionManifest['missionType'],
  opts?: {
    requireCampaignReel?: boolean;
    productionProfile?: ProductionProfile | null;
    packageSlug?: string | null;
  },
): {
  requiredSlots: number;
  filledRequired: number;
  missingRoles: ProductionSlotRole[];
  coveragePct: number;
} {
  const manifest = buildMissionProductionManifest({
    missionId,
    missionType,
    includeAds: missionType === 'ads_focus',
    requireCampaignReel: opts?.requireCampaignReel,
    productionProfile: opts?.productionProfile,
    packageSlug: opts?.packageSlug,
  });
  const required = manifest.slots.filter((s) => s.required);
  const need = new Map<ProductionSlotRole, number>();
  for (const slot of required) {
    need.set(slot.role, (need.get(slot.role) ?? 0) + 1);
  }
  const have = new Map<ProductionSlotRole, number>();
  for (const a of assignments) {
    have.set(a.slot_role, (have.get(a.slot_role) ?? 0) + 1);
  }
  const missingRoles: ProductionSlotRole[] = [];
  let filledRequired = 0;
  for (const [role, needCount] of need.entries()) {
    const haveCount = have.get(role) ?? 0;
    filledRequired += Math.min(needCount, haveCount);
    for (let i = haveCount; i < needCount; i++) {
      missingRoles.push(role);
    }
  }
  const coveragePct = required.length
    ? Math.round((filledRequired / required.length) * 100)
    : 100;
  return {
    requiredSlots: required.length,
    filledRequired,
    missingRoles,
    coveragePct,
  };
}

/** Idea-driven missions: one slot per ideation idea (0..N-1). */
export function validateIdeaDrivenAssignments(
  assignments: ProductionAssignment[],
  ideasCount: number,
): {
  requiredSlots: number;
  filledRequired: number;
  missingRoles: ProductionSlotRole[];
  coveragePct: number;
} {
  if (ideasCount <= 0) {
    return { requiredSlots: 0, filledRequired: 0, missingRoles: [], coveragePct: 100 };
  }
  const covered = new Set<number>();
  for (const assignment of assignments) {
    const idx = assignment.idea_index;
    if (Number.isFinite(idx) && idx >= 0 && idx < ideasCount) {
      covered.add(idx);
    }
  }
  const filledRequired = covered.size;
  return {
    requiredSlots: ideasCount,
    filledRequired,
    missingRoles: [],
    coveragePct: Math.round((filledRequired / ideasCount) * 100),
  };
}

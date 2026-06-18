/**
 * APO-1/2 — Feed Art Director assignment → production pipeline routing.
 */
import {
  buildMissionProductionManifest,
  MISSION_WEEKLY_PACKAGE_COUNTS,
  resolveMissionRequiredSlotCount,
  pipelineForSlotRole,
  type MissionProductionManifest,
  type ProductionAssignment,
  type ProductionPipeline,
  type ProductionSlotRole,
} from './mission-production-manifest';
import { isPromoOfferCopy } from './poster-quality';
import {
  applyMissionRemotionStoryAssignment,
} from './mission-remotion-story';
import { mapProductionContextToLibrarySlotKey } from './brand-template-library';
import { isAgencyServiceSector } from './agency-production-defaults';
import {
  detectIdeaPackageFormat,
  type FeedArtDirectorReport,
} from './weekly-publish-package';
import {
  isFeedDirectorFallback,
  type ProductionProfile,
} from './production-profile';
import { resolveContentIntent } from './brand-motion-profile';
import type { StoryCompositionId } from '@/remotion/types';
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
      slot_role: campaign ? 'campaign_story_motion' : 'campaign_story_motion',
      pipeline: 'remotion_story',
      copy_bundle_id: bundleId,
      publish_channel: publishChannelForRole(campaign ? 'campaign_story_motion' : 'campaign_story_motion'),
      rationale: campaign ? 'heuristic_campaign_story' : 'heuristic_story_remotion',
    };
    return applyMissionRemotionStoryAssignment(base, storyIndex);
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
      pipeline: 'remotion_poster',
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
      rationale: (item as ProductionAssignment).rationale,
    });
  }
  return out;
}

function enrichAssignment(
  assignment: ProductionAssignment,
  idea: Record<string, unknown>,
): ProductionAssignment {
  // FD-assigned slot wins — do not override with heuristics.
  if (assignment.library_slot_key) return assignment;

  const hasEventDetails = Boolean(
    (idea.event_details as Record<string, unknown> | undefined)?.artist_name
    || (idea.event_details as Record<string, unknown> | undefined)?.date
    || (idea.event_details as Record<string, unknown> | undefined)?.event_date,
  );

  // Weekly mission stories rotate Marka Detayı slots in auto-produce unless this
  // idea is a real event (date/artist) — avoid pinning every promo to event_story.
  if (assignment.slot_role === 'campaign_story_motion' && !hasEventDetails) {
    return assignment;
  }

  const librarySlotKey = mapProductionContextToLibrarySlotKey({
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
  return librarySlotKey ? { ...assignment, library_slot_key: librarySlotKey } : assignment;
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
}): ProductionAssignment {
  const fromReport = parseProductionAssignments(input.report).find(
    (a) => a.idea_index === input.ideaIndex,
  );
  let assignment: ProductionAssignment;
  if (fromReport?.slot_role) {
    const pipeline = fromReport.pipeline || pipelineForSlotRole(fromReport.slot_role);
    assignment = enrichAssignment({
      ...fromReport,
      pipeline,
      copy_bundle_id: fromReport.copy_bundle_id || defaultCopyBundleId(input.missionId),
      publish_channel: fromReport.publish_channel || publishChannelForRole(fromReport.slot_role),
    }, input.idea);
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
  assignment = enrichAssignment(assignment, input.idea);
  // FD slot drives pipeline — idea format may be "post" while assignment is campaign_story_motion.
  if (shouldRenderRemotionStory(assignment)) {
    return applyMissionRemotionStoryAssignment(assignment, input.storyIndex);
  }
  if (detectIdeaPackageFormat(input.idea) === 'story') {
    return applyMissionRemotionStoryAssignment(assignment, input.storyIndex);
  }
  return assignment;
}

/** Reel production follows FD slot, not only content_kind=instagram_reel. */
export function assignmentImpliesReel(role: ProductionSlotRole): boolean {
  return role === 'organic_reel' || role === 'campaign_reel_motion';
}

export function assignmentImpliesStoryFormat(role: ProductionSlotRole): boolean {
  return role === 'campaign_story_motion'
    || role === 'organic_story_still'
    || role === 'paid_ad_creative'
    || role === 'paid_ad_google_creative';
}

export function shouldRenderRemotionPoster(assignment: ProductionAssignment): boolean {
  return assignment.pipeline === 'remotion_poster';
}

/** Motion story + marka şablonları yalnızca kampanya duyuru / reklam rollerinde. */
const REMOTION_STORY_ROLES = new Set<ProductionSlotRole>([
  'campaign_story_motion',
  'paid_ad_creative',
  'paid_ad_google_creative',
]);

export function shouldRenderRemotionStory(
  assignment: ProductionAssignment,
  _opts?: { forceEvent?: boolean },
): boolean {
  if (assignment.pipeline === 'remotion_story') return true;
  return REMOTION_STORY_ROLES.has(assignment.slot_role);
}

/** APO-6 — campaign motion story uses CampaignHero composition. */
export function preferredStoryCompositionForAssignment(
  assignment: ProductionAssignment,
  fallback: StoryCompositionId,
  opts?: { forceEvent?: boolean },
): StoryCompositionId {
  if (assignment.slot_role === 'campaign_story_motion') return 'CampaignHeroStory';
  if (opts?.forceEvent) return 'EventAnnouncementStory';
  return fallback;
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

/** 7 slot için fikir havuzu yetersizse round-robin (aynı fikir farklı formatta). */
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

/** FD veya manifest ataması 7'den kısaysa eksik rolleri manifest'ten tamamla. */
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

/**
 * P1-4 — Drive auto-produce from manifest slots (7) instead of all merged ideas.
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
  const organicTarget = resolveMissionRequiredSlotCount({
    missionType: input.manifestMissionType,
    requireCampaignReel: input.requireCampaignReel,
    productionProfile: input.productionProfile,
    packageSlug: input.packageSlug,
  });
  const maxSlots = Math.min(
    input.maxSlots ?? organicTarget,
    organicTarget,
  );
  if (!input.missionId || input.ideas.length === 0) return [];

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

  const queue: ManifestProductionQueueItem[] = [];
  const usedSlotKeys = new Set<string>();
  let storyOrdinal = 0;

  for (const raw of assignments) {
    if (queue.length >= maxSlots) break;
    let ideaIdx = raw.idea_index;
    if (!Number.isFinite(ideaIdx) || ideaIdx < 0 || ideaIdx >= input.ideas.length) {
      ideaIdx = resolveIdeaIndexForSlot(
        queue.length,
        new Set(queue.map((q) => q.ideaIndex)),
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
      pipeline: raw.pipeline || pipelineForSlotRole(raw.slot_role),
      copy_bundle_id: raw.copy_bundle_id || defaultCopyBundleId(input.missionId),
      publish_channel: raw.publish_channel || publishChannelForRole(raw.slot_role),
    }, idea);

    if (shouldRenderRemotionStory(assignment)) {
      assignment = applyMissionRemotionStoryAssignment(assignment, storyOrdinal);
      storyOrdinal += 1;
    }

    queue.push({
      queueIndex: queue.length,
      ideaIndex: ideaIdx,
      idea,
      assignment,
    });
  }

  return queue;
}

/** P3 — Economy: FD organic_reel → organic_story_still when Runway quota is 0. */
export function normalizeAssignmentsForProductionProfile(
  assignments: ProductionAssignment[],
  profile: ProductionProfile,
): ProductionAssignment[] {
  if (profile.allowRunwayReels) return assignments;
  return assignments.map((a) => {
    if (a.slot_role !== 'organic_reel') return a;
    return {
      ...a,
      slot_role: 'organic_story_still',
      pipeline: 'story_still',
      publish_channel: publishChannelForRole('organic_story_still'),
      rationale: a.rationale ? `${a.rationale}; economy_reel_swap` : 'economy_reel_swap',
    };
  });
}

/** P3 — Manifest slot drives content kind, not stale idea content_type. */
export function resolveContentKindForAssignment(
  idea: Record<string, unknown>,
  assignment: ProductionAssignment,
): string {
  if (assignment.pipeline === 'carousel_gallery' || assignment.slot_role === 'organic_carousel') {
    return 'instagram_carousel';
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
  /** Mission Hub path: ship Feed outputs; manifest gaps are warnings, not hard blocks. */
  const missionRelaxed = Boolean(input.missionId);
  const hardBlockIncomplete = blockPolicy && !missionRelaxed;

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
    if (missionRelaxed && input.assignments.length > 0) {
      warnings.push(
        'Feed Art Director slot ataması eksik — manifest heuristic routing kullanıldı',
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
    if (hardBlockIncomplete) {
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
    if (hardBlockIncomplete) {
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
  /** Cross-mission dedupe — headlines produced in last 14 days. */
  blockedHeadlineKeys?: Set<string>;
}): {
  assignments: ProductionAssignment[];
  rawAssignmentCount: number;
  validation: ReturnType<typeof validateManifestAgainstAssignments>;
  gate: FeedDirectorProductionGate;
} {
  const raw = parseProductionAssignments(input.report);
  let assignments = normalizeAssignmentsForProductionProfile(raw, input.productionProfile);
  if (input.missionId && input.ideas.length > 0) {
    if (assignments.length > 0) {
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
      const usedIdeas = new Set<number>();
      const usedHeadlines = new Set<string>(input.blockedHeadlineKeys ?? []);
      const organicTarget = resolveMissionRequiredSlotCount({
    missionType: input.manifestMissionType,
    requireCampaignReel: input.requireCampaignReel,
    productionProfile: input.productionProfile,
    packageSlug: input.packageSlug,
  });
      assignments = required.slice(0, organicTarget).map((slot, slotIdx) => {
        const ideaIdx = pickStrategistIdeaIndex(
          input.ideas,
          usedIdeas,
          usedHeadlines,
          slotIdx,
        );
        usedIdeas.add(ideaIdx);
        const hk = strategistHeadlineKey(input.ideas[ideaIdx]!);
        if (hk) usedHeadlines.add(hk);
        return {
          idea_index: ideaIdx,
          slot_role: slot.role,
          pipeline: slot.pipeline,
          copy_bundle_id: defaultCopyBundleId(input.missionId!),
          publish_channel: publishChannelForRole(slot.role),
          rationale: 'manifest_slot_map',
        };
      });
      assignments = normalizeAssignmentsForProductionProfile(assignments, input.productionProfile);
    }
  }
  const validation = validateManifestAgainstAssignments(
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

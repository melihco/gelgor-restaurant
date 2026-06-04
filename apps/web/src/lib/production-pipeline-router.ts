/**
 * APO-1/2 — Feed Art Director assignment → production pipeline routing.
 */
import type { FeedArtDirectorReport } from './weekly-publish-package';
import {
  buildMissionProductionManifest,
  pipelineForSlotRole,
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
import { detectIdeaPackageFormat } from './weekly-publish-package';
import type { StoryCompositionId } from '@/remotion/types';

export type { ProductionAssignment } from './mission-production-manifest';

const CAMPAIGN_ROLES = new Set<ProductionSlotRole>([
  'campaign_story_motion',
  'campaign_reel_motion',
]);

function defaultCopyBundleId(missionId: string): string {
  return missionId ? `${missionId.slice(0, 8)}-week` : 'default-week';
}

function publishChannelForRole(role: ProductionSlotRole): ProductionAssignment['publish_channel'] {
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
      rationale: (item as ProductionAssignment).rationale,
    });
  }
  return out;
}

function enrichAssignment(
  assignment: ProductionAssignment,
  idea: Record<string, unknown>,
): ProductionAssignment {
  const librarySlotKey = assignment.library_slot_key
    ?? mapProductionContextToLibrarySlotKey({
      slotRole: assignment.slot_role,
      templateUseCase: String(idea.template_use_case || ''),
      treatment: String(idea.treatment || idea.visual_production_spec?.treatment || ''),
      hasEventDetails: Boolean(
        (idea.event_details as Record<string, unknown> | undefined)?.artist_name
        || (idea.event_details as Record<string, unknown> | undefined)?.date,
      ),
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
  if (detectIdeaPackageFormat(input.idea) === 'story') {
    return applyMissionRemotionStoryAssignment(assignment, input.storyIndex);
  }
  return assignment;
}

export function shouldRenderRemotionPoster(assignment: ProductionAssignment): boolean {
  return assignment.pipeline === 'remotion_poster';
}

/** Motion story + marka şablonları yalnızca kampanya duyuru / reklam rollerinde. */
const REMOTION_STORY_ROLES = new Set<ProductionSlotRole>([
  'campaign_story_motion',
  'paid_ad_creative',
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

export function validateManifestAgainstAssignments(
  missionId: string,
  assignments: ProductionAssignment[],
  missionType?: 'weekly_content' | 'campaign' | 'event' | 'ads_focus',
  opts?: { requireCampaignReel?: boolean },
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

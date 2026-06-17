/**
 * Sprint 3 — build manifest / fallback production queue for auto-produce.
 *
 * Quality parity: when manifest queue is empty but ideas exist, fall back to
 * per-idea assignment routing (legacy auto-produce behavior).
 */
import { detectIdeaPackageFormat } from '@/lib/weekly-publish-package';
import {
  buildManifestProductionQueue,
  resolveProductionAssignment,
  type ManifestProductionQueueItem,
} from '@/lib/production-pipeline-router';
import type { ProductionProfile } from '@/lib/production-profile';
import type { MissionProductionManifest } from '@/lib/mission-production-manifest';

function buildFallbackIdeaQueue(input: {
  toProcess: Record<string, unknown>[];
  feedDirectorReport: Record<string, unknown> | null;
  brandBusinessType: string;
}): ManifestProductionQueueItem[] {
  const { toProcess, feedDirectorReport, brandBusinessType } = input;
  let slotPostCount = 0;
  let slotStoryCount = 0;
  let slotReelCount = 0;

  return toProcess.map((idea, ideaIndex) => {
    const pkgFmt = detectIdeaPackageFormat(idea);
    const postIndex = pkgFmt === 'post' || pkgFmt === 'carousel' ? slotPostCount : 0;
    const storyIndex = pkgFmt === 'story' ? slotStoryCount : 0;
    const reelIndex = pkgFmt === 'reel' ? slotReelCount : 0;
    const assignment = resolveProductionAssignment({
      ideaIndex,
      idea,
      report: feedDirectorReport,
      missionId: '',
      postIndex,
      storyIndex,
      reelIndex,
      sector: brandBusinessType,
    });
    if (pkgFmt === 'post' || pkgFmt === 'carousel') slotPostCount += 1;
    else if (pkgFmt === 'story') slotStoryCount += 1;
    else if (pkgFmt === 'reel') slotReelCount += 1;
    return {
      queueIndex: ideaIndex,
      ideaIndex,
      idea,
      assignment,
    };
  });
}

export function buildAutoProduceProductionQueue(input: {
  missionId?: string;
  toProcess: Record<string, unknown>[];
  feedDirectorReport: Record<string, unknown> | null;
  manifestMissionType: MissionProductionManifest['missionType'];
  brandBusinessType: string;
  maxIdeas: number;
  productionProfile: ProductionProfile;
  packageSlug: string;
}): ManifestProductionQueueItem[] {
  const {
    missionId,
    toProcess,
    feedDirectorReport,
    manifestMissionType,
    brandBusinessType,
    maxIdeas,
    productionProfile,
    packageSlug,
  } = input;

  if (!toProcess.length) return [];

  if (missionId) {
    const manifestQueue = buildManifestProductionQueue({
      missionId,
      ideas: toProcess,
      report: feedDirectorReport,
      manifestMissionType,
      sector: brandBusinessType,
      maxSlots: maxIdeas,
      requireCampaignReel: manifestMissionType === 'campaign',
      productionProfile,
      packageSlug,
    });
    if (manifestQueue.length > 0) return manifestQueue;
  }

  return buildFallbackIdeaQueue({
    toProcess,
    feedDirectorReport,
    brandBusinessType,
  });
}

export type { ManifestProductionQueueItem };

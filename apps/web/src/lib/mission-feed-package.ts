import {
  isArtifactFeedReady,
  type WeeklyPublishSelection,
} from '@/lib/weekly-publish-package';
import type { OutputArtifact } from '@/types';
import { parseArtifactContent } from '@/lib/artifact-utils';
import {
  artifactProductionRole,
  MISSION_WEEKLY_PACKAGE_COUNTS,
} from '@/lib/mission-production-manifest';
import {
  dedupeProductionBundles,
  isBundleFailed,
  isProductionBundleStory,
  parseArtifactMissionId,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';

export type { ProductionBundleStatus } from '@/lib/production-bundle';
export {
  canRetryStoryRender,
  dedupeFeedDisplayArtifacts,
  dedupeProductionBundles,
  dedupeStoryBarArtifacts,
  filterConsumerStoryBar,
  getProductionBundleStatus,
  getProductionDedupeKey,
  getProductionIdeaKey,
  getStoryBarDedupeKey,
  isAwaitingStoryVideo,
  isBundleFailed,
  isBundleReadyForPublish,
  isBundleRendering,
  isBundleStaleRendering,
  isPostKind,
  isProductionBundle,
  isProductionBundleStory,
  parseArtifactMissionId,
  resolveBrandedPostUrl,
  resolvePosterUrl,
  resolvePublishImageUrl,
  resolveStoryPublishImageUrl,
  resolveStoryPublishVideoUrl,
  resolveStoryVideoUrl,
  resolveStoryVideoClientUrl,
  storyRetryIsBusy,
  storyRetryLabel,
} from '@/lib/production-bundle';

export interface MissionFeedPackage {
  storyVideos: number;
  posts: number;
  reels: number;
  pendingReview: number;
  approved: number;
  totalPublishable: number;
  backupCount: number;
  primaryCount: number;
  selectionSource?: 'feed_art_director' | 'heuristic';
  feedDirectorScore?: number | null;
  /** APO-5 — production_role breakdown (primary package only) */
  organicPosts: number;
  designedPosts: number;
  storyStills: number;
  storyMotion: number;
  carousels: number;
}

/** Slot progress for Mission Hub — factory queue is source of truth when present. */
export function resolveMissionSlotProgress(input: {
  factoryReady?: number | null;
  factoryTotal?: number | null;
  pkg?: MissionFeedPackage | null;
  selection?: WeeklyPublishSelection | null;
}): { ready: number; target: number } {
  const manifestTarget = MISSION_WEEKLY_PACKAGE_COUNTS.total;
  const factoryTotal = input.factoryTotal ?? 0;
  const factoryReady = input.factoryReady ?? 0;
  if (factoryTotal > 0) {
    return {
      ready: factoryReady,
      target: Math.max(manifestTarget, factoryTotal),
    };
  }
  const fallback = input.pkg?.primaryCount ?? input.selection?.primary.length ?? 0;
  return { ready: fallback, target: manifestTarget };
}

/** Video story artifact — production bundle story with an attached MP4. */
export function isVideoStoryArtifact(artifact: OutputArtifact): boolean {
  try {
    const content = parseArtifactContent(artifact.content);
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    if (String(content.source || meta.source || '') === 'announcement_calendar') return false;
    if (!isProductionBundleStory(artifact)) return false;
    return Boolean(resolveStoryVideoUrl(artifact));
  } catch {
    return false;
  }
}

function countByProductionRole(
  artifacts: OutputArtifact[],
): Pick<
  MissionFeedPackage,
  'organicPosts' | 'designedPosts' | 'storyStills' | 'storyMotion' | 'carousels' | 'reels'
> {
  let organicPosts = 0;
  let designedPosts = 0;
  let storyStills = 0;
  let storyMotion = 0;
  let carousels = 0;
  let reels = 0;

  for (const a of artifacts) {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const role = artifactProductionRole(meta);
    if (role === 'organic_post') organicPosts += 1;
    else if (role === 'designed_post') designedPosts += 1;
    else if (role === 'organic_carousel') carousels += 1;
    else if (role === 'organic_story_still') storyStills += 1;
    else if (role === 'campaign_story_motion') storyMotion += 1;
    else if (role?.includes('reel')) reels += 1;
    else if (isReelArtifact(a)) reels += 1;
    else if (isVideoStoryArtifact(a)) storyMotion += 1;
    else if (isFeedPostArtifact(a)) organicPosts += 1;
  }

  return { organicPosts, designedPosts, storyStills, storyMotion, carousels, reels };
}

function isFeedPostArtifact(artifact: OutputArtifact): boolean {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const kind = String(content.kind || meta.kind || '').toLowerCase();
  const ct = String((artifact as { contentType?: string }).contentType || content.contentType || '').toLowerCase();
  if (kind.includes('story') || ct.includes('story')) return false;
  if (kind.includes('reel') || ct.includes('reel')) return false;
  if (kind.includes('ad') || ct.includes('ad')) return false;
  return kind.includes('post') || ct.includes('post') || kind.includes('carousel') || ct.includes('carousel');
}

function isReelArtifact(artifact: OutputArtifact): boolean {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const kind = String(content.kind || meta.kind || '').toLowerCase();
  const ct = String((artifact as { contentType?: string }).contentType || content.contentType || '').toLowerCase();
  return kind.includes('reel') || ct.includes('reel');
}

/** Client-side mission filter — matches metadata OR content JSON mission_id. */
export function filterArtifactsForMission(
  artifacts: OutputArtifact[],
  missionId: string,
): OutputArtifact[] {
  return dedupeProductionBundles(
    artifacts.filter((a) => parseArtifactMissionId(a) === missionId),
  );
}

export function summarizeMissionFeedPackage(
  artifacts: OutputArtifact[],
  missionId: string,
  selection?: WeeklyPublishSelection | null,
): MissionFeedPackage {
  const deduped = dedupeProductionBundles(artifacts);
  const allProduced = deduped.filter((a) => {
    if (parseArtifactMissionId(a) !== missionId) return false;
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    return meta.auto_produced === true
      || meta.production_bundle === true
      || meta.production_role != null
      || meta.ad_creative === true
      || meta.source === 'auto-produce';
  });
  const mine = selection?.primary.length
    ? selection.primary
    : allProduced;
  const backupCount = selection?.backup.length ?? Math.max(
    0,
    allProduced.length - mine.length,
  );
  const storyVideos = mine.filter(isVideoStoryArtifact).length;
  const posts = mine.filter(isFeedPostArtifact).length;
  const reels = mine.filter(isReelArtifact).length;
  const roleCounts = countByProductionRole(mine);
  const pendingReview = allProduced.filter((a) => a.status === 'pending_review').length;
  const approved = allProduced.filter((a) => a.status === 'approved').length;
  const publishableCount = allProduced.filter(isArtifactFeedReady).length;
  return {
    storyVideos,
    posts,
    reels: roleCounts.reels > 0 ? roleCounts.reels : reels,
    pendingReview,
    approved,
    totalPublishable: publishableCount,
    backupCount,
    primaryCount: allProduced.length,
    selectionSource: selection?.selectionSource,
    feedDirectorScore: selection?.feedDirectorScore ?? null,
    organicPosts: roleCounts.organicPosts,
    designedPosts: roleCounts.designedPosts,
    storyStills: roleCounts.storyStills,
    storyMotion: roleCounts.storyMotion,
    carousels: roleCounts.carousels,
  };
}

export function formatMissionFeedPackageLabel(pkg: MissionFeedPackage): string {
  const parts: string[] = [];
  if (pkg.storyMotion > 0) parts.push(`${pkg.storyMotion} motion story`);
  else if (pkg.storyVideos > 0) parts.push(`${pkg.storyVideos} story`);
  if (pkg.storyStills > 0) parts.push(`${pkg.storyStills} story`);
  if (pkg.posts > 0) parts.push(`${pkg.posts} post`);
  if (pkg.designedPosts > 0) parts.push(`${pkg.designedPosts} tasarım`);
  if (pkg.carousels > 0) parts.push(`${pkg.carousels} carousel`);
  if (pkg.reels > 0) parts.push(`${pkg.reels} reel`);
  if (parts.length === 0) return 'İçerik üretiliyor…';
  return parts.join(' · ');
}

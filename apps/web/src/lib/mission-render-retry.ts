/**
 * Retry failed Remotion bundle renders for one mission (stories + designed posts).
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactContent } from '@/lib/artifact-utils';
import { parseArtifactMissionId } from '@/lib/production-bundle';
import {
  expectsRemotionStoryVideo,
  getProductionBundleStatus,
  isBundleFailed,
  isBundleStaleRendering,
  isPostKind,
  isProductionBundleStory,
  resolveStoryVideoUrl,
  resolveBrandedPostUrl,
  resolvePosterUrl,
} from '@/lib/production-bundle';
import { detectArtifactPackageFormat } from '@/lib/weekly-publish-package';

/** Remotion story slot — must ship MP4; gallery-only / mis-marked ready counts as retryable. */
export function missionRemotionStoryNeedsRetry(artifact: OutputArtifact): boolean {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const role = String(meta.production_role ?? content.production_role ?? '').trim();
  const pipeline = String(meta.pipeline ?? content.pipeline ?? '').trim();
  const isRemotionStory = expectsRemotionStoryVideo(artifact)
    || role === 'campaign_story_motion'
    || pipeline === 'remotion_story'
    || (isProductionBundleStory(artifact) && (role.includes('story') || pipeline.includes('story')));

  if (!isRemotionStory) return false;
  if (resolveStoryVideoUrl(artifact)) return false;

  const renderError = String(meta.render_error ?? content.render_error ?? '').trim();
  if (renderError) return true;

  const rawStatus = String(
    meta.bundle_status ?? meta.bundleStatus ?? content.bundle_status ?? content.bundleStatus ?? '',
  ).toLowerCase();
  if (rawStatus === 'ready') return true;

  const bundleStatus = getProductionBundleStatus(artifact);
  return isBundleFailed(artifact)
    || isBundleStaleRendering(artifact)
    || bundleStatus === 'rendering'
    || bundleStatus === 'failed';
}

export function missionArtifactNeedsRenderRetry(artifact: OutputArtifact): boolean {
  if (missionRemotionStoryNeedsRetry(artifact)) return true;

  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const ct = String(meta.contentType ?? meta.kind ?? '').toLowerCase();
  if (ct.includes('story')) {
    if (resolveStoryVideoUrl(artifact)) return false;
    return isBundleFailed(artifact) || isBundleStaleRendering(artifact);
  }

  if (isPostKind(artifact)) {
    const branded = resolveBrandedPostUrl(artifact);
    const poster = resolvePosterUrl(artifact);
    if (branded && poster && branded !== poster) return false;
    return isBundleFailed(artifact) || isBundleStaleRendering(artifact);
  }

  if (detectArtifactPackageFormat(artifact) === 'reel') {
    if (resolveStoryVideoUrl(artifact)) return false;
    return isBundleFailed(artifact) || isBundleStaleRendering(artifact);
  }

  return false;
}

export function filterMissionRenderRetryArtifacts(
  artifacts: OutputArtifact[],
  missionId: string,
): OutputArtifact[] {
  return artifacts.filter((a) => {
    if (parseArtifactMissionId(a) !== missionId) return false;
    return missionArtifactNeedsRenderRetry(a);
  });
}

export function filterMissionRemotionStoryRetryArtifacts(
  artifacts: OutputArtifact[],
  missionId: string,
): OutputArtifact[] {
  return artifacts.filter((a) => {
    if (parseArtifactMissionId(a) !== missionId) return false;
    return missionRemotionStoryNeedsRetry(a);
  });
}

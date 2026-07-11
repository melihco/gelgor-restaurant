/**
 * Retry failed fal production bundles for one mission (stories + designed posts).
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactContent } from '@/lib/artifact-utils';
import { parseArtifactMissionId } from '@/lib/production-bundle';
import {
  getProductionBundleStatus,
  isBundleFailed,
  isBundleStaleRendering,
  isPostKind,
  resolveStoryVideoUrl,
  resolveBrandedPostUrl,
  resolvePosterUrl,
} from '@/lib/production-bundle';
import { detectArtifactPackageFormat } from '@/lib/weekly-publish-package';

function hasDeliverableStill(artifact: OutputArtifact): boolean {
  return Boolean(resolveBrandedPostUrl(artifact) || resolvePosterUrl(artifact));
}

/** Legacy remotion_story / fal_story — poster is the final deliverable (no MP4). */
export function missionRemotionStoryNeedsRetry(artifact: OutputArtifact): boolean {
  if (resolveStoryVideoUrl(artifact)) return false;
  if (hasDeliverableStill(artifact)) return false;

  const renderError = String(
    (artifact.metadata as Record<string, unknown> | undefined)?.render_error
    ?? parseArtifactContent(artifact.content).render_error
    ?? '',
  ).trim();
  if (renderError) return true;

  const bundleStatus = getProductionBundleStatus(artifact);
  return isBundleFailed(artifact)
    || isBundleStaleRendering(artifact)
    || bundleStatus === 'rendering'
    || bundleStatus === 'failed';
}

export function missionArtifactNeedsRenderRetry(artifact: OutputArtifact): boolean {
  if (missionRemotionStoryNeedsRetry(artifact)) return true;

  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const pipeline = String(meta.pipeline ?? content.pipeline ?? '').trim();

  const ct = String(meta.contentType ?? meta.kind ?? '').toLowerCase();
  if (ct.includes('story') || pipeline.includes('story')) {
    if (resolveStoryVideoUrl(artifact)) return false;
    if (hasDeliverableStill(artifact)) return false;
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

/**
 * Retry failed Remotion bundle renders for one mission (stories + designed posts).
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactMissionId } from '@/lib/production-bundle';
import {
  getProductionBundleStatus,
  isBundleFailed,
  isBundleStaleRendering,
  isPostKind,
  isProductionBundleStory,
  resolveStoryVideoUrl,
  resolveBrandedPostUrl,
  resolvePosterUrl,
} from '@/lib/production-bundle';

export function missionArtifactNeedsRenderRetry(artifact: OutputArtifact): boolean {
  const missionId = parseArtifactMissionId(artifact);
  if (!missionId) return false;

  if (isProductionBundleStory(artifact)) {
    if (resolveStoryVideoUrl(artifact)) return false;
    return isBundleFailed(artifact) || isBundleStaleRendering(artifact)
      || getProductionBundleStatus(artifact) === 'rendering';
  }

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

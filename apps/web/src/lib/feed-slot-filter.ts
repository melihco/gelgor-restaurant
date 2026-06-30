import type { OutputArtifact } from '@/types';
import { parseArtifactMetadata } from '@/lib/artifact-utils';
import { isRemotionVideoStoryArtifact } from '@/lib/mission-feed-package';
import { resolveStoryVideoUrl } from '@/lib/production-bundle';

/** APO-5 — secondary Feed filters by production slot (tenant-agnostic metadata). */
export type FeedSlotFilter =
  | 'all'
  | 'organic'
  | 'designed'
  | 'story_still'
  | 'story_motion';

export function artifactMatchesSlotFilter(
  artifact: OutputArtifact,
  slot: FeedSlotFilter,
  detectKind: (a: OutputArtifact) => string,
): boolean {
  if (slot === 'all') return true;

  const meta = parseArtifactMetadata(artifact.metadata);
  const role = String(meta.production_role ?? '').trim();
  const pipeline = String(meta.pipeline ?? '').trim();
  const kind = detectKind(artifact);

  if (slot === 'organic') {
    return (
      role === 'organic_post'
      || role === 'organic_story_still'
      || role === 'organic_reel'
      || role === 'organic_carousel'
      || pipeline === 'gallery_photo'
      || pipeline === 'story_still'
      || pipeline === 'carousel_gallery'
    );
  }

  if (slot === 'designed') {
    return (
      role === 'designed_post'
      || role === 'fal_designed_post'
      || role === 'fal_only_post'
      || role === 'designed_typography'
      || role === 'paid_ad_creative'
      || pipeline === 'remotion_poster'
      || pipeline === 'fal_design'
      || pipeline === 'fal_only'
      || pipeline === 'meta_ad'
    );
  }

  if (slot === 'story_still') {
    if (kind !== 'story') return false;
    if (role === 'organic_story_still' || pipeline === 'story_still') return true;
    return !resolveStoryVideoUrl(artifact);
  }

  if (slot === 'story_motion') {
    if (kind !== 'story') return false;
    if (
      role === 'campaign_story_motion'
      || pipeline === 'remotion_story'
      || isRemotionVideoStoryArtifact(artifact)
    ) {
      return true;
    }
    return Boolean(resolveStoryVideoUrl(artifact));
  }

  return true;
}

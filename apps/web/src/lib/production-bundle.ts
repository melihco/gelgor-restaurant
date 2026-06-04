import type { OutputArtifact } from '@/types';
import { parseArtifactContent } from '@/app/mobile/_components/artifact-utils';

export type ProductionBundleStatus = 'rendering' | 'ready' | 'failed';

export function parseArtifactMissionId(artifact: OutputArtifact): string | null {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const id = String(
    meta.mission_id || meta.missionId || content.mission_id || content.missionId || '',
  ).trim();
  return id || null;
}

export function resolveStoryVideoUrl(artifact: OutputArtifact): string | null {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const raw = String(
    content.videoUrl || meta.videoUrl || meta.video_url
    || (artifact.contentUrl && /\.(mp4|mov|webm)(\?|$)/i.test(artifact.contentUrl) ? artifact.contentUrl : '')
    || '',
  ).trim();
  if (!raw || !/\.(mp4|mov|webm)(\?|$)/i.test(raw)) return null;
  if (raw.startsWith('http') || raw.startsWith('/api/') || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return `/api/media?key=${encodeURIComponent(raw.replace(/^\//, ''))}`;
  return raw;
}

function hasProductionBundleFlag(artifact: OutputArtifact): boolean {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  return Boolean(
    meta.production_bundle || meta.productionBundle
    || content.production_bundle || content.productionBundle,
  );
}

/** DB/content bundle_status only — never call getProductionBundleStatus from here. */
function readRawBundleStatus(artifact: OutputArtifact): string {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  return String(
    meta.bundle_status || meta.bundleStatus || content.bundle_status || content.bundleStatus || '',
  ).toLowerCase();
}

/** Stuck render queue (no video, older than maxAgeMs). Uses raw status only to avoid recursion. */
function isRenderingTimedOut(artifact: OutputArtifact, maxAgeMs = 90_000): boolean {
  if (resolveStoryVideoUrl(artifact)) return false;
  const created = new Date(artifact.createdAt).getTime();
  if (!Number.isFinite(created)) return true;
  if (Date.now() - created <= maxAgeMs) return false;

  const raw = readRawBundleStatus(artifact);
  if (raw === 'rendering') return true;
  if (raw === 'ready' || raw === 'failed') return false;
  return hasProductionBundleFlag(artifact);
}

export function getProductionBundleStatus(artifact: OutputArtifact): ProductionBundleStatus | null {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const raw = readRawBundleStatus(artifact);
  const role = String(meta.production_role ?? content.production_role ?? '').trim();

  const looksRendering = raw === 'rendering'
    || (raw === '' && hasProductionBundleFlag(artifact) && !resolveStoryVideoUrl(artifact));
  if (looksRendering && isRenderingTimedOut(artifact)) {
    const poster = resolvePosterUrl(artifact);
    const url = String(artifact.contentUrl ?? '').trim();
    const hasStill = Boolean(poster || (url && !/\.(mp4|mov|webm)(\?|$)/i.test(url)));
    if (hasStill && (role === 'organic_story_still' || role.includes('story'))) return 'ready';
    return 'failed';
  }

  if (raw === 'rendering' || raw === 'ready' || raw === 'failed') return raw;
  if (resolveStoryVideoUrl(artifact)) return 'ready';
  if (role === 'organic_story_still' && resolvePosterUrl(artifact)) return 'ready';
  if (isPostKind(artifact) && hasProductionBundleFlag(artifact)) {
    const branded = resolveBrandedPostUrl(artifact);
    const poster = resolvePosterUrl(artifact);
    if (branded && poster && branded !== poster) return 'ready';
  }
  if (hasProductionBundleFlag(artifact)) return 'rendering';
  return null;
}

export function isProductionBundle(artifact: OutputArtifact): boolean {
  if (hasProductionBundleFlag(artifact)) return true;
  return getProductionBundleStatus(artifact) !== null;
}

function isStoryKind(artifact: OutputArtifact): boolean {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const artifactCt = String((artifact as { contentType?: string }).contentType || '').toLowerCase();
  const kind = String(content.kind || meta.kind || artifactCt || '').toLowerCase();
  const ct = String(artifactCt || content.contentType || '').toLowerCase();
  return kind.includes('story') || ct.includes('story') || kind.includes('canvas');
}

export function isPostKind(artifact: OutputArtifact): boolean {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const artifactCt = String((artifact as { contentType?: string }).contentType || '').toLowerCase();
  const kind = String(content.kind || meta.kind || artifactCt || '').toLowerCase();
  const ct = String(artifactCt || content.contentType || '').toLowerCase();
  return kind.includes('post') || ct === 'post' || ct.includes('instagram_post');
}

/** Branded PNG from Remotion poster pipeline (feed post bundle). */
export function resolveBrandedPostUrl(artifact: OutputArtifact): string | null {
  if (!isPostKind(artifact)) return null;
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const raw = String(
    content.imageUrl || meta.imageUrl || artifact.contentUrl || '',
  ).trim();
  if (!raw || /\.(mp4|mov|webm)(\?|$)/i.test(raw)) return null;
  if (raw.startsWith('http') || raw.startsWith('/api/') || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return `/api/media?key=${encodeURIComponent(raw.replace(/^\//, ''))}`;
  return raw;
}

/** Raw gallery photo for Remotion render — never use text-baked branded stills as photo input. */
export function resolveGalleryPhotoForRender(artifact: OutputArtifact): string | null {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const raw = String(
    meta.reference_photo_url || content.reference_photo_url
    || meta.poster_url || meta.posterUrl || content.posterUrl || content.poster_url
    || content.imageUrl || meta.imageUrl || '',
  ).trim();
  if (!raw || /\.(mp4|mov|webm)(\?|$)/i.test(raw)) return null;
  return raw;
}

/** Gallery poster for a production bundle (before or after video render). */
export function resolvePosterUrl(artifact: OutputArtifact): string | null {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const feedPreview = String(meta.feed_preview_url || content.feed_preview_url || '').trim();
  if (feedPreview && !/\.(mp4|mov|webm)(\?|$)/i.test(feedPreview)) return feedPreview;

  const gallery = resolveGalleryPhotoForRender(artifact);
  if (gallery) return gallery;
  const raw = String(content.imageUrl || meta.imageUrl || '').trim();
  if (!raw || /\.(mp4|mov|webm)(\?|$)/i.test(raw)) return null;
  return raw;
}

export function getProductionIdeaKey(artifact: OutputArtifact): string {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const ideaId = String(meta.idea_id || meta.ideaId || content.idea_id || content.ideaId || '').trim();
  if (ideaId) return ideaId;
  const missionId = parseArtifactMissionId(artifact) || 'no-mission';
  const headline = String(meta.headline || content.headline || artifact.title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return `${missionId}::${headline}`;
}

function bundlePriority(artifact: OutputArtifact): number {
  const status = getProductionBundleStatus(artifact);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const hasVideo = Boolean(resolveStoryVideoUrl(artifact));
  if (status === 'ready' && hasVideo) return 100;
  if (String(meta.source || '') === 'remotion' && hasVideo) return 90;
  if (status === 'rendering' && isProductionBundle(artifact)) return 70;
  if (status === 'rendering') return 50;
  if (hasVideo) return 40;
  if (isProductionBundle(artifact)) return 30;
  return 10;
}

/**
 * One idea = one artifact. Collapses legacy duplicate pairs (image placeholder + Remotion video).
 */
export function dedupeProductionBundles(artifacts: OutputArtifact[]): OutputArtifact[] {
  const storyGroups = new Map<string, OutputArtifact[]>();
  const passthrough: OutputArtifact[] = [];

  for (const artifact of artifacts) {
    if (!isStoryKind(artifact)) {
      passthrough.push(artifact);
      continue;
    }
    const key = getProductionIdeaKey(artifact);
    const group = storyGroups.get(key) ?? [];
    group.push(artifact);
    storyGroups.set(key, group);
  }

  const dedupedStories: OutputArtifact[] = [];
  for (const group of storyGroups.values()) {
    if (group.length === 1) {
      dedupedStories.push(group[0]!);
      continue;
    }
    const winner = [...group].sort((a, b) => bundlePriority(b) - bundlePriority(a))[0]!;
    dedupedStories.push(winner);
  }

  return [...passthrough, ...dedupedStories].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** Feed story bar + story tab: production bundle with poster and/or Remotion video. */
export function isProductionBundleStory(artifact: OutputArtifact): boolean {
  if (!isStoryKind(artifact)) return false;
  const status = getProductionBundleStatus(artifact);
  const hasVideo = Boolean(resolveStoryVideoUrl(artifact));
  const hasPoster = Boolean(resolvePosterUrl(artifact));
  if (isProductionBundle(artifact)) {
    return status === 'ready' ? hasVideo : hasPoster || hasVideo;
  }
  // Legacy Remotion-only artifact
  return hasVideo;
}

export function isBundleReadyForPublish(artifact: OutputArtifact): boolean {
  if (getProductionBundleStatus(artifact) !== 'ready') return false;
  if (resolveStoryVideoUrl(artifact)) return true;
  if (isPostKind(artifact)) {
    const branded = resolveBrandedPostUrl(artifact);
    const poster = resolvePosterUrl(artifact);
    return Boolean(branded && poster && branded !== poster);
  }
  return false;
}

export function isBundleRendering(artifact: OutputArtifact): boolean {
  return getProductionBundleStatus(artifact) === 'rendering';
}

export function isBundleFailed(artifact: OutputArtifact): boolean {
  return getProductionBundleStatus(artifact) === 'failed';
}

/** Rendering longer than maxAgeMs with no video — likely queue timeout or server restart. */
export function isBundleStaleRendering(
  artifact: OutputArtifact,
  maxAgeMs = 90_000,
): boolean {
  const status = getProductionBundleStatus(artifact);
  if (status !== 'rendering') return false;
  return isRenderingTimedOut(artifact, maxAgeMs);
}

/** Story/post expected to get Remotion output but asset is still missing. */
export function isAwaitingStoryVideo(artifact: OutputArtifact): boolean {
  if (isStoryKind(artifact)) {
    if (resolveStoryVideoUrl(artifact)) return false;
    if (isProductionBundle(artifact)) return true;
    return hasProductionBundleFlag(artifact);
  }
  if (isPostKind(artifact) && isProductionBundle(artifact)) {
    const branded = resolveBrandedPostUrl(artifact);
    const poster = resolvePosterUrl(artifact);
    if (branded && poster && branded !== poster) return false;
    return !isBundleFailed(artifact);
  }
  return false;
}

/** Show retry / re-render affordance in Feed UI. */
export function canRetryStoryRender(artifact: OutputArtifact): boolean {
  if (isStoryKind(artifact)) {
    if (isAwaitingStoryVideo(artifact)) return true;
    if (isBundleFailed(artifact)) return true;
    if (isBundleStaleRendering(artifact)) return true;
    return isProductionBundleStory(artifact) && Boolean(resolveStoryVideoUrl(artifact));
  }
  if (isPostKind(artifact)) {
    if (isAwaitingStoryVideo(artifact)) return true;
    if (isBundleFailed(artifact)) return true;
    if (isBundleStaleRendering(artifact)) return true;
    const branded = resolveBrandedPostUrl(artifact);
    const poster = resolvePosterUrl(artifact);
    return Boolean(branded && poster && branded !== poster);
  }
  return false;
}

export function storyRetryLabel(artifact: OutputArtifact): string {
  if (isBundleFailed(artifact)) return 'Yeniden render';
  if (isAwaitingStoryVideo(artifact) && isBundleRendering(artifact) && !isBundleStaleRendering(artifact)) {
    return isPostKind(artifact) ? 'Poster üretiliyor…' : 'Render ediliyor…';
  }
  if (resolveStoryVideoUrl(artifact)) return 'Yeniden render';
  if (isPostKind(artifact) && resolveBrandedPostUrl(artifact)) return 'Yeniden render';
  return isPostKind(artifact) ? 'Poster üret' : 'Video üret';
}

export function storyRetryIsBusy(artifact: OutputArtifact): boolean {
  return isAwaitingStoryVideo(artifact)
    && isBundleRendering(artifact)
    && !isBundleStaleRendering(artifact)
    && !isBundleFailed(artifact);
}

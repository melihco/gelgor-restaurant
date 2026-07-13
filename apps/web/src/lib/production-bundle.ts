import type { OutputArtifact } from '@/types';
import { parseArtifactContent, parseArtifactMetadata } from '@/lib/artifact-utils';
import { upscaleCdnUrl } from '@/lib/gallery-display-url';
import { isPlayableVideoUrl } from '@/lib/fal-story-motion';
import { mediaUrlForKey, resolveClientMediaUrl } from '@/lib/media-url';
import { compareArtifactsByProductionTime } from '@/lib/artifact-production-time';
import { normalizeProductionPipeline } from '@/lib/mission-production-manifest';
import { isVideoPipeline } from '@/lib/pipeline-registry';

/** Local helper — avoids circular import via media-url / artifact-utils. */
function upgradePhotoUrlForDisplay(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return trimmed;
  return upscaleCdnUrl(trimmed);
}

export type ProductionBundleStatus = 'rendering' | 'ready' | 'failed';

export function parseArtifactMissionId(artifact: OutputArtifact): string | null {
  const meta = parseArtifactMetadata(artifact.metadata);
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
  if (!raw || !isPlayableVideoUrl(raw)) return null;
  if (raw.startsWith('http') || raw.startsWith('/api/') || raw.startsWith('data:')) return raw;
  if (raw.startsWith('/')) return `/api/media?key=${encodeURIComponent(raw.replace(/^\//, ''))}`;
  // Bare R2 object key (tenant/stories/foo.mp4)
  return mediaUrlForKey(raw);
}

/** Instagram story publish — MP4/MOV/WebM only; never treat PNG stills as video. */
export function resolveStoryPublishVideoUrl(artifact: OutputArtifact): string | null {
  return resolveStoryVideoUrl(artifact);
}

/** Still-image story when motion export is missing or mis-tagged as videoUrl. */
export function resolveStoryPublishImageUrl(artifact: OutputArtifact): string | null {
  const productionExport = resolveProductionExportImageUrl(artifact);
  if (productionExport) return productionExport;
  const branded = resolvePublishImageUrl(artifact);
  if (branded) return branded;
  const poster = resolvePosterUrl(artifact);
  if (poster && !isPlayableVideoUrl(poster)) return poster;
  const contentUrl = String(artifact.contentUrl ?? '').trim();
  if (contentUrl && !isPlayableVideoUrl(contentUrl) && isPersistedExportImageUrl(contentUrl)) {
    return upgradePhotoUrlForDisplay(contentUrl) ?? contentUrl;
  }
  return null;
}

/** Browser `<video src>` — resolves R2 keys and bare paths for client playback. */
export function resolveStoryVideoClientUrl(artifact: OutputArtifact): string | null {
  const raw = resolveStoryVideoUrl(artifact);
  if (!raw) return null;
  return resolveClientMediaUrl(raw) ?? raw;
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
  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  return String(
    meta.bundle_status || meta.bundleStatus || content.bundle_status || content.bundleStatus || '',
  ).toLowerCase();
}

/** Remotion story queue — Grafiker retries + parallel renders can exceed 90s. */
export const REMOTION_BUNDLE_STALE_MS = 360_000;

/** Stuck render queue (no video, older than maxAgeMs). Uses raw status only to avoid recursion. */
function isRenderingTimedOut(artifact: OutputArtifact, maxAgeMs = REMOTION_BUNDLE_STALE_MS): boolean {
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
  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  const raw = readRawBundleStatus(artifact);
  const role = String(meta.production_role ?? content.production_role ?? '').trim();

  // attach-video may have run while bundle_status was still "rendering" (retry race).
  if (resolveStoryVideoUrl(artifact)) return 'ready';

  const looksRendering = raw === 'rendering'
    || (raw === '' && hasProductionBundleFlag(artifact) && !resolveStoryVideoUrl(artifact));
  if (looksRendering && isRenderingTimedOut(artifact)) {
    if (expectsRemotionStoryVideo(artifact) && !resolveStoryVideoUrl(artifact)) {
      return 'failed';
    }
    const poster = resolvePosterUrl(artifact);
    const url = String(artifact.contentUrl ?? '').trim();
    const hasStill = Boolean(poster || (url && !/\.(mp4|mov|webm)(\?|$)/i.test(url)));
    if (hasStill && (role === 'organic_story_still' || role.includes('story'))) return 'ready';
    return 'failed';
  }

  if (raw === 'rendering' || raw === 'ready' || raw === 'failed') {
    if (
      raw === 'ready'
      && expectsRemotionStoryVideo(artifact)
      && !resolveStoryVideoUrl(artifact)
    ) {
      const galleryOnly = Boolean(meta.gallery_only ?? meta.galleryOnly ?? content.gallery_only);
      if (!galleryOnly) return 'failed';
    }
    return raw;
  }
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

function isPersistedExportImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith('/api/media')) return true;
  if (u.includes('/posts/') || u.includes('/image/')) return true;
  if (/\.(png|jpe?g|webp)(\?|$)/i.test(u) && !u.includes('unsplash.com')) return true;
  return false;
}

function isGalleryProxyPreviewUrl(url: string): boolean {
  return String(url ?? '').trim().includes('/api/media-proxy');
}

function isFalProducedArtifact(meta: Record<string, unknown>): boolean {
  const pipeline = String(meta.pipeline ?? '').trim();
  if (pipeline.startsWith('fal_')) return true;
  if (meta.fal_designer_produced === true || meta.fal_only === true || meta.fal_video_produced === true) {
    return true;
  }
  return String(meta.production_track ?? '').trim() === 'fal_ai';
}

function artifactUsesGalleryProxyPreview(artifact: OutputArtifact): boolean {
  const content = parseArtifactContent(artifact.content);
  const meta = parseArtifactMetadata(artifact.metadata);
  return [
    content.imageUrl,
    meta.imageUrl,
    meta.feed_preview_url,
    content.feed_preview_url,
    content.posterUrl,
    meta.poster_url,
    meta.posterUrl,
  ].some((candidate) => isGalleryProxyPreviewUrl(String(candidate ?? '')));
}

/** Production export in contentUrl — fal/R2/Remotion output, not gallery reference still. */
function resolveProductionExportImageUrl(artifact: OutputArtifact): string | null {
  const contentUrl = String(artifact.contentUrl ?? '').trim();
  if (!contentUrl || /\.(mp4|mov|webm)(\?|$)/i.test(contentUrl)) return null;
  if (!isPersistedExportImageUrl(contentUrl)) return null;

  const meta = parseArtifactMetadata(artifact.metadata);
  if (
    isFalProducedArtifact(meta)
    || artifactUsesGalleryProxyPreview(artifact)
    || meta.bundle_status === 'ready'
  ) {
    return upgradePhotoUrlForDisplay(contentUrl) ?? contentUrl;
  }
  return null;
}

function normalizeBrandedPostUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || /\.(mp4|mov|webm)(\?|$)/i.test(trimmed)) return null;
  if (trimmed.startsWith('http') || trimmed.startsWith('/api/') || trimmed.startsWith('data:')) return trimmed;
  if (trimmed.startsWith('/')) return `/api/media?key=${encodeURIComponent(trimmed.replace(/^\//, ''))}`;
  return trimmed;
}

/** Instagram/Mertcafe publish — prefer R2 branded export over gallery previews. */
export function resolvePublishImageUrl(artifact: OutputArtifact): string | null {
  const productionExport = resolveProductionExportImageUrl(artifact);
  if (productionExport) return productionExport;

  const branded = resolveBrandedPostUrl(artifact);
  if (branded) return branded;

  const content = parseArtifactContent(artifact.content);
  const meta = parseArtifactMetadata(artifact.metadata);
  const persistedContentUrl = String(artifact.contentUrl ?? '').trim();
  const hasPersistedExport = isPersistedExportImageUrl(persistedContentUrl);
  const candidates = [
    content.imageUrl,
    meta.imageUrl,
    meta.enhanced_photo_url,
    content.enhanced_photo_url,
    content.exportUrl,
    content.permanentPreviewUrl,
    meta.exportUrl,
    meta.permanentPreviewUrl,
    content.canvaDownloadUrl,
    meta.canvaDownloadUrl,
    meta.feed_preview_url,
    content.feed_preview_url,
    meta.poster_url,
    meta.posterUrl,
    content.posterUrl,
    content.poster_url,
    meta.reference_photo_url,
    content.reference_photo_url,
    artifact.contentUrl,
  ];

  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw || /\.(mp4|mov|webm)(\?|$)/i.test(raw)) continue;
    if (raw.includes('canva.com/design')) continue;
    if (isGalleryProxyPreviewUrl(raw) && hasPersistedExport) continue;
    if (raw.includes('/api/media-proxy') && !isPersistedExportImageUrl(raw)) {
      // Skip expired Unsplash proxies when a persisted export exists elsewhere in candidates
      const hasExport = candidates.some(
        (c) => typeof c === 'string' && isPersistedExportImageUrl(String(c)),
      );
      if (hasExport) continue;
    }
    return upgradePhotoUrlForDisplay(raw) ?? raw;
  }
  return null;
}

/** Branded PNG from Remotion poster pipeline (feed post bundle). */
export function resolveBrandedPostUrl(artifact: OutputArtifact): string | null {
  if (!isPostKind(artifact)) return null;
  const productionExport = resolveProductionExportImageUrl(artifact);
  if (productionExport) return productionExport;

  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const raw = String(
    content.imageUrl || meta.imageUrl || artifact.contentUrl || '',
  ).trim();
  return normalizeBrandedPostUrl(raw);
}

/** Raw gallery photo for Remotion render — never use text-baked branded stills as photo input. */
export function resolveGalleryPhotoForRender(artifact: OutputArtifact): string | null {
  const content = parseArtifactContent(artifact.content);
  const meta = parseArtifactMetadata(artifact.metadata);
  const candidates = [
    meta.enhanced_photo_url,
    content.enhanced_photo_url,
    meta.feed_preview_url,
    content.feed_preview_url,
    meta.poster_url,
    meta.posterUrl,
    content.posterUrl,
    content.poster_url,
    meta.selected_gallery_url,
    content.selected_gallery_url,
    meta.reference_photo_url,
    content.reference_photo_url,
    content.imageUrl,
    meta.imageUrl,
  ];
  const isTenantMedia = (raw: string) =>
    raw.includes('/api/media') || raw.startsWith('/api/media');
  const ordered = [
    ...candidates.filter((c) => isTenantMedia(String(c || ''))),
    ...candidates.filter((c) => !isTenantMedia(String(c || ''))),
  ];
  for (const candidate of ordered) {
    const raw = String(candidate || '').trim();
    if (!raw || /\.(mp4|mov|webm)(\?|$)/i.test(raw)) continue;
    return upgradePhotoUrlForDisplay(raw) ?? raw;
  }
  return null;
}

/** Gallery poster for a production bundle (before or after video render). */
export function resolvePosterUrl(artifact: OutputArtifact): string | null {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const feedPreview = String(meta.feed_preview_url || content.feed_preview_url || '').trim();
  if (feedPreview && !/\.(mp4|mov|webm)(\?|$)/i.test(feedPreview)) {
    return upgradePhotoUrlForDisplay(feedPreview) ?? feedPreview;
  }

  const gallery = resolveGalleryPhotoForRender(artifact);
  if (gallery) return gallery;
  const raw = String(content.imageUrl || meta.imageUrl || '').trim();
  if (!raw || /\.(mp4|mov|webm)(\?|$)/i.test(raw)) return null;
  return upgradePhotoUrlForDisplay(raw) ?? raw;
}

function normalizeProductionHeadline(raw: unknown): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function artifactPackageFormat(artifact: OutputArtifact): string {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const kind = String(content.kind || meta.kind || '').toLowerCase();
  const ct = String((artifact as { contentType?: string }).contentType || content.contentType || '').toLowerCase();
  if (kind.includes('story') || kind.includes('canvas') || ct.includes('story') || ct.includes('canvas')) {
    return 'story';
  }
  if (kind.includes('reel') || ct.includes('reel')) return 'reel';
  if (kind.includes('carousel') || ct.includes('carousel')) return 'carousel';
  if (kind.includes('event') || kind.includes('announcement')) return 'story';
  return 'post';
}

export function getProductionIdeaKey(artifact: OutputArtifact): string {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const ideaId = String(meta.idea_id || meta.ideaId || content.idea_id || content.ideaId || '').trim();
  if (ideaId) return ideaId;
  const missionId = parseArtifactMissionId(artifact) || 'no-mission';
  const headline = normalizeProductionHeadline(meta.headline || content.headline || artifact.title);
  return `${missionId}::${headline}`;
}

/** Per-story identity — distinct manifest slots at the same idea_index stay separate. */
export function getStoryBarDedupeKey(artifact: OutputArtifact): string {
  const missionId = parseArtifactMissionId(artifact) || 'no-mission';
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const role = String(meta.production_role ?? content.production_role ?? '').trim();
  const ideaIndex = meta.idea_index ?? content.idea_index ?? meta.ideaIndex;
  if (typeof ideaIndex === 'number') {
    return `story::${missionId}::idx-${ideaIndex}${role ? `::${role}` : ''}`;
  }
  const ideaId = String(meta.idea_id || meta.ideaId || content.idea_id || content.ideaId || '').trim();
  if (ideaId && missionId !== 'no-mission' && ideaId.startsWith(`${missionId}-`)) {
    const suffix = ideaId.slice(missionId.length + 1);
    const parsedIdx = Number.parseInt(suffix, 10);
    if (!Number.isNaN(parsedIdx)) {
      return `story::${missionId}::idx-${parsedIdx}${role ? `::${role}` : ''}`;
    }
  }
  if (ideaId) return `story::${ideaId}${role ? `::${role}` : ''}`;
  const slotKey = String(meta.library_slot_key || meta.librarySlotKey || '').trim();
  if (slotKey) return `story::${missionId}::${slotKey}`;
  const headline = normalizeProductionHeadline(meta.headline || content.headline || artifact.title);
  if (headline) return `story::${missionId}::${headline}${role ? `::${role}` : ''}`;
  return `story::${artifact.id}`;
}

/** Semantic dedupe key — one manifest slot (idea_index + production_role) per artifact. */
export function getProductionDedupeKey(artifact: OutputArtifact): string {
  const fmt = artifactPackageFormat(artifact);
  const missionId = parseArtifactMissionId(artifact) || 'no-mission';
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const role = String(meta.production_role ?? content.production_role ?? '').trim();
  const ideaIndex = meta.idea_index ?? content.idea_index;
  if (role && typeof ideaIndex === 'number') {
    return `${fmt}::${missionId}::idx-${ideaIndex}::${role}`;
  }
  if (fmt === 'story') return getStoryBarDedupeKey(artifact);
  const headline = normalizeProductionHeadline(meta.headline || content.headline || artifact.title);
  if (headline) return `${fmt}::${missionId}::${headline}${role ? `::${role}` : ''}`;
  const ideaId = String(meta.idea_id || meta.ideaId || content.idea_id || content.ideaId || '').trim();
  if (ideaId) return `${fmt}::${ideaId}${role ? `::${role}` : ''}`;
  return `${fmt}::${artifact.id}`;
}

export function buildIdeaProductionDedupeKey(
  missionId: string | undefined,
  idea: Record<string, unknown>,
  ideaIndex: number,
  slotRole?: string,
): string {
  const ct = String(
    idea.content_type || idea.content_kind || idea.format || idea.kind || 'post',
  ).toLowerCase();
  let fmt = 'post';
  if (ct.includes('reel')) fmt = 'reel';
  else if (ct.includes('carousel')) fmt = 'carousel';
  else if (ct.includes('story') || ct.includes('canvas') || ct.includes('event') || ct.includes('announcement')) {
    fmt = 'story';
  }
  const mid = missionId || 'no-mission';
  const slot = String(slotRole ?? '').trim();
  const slotSuffix = slot ? `::${slot}` : '';
  if (fmt === 'story') {
    const stableId = String(idea.id || idea.idea_id || '').trim();
    if (stableId) return `story::${stableId}${slotSuffix}`;
    const idx = typeof idea.idea_index === 'number' ? idea.idea_index : ideaIndex;
    return `story::${mid}::idx-${idx}${slotSuffix}`;
  }
  const headline = normalizeProductionHeadline(
    idea.headline || idea.concept_title || idea.title || idea.caption_draft,
  );
  if (headline) return `${fmt}::${mid}::${headline}${slotSuffix}`;
  const stableId = String(idea.id || idea.idea_id || '').trim();
  if (stableId) return `${fmt}::${stableId}${slotSuffix}`;
  return `${fmt}::${mid}::idx-${ideaIndex}${slotSuffix}`;
}

function bundlePriority(artifact: OutputArtifact): number {
  const status = getProductionBundleStatus(artifact);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const hasVideo = Boolean(resolveStoryVideoUrl(artifact));
  if (expectsRemotionStoryVideo(artifact) && !hasVideo) return 8;
  if (status === 'ready' && hasVideo) return 100;
  if (String(meta.source || '') === 'remotion' && hasVideo) return 90;
  if (status === 'rendering' && isProductionBundle(artifact)) return 70;
  if (status === 'rendering') return 50;
  if (hasVideo) return 40;
  if (isProductionBundle(artifact)) return 30;
  return 10;
}

/**
 * One idea = one artifact. Collapses duplicate runs (same headline/format) and legacy
 * bundle pairs (image placeholder + Remotion video).
 */
function dedupeByKey(
  artifacts: OutputArtifact[],
  keyFn: (artifact: OutputArtifact) => string,
): OutputArtifact[] {
  const groups = new Map<string, OutputArtifact[]>();

  for (const artifact of artifacts) {
    const key = keyFn(artifact);
    const group = groups.get(key) ?? [];
    group.push(artifact);
    groups.set(key, group);
  }

  const deduped: OutputArtifact[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]!);
      continue;
    }
    const winner = [...group].sort((a, b) => bundlePriority(b) - bundlePriority(a))[0]!;
    deduped.push(winner);
  }

  return deduped.sort(compareArtifactsByProductionTime);
}

export function dedupeProductionBundles(artifacts: OutputArtifact[]): OutputArtifact[] {
  return dedupeByKey(artifacts, getProductionDedupeKey);
}

/**
 * Feed scroll — keep every production run (reproduce, backfill, new missions).
 * Only drops exact duplicate rows by artifact id (API/cache glitches).
 * Mission checklist / slot counts still use dedupeProductionBundles.
 */
export function dedupeFeedDisplayArtifacts(artifacts: OutputArtifact[]): OutputArtifact[] {
  const seen = new Set<string>();
  const out: OutputArtifact[] = [];
  const sorted = [...artifacts].sort(compareArtifactsByProductionTime);
  for (const artifact of sorted) {
    if (!artifact?.id || seen.has(artifact.id)) continue;
    seen.add(artifact.id);
    out.push(artifact);
  }
  return out;
}

/** Story bubble bar — one ring per idea/slot, not per headline text. */
export function dedupeStoryBarArtifacts(artifacts: OutputArtifact[]): OutputArtifact[] {
  return dedupeByKey(artifacts, getStoryBarDedupeKey);
}

/**
 * Consumer Feed story bar — hide failed/stale duplicates and cap ring count.
 * Operator mode should pass through the full deduped pool.
 */
export function filterConsumerStoryBar(
  artifacts: OutputArtifact[],
  opts?: { maxRings?: number; missionId?: string | null },
): OutputArtifact[] {
  const maxRings = opts?.maxRings ?? 4;
  let pool = dedupeStoryBarArtifacts(artifacts).filter((a) => {
    if (isBundleFailed(a) && !resolveStoryVideoUrl(a) && !resolvePosterUrl(a)) return false;
    if (isBundleFailed(a) && !resolveStoryVideoUrl(a) && expectsRemotionStoryVideo(a)) return false;
    if (isBundleStaleRendering(a)) return false;
    return true;
  });

  if (opts?.missionId) {
    pool = pool.filter((a) => parseArtifactMissionId(a) === opts.missionId);
  } else {
    const byMission = new Map<string, OutputArtifact[]>();
    for (const artifact of pool) {
      const mid = parseArtifactMissionId(artifact) || 'none';
      const group = byMission.get(mid) ?? [];
      group.push(artifact);
      byMission.set(mid, group);
    }
    const newestMissionIds = [...byMission.entries()]
      .sort(([, a], [, b]) => {
        const ta = Math.max(...a.map((x) => new Date(x.createdAt).getTime()));
        const tb = Math.max(...b.map((x) => new Date(x.createdAt).getTime()));
        return tb - ta;
      })
      .slice(0, 4)
      .map(([mid]) => mid);
    pool = pool.filter((a) => {
      const mid = parseArtifactMissionId(a) || 'none';
      // Yeni Brief (mission'sız) story'leri her zaman göster — mission gruplamasına takılmasın.
      if (mid === 'none') return true;
      return newestMissionIds.includes(mid);
    });
  }

  return pool
    .sort(compareArtifactsByProductionTime)
    .slice(0, maxRings);
}

/** Story slot that historically expected a Remotion MP4 — now fal still poster is sufficient. */
export function expectsRemotionStoryVideo(_artifact: OutputArtifact): boolean {
  return false;
}

function storyExpectsVideoArtifact(artifact: OutputArtifact): boolean {
  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  const pipeline = normalizeProductionPipeline(
    String(meta.pipeline ?? content.pipeline ?? '').trim(),
  );
  return isVideoPipeline(pipeline);
}

export function isProductionBundleStory(artifact: OutputArtifact): boolean {
  if (!isStoryKind(artifact)) return false;
  const status = getProductionBundleStatus(artifact);
  const hasVideo = Boolean(resolveStoryVideoUrl(artifact));
  const hasPoster = Boolean(resolvePosterUrl(artifact));
  if (isProductionBundle(artifact)) {
    return status === 'ready' ? (hasVideo || hasPoster) : hasPoster || hasVideo;
  }
  return hasVideo || hasPoster;
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
  maxAgeMs = REMOTION_BUNDLE_STALE_MS,
): boolean {
  const status = getProductionBundleStatus(artifact);
  if (status !== 'rendering') return false;
  return isRenderingTimedOut(artifact, maxAgeMs);
}

/** Story/post expected to get Remotion output but asset is still missing. */
export function isAwaitingStoryVideo(artifact: OutputArtifact): boolean {
  if (isStoryKind(artifact)) {
    if (resolveStoryVideoUrl(artifact)) return false;
    if (!storyExpectsVideoArtifact(artifact)) {
      if (resolveBrandedPostUrl(artifact) || resolvePosterUrl(artifact)) return false;
    }
    if (isProductionBundle(artifact)) return storyExpectsVideoArtifact(artifact);
    return hasProductionBundleFlag(artifact) && storyExpectsVideoArtifact(artifact);
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
  return isPostKind(artifact) ? 'Poster üret' : 'Poster üret';
}

export function storyRetryIsBusy(artifact: OutputArtifact): boolean {
  return isAwaitingStoryVideo(artifact)
    && isBundleRendering(artifact)
    && !isBundleStaleRendering(artifact)
    && !isBundleFailed(artifact);
}

/**
 * Sprint 3 — Feed artifact view-model.
 * PlatformFeed reads this instead of re-deriving bundle/quality heuristics inline.
 *
 * Quality note: detectFeedArtifactKind preserves legacy PlatformFeed signal order
 * (story before reel, Canva/canvas hints, ad detection) — do not simplify further.
 */
import { detectPreviewMode, artifactToNativeContent } from '@/app/mobile/_components/platform-native-previews';
import { parseArtifactContent, parseArtifactMetadata, resolveCarouselUrls } from '@/lib/artifact-utils';
import { resolveClientMediaUrl } from '@/lib/media-url';
import {
  isFalDesignPipeline,
  isFalOnlyPipeline,
  isFalVideoPipeline,
} from '@/lib/pipeline-registry';
import { adChannelFromArtifact, adPlatformShortLabel, isPaidAdArtifact } from '@/lib/ad-publish-utils';
import { formatPublishScheduleLabel } from '@/lib/feed-publish-schedule';
import {
  canRetryStoryRender,
  getProductionBundleStatus,
  isBundleRendering,
  resolveStoryVideoClientUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { buildProductionQualityScorecard, type ProductionQualityScorecard } from '@/lib/production-quality-scorecard';
import type { OutputArtifact } from '@/types';

export type FeedArtifactKind = 'post' | 'story' | 'reel' | 'carousel' | 'ad' | 'unknown';

export interface FeedArtifactViewModel {
  artifact: OutputArtifact;
  meta: Record<string, unknown>;
  content: ReturnType<typeof artifactToNativeContent>;
  kind: FeedArtifactKind;
  previewMode: ReturnType<typeof detectPreviewMode>;
  quality: ProductionQualityScorecard;
  bundleStatus: ReturnType<typeof getProductionBundleStatus>;
  isRendering: boolean;
  canRetryRender: boolean;
  scheduleLabel: string | null;
  isAdCreative: boolean;
  adBadge: string | null;
  isDesignedPost: boolean;
  isPendingReview: boolean;
  isApproved: boolean;
  carouselUrls: string[];
}

export interface FeedProducedMedia {
  imageUrl: string | null;
  videoUrl: string | null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/**
 * Canonical Feed kind — parity with legacy PlatformFeed.detectKind.
 * Story is checked before reel so video stories with MP4 are not mislabeled.
 */
export function detectFeedArtifactKind(artifact: OutputArtifact): FeedArtifactKind {
  if (isPaidAdArtifact(artifact)) return 'ad';

  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  const renderedPreview = readRecord(content.renderedPreview);

  const artifactType = String((artifact as { artifactType?: string }).artifactType ?? '').toLowerCase();
  const contentKind = String(content.kind ?? '').toLowerCase();
  const previewKind = String(renderedPreview.kind ?? '').toLowerCase();
  const metaKind = String(
    meta.kind
    ?? meta.content_kind
    ?? meta.contentKind
    ?? content.content_kind
    ?? content.contentKind
    ?? meta.production_role
    ?? content.production_role
    ?? '',
  ).toLowerCase();
  const contentType = String((artifact as { contentType?: string }).contentType ?? '').toLowerCase();
  const exportFmt = String(
    meta.canvaExportFormat
    ?? renderedPreview.exportFormat
    ?? '',
  ).toLowerCase();
  const title = String((artifact as { title?: string }).title ?? '').toLowerCase();
  const videoUrl = String(
    content.videoUrl
    ?? meta.videoUrl
    ?? renderedPreview.videoUrl
    ?? '',
  ).trim();
  const contentUrl = String(artifact.contentUrl ?? '').trim();
  const role = String(meta.production_role ?? '').toLowerCase();

  const signals = [
    contentKind,
    previewKind,
    artifactType,
    contentType,
    exportFmt,
    title,
    metaKind,
    role,
    String(meta.pipeline ?? ''),
  ].join(' ');

  if (signals.includes('story') || signals.includes('canvas')) return 'story';
  if (signals.includes('carousel')) return 'carousel';

  if (
    signals.includes('reel')
    || exportFmt === 'mp4'
    || (videoUrl && !contentUrl.includes('.mp4'))
    || (videoUrl && !signals.includes('story'))
  ) {
    return 'reel';
  }

  if (signals.includes('ad')) return 'ad';

  if (resolveStoryVideoUrl(artifact)) {
    if (role.includes('story')) return 'story';
    if (!signals.includes('reel')) return 'story';
    return 'reel';
  }

  if (/\.(mp4|mov|webm)(\?|$)/i.test(contentUrl)) {
    return role.includes('story') ? 'story' : 'reel';
  }

  if (Number(meta.carousel_count ?? content.carousel_count ?? 0) > 1) return 'carousel';

  return 'post';
}

function isPlayableVideoUrl(url: string | null | undefined): boolean {
  return Boolean(url && /\.(mp4|mov|webm)(\?|$)/i.test(url));
}

function isFalProducedArtifact(meta: Record<string, unknown>): boolean {
  const pipeline = String(meta.pipeline ?? '').trim();
  if (isFalDesignPipeline(pipeline) || isFalOnlyPipeline(pipeline) || isFalVideoPipeline(pipeline)) {
    return true;
  }
  if (meta.fal_designer_produced === true || meta.fal_only === true || meta.fal_video_produced === true) {
    return true;
  }
  return String(meta.production_track ?? '').trim() === 'fal_ai';
}

function isPersistedR2ExportUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.includes('/api/media?key=') || u.includes('/api/media?Key=')) return true;
  if (u.startsWith('/api/media/')) return true;
  return false;
}

export function isGalleryProxyPreviewUrl(url: string | null | undefined): boolean {
  return String(url ?? '').trim().includes('/api/media-proxy');
}

function artifactUsesGalleryProxyPreview(artifact: OutputArtifact): boolean {
  const content = parseArtifactContent(artifact.content);
  const meta = parseArtifactMetadata(artifact.metadata);
  const candidates = [
    content.imageUrl,
    meta.imageUrl,
    meta.feed_preview_url,
    content.feed_preview_url,
    content.posterUrl,
    meta.poster_url,
    meta.posterUrl,
  ];
  return candidates.some((candidate) => isGalleryProxyPreviewUrl(String(candidate ?? '')));
}

function shouldPreferContentUrlExport(artifact: OutputArtifact, contentUrl: string): boolean {
  const meta = parseArtifactMetadata(artifact.metadata);
  if (isFalProducedArtifact(meta)) return true;
  if (artifactUsesGalleryProxyPreview(artifact)) return true;
  if (isPlayableVideoUrl(contentUrl)) return true;
  if (resolveStoryVideoUrl(artifact)) return true;
  if (meta.bundle_status === 'ready') return true;
  return false;
}

/**
 * Feed preview only — map persisted `contentUrl` export to still/video preview fields.
 * Covers fal posts/stories/reels and ready video bundles.
 */
export function resolveFeedProducedMedia(
  artifact: OutputArtifact,
  kind?: FeedArtifactKind,
): FeedProducedMedia {
  const empty: FeedProducedMedia = { imageUrl: null, videoUrl: null };
  const contentUrl = String(artifact.contentUrl ?? '').trim();
  if (!contentUrl || !isPersistedR2ExportUrl(contentUrl)) return empty;
  if (!shouldPreferContentUrlExport(artifact, contentUrl)) return empty;

  const resolvedKind = kind ?? detectFeedArtifactKind(artifact);
  const resolved = resolveClientMediaUrl(contentUrl) ?? contentUrl;
  if (isPlayableVideoUrl(resolved)) {
    return { videoUrl: resolved, imageUrl: null };
  }
  // Reels preview video-only — never surface a PNG export as reel media.
  if (resolvedKind === 'reel') return empty;
  return { imageUrl: resolved, videoUrl: null };
}

/**
 * Feed preview only — prefer the fal/R2 export in `contentUrl` over gallery proxy stills
 * stored in `content.imageUrl` / `metadata.imageUrl`.
 */
export function resolveFeedProducedStillUrl(artifact: OutputArtifact): string | null {
  return resolveFeedProducedMedia(artifact, detectFeedArtifactKind(artifact)).imageUrl;
}

/** Feed story/reel viewer — prefer produced export video, then bundle video fields. */
export function resolveFeedPreviewVideoUrl(artifact: OutputArtifact): string | null {
  const produced = resolveFeedProducedMedia(artifact).videoUrl;
  if (produced) return produced;
  return resolveStoryVideoClientUrl(artifact);
}

function applyFeedPreviewMediaOverride(
  artifact: OutputArtifact,
  native: ReturnType<typeof artifactToNativeContent>,
  kind: FeedArtifactKind,
): ReturnType<typeof artifactToNativeContent> {
  const produced = resolveFeedProducedMedia(artifact, kind);

  if (kind === 'reel') {
    const videoUrl = produced.videoUrl ?? (isPlayableVideoUrl(native.videoUrl) ? native.videoUrl : null);
    const posterUrl = videoUrl
      && native.imageUrl
      && !isGalleryProxyPreviewUrl(native.imageUrl)
      ? native.imageUrl
      : null;
    return {
      ...native,
      imageUrl: posterUrl,
      videoUrl,
    };
  }

  if (!produced.imageUrl && !produced.videoUrl) return native;

  const videoUrl = produced.videoUrl ?? (isPlayableVideoUrl(native.videoUrl) ? native.videoUrl : null);
  let imageUrl = produced.imageUrl ?? native.imageUrl;
  if (videoUrl && isGalleryProxyPreviewUrl(imageUrl)) {
    imageUrl = produced.imageUrl ?? null;
  }
  if (produced.imageUrl) {
    imageUrl = produced.imageUrl;
  }

  return {
    ...native,
    imageUrl: imageUrl ?? null,
    videoUrl,
  };
}

export function buildFeedArtifactViewModel(
  artifact: OutputArtifact,
  missionIdeationLookup?: ReadonlyMap<string, string>,
): FeedArtifactViewModel {
  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  const kind = detectFeedArtifactKind(artifact);
  const previewMode = detectPreviewMode(artifact, kind);
  const quality = buildProductionQualityScorecard(artifact, meta);
  const bundleStatus = getProductionBundleStatus(artifact);
  const hasVideo = Boolean(resolveStoryVideoUrl(artifact));
  const isRendering = isBundleRendering(artifact) && !hasVideo;
  const isAdCreative = isPaidAdArtifact(artifact);
  const adChannel = adChannelFromArtifact(artifact);
  const isDesignedPost = String(meta.production_role ?? '') === 'designed_post';

  return {
    artifact,
    meta,
    content: applyFeedPreviewMediaOverride(
      artifact,
      artifactToNativeContent(artifact, missionIdeationLookup),
      kind,
    ),
    kind,
    previewMode,
    quality,
    bundleStatus,
    isRendering,
    canRetryRender: canRetryStoryRender(artifact),
    scheduleLabel: formatPublishScheduleLabel(meta, { kind }),
    isAdCreative,
    adBadge: isAdCreative ? adPlatformShortLabel(adChannel) : null,
    isDesignedPost,
    isPendingReview: artifact.status === 'pending_review',
    isApproved: artifact.status === 'approved',
    carouselUrls: resolveCarouselUrls(content, meta),
  };
}

/**
 * Sprint 3 — Feed artifact view-model.
 * PlatformFeed reads this instead of re-deriving bundle/quality heuristics inline.
 *
 * Quality note: detectFeedArtifactKind preserves legacy PlatformFeed signal order
 * (story before reel, Canva/canvas hints, ad detection) — do not simplify further.
 */
import { detectPreviewMode, artifactToNativeContent } from '@/app/mobile/_components/platform-native-previews';
import {
  parseArtifactContent,
  resolveCarouselUrls,
} from '@/app/mobile/_components/artifact-utils';
import { adChannelFromArtifact, adPlatformShortLabel, isPaidAdArtifact } from '@/lib/ad-publish-utils';
import { formatPublishScheduleLabel } from '@/lib/feed-publish-schedule';
import {
  canRetryStoryRender,
  getProductionBundleStatus,
  isBundleRendering,
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

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/**
 * Canonical Feed kind — parity with legacy PlatformFeed.detectKind.
 * Story is checked before reel so Remotion stories with MP4 are not mislabeled.
 */
export function detectFeedArtifactKind(artifact: OutputArtifact): FeedArtifactKind {
  if (isPaidAdArtifact(artifact)) return 'ad';

  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const renderedPreview = readRecord(content.renderedPreview);

  const artifactType = String((artifact as { artifactType?: string }).artifactType ?? '').toLowerCase();
  const contentKind = String(content.kind ?? '').toLowerCase();
  const previewKind = String(renderedPreview.kind ?? '').toLowerCase();
  const metaKind = String(
    meta.content_kind
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
    if (role.includes('story') || meta.remotion_mission_story === true) return 'story';
    if (!signals.includes('reel')) return 'story';
    return 'reel';
  }

  if (/\.(mp4|mov|webm)(\?|$)/i.test(contentUrl)) {
    return role.includes('story') ? 'story' : 'reel';
  }

  if (Number(meta.carousel_count ?? content.carousel_count ?? 0) > 1) return 'carousel';

  return 'post';
}

export function buildFeedArtifactViewModel(artifact: OutputArtifact): FeedArtifactViewModel {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);
  const kind = detectFeedArtifactKind(artifact);
  const previewMode = detectPreviewMode(artifact, kind);
  const quality = buildProductionQualityScorecard(artifact, meta);
  const bundleStatus = getProductionBundleStatus(artifact);
  const hasVideo = Boolean(resolveStoryVideoUrl(artifact));
  const isRendering = isBundleRendering(artifact) && !hasVideo;
  const isAdCreative = isPaidAdArtifact(artifact);
  const adChannel = adChannelFromArtifact(artifact);
  const isDesignedPost = String(meta.production_role ?? '') === 'designed_post'
    || String(meta.pipeline ?? '') === 'remotion_poster';

  return {
    artifact,
    meta,
    content: artifactToNativeContent(artifact),
    kind,
    previewMode,
    quality,
    bundleStatus,
    isRendering,
    canRetryRender: canRetryStoryRender(artifact),
    scheduleLabel: formatPublishScheduleLabel(meta),
    isAdCreative,
    adBadge: isAdCreative ? adPlatformShortLabel(adChannel) : null,
    isDesignedPost,
    isPendingReview: artifact.status === 'pending_review',
    isApproved: artifact.status === 'approved',
    carouselUrls: resolveCarouselUrls(content, meta),
  };
}

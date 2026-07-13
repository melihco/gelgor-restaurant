'use client';
/**
 * PLATFORM FEED — Platform-native content preview.
 *
 * Every piece of AI-generated content is shown exactly as it will appear
 * on the target platform. No abstract cards, no metadata tables.
 * Instagram posts look like Instagram. Stories look like stories.
 *
 * Interaction model:
 *   - Vertical scroll through content
 *   - Each card is full-platform preview with approve/revision actions
 *   - Tab bar to filter by platform/format
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { nodeOutputObject } from '@/lib/mission-node-output';
import { resolveArtifact, parseArtifactContent, normalizeHashtags as normalizeHashtagsUtil, resolveCarouselUrls } from '@/lib/artifact-utils';
import { resolveFeedDisplayCaption, resolveFeedDisplayHeadline, buildMissionIdeationCaptionLookup } from '@/lib/feed-display-caption';
import { SafeCoverImage } from '../SafeCoverImage';
import {
  dedupeFeedDisplayArtifacts,
  dedupeStoryBarArtifacts,
  filterConsumerStoryBar,
  isBundleRendering,
  isBundleFailed,
  canRetryStoryRender,
  storyRetryLabel,
  storyRetryIsBusy,
  isProductionBundleStory,
  isRemotionVideoStoryArtifact,
  parseArtifactMissionId,
  resolvePosterUrl,
  resolveBrandedPostUrl,
  resolvePublishImageUrl,
  isAwaitingStoryVideo,
  isPostKind,
  resolveStoryVideoUrl as resolveStoryVideoUrlShared,
  resolveStoryPublishVideoUrl,
  resolveStoryPublishImageUrl,
} from '@/lib/mission-feed-package';
import {
  filterFeedDisplayArtifacts,
  filterMissionFeedArtifacts,
  isArtifactFeedPublishable,
} from '@/lib/weekly-publish-package';
import {
  extractWeeklyThemeFromNodes,
  summarizeMissionPlanningOutputs,
  summarizeMissionProductionPipeline,
} from '@/lib/mission-pipeline-transparency';
import { buildFeedDirectorTelemetry } from '@/lib/mission-production-telemetry';
import { resolveApprovalQualityGate } from '@/lib/approval-quality-gate';
import { buildFeedArtifactViewModel, detectFeedArtifactKind, isGalleryProxyPreviewUrl, resolveFeedPreviewVideoUrl, resolveFeedProducedStillUrl } from '@/lib/artifact-view-model';
import {
  artifactMatchesSlotFilter,
  type FeedSlotFilter,
} from '@/lib/feed-slot-filter';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { useBrandStoryAudio } from '@/hooks/useBrandStoryAudio';
import { resolveActiveFeedTemplates, type ScheduledTemplateConfig, type ScheduledTemplateFeedItem } from '@/lib/scheduled-template-feed';
import { getTenantBffHeaders } from '@/lib/runtime-config';

/** Story bar ring — mission artifact or brand scheduled template. */
type StoryBarItem =
  | { kind: 'artifact'; artifact: OutputArtifact }
  | { kind: 'scheduled'; template: ScheduledTemplateFeedItem };
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import {
  MOBILE_ARTIFACT_FEED_LIMIT,
  MOBILE_ARTIFACT_FEED_RENDER_PAGE,
  MOBILE_ARTIFACT_MISSION_POOL_LIMIT,
  refetchMobileFeedPool,
} from '../../_lib/mobile-artifacts';
import { useFeedPullToRefresh } from '../../_hooks/use-feed-pull-to-refresh';
import { FeedLazyPostList } from '../FeedLazyPostList';
import { mobileQueryDefaults } from '../../_lib/mobile-query';
import {
  adChannelFromArtifact,
  adPlatformLabel,
  adPlatformShortLabel,
  isPaidAdArtifact,
  isOrganicFeedArtifact,
} from '@/lib/ad-publish-utils';
import { BoostPostSheet } from '../BoostPostSheet';
import {
  classifyMatch,
  MIN_ACCEPT_SCORE,
  resolveArtifactMatchScore,
} from '@/lib/gallery-photo-matcher';
import { VisualReviewBadge } from '../VisualReviewSheet';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { getMobilePortalRoot, isDebugUiMode, isMobileOperatorMode } from '../mobile-client-config';
import { isProductionLimitsBypassed } from '@/lib/production-budget-policy';
import { FeedLoadingSkeleton } from '../FeedLoadingSkeleton';
import { MobileBrandNavbar, FeedNavbarActions, MobileNavMenuButton } from '../MobileBrandNavbar';
import { brandNavbarBackground, useBrandThemePalette } from '../use-brand-theme-palette';
import { resolveFeedBrandName, resolveFeedHandle } from '@/lib/tenant-brand-context';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { resolveMertcafePublishAuth, humanizeMertcafePublishError, assertMertcafePublishReady } from '@/lib/mertcafe-publish-auth';
import { isPlayableVideoUrl } from '@/lib/fal-story-motion';
import {
  artifactToNativeContent,
  detectPreviewMode,
  PlatformNativePreview,
  PLATFORM_TABS,
  StoryCoverImage,
  StoryFullscreenImage,
  StoryStillPreview,
  StoryPreviewVideo,
  type PreviewPlatform,
} from '../platform-native-previews';
import type { OutputArtifact } from '@/types';
import { FeedPublishBar } from '../FeedPublishBar';
import { resolveIgFeedChrome } from '../ig-feed-chrome';
import { ScheduleSheet } from '../ScheduleSheet';
import {
  formatPublishScheduleLabel,
  formatScheduleButtonSubtitle,
  formatFeedScheduleHint,
  resolveSuggestedScheduleISO,
  sortFeedArtifactsForDisplay,
} from '@/lib/feed-publish-schedule';
import { compareArtifactsByProductionTime } from '@/lib/artifact-production-time';

type FeedFilter = 'all' | 'post' | 'story' | 'reel' | 'ad';

interface BrandAlignmentData {
  bas: number;
  canProposeMissions: boolean;
  canAutoProduce: boolean;
  weakest: { id: string; label: string; score: number | null; fix: string } | null;
  subScores?: Array<{ id: string; label: string; score: number | null }>;
}

function alignmentSubScore(
  data: BrandAlignmentData | null | undefined,
  id: string,
): number | null {
  const hit = data?.subScores?.find((s) => s.id === id);
  return typeof hit?.score === 'number' ? hit.score : null;
}

function detectKind(artifact: OutputArtifact): string {
  return detectFeedArtifactKind(artifact);
}

function parseFeedDirectorReportFromNodes(
  nodes: Array<{ task_type?: string; status?: string; output_summary?: string | null; output_payload?: unknown }>,
): Record<string, unknown> | null {
  const node = nodes.find(
    (n) => n.task_type === 'feed_cohesion_review' && n.status === 'completed',
  );
  return nodeOutputObject(node);
}

function FeedArtifactQualityStrip({
  meta,
  t,
  igHome,
}: {
  meta: Record<string, unknown>;
  t: ReturnType<typeof useTheme>['t'];
  igHome: boolean;
}) {
  const slotLabel = productionRoleBadge(meta);
  const fdScore = typeof meta.feed_director_score === 'number' ? meta.feed_director_score : null;
  const grafiker = typeof meta.grafiker_score === 'number' ? meta.grafiker_score : null;
  const grafikerPass = typeof meta.grafiker_pass === 'boolean' ? meta.grafiker_pass : null;
  if (!slotLabel && fdScore == null && grafiker == null) return null;
  if (!isDebugUiMode()) return null;

  const chip = (label: string, value: string, color: string) => (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '3px 7px',
      borderRadius: 6,
      background: color,
      color: '#fff',
      letterSpacing: '0.02em',
    }}>
      {label}: {value}
    </span>
  );

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      margin: igHome ? '0 14px 8px' : '0 12px 8px',
    }}>
      {slotLabel && chip('Slot', slotLabel, 'rgba(59,130,246,0.75)')}
      {fdScore != null && chip('FD', `${fdScore}`, 'rgba(16,185,129,0.75)')}
      {grafiker != null && chip(
        'Grafiker',
        `${grafiker}/10`,
        grafikerPass === false || grafiker < 8
          ? 'rgba(245,158,11,0.85)'
          : 'rgba(16,185,129,0.85)',
      )}
    </div>
  );
}

/** Story bar: all story kinds (Remotion, poster still, legacy). */
function isFeedStoryItem(artifact: OutputArtifact): boolean {
  return detectKind(artifact) === 'story';
}

/** APO-5 v0 — production slot badge from auto-produce metadata */
function productionRoleBadge(meta: Record<string, unknown>): string | null {
  const role = String(meta.production_role ?? '').trim();
  const pipeline = String(meta.pipeline ?? '').trim();
  if (role === 'organic_post' || pipeline === 'gallery_photo') return 'Galeri';
  if (role === 'designed_post' || role === 'designed_typography' || role === 'fal_designed_post' || pipeline === 'fal_design' || pipeline === 'remotion_poster') return 'Tasarım';
  if (role === 'organic_story_still' || pipeline === 'story_still') return 'Story';
  if (pipeline === 'remotion_story' || pipeline === 'fal_story' || meta.remotion_mission_story) return 'Story';
  if (role.includes('campaign') || pipeline.includes('remotion')) return 'Kampanya';
  if (role.includes('reel') || pipeline === 'runway_reel') return 'Reel';
  if (role === 'organic_carousel' || pipeline === 'carousel_gallery') return 'Carousel';
  if (role === 'paid_ad_google_creative' || pipeline === 'google_ad') return 'Google Ads';
  if (role === 'paid_ad_creative' || pipeline === 'meta_ad') return 'Meta Ads';
  return null;
}

function AdPublishActions({
  artifact,
  workspaceId,
  onOpenMeta,
  onOpenGoogle,
  t,
  shellBg,
  separator,
  mutedText,
}: {
  artifact: OutputArtifact;
  workspaceId?: string;
  onOpenMeta: () => void;
  onOpenGoogle: () => void;
  t: ReturnType<typeof useTheme>['t'];
  shellBg?: string;
  separator?: string;
  mutedText?: string;
}) {
  const channel = adChannelFromArtifact(artifact);
  const label = adPlatformLabel(channel);
  const isMeta = channel === 'meta_ads';
  const isGoogle = channel === 'google_ads';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8,
      padding: '0 14px 14px', background: shellBg ?? '#000',
      borderTop: `0.5px solid ${separator ?? 'rgba(255,255,255,0.06)'}`,
    }}>
      <div style={{ fontSize: 11, color: mutedText ?? 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
        {label} kreatifi — organik yayın yerine reklam panelinden gönderin
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(isMeta || !channel) && (
          <button type="button" onClick={onOpenMeta}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#1877F2,#0d5bb5)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
            Meta&apos;da yayınla
          </button>
        )}
        {(isGoogle || !channel) && (
          <button type="button" onClick={onOpenGoogle}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#4285F4,#1a73e8)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
            Google Ads
          </button>
        )}
      </div>
      {!workspaceId && (
        <span style={{ fontSize: 10, color: t.warning }}>Workspace bağlantısı gerekli</span>
      )}
    </div>
  );
}

function InstagramProfileBar({ handle, logoUrl, postCount, storyCount }: {
  handle: string; logoUrl?: string; postCount: number; storyCount: number;
}) {
  const h = handle.startsWith('@') ? handle : `@${handle}`;
  return (
    <div style={{
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      background: '#000',
      borderBottom: '0.5px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', padding: 2.5,
        background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', flexShrink: 0 }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
          border: '2px solid #000', background: '#222',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{h.replace('@', '')[0]?.toUpperCase()}</span>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{h}</div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{postCount}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>gönderi</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>{storyCount}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>story</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const NativeFeedCard = React.memo(function NativeFeedCard({
  artifact, platform, onApprove, onRevision, onRetryRender, retryingRender, approving, revisioning,
  workspaceId, onOpenMetaAd, onOpenGoogleAd, onOpenReelFullscreen, t, storyMusicUrl, missionIdeationLookup,
}: {
  artifact: OutputArtifact;
  platform: PreviewPlatform;
  onApprove: (artifactId: string) => void;
  onRevision: (artifactId: string) => void;
  onRetryRender?: (artifactId: string) => void;
  retryingRender?: boolean;
  approving: boolean;
  revisioning: boolean;
  workspaceId?: string;
  onOpenMetaAd?: (artifactId: string) => void;
  onOpenGoogleAd?: () => void;
  onOpenReelFullscreen?: () => void;
  t: ReturnType<typeof useTheme>['t'];
  storyMusicUrl?: string | null;
  missionIdeationLookup?: ReadonlyMap<string, string>;
}) {
  const tenantBrand = useTenantBrandContext();
  const openApproval = useMobileStore((s) => s.openApproval);
  const vm = React.useMemo(
    () => buildFeedArtifactViewModel(artifact, missionIdeationLookup),
    [artifact, missionIdeationLookup],
  );
  const meta = vm.meta;
  const handle = resolveFeedHandle(meta, tenantBrand);
  const logoUrl = tenantBrand.logoUrl ? (resolveClientMediaUrl(tenantBrand.logoUrl) ?? tenantBrand.logoUrl) : undefined;
  const kind = vm.kind;
  const mode = vm.previewMode;
  const content = vm.content;
  const isPending = vm.isPendingReview;
  const isApproved = vm.isApproved;
  const isRendering = vm.isRendering;
  const canRetry = vm.canRetryRender;
  const scheduleLabel = vm.scheduleLabel;
  const isAdCreative = vm.isAdCreative;
  const isDesignedPost = vm.isDesignedPost;
  const adBadge = vm.adBadge ?? '';
  const matchScore = vm.quality.matchScore;
  const matchCls = matchScore != null ? classifyMatch(matchScore) : null;
  const matchRejected = matchCls?.quality === 'rejected';
  const matchWeak = matchCls?.quality === 'weak' && (matchScore ?? 0) > 5;
  const qualityGate = vm.quality;
  const canApproveHard = !qualityGate.hardBlock;
  const hasSoftWarnings = qualityGate.softWarnings.length > 0;
  const hardBlockButtonLabel = qualityGate.hardBlockReason?.includes('Grafiker')
    ? '⚠ Kalite düşük'
    : qualityGate.hardBlockReason?.includes('metin')
      ? '⚠ Metin hatalı'
      : '⚠ Onay kapalı';
  const [softApproveAck, setSoftApproveAck] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);

  const igHome = !isMobileOperatorMode() && platform === 'instagram';
  const igHomeChrome = resolveIgFeedChrome(t.isDark);
  const cardBg = igHome
    ? igHomeChrome.shell
    : (platform === 'instagram' ? '#000' : (t.isDark ? '#0F0F1C' : '#fff'));

  const handleApproveClick = () => {
    if (!canApproveHard || approving || isRendering) return;
    if (hasSoftWarnings && !softApproveAck) {
      setSoftApproveAck(true);
      return;
    }
    onApprove(artifact.id);
    setSoftApproveAck(false);
  };

  const scheduleSubtitle = formatScheduleButtonSubtitle(meta);
  const suggestedScheduleISO = resolveSuggestedScheduleISO(meta);

  const publishType: 'feed' | 'reel' | 'story' =
    kind === 'reel' ? 'reel' : kind === 'story' ? 'story' : 'feed';

  const formatTag: import('../platform-native-previews').FeedFormatTag | undefined =
    isAdCreative ? 'ad' : kind === 'carousel' ? 'carousel' : kind === 'reel' ? 'reel' : 'post';

  const publishBar = igHome && isPending && !isAdCreative && !isRendering ? (
    <FeedPublishBar
      onShareNow={handleApproveClick}
      onSchedule={() => setScheduleOpen(true)}
      onEdit={() => openApproval(artifact.id)}
      onRevise={() => onRevision(artifact.id)}
      scheduleSubtitle={scheduleSubtitle}
      sharing={approving}
      revisioning={revisioning}
      disabled={!canApproveHard || isRendering}
      softWarning={hasSoftWarnings && !softApproveAck}
      hardBlockLabel={hardBlockButtonLabel}
      dark={t.isDark}
    />
  ) : null;

  const swipeStartX = React.useRef<number | null>(null);
  const [swipeDx, setSwipeDx] = React.useState(0);
  const SWIPE_THRESHOLD = 72;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isPending || isRendering) return;
    swipeStartX.current = e.clientX;
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (swipeStartX.current === null) return;
    const dx = e.clientX - swipeStartX.current;
    if (Math.abs(dx) > 4) setSwipeDx(dx);
  };
  const handlePointerUp = () => {
    if (swipeStartX.current === null) return;
    swipeStartX.current = null;
    if (swipeDx >= SWIPE_THRESHOLD) {
      onApprove(artifact.id);
    } else if (swipeDx <= -SWIPE_THRESHOLD) {
      onRevision(artifact.id);
    }
    setSwipeDx(0);
  };

  const swipeOpacity = Math.min(Math.abs(swipeDx) / SWIPE_THRESHOLD, 1);
  const isSwipingRight = swipeDx > 12;
  const isSwipingLeft = swipeDx < -12;

  return (
    <div
      className={igHome ? 'ig-feed-post' : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        marginBottom: igHome ? 0 : 10,
        borderRadius: igHome ? 0 : 18,
        overflow: 'hidden',
        background: cardBg,
        border: igHome ? 'none' : `0.5px solid ${t.separator}`,
        borderBottom: igHome ? `0.5px solid ${igHomeChrome.separator}` : undefined,
        contentVisibility: 'auto',
        containIntrinsicSize: mode === 'reel' ? '0 700px' : '0 680px',
        transform: `translateX(${Math.max(-48, Math.min(48, swipeDx * 0.4))}px)`,
        transition: swipeDx === 0 ? 'transform 200ms cubic-bezier(0.22,1,0.36,1)' : 'none',
        position: 'relative',
        touchAction: 'pan-y',
      }}>
      <div style={{ position: 'relative' }}>
        <PlatformNativePreview
          platform={platform}
          mode={mode}
          content={content}
          handle={handle}
          logoUrl={logoUrl}
          isPending={isPending}
          timeLabel={timeAgo(artifact.createdAt)}
          backgroundMusicUrl={mode === 'story' && !content.videoUrl ? storyMusicUrl : undefined}
          afterMedia={publishBar}
          inFeedScroll={igHome}
          formatTag={formatTag}
          igChromeDark={t.isDark}
          onReelOpen={igHome && mode === 'reel' ? onOpenReelFullscreen : undefined}
        />

        {(scheduleLabel || isAdCreative) && mode !== 'story' && !igHome && (
          <span style={{
            position: 'absolute', top: 10, left: 10, zIndex: 2,
            fontSize: 10, fontWeight: 800, padding: '4px 8px', borderRadius: 8,
            background: isAdCreative ? 'rgba(24,119,242,0.85)' : 'rgba(0,0,0,0.55)',
            color: isAdCreative ? '#fff' : '#C9A96E', letterSpacing: '0.02em',
          }}>
            {isAdCreative ? adBadge : scheduleLabel}
          </span>
        )}

        {/* Swipe intent overlay */}
        {(isSwipingRight || isSwipingLeft) && isPending && !isRendering && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: isSwipingRight
              ? `rgba(52,211,153,${swipeOpacity * 0.25})`
              : `rgba(157,190,206,${swipeOpacity * 0.2})`,
            display: 'flex', alignItems: 'center', justifyContent: isSwipingRight ? 'flex-start' : 'flex-end',
            padding: '0 24px',
            pointerEvents: 'none',
            transition: 'background 60ms ease',
          }}>
            <div style={{
              fontSize: 28, fontWeight: 900,
              opacity: swipeOpacity,
              transform: `scale(${0.7 + swipeOpacity * 0.4})`,
              transition: 'opacity 60ms, transform 60ms',
              color: isSwipingRight ? '#34d399' : '#9DBECE',
            }}>
              {isSwipingRight ? '✓' : '↺'}
            </div>
          </div>
        )}

        {/* Rendering overlay — minimal */}
        {isRendering && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.60)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.12)',
              borderTop: `2px solid ${t.accent}`,
              animation: 'spinSlow 0.9s linear infinite',
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
              {isMobileOperatorMode()
                ? 'Hazırlanıyor'
                : (kind === 'reel' ? 'Reel hazırlanıyor (~30 sn)' : kind === 'story' ? 'Story videosu hazırlanıyor (~2 dk)' : 'Görsel hazırlanıyor…')}
            </span>
          </div>
        )}
      </div>

      {isPending && matchWeak && (
        <div style={{
          margin: igHome ? '0 14px 8px' : '0 12px 8px',
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
        }}>
          <span style={{ fontSize: 11, color: '#F59E0B', lineHeight: 1.4 }}>
            Zayıf eşleşme — onaylamadan önce fotoğrafın konuyla örtüştüğünü doğrulayın.
          </span>
        </div>
      )}

      {isPending && qualityGate.hardBlock && !matchRejected && qualityGate.hardBlockReason && (
        <div style={{
          margin: igHome ? '0 14px 8px' : '0 12px 8px',
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>
            Onay engellendi
          </div>
          <span style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.4 }}>
            {qualityGate.hardBlockReason}. Yeniden üretin veya revize edin.
          </span>
        </div>
      )}

      {isPending && matchRejected && (
        <div style={{
          margin: igHome ? '0 14px 8px' : '0 12px 8px',
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>
            Fotoğraf — Metin Uyumsuzluğu
          </div>
          <span style={{ fontSize: 11, color: '#FCA5A5', lineHeight: 1.4 }}>
            {(matchScore ?? 0) <= 5
              ? 'Bu fotoğraf başlıkla uyumlu görünmüyor. Düzenle ile farklı bir görsel seçebilirsiniz.'
              : 'Bu fotoğraf başlık/konuyla tam örtüşmüyor. Onaylamadan önce kontrol edin.'}
            {isDebugUiMode() && (
              <> Skor {Math.round(matchScore ?? 0)}/{MIN_ACCEPT_SCORE}</>
            )}
          </span>
        </div>
      )}

      {isPending && hasSoftWarnings && (
        <div style={{
          margin: igHome ? '0 14px 8px' : '0 12px 8px',
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)',
        }}>
          <span style={{ fontSize: 11, color: '#F59E0B', lineHeight: 1.45 }}>
            {qualityGate.softWarnings.join(' · ')}
            {softApproveAck && ' — Onayla ile yayına alabilirsiniz.'}
          </span>
        </div>
      )}

      {isPending && <FeedArtifactQualityStrip meta={meta} t={t} igHome={igHome} />}

      {/* Approval actions — IG home: slim bar under post; operator: full strip */}
      {igHome ? (
        isPending && isAdCreative ? (
          <AdPublishActions
            artifact={artifact}
            workspaceId={workspaceId}
            onOpenMeta={() => onOpenMetaAd?.(artifact.id)}
            onOpenGoogle={() => onOpenGoogleAd?.()}
            t={t}
            shellBg={igHomeChrome.shell}
            separator={igHomeChrome.separator}
            mutedText={igHomeChrome.textMuted}
          />
        ) : isPending && (
          <>
            {isDesignedPost && !isAdCreative && (
              <AdPublishActions
                artifact={artifact}
                workspaceId={workspaceId}
                onOpenMeta={() => onOpenMetaAd?.(artifact.id)}
                onOpenGoogle={() => onOpenGoogleAd?.()}
                t={t}
                shellBg={igHomeChrome.shell}
                separator={igHomeChrome.separator}
                mutedText={igHomeChrome.textMuted}
              />
            )}
          </>
        )
      ) : (
        <div style={{ padding: '10px 12px 12px', background: cardBg }}>
          {(isApproved || (isDebugUiMode() && content.grafikerScore != null)) && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
              {isApproved && (
                <span style={{ fontSize: 10, fontWeight: 700, color: t.success }}>✓ Onaylı</span>
              )}
              {isDebugUiMode() && content.grafikerScore != null && (
                <span style={{ fontSize: 10, color: t.textMuted }}>
                  {content.grafikerScore}/10
                </span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {isPending && isAdCreative && (
              <>
                <button type="button" onClick={() => onOpenMetaAd?.(artifact.id)}
                  style={{
                    flex: 1, minWidth: 120, padding: '12px 16px', borderRadius: 12, border: 'none',
                    background: '#1877F2', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                  Meta Ads
                </button>
                <button type="button" onClick={() => onOpenGoogleAd?.()}
                  style={{
                    flex: 1, minWidth: 120, padding: '12px 16px', borderRadius: 12, border: 'none',
                    background: '#1a73e8', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>
                  Google Ads
                </button>
              </>
            )}
            {isPending && !isAdCreative && (
              <button type="button" onClick={handleApproveClick} disabled={approving || isRendering || !canApproveHard}
                title={qualityGate.hardBlockReason ?? undefined}
                style={{
                  flex: 1, padding: '12px 16px', borderRadius: 12, border: 'none',
                  background: isRendering || !canApproveHard
                    ? t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                    : t.success,
                  color: isRendering || !canApproveHard ? t.textMuted : '#fff',
                  fontSize: 13, fontWeight: 700,
                  cursor: approving || isRendering || !canApproveHard ? 'not-allowed' : 'pointer',
                }}>
                {approving
                  ? 'Paylaşılıyor…'
                  : !canApproveHard
                    ? hardBlockButtonLabel
                    : hasSoftWarnings && !softApproveAck
                      ? '✓ Onayla (uyarı)'
                      : hasSoftWarnings
                        ? 'Yine de onayla'
                        : '✓ Onayla'}
              </button>
            )}
            {canRetry && onRetryRender && (
              <StoryRetryButton
                artifact={artifact}
                retrying={Boolean(retryingRender)}
                onRetry={() => onRetryRender(artifact.id)}
                variant="card"
              />
            )}
            <button type="button" onClick={() => openApproval(artifact.id)}
              style={{
                flex: isPending ? 0 : 1,
                minWidth: isPending ? 48 : undefined,
                padding: '12px 14px', borderRadius: 12,
                border: `0.5px solid ${t.separator}`,
                background: 'transparent',
                color: t.textSecondary,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
              {isPending ? 'Düzenle' : 'Detay'}
            </button>
            {isPending && (
              <button type="button" onClick={() => onRevision(artifact.id)} disabled={revisioning}
                style={{
                  width: 46, flexShrink: 0,
                  padding: '13px 0', borderRadius: 14,
                  border: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                  background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                  color: t.textMuted,
                  fontSize: 16, cursor: revisioning ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                ↩
              </button>
            )}
          </div>
        </div>
      )}

      <ScheduleSheet
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        publishType={publishType}
        imageUrl={content.imageUrl ?? undefined}
        videoUrl={content.videoUrl ?? undefined}
        caption={content.caption}
        hashtags={content.hashtags}
        artifactTitle={artifact.title}
        defaultScheduledAt={suggestedScheduleISO ?? undefined}
      />
    </div>
  );
}, (prev, next) =>
  prev.artifact.id === next.artifact.id
  && prev.artifact.status === next.artifact.status
  && prev.artifact.contentUrl === next.artifact.contentUrl
  && prev.approving === next.approving
  && prev.revisioning === next.revisioning
  && prev.retryingRender === next.retryingRender
  && prev.platform === next.platform,
);

function isRemotionVideoStory(artifact: OutputArtifact): boolean {
  return isRemotionVideoStoryArtifact(artifact);
}

/**
 * Foundation-first autonomy gate (Sprint 1). Mission auto-trigger on Feed mount is
 * DISABLED by default and only enabled by an explicit opt-in env flag. Quality gates
 * (brand readiness, gallery, idea contract) must pass before autonomy is turned on.
 */
const AUTO_MISSION_TRIGGER_ENABLED =
  process.env.NEXT_PUBLIC_AUTO_MISSION_TRIGGER === 'true';

const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function formatPublishFeedback(kind: string): string {
  const now = new Date();
  const day = TR_DAYS[now.getDay()] ?? '';
  const time = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const label = kind === 'story' ? 'Hikaye' : kind === 'reel' ? 'Reel' : 'Gönderi';
  return `✓ ${label} yayınlandı — ${day} ${time}`;
}

function resolveImg(url: string | null | undefined): string | null {
  return resolveClientMediaUrl(url);
}

/** Normalize hashtags from any stored format — delegates to shared artifact-utils helper */
const normalizeDisplayHashtags = (raw: unknown) => normalizeHashtagsUtil(raw, 10);

function resolveArtifactImg(artifact: { contentUrl?: string | null; content?: string | null; metadata?: unknown }): string | null {
  const falStill = resolveFeedProducedStillUrl(artifact as OutputArtifact);
  if (falStill) return falStill;

  const content = (() => { try { return JSON.parse(artifact.content ?? '{}'); } catch { return {}; } })() as Record<string, unknown>;
  const rendered = (content.renderedPreview ?? {}) as Record<string, unknown>;
  const canvaDesign = (rendered.canvaDesign ?? {}) as Record<string, unknown>;
  const meta    = (artifact.metadata ?? {}) as Record<string, unknown>;
  // Sprint 8 (S8.4): prefer the EXPORTED / PERMANENT Instagram-ready asset so the
  // Feed preview is exactly what gets published. Thumbnails are only a fallback.
  const candidates: Array<unknown> = [
    // 1. Production export (R2 Remotion poster / designed post)
    content.imageUrl, meta.imageUrl,
    meta.enhanced_photo_url, content.enhanced_photo_url,
    // 2. Exported / permanent high-res asset (Canva etc.)
    content.canvaDownloadUrl, content.exportUrl, content.permanentPreviewUrl,
    rendered.exportUrl, rendered.permanentPreviewUrl,
    canvaDesign.exportUrl, canvaDesign.permanentPreviewUrl, canvaDesign.canvaDownloadUrl,
    meta.canvaDownloadUrl, meta.exportUrl, meta.permanentPreviewUrl,
    // 3. Thumbnails / preview fields
    content.canvaThumbnail, content.canvaThumb,
    rendered.imageUrl, rendered.thumbnailUrl,
    canvaDesign.thumbnailUrl, meta.canvaThumbnail,
    // 4. Gallery previews — last (Unsplash proxies may be expired)
    meta.feed_preview_url, content.feed_preview_url,
    meta.poster_url, meta.posterUrl, content.posterUrl, content.poster_url,
    meta.reference_photo_url, content.reference_photo_url,
  ];
  // Helper: skip video files — they can't be displayed as images
  const isVideoUrl = (u: unknown) => typeof u === 'string' && (
    u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.mov') ||
    u.includes('/api/remotion/video/') || u.includes('remotion-serve')
  );

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && !isVideoUrl(c)) {
      const resolved = resolveImg(c.trim());
      if (resolved) return resolved;
    }
  }
  // contentUrl: only use if it looks like an image (skip video files and Canva edit pages)
  const cu = artifact.contentUrl;
  if (cu && !cu.includes('canva.com/design') && !isVideoUrl(cu)) return resolveImg(cu);
  return null;
}

function isCanvaEditUrl(u: string): boolean {
  if (!u.trim()) return false;
  return /canva\.com\/design\//i.test(u) && /\/edit(?:[/?#]|$)/i.test(u);
}

function isPublishableMediaUrl(u: string): boolean {
  if (!u.trim()) return false;
  if (isCanvaEditUrl(u)) return false;
  if (u.includes('/api/remotion/') || u.includes('/api/media')) return true;
  if (/^\/[0-9a-f-]{36}\/(stories|video|reel|posts|image)\//i.test(u)) return true;
  if (/^[0-9a-f-]{36}\/(stories|video|reel|posts|image)\//i.test(u.replace(/^\//, ''))) return true;
  if (u.startsWith('http') || u.startsWith('data:')) return !isCanvaEditUrl(u);
  return Boolean(u.trim());
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dakika`;
  if (m < 1440) return `${Math.floor(m / 60)} saat`;
  return `${Math.floor(m / 1440)} gün`;
}

// ── Instagram Carousel Card ──────────────────────────────────────────────────
// Shows 3-4 matched gallery photos with swipe dots, caption and hashtags.
function IGCarouselCard({ artifact, onApprove, onRevision, approving, revisioning, t }: {
  artifact: OutputArtifact;
  onApprove: () => void;
  onRevision: () => void;
  approving: boolean;
  revisioning: boolean;
  t: ReturnType<typeof useTheme>['t'];
}) {
  const tenantBrand = useTenantBrandContext();
  const [slide, setSlide] = React.useState(0);
  const openApproval = useMobileStore((s) => s.openApproval);
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;

  const rawUrls: string[] = resolveCarouselUrls(content, meta);

  // If no carousel_urls, fall back to single image
  const fallback = resolveArtifactImg(artifact);
  const images: string[] = rawUrls.length >= 2
    ? rawUrls.map((u) => resolveImg(u) ?? u).filter(Boolean)
    : fallback ? [fallback] : [];

  const captionInput = {
    content: content as Record<string, unknown>,
    metadata: meta,
    title: artifact.title,
  };
  const headline  = resolveFeedDisplayHeadline(captionInput);
  const caption   = resolveFeedDisplayCaption(captionInput);
  const hashtags  = normalizeDisplayHashtags(content.hashtags ?? meta.hashtags ?? []);
  const handle    = resolveFeedHandle(meta, tenantBrand);
  const isApproved     = artifact.status === 'approved';
  const isAutoProduced = (meta as any)?.auto_produced === true;
  const slotBadge = productionRoleBadge(meta);

  const currentImg = images[slide] ?? null;
  const total      = images.length;

  return (
    <div style={{ background: t.isDark ? '#0a0a0f' : '#fff', borderBottom: `0.5px solid ${t.separator}`, marginBottom: 2 }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
          padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%',
            background: t.isDark ? '#0a0a0f' : '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, fontWeight: 800, color: t.textPrimary }}>
            {handle[0]?.toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{handle}</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{timeAgo(artifact.createdAt)}</div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {total > 1 && (
            <span style={{ fontSize: 10, color: t.textMuted }}>{slide + 1}/{total}</span>
          )}
          {isApproved && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10,
            fontWeight: 700, background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>✓ Onaylı</span>}
          {artifact.status === 'pending_review' && <span style={{ fontSize: 10, padding: '3px 8px',
            borderRadius: 10, fontWeight: 700, background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>İncelenecek</span>}
          <button onClick={() => openApproval(artifact.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: t.textMuted, fontSize: 16 }}>···</button>
        </div>
      </div>

      {/* Carousel image frame — tam görünüm, kırpma yok */}
      <div style={{ width: '100%', position: 'relative', background: t.isDark ? '#0a0a12' : '#f4f4f4',
        overflow: 'hidden', minHeight: 80 }}>
        {currentImg ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentImg} alt="" referrerPolicy="no-referrer" aria-hidden="true"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', filter: 'blur(18px) brightness(0.55)', transform: 'scale(1.1)',
                pointerEvents: 'none' }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentImg} alt="" referrerPolicy="no-referrer"
              style={{ display: 'block', position: 'relative', width: '100%', height: 'auto',
                maxHeight: '80vw', objectFit: 'contain',
                imageRendering: '-webkit-optimize-contrast' as const }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </>
        ) : (
          <div style={{ width: '100%', aspectRatio: '1/1', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 48, opacity: 0.08 }}>❑</div>
        )}
        {/* Swipe overlay areas — absolute over the image */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {slide > 0 && (
            <button onClick={() => setSlide(s => s - 1)}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%',
                background: 'transparent', border: 'none', cursor: 'pointer', pointerEvents: 'auto' }} />
          )}
          {slide < total - 1 && (
            <button onClick={() => setSlide(s => s + 1)}
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%',
                background: 'transparent', border: 'none', cursor: 'pointer', pointerEvents: 'auto' }} />
          )}
          {total > 1 && (
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0,
              display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'auto' }}>
              {images.map((_, i) => (
                <div key={i} onClick={() => setSlide(i)}
                  style={{ width: i === slide ? 16 : 6, height: 6, borderRadius: 3,
                    background: i === slide ? '#fff' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer', transition: 'all 0.2s' }} />
              ))}
            </div>
          )}
          {slide < total - 1 && (
            <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.22)', borderRadius: '50%', width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>›</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '10px 14px 4px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <svg style={{ marginLeft: 'auto' }} width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="19 21 12 16 5 21 5 3 19 3 19 21"/>
        </svg>
      </div>
      {headline && (
        <div style={{ padding: '2px 14px 6px', fontSize: 14, fontWeight: 800,
          color: t.textPrimary, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
          {headline}
        </div>
      )}
      {caption && (
        <div style={{ padding: '0 14px 6px', fontSize: 13, color: t.textPrimary, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700 }}>{handle}</span>{' '}
          <span style={{ color: t.textSecondary }}>{caption.slice(0, 140)}{caption.length > 140 ? '…' : ''}</span>
        </div>
      )}
      {hashtags.length > 0 && (
        <div style={{ padding: '0 14px 10px', fontSize: 11, color: '#3B82F6', lineHeight: 1.7 }}>
          {hashtags.join(' ')}
        </div>
      )}
      {/* Approve/revision */}
      {artifact.status === 'pending_review' && (
        <div style={{ padding: '8px 14px 14px', display: 'flex', gap: 8 }}>
          <button onClick={onApprove} disabled={approving} style={{
            flex: 3, padding: '11px', borderRadius: 12, border: 'none',
            cursor: approving ? 'default' : 'pointer',
            background: approving ? t.separator : '#10B981',
            color: '#fff', fontWeight: 700, fontSize: 14,
          }}>
            {approving ? '⏳ Onaylanıyor…' : '✓ Onayla'}
          </button>
          <button onClick={onRevision} disabled={revisioning} style={{
            flex: 1, padding: '11px', borderRadius: 12,
            border: `1px solid ${t.separator}`, background: 'transparent',
            cursor: 'pointer', color: t.textMuted, fontSize: 12,
          }}>
            Geç
          </button>
        </div>
      )}
    </div>
  );
}

// ── Instagram Post Card ──────────────────────────────────────────────────────
function IGPostCard({ artifact, onApprove, onRevision, approving, revisioning, t }: {
  artifact: OutputArtifact;
  onApprove: () => void;
  onRevision: () => void;
  approving: boolean;
  revisioning: boolean;
  t: ReturnType<typeof useTheme>['t'];
}) {
  const tenantBrand = useTenantBrandContext();
  const openApproval = useMobileStore((s) => s.openApproval);
  const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const content = parseArtifactContent(artifact.content);

  const brandedUrl = resolveBrandedPostUrl(artifact);
  const posterUrl = resolvePosterUrl(artifact);
  const galleryImg = resolveImg(
    String(meta.reference_photo_url || content.reference_photo_url || meta.poster_url || ''),
  );
  const awaitingBrandedPoster = isPostKind(artifact) && isAwaitingStoryVideo(artifact);
  const isGallerySourced = (meta as any)?.gallery_sourced === true || Boolean((meta as any)?.reference_photo_url);
  const displayImg = awaitingBrandedPoster
    ? null
    : (isGallerySourced && galleryImg)
      ? galleryImg
      : (brandedUrl && posterUrl && brandedUrl !== posterUrl ? resolveImg(brandedUrl) : null)
        ?? resolveArtifactImg(artifact)
        ?? galleryImg
        ?? resolveImg(resolved?.imageUrl ?? undefined);
  const img = displayImg;
  const captionInput = {
    content: content as Record<string, unknown>,
    metadata: meta,
    title: artifact.title,
  };
  const headline = resolveFeedDisplayHeadline(captionInput);
  const caption = resolveFeedDisplayCaption(captionInput);
  const hashtags = normalizeDisplayHashtags(content.hashtags ?? meta.hashtags ?? resolved?.hashtags ?? []);
  const handle   = resolveFeedHandle(meta, tenantBrand);
  const isApproved = artifact.status === 'approved';
  const isAutoProduced = (meta as any)?.auto_produced === true || (meta as any)?.source === 'auto-produce';
  const isAgencyBranded = (meta as any)?.agency_branded === true
    || Boolean(brandedUrl && posterUrl && brandedUrl !== posterUrl);
  const slotBadge = productionRoleBadge(meta);
  const scheduleLabel = formatFeedScheduleHint(meta);

  return (
    <div style={{
      background: t.isDark ? '#0a0a0f' : '#fff',
      borderBottom: `0.5px solid ${t.separator}`,
      marginBottom: 2,
    }}>
      {/* IG Header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
          padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%',
            background: t.isDark ? '#0a0a0f' : '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 14, fontWeight: 800, color: t.textPrimary }}>
            {handle[0]?.toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{handle}</div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{timeAgo(artifact.createdAt)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {scheduleLabel && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              background: 'rgba(201,169,110,0.15)', color: '#C9A96E' }}>{scheduleLabel}</span>
          )}
          {slotBadge && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              background: 'rgba(59,130,246,0.12)', color: '#3B82F6' }}>{slotBadge}</span>
          )}
          {isGallerySourced && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>Galeri</span>
          )}
          {isAgencyBranded && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              background: 'rgba(138,171,189,0.12)', color: '#8AABBD' }}>Ajans</span>
          )}
          {isAutoProduced && !isGallerySourced && !isAgencyBranded && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, fontWeight: 700,
              background: 'rgba(138,171,189,0.12)', color: '#8AABBD' }}>AI</span>
          )}
          {isApproved && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
              background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>✓ Onaylı</span>
          )}
          {artifact.status === 'pending_review' && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, fontWeight: 700,
              background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>Bekliyor</span>
          )}
          <button onClick={() => openApproval(artifact.id)} style={{ background: 'none', border: 'none',
            cursor: 'pointer', padding: 4, color: t.textMuted, fontSize: 16 }}>···</button>
        </div>
      </div>

      {/* Image — tam görünüm, kırpma yok */}
      {/* Instagram standart: 4:5 portrait → 1.91:1 landscape arası desteklenir */}
      <div style={{
        width: '100%',
        position: 'relative',
        background: t.isDark ? '#0a0a12' : '#f4f4f4',
        overflow: 'hidden',
        minHeight: 80,
      }}>
        {awaitingBrandedPoster ? (
          <div style={{ width: '100%', aspectRatio: '1/1', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10, background: t.isDark ? '#12121a' : '#f0f0f0' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', border: `3px solid ${t.separator}`,
              borderTop: '3px solid #8AABBD', animation: 'spinSlow 0.9s linear infinite' }} />
            <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 600 }}>Marka şablonu uygulanıyor…</span>
          </div>
        ) : img ? (
          <>
            {/* Blurred backdrop — letterbox alanlarını doldurmak için */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" referrerPolicy="no-referrer" aria-hidden="true"
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover', display: 'block',
                filter: 'blur(18px) brightness(0.55)',
                transform: 'scale(1.1)',
                pointerEvents: 'none',
              }} />
            {/* Asıl görsel — tam boyut; galeri URL fallback */}
            <SafeCoverImage
              src={img}
              fallbacks={[galleryImg, resolveImg(brandedUrl ?? undefined), resolveImg(posterUrl ?? undefined)]}
              style={{
                display: 'block',
                position: 'relative',
                width: '100%',
                height: 'auto',
                maxHeight: '80vw',
                objectFit: 'contain',
              }}
            />
          </>
        ) : (
          <div style={{ width: '100%', aspectRatio: '1/1', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 48, opacity: 0.08 }}>✦</div>
        )}
      </div>

      {/* IG Actions row */}
      <div style={{ padding: '10px 14px 4px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <svg style={{ marginLeft: 'auto' }} width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={t.textSecondary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="19 21 12 16 5 21 5 3 19 3 19 21"/>
        </svg>
      </div>

      {/* Caption */}
      {caption && (
        <div style={{ padding: '0 14px 6px', fontSize: 13, color: t.textPrimary, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700 }}>{handle}</span>{' '}
          <span style={{ color: t.textSecondary }}>{caption.slice(0, 120)}{caption.length > 120 ? '…' : ''}</span>
        </div>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && (
        <div style={{ padding: '0 14px 10px', fontSize: 13, color: '#60A5FA' }}>
          {hashtags.join(' ')}
        </div>
      )}

      {/* Visual Review badge — only when there's an image to analyze */}
      {img && (
        <div style={{ padding: '0 14px 8px' }}>
          <VisualReviewBadge
            imageUrl={img}
            thumbnailUrl={img}
            context={{
              brandName: handle,
              contentType: 'instagram_post',
              platform: 'Instagram',
              caption: caption?.slice(0, 200),
            }}
          />
        </div>
      )}

      {/* Agency action bar — same position as IG actions, different meaning */}
      {artifact.status === 'pending_review' && (
        <div style={{ margin: '0 14px 14px', display: 'flex', gap: 8 }}>
          <button onClick={onApprove} disabled={approving || revisioning || awaitingBrandedPoster}
            style={{ flex: 1, padding: '11px', borderRadius: 14, cursor: awaitingBrandedPoster ? 'not-allowed' : 'pointer', border: 'none',
              background: awaitingBrandedPoster ? t.elevated : approving ? 'rgba(16,185,129,0.1)' : 'rgba(16,185,129,0.15)',
              color: awaitingBrandedPoster ? t.textMuted : '#10B981', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: awaitingBrandedPoster ? 0.6 : 1 }}>
            {awaitingBrandedPoster ? 'Şablon hazırlanıyor…'
              : approving ? <><div style={{ width: 12, height: 12, borderRadius: '50%',
              border: '2px solid rgba(16,185,129,0.3)', borderTop: '2px solid #10B981',
              animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor…</> : '✓ Onayla'}
          </button>
          <button onClick={onRevision} disabled={approving || revisioning}
            style={{ padding: '11px 16px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: `0.5px solid ${t.separator}`,
              color: t.textSecondary, fontSize: 13, fontWeight: 600 }}>
            ↺
          </button>
          <button onClick={() => openApproval(artifact.id)}
            style={{ padding: '11px 16px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${t.separator}`,
              color: t.textTertiary, fontSize: 13 }}>
            ···
          </button>
        </div>
      )}
    </div>
  );
}

// ── Reel Preview Card ────────────────────────────────────────────────────────
function IGReelCard({ artifact, onApprove, approving, t }: {
  artifact: OutputArtifact;
  onApprove: () => void;
  approving: boolean;
  t: ReturnType<typeof useTheme>['t'];
}) {
  const tenantBrand = useTenantBrandContext();
  const openApproval = useMobileStore((s) => s.openApproval);
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;

  // Reel: prefer videoUrl; resolve path-format URLs via media proxy
  const rawReelVideo = String((content.videoUrl as string)
    || (meta.videoUrl as string)
    || ((content as any).renderedPreview?.videoUrl as string)
    || '').trim();
  const videoUrl = (() => {
    if (!rawReelVideo) return null;
    if (rawReelVideo.startsWith('http') || rawReelVideo.startsWith('/api/') || rawReelVideo.startsWith('data:')) return rawReelVideo;
    if (rawReelVideo.startsWith('/')) return `/api/media?key=${encodeURIComponent(rawReelVideo.replace(/^\//, ''))}`;
    return rawReelVideo;
  })();
  const thumbUrl = resolveArtifactImg(artifact);
  const captionInput = {
    content: content as Record<string, unknown>,
    metadata: meta,
    title: artifact.title,
  };
  const headline = resolveFeedDisplayHeadline(captionInput);
  const caption = resolveFeedDisplayCaption(captionInput);
  const hashtags = normalizeDisplayHashtags(content.hashtags ?? meta.hashtags ?? []);
  const handle = '@' + resolveFeedHandle(meta, tenantBrand);
  const isApproved = artifact.status === 'approved';
  const isAutoProduced = (meta as any)?.auto_produced === true;
  const slotBadge = productionRoleBadge(meta);

  return (
    <div style={{ margin: '0', borderBottom: `0.5px solid ${t.separator}` }} className="ig-vertical-media-card">
      {/* 9:16 Reel frame */}
      <div className="ig-vertical-media-stage">
        {/* Video or thumbnail */}
        {videoUrl ? (
          <video src={videoUrl} poster={thumbUrl ?? undefined}
            controls playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', imageRendering: '-webkit-optimize-contrast' as const }} />
        ) : thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', imageRendering: '-webkit-optimize-contrast' as const }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
            fontSize: 48, opacity: 0.3 }}>▶</div>
        )}
        {/* Play icon overlay (when thumbnail only) */}
        {!videoUrl && thumbUrl && (
          <div style={{ position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 22, color: '#fff', marginLeft: 3 }}>▶</span>
          </div>
        )}
        {/* Top bar */}
        <div style={{ position: 'absolute', top: 14, left: 14, right: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#fff',
              background: 'rgba(0,0,0,0.45)', padding: '2px 8px', borderRadius: 8 }}>
              ▶ Reel
            </span>
            {isAutoProduced && (
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
                background: 'rgba(138,171,189,0.85)', color: '#fff', fontWeight: 700 }}>AI</span>
            )}
            {slotBadge && (
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
                background: 'rgba(59,130,246,0.85)', color: '#fff', fontWeight: 700 }}>{slotBadge}</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isApproved && (
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
                background: 'rgba(16,185,129,0.85)', color: '#fff', fontWeight: 700 }}>✓ Onaylı</span>
            )}
            {artifact.status === 'pending_review' && (
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
                background: 'rgba(245,158,11,0.9)', color: '#000', fontWeight: 700 }}>Bekliyor</span>
            )}
            <button onClick={() => openApproval(artifact.id)}
              style={{ background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%',
                width: 24, height: 24, cursor: 'pointer', color: '#fff', fontSize: 13,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>···</button>
          </div>
        </div>
        {/* Bottom: approve */}
        {artifact.status === 'pending_review' && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.7) 100%)',
            padding: '32px 16px 20px', display: 'flex', gap: 8 }}>
            <button onClick={onApprove} disabled={approving}
              style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none',
                cursor: approving ? 'default' : 'pointer',
                background: approving ? 'rgba(255,255,255,0.15)' : 'rgba(16,185,129,0.9)',
                color: '#fff', fontWeight: 700, fontSize: 14 }}>
              {approving ? '⏳ Onaylanıyor…' : '✓ Onayla'}
            </button>
          </div>
        )}
      </div>
      {/* Headline + Caption row */}
      {(headline || caption || hashtags.length > 0) && (
        <div style={{ padding: '12px 16px 16px', background: t.isDark ? 'rgba(255,255,255,0.02)' : '#fff' }}>
          {headline && (
            <div style={{ fontSize: 14, fontWeight: 800, color: t.textPrimary,
              letterSpacing: '-0.01em', lineHeight: 1.3, marginBottom: 4 }}>
              {headline}
            </div>
          )}
          {caption && (
            <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, color: t.textPrimary }}>{handle} </span>
              {caption.slice(0, 160)}
            </div>
          )}
          {hashtags.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 11, color: t.accent, opacity: 0.7 }}>
              {hashtags.slice(0, 5).join(' ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Story Preview Card ───────────────────────────────────────────────────────
function StoryRetryButton({
  artifact,
  retrying,
  onRetry,
  variant = 'bubble',
}: {
  artifact: OutputArtifact;
  retrying: boolean;
  onRetry: () => void;
  variant?: 'bubble' | 'card' | 'viewer';
}) {
  if (!isMobileOperatorMode() || !canRetryStoryRender(artifact)) return null;
  const label = retrying ? 'Başlatılıyor…' : storyRetryLabel(artifact);
  const failed = isBundleFailed(artifact);
  const accent = failed ? '#EF4444' : '#F59E0B';
  const bg = failed ? 'rgba(239,68,68,0.22)' : 'rgba(245,158,11,0.22)';

  if (variant === 'bubble') {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRetry(); }}
        disabled={retrying}
        style={{
          marginTop: 3,
          padding: '4px 10px',
          borderRadius: 999,
          border: `1px solid ${accent}66`,
          background: bg,
          color: accent,
          fontSize: 10,
          fontWeight: 700,
          cursor: retrying ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        ↻ {label}
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRetry(); }}
        disabled={retrying}
        style={{
          padding: '10px 14px',
          borderRadius: 12,
          border: `1px solid ${accent}77`,
          background: 'rgba(0,0,0,0.62)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          cursor: retrying ? 'wait' : 'pointer',
          backdropFilter: 'blur(8px)',
        }}
      >
        ↻ {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onRetry}
      disabled={retrying}
      style={{
        flex: 1,
        padding: '13px',
        borderRadius: 12,
        border: `1px solid ${accent}66`,
        background: bg,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: retrying ? 'wait' : 'pointer',
      }}
    >
      {retrying ? 'Render başlatılıyor…' : `↻ ${label}`}
    </button>
  );
}

function StoryCard({ artifact, onApprove, onRetryRender, retryingRender, approving, t }: {
  artifact: OutputArtifact;
  onApprove: () => void;
  onRetryRender?: () => void;
  retryingRender?: boolean;
  approving: boolean;
  t: ReturnType<typeof useTheme>['t'];
}) {
  const tenantBrand = useTenantBrandContext();
  const openApproval = useMobileStore((s) => s.openApproval);
  const storyVideoRef = useRef<HTMLVideoElement | null>(null);
  const [storyMuted, setStoryMuted] = useState(false);
  const [storyNeedsSoundTap, setStoryNeedsSoundTap] = useState(false);
  const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const img = resolveArtifactImg(artifact) ?? resolveImg(resolved?.imageUrl ?? undefined);

  // For Remotion stories: use content.imageUrl (original gallery photo) as poster/fallback
  // This is the photo before the Remotion template was applied
  const originalPhotoUrl = String(
    (meta as any)?.reference_photo_url || (content as any)?.reference_photo_url
    || (content as any)?.posterUrl || (content as any)?.imageUrl || '',
  ).trim();
  const storyPosterImg = (originalPhotoUrl && !originalPhotoUrl.endsWith('.mp4'))
    ? resolveImg(originalPhotoUrl)
    : img;

  // Resolve any Remotion MP4 video URL to a playable endpoint
  const rawVideoUrl = String(
    (content as any)?.videoUrl || (meta as any)?.videoUrl || (meta as any)?.video_url
    || (artifact.contentUrl && /\.(mp4|mov|webm)/i.test(artifact.contentUrl) ? artifact.contentUrl : '')
    || '',
  ).trim();
  const resolveVideoUrl = (url: string): string | null => {
    if (!url || !/\.(mp4|mov|webm)/i.test(url)) return null;
    if (url.startsWith('/api/')) return url;
    if (url.startsWith('http')) return url;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('/') && url.includes('.mp4')) {
      return `/api/media?key=${encodeURIComponent(url.replace(/^\//, ''))}`;
    }
    return url;
  };
  const storyVideoUrl = resolveVideoUrl(rawVideoUrl);
  // Consider any story with a valid video URL as a Remotion story (play as video)
  const isRemotionStory = Boolean(storyVideoUrl);
  const handle = '@' + resolveFeedHandle(meta, tenantBrand);
  const brandLabel = resolveFeedBrandName(meta, tenantBrand);
  const isApproved = artifact.status === 'approved';
  const slotBadge = productionRoleBadge(meta);

  useEffect(() => {
    setStoryMuted(false);
    setStoryNeedsSoundTap(false);
  }, [storyVideoUrl]);

  const tryPlayStoryVideo = useCallback(async (video: HTMLVideoElement) => {
    try {
      video.muted = storyMuted;
      await video.play();
      if (!storyMuted) setStoryNeedsSoundTap(false);
    } catch {
      video.muted = true;
      setStoryMuted(true);
      setStoryNeedsSoundTap(true);
      void video.play().catch(() => undefined);
    }
  }, [storyMuted]);

  const enableStorySound = useCallback(async () => {
    const video = storyVideoRef.current;
    if (!video) return;
    try {
      video.muted = false;
      video.volume = 1;
      setStoryMuted(false);
      await video.play();
      setStoryNeedsSoundTap(false);
    } catch {
      setStoryNeedsSoundTap(true);
    }
  }, []);

  return (
    <div style={{ margin: '0', borderBottom: `0.5px solid ${t.separator}`, paddingBottom: 0 }} className="ig-vertical-media-card">
      {/* Full-width 9:16 story frame — NO caption below */}
      <div className="ig-vertical-media-stage">
        {/* Remotion MP4 story — plays inline; poster = original gallery photo */}
        {isRemotionStory && storyVideoUrl ? (
          <>
            <video
              ref={storyVideoRef}
              src={storyVideoUrl}
              poster={storyPosterImg ?? img ?? undefined}
              autoPlay muted={storyMuted} playsInline
              onCanPlay={(e) => { void tryPlayStoryVideo(e.currentTarget); }}
              onEnded={(e) => {
                const v = e.currentTarget;
                if (!Number.isFinite(v.duration)) return;
                v.pause();
                v.currentTime = Math.max(0, v.duration - 0.04);
              }}
              onError={(e) => {
                // If video fails to load, hide it and show original photo
                const vid = e.currentTarget;
                vid.style.display = 'none';
                const next = vid.nextElementSibling as HTMLElement | null;
                if (next) next.style.display = 'block';
              }}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {storyNeedsSoundTap && (
              <button
                type="button"
                onClick={enableStorySound}
                style={{
                  position: 'absolute',
                  right: 16,
                  bottom: artifact.status === 'pending_review' ? 86 : 18,
                  zIndex: 7,
                  border: 'none',
                  borderRadius: 999,
                  padding: '9px 12px',
                  background: 'rgba(0,0,0,0.62)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  backdropFilter: 'blur(6px)',
                }}
              >
                Sesi aç
              </button>
            )}
            {/* Fallback: original gallery photo when video fails */}
            {storyPosterImg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={storyPosterImg} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'none' }} />
            )}
          </>
        ) : img ? (
          <SafeCoverImage
            src={img}
            fallbacks={[storyPosterImg, resolveImg(resolvePosterUrl(artifact) ?? undefined)]}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', imageRendering: '-webkit-optimize-contrast' as const }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'linear-gradient(135deg,#1a1a2e,#16213e)',
            fontSize: 48, opacity: 0.3 }}>↕</div>
        )}
        {/* Remotion badge + Grafiker quality score */}
        {isRemotionStory && (
          <div style={{ position: 'absolute', top: 48, right: 14, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            {/* Composition ID chip */}
            <div style={{ padding: '3px 8px', borderRadius: 8,
              background: 'rgba(77,112,136,0.75)', color: '#fff', fontSize: 9, fontWeight: 700,
              backdropFilter: 'blur(4px)', letterSpacing: 1 }}>
              {(() => {
                const compId = String((content as any)?.compositionId || meta?.compositionId || '');
                if (compId.includes('Luxury')) return '✦ Story';
                if (compId.includes('Cinematic')) return '◉ Story';
                return '⬛ Story';
              })()}
            </div>
            {/* Grafiker score chip (when available) */}
            {isDebugUiMode() && typeof meta?.grafiker_score === 'number' && (
              <div style={{ padding: '2px 7px', borderRadius: 8,
                background: (meta.grafiker_score as number) >= 8
                  ? 'rgba(16,185,129,0.75)'
                  : (meta.grafiker_score as number) >= 6
                  ? 'rgba(245,158,11,0.75)'
                  : 'rgba(239,68,68,0.75)',
                color: '#fff', fontSize: 9, fontWeight: 800,
                backdropFilter: 'blur(4px)' }}>
                ★ {meta.grafiker_score}/10
              </div>
            )}
          </div>
        )}

        {/* Top chrome: progress bar + handle */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'linear-gradient(rgba(0,0,0,0.55) 0%, transparent 100%)',
          padding: '12px 14px 28px',
          pointerEvents: 'none',
        }}>
          {/* Progress bar */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
            {[0.6, 0.4, 0.4].map((w, i) => (
              <div key={i} style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.28)', borderRadius: 2, overflow: 'hidden' }}>
                {i === 0 && <div style={{ height: '100%', width: `${w * 100}%`, background: '#fff', borderRadius: 2 }} />}
              </div>
            ))}
          </div>
          {/* Handle row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366)',
              padding: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%',
                background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: '#fff' }}>
                {brandLabel[0]?.toUpperCase()}
              </div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: '0.01em' }}>{handle}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{timeAgo(artifact.createdAt)}</span>
          </div>
        </div>

        {/* Top-right: status badge + close */}
        <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6, alignItems: 'center' }}>
          {(meta as any)?.auto_produced && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(138,171,189,0.85)', color: '#fff', fontWeight: 700, letterSpacing: '0.04em' }}>AI</span>
          )}
          {slotBadge && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(59,130,246,0.85)', color: '#fff', fontWeight: 700, letterSpacing: '0.04em' }}>
              {slotBadge}
            </span>
          )}
          {isApproved && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(16,185,129,0.85)', color: '#fff', fontWeight: 700 }}>✓</span>
          )}
          {artifact.status === 'pending_review' && (
            <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8,
              background: 'rgba(245,158,11,0.9)', color: '#000', fontWeight: 700 }}>Bekliyor</span>
          )}
          <button onClick={() => openApproval(artifact.id)}
            style={{ background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '50%',
              width: 24, height: 24, cursor: 'pointer', color: '#fff', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ···
          </button>
        </div>

        {onRetryRender && canRetryStoryRender(artifact) && (
          <div style={{
            position: 'absolute',
            bottom: artifact.status === 'pending_review' ? 78 : 16,
            left: 16,
            zIndex: 6,
          }}>
            <StoryRetryButton
              artifact={artifact}
              retrying={!!retryingRender}
              onRetry={onRetryRender}
              variant="card"
            />
          </div>
        )}

        {/* Bottom chrome: approve action inside the frame */}
        {artifact.status === 'pending_review' && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.7) 100%)',
            padding: '32px 16px 20px',
            display: 'flex', gap: 8,
          }}>
            <button onClick={onApprove} disabled={approving}
              style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer', border: 'none',
                background: approving ? 'rgba(16,185,129,0.3)' : 'rgba(16,185,129,0.9)',
                color: '#fff', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {approving
                ? <><div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }}/>Onaylanıyor…</>
                : '✓ Onayla'}
            </button>
            <button onClick={() => openApproval(artifact.id)} disabled={approving}
              style={{ padding: '12px 18px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.15)', border: '0.5px solid rgba(255,255,255,0.2)',
                color: '#fff', fontSize: 13 }}>
              Sonraki →
            </button>
          </div>
        )}
      </div>
      {/* No caption, no hashtags — event info is baked into the image */}
    </div>
  );
}

// ── Main Feed ────────────────────────────────────────────────────────────────
export function PlatformFeed() {
  const { t } = useTheme();
  const brandPalette = useBrandThemePalette();
  const operatorMode = isMobileOperatorMode();
  const debugMode = isDebugUiMode();
  // navigate and openApproval already destructured above
  const queryClient = useQueryClient();
  const tenantId = useActiveTenantId();
  const feedRefreshNonce = useMobileStore((s) => s.feedRefreshNonce);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const { storyMusicUrl } = useBrandStoryAudio(tenantId);

  // Scheduled templates — recurring story/reel gallery items
  const { data: scheduledTemplatesRaw = [] } = useQuery<ScheduledTemplateConfig[]>({
    queryKey: ['scheduled-templates', tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/brand-context/${tenantId}/scheduled-templates`, {
        headers: getTenantBffHeaders(tenantId),
      });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const activeScheduledTemplates = React.useMemo(
    () => resolveActiveFeedTemplates(scheduledTemplatesRaw),
    [scheduledTemplatesRaw],
  );

  // Same artifact pool as nav badge / mission hub — one cache key so badge count matches feed.
  // DOM lazy paint is handled by FeedLazyPostList (MOBILE_ARTIFACT_FEED_RENDER_PAGE).
  const {
    data: rawArtifacts = [],
    isPending: artifactsPending,
    isFetching: artifactsFetching,
    isError: artifactsError,
    refetch: refetchArtifacts,
  } = useMobileArtifacts({
    subscribeOnly: true,
    params: { limit: MOBILE_ARTIFACT_MISSION_POOL_LIMIT },
  });

  const refreshFeed = useCallback(async () => {
    if (!tenantId) return;
    await refetchMobileFeedPool(queryClient, tenantId);
  }, [queryClient, tenantId]);

  const {
    pullDistance,
    pullActive,
    pullReady,
    refreshing: pullRefreshing,
    onTouchStart: onFeedTouchStart,
    onTouchMove: onFeedTouchMove,
    onTouchEnd: onFeedTouchEnd,
  } = useFeedPullToRefresh({
    scrollRef: feedScrollRef,
    onRefresh: refreshFeed,
    disabled: operatorMode,
  });

  useEffect(() => {
    if (feedRefreshNonce === 0) return;
    feedScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [feedRefreshNonce]);

  const mergedRawArtifacts = rawArtifacts;

  const dedupedRaw = React.useMemo(
    () => dedupeFeedDisplayArtifacts(mergedRawArtifacts as OutputArtifact[]),
    [mergedRawArtifacts],
  );

  const dedupedFull = dedupedRaw;

  const { data: brandAlignment } = useQuery<BrandAlignmentData>({
    queryKey: ['brand-alignment', tenantId],
    queryFn: async () => {
      const id = tenantId!;
      const res = await fetch(`/api/brand-alignment/${id}`, {
        headers: getTenantBffHeaders(id),
      });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId) && !artifactsPending,
  });
  const navigate = useMobileStore((s) => s.navigate);
  const openApproval = useMobileStore((s) => s.openApproval);
  const [boostAdArtifact, setBoostAdArtifact] = useState<OutputArtifact | null>(null);
  const [reelViewerArtifact, setReelViewerArtifact] = useState<OutputArtifact | null>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [slotFilter, setSlotFilter] = useState<FeedSlotFilter>('all');
  const feedMissionFromStore = useMobileStore((s) => s.feedMissionFilterId);
  const clearFeedMissionFilter = useMobileStore((s) => s.clearFeedMissionFilter);
  const [missionFilterId, setMissionFilterId] = useState<string | null>(null);

  React.useEffect(() => {
    if (feedMissionFromStore) {
      setMissionFilterId(feedMissionFromStore);
      setShowApproved(false);
      clearFeedMissionFilter();
    }
  }, [feedMissionFromStore, clearFeedMissionFilter]);
  const [platformView, setPlatformView] = useState<PreviewPlatform>('instagram');
  // Default: show pending_review (new mission content) — users switch to approved (galeri) manually.
  const [showApproved, setShowApproved] = useState(false);

  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});
  const [publishSuccess, setPublishSuccess] = useState<Array<{ id: string; message: string }>>([]);
  const [pipelineStatus, setPipelineStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [autoTriggerReason, setAutoTriggerReason] = useState<string | null>(null);
  const prevPendingRef = React.useRef(0);
  // Story bubble viewer state
  const [storyViewIdx, setStoryViewIdx] = useState<number | null>(null);
  const [scheduledMediaIdx, setScheduledMediaIdx] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);
  // Auto-trigger the mission pipeline on mount (fire-and-forget).
  // Kicks off propose → approve → task_graph_executor → content_ideation
  // → auto-produce → Feed artifacts without any manual interaction.
  // Skips silently if a mission is already active or daily cap reached.
  //
  // Foundation-first gate (Sprint 1, S1.4): autonomy is OFF by default. The pipeline
  // only auto-triggers when NEXT_PUBLIC_AUTO_MISSION_TRIGGER === 'true' AND the
  // brand readiness gate passes (enforced server-side later). Until quality gates
  // are met we never silently produce content. See docs/foundation-sprint-program.md.
  useEffect(() => {
    if (!tenantId) return;
    if (!AUTO_MISSION_TRIGGER_ENABLED) {
      setPipelineStatus('idle');
      return;
    }
    const run = () => {
    const dayKey = new Date().toISOString().slice(0, 10);
    const triggerGuardKey = `sa-auto-trigger:${tenantId}:${dayKey}`;
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(triggerGuardKey)) {
        setPipelineStatus('done');
        setAutoTriggerReason('already_triggered_today');
        return;
      }
    } catch {
      /* private mode */
    }

    setPipelineStatus('running');
    setAutoTriggerReason(null);
    fetch(`/api/missions/${tenantId}/auto-trigger`, {
      method: 'POST',
      headers: getTenantBffHeaders(tenantId),
    })
      .then(r => r.json())
      .then((data: { triggered?: boolean; skipped?: boolean; reason?: string; detail?: string }) => {
        setPipelineStatus(data.triggered ? 'running' : 'done');
        if (data.triggered || data.skipped) {
          try {
            sessionStorage.setItem(triggerGuardKey, '1');
          } catch {
            /* ignore */
          }
        }
        if (data.skipped) {
          setAutoTriggerReason(data.reason ?? 'skipped');
        }
        if (data.triggered) {
          // Poll artifacts every 20s while pipeline may be producing
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['artifacts'] });
            setPipelineStatus('done');
          }, 30_000);
        }
      })
      .catch(() => setPipelineStatus('done'));
    };
    const timer = setTimeout(run, 2500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const { data: usageCost } = useQuery({
    queryKey: ['usage-cost', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/usage-cost/${tenantId}?days=1`, {
        headers: getTenantBffHeaders(tenantId),
      });
      if (!res.ok) return null;
      return res.json() as Promise<{
        remaining_today_usd?: number;
        daily_budget_usd?: number;
        spent_today_usd?: number;
        token_wallet?: { enabled?: boolean; remaining_tokens?: number };
      }>;
    },
    enabled: Boolean(tenantId) && !artifactsPending,
    staleTime: 60_000,
    ...mobileQueryDefaults,
  });

  const productionBudgetBlocked = !isProductionLimitsBypassed() && usageCost != null && (
    (usageCost.remaining_today_usd ?? 1) <= 0.001
    || (usageCost.token_wallet?.enabled === true
      && (usageCost.token_wallet.remaining_tokens ?? 0) <= 0)
  );

  const hasRenderingBundles = React.useMemo(
    () => dedupedRaw.some((a) => isBundleRendering(a) && !resolveStoryVideoUrlShared(a)),
    [dedupedRaw],
  );

  React.useEffect(() => {
    if (!tenantId || !hasRenderingBundles) return;
    fetch('/api/production-bundle/reconcile-stale', {
      method: 'POST',
      headers: getTenantBffHeaders(tenantId),
      signal: AbortSignal.timeout(12_000),
    })
      .then((res) => { if (res.ok) void refetchArtifacts(); })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, hasRenderingBundles]);

  const [retryingStoryId, setRetryingStoryId] = React.useState<string | null>(null);
  const retryStoryRender = React.useCallback(async (artifactId: string) => {
    if (!tenantId || retryingStoryId) return;
    setRetryingStoryId(artifactId);
    try {
      const res = await fetch(`/api/production-bundle/${artifactId}/retry-render`, {
        method: 'POST',
        headers: getTenantBffHeaders(tenantId),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; status?: string };
      if (!res.ok && res.status !== 202) {
        throw new Error(data.error || `Render başlatılamadı (${res.status})`);
      }
      await refetchArtifacts();
    } catch (err) {
      console.warn('[PlatformFeed] retry render:', err);
    } finally {
      setRetryingStoryId(null);
    }
  }, [tenantId, retryingStoryId, refetchArtifacts]);

  const missionIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const artifact of dedupedRaw) {
      const missionId = parseArtifactMissionId(artifact);
      if (missionId) ids.add(missionId);
    }
    return [...ids];
  }, [dedupedRaw]);

  const { data: missionList = [] } = useQuery({
    queryKey: ['missions-list-feed', tenantId],
    queryFn: () => apiClient.listMissions(tenantId!, 'completed'),
    enabled: Boolean(tenantId) && missionIds.length > 0,
    staleTime: 120_000,
  });

  const { data: missionIdeationLookup } = useQuery({
    queryKey: ['mission-ideation-captions', tenantId, missionIds.join(',')],
    queryFn: async () => {
      const lookup = new Map<string, string>();
      if (!tenantId) return lookup;
      await Promise.all(missionIds.map(async (missionId) => {
        try {
          const prog = await apiClient.getMissionProgress(tenantId, missionId, { includePayload: true });
          const byIndex = buildMissionIdeationCaptionLookup(missionId, prog.nodes ?? []);
          for (const [ideaIndex, caption] of byIndex.entries()) {
            lookup.set(`${missionId}:${ideaIndex}`, caption);
          }
        } catch {
          /* skip mission if progress unavailable */
        }
      }));
      return lookup;
    },
    enabled: Boolean(tenantId) && missionIds.length > 0,
    staleTime: 120_000,
  });

  const missionTitleById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of missionList) map.set(m.id, m.title);
    return map;
  }, [missionList]);

  const { data: filteredMissionProg } = useQuery({
    queryKey: ['mission-progress-feed', tenantId, missionFilterId],
    queryFn: () => apiClient.getMissionProgress(tenantId!, missionFilterId!, { includePayload: true }),
    enabled: Boolean(tenantId && missionFilterId),
    staleTime: 60_000,
  });

  const filteredMissionContext = React.useMemo(() => {
    if (!missionFilterId) return null;
    const missionArts = dedupedRaw.filter((a) => parseArtifactMissionId(a) === missionFilterId);
    const nodes = filteredMissionProg?.nodes ?? [];
    const planning = summarizeMissionPlanningOutputs(nodes);
    const fdReport = parseFeedDirectorReportFromNodes(nodes);
    const fdTelemetry = buildFeedDirectorTelemetry(fdReport);
    const pipeline = summarizeMissionProductionPipeline({
      artifacts: missionArts,
      missionId: missionFilterId,
      checklist: null,
      planning,
      fdAssignmentCount: fdReport?.production_assignments
        ? (fdReport.production_assignments as unknown[]).length
        : null,
    });
    return {
      theme: planning.strategyTheme ?? extractWeeklyThemeFromNodes(nodes),
      title: missionTitleById.get(missionFilterId) ?? null,
      pipeline,
      fdScore: fdTelemetry.feed_score,
      manifestCoverage: typeof fdReport?.manifest_coverage_pct === 'number'
        ? fdReport.manifest_coverage_pct
        : null,
    };
  }, [missionFilterId, dedupedRaw, filteredMissionProg?.nodes, missionTitleById]);

  const allArtifacts = React.useMemo(() => {
    // Galeri görünümünde (showApproved) tam geçmiş, approved olan her şeyi göster
    const sourcePool = dedupedFull;
    if (showApproved) {
      return sourcePool
        .filter((a) => a.status === 'approved')
        .sort(compareArtifactsByProductionTime);
    }
    const publishable = filterFeedDisplayArtifacts(sourcePool);
    if (missionFilterId) {
      return filterMissionFeedArtifacts(sourcePool, missionFilterId);
    }
    return publishable;
  }, [dedupedFull, showApproved, missionFilterId]);

  const rawPendingCount = React.useMemo(
    () => dedupedRaw.filter((a) => a.status === 'pending_review').length,
    [dedupedRaw],
  );
  const pendingPublishableCount = React.useMemo(
    () => allArtifacts.filter((a) => a.status === 'pending_review').length,
    [allArtifacts],
  );

  const approveMutation = useMutation({
    mutationFn: async (artifact: OutputArtifact) => {
      if (!tenantId) {
        throw new Error('Tenant seçili değil. Çıkış yapıp tekrar giriş yapın.');
      }
      const mcStatus = await apiClient.getMertcafeStatus(tenantId);
      assertMertcafePublishReady(mcStatus);
      const publishAuth = resolveMertcafePublishAuth(mcStatus);

      const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
      const content = parseArtifactContent(artifact.content);
      const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
      const matchScore = resolveArtifactMatchScore(meta);
      if (matchScore != null && classifyMatch(matchScore).quality === 'rejected') {
        throw new Error(
          'Fotoğraf içerikle eşleşmiyor — galeri analizini çalıştırın veya fotoğrafı değiştirin.',
        );
      }
      const kind = detectKind(artifact);

      // Stories never carry a caption — event info is baked into the image overlay
      const caption = kind === 'story'
        ? ''
        : resolveFeedDisplayCaption({
          content: content as Record<string, unknown>,
          metadata: meta,
          title: artifact.title,
        }, missionIdeationLookup);
      const hashtags = kind === 'story'
        ? []
        : normalizeHashtagsUtil(content.hashtags ?? meta.hashtags ?? resolved?.hashtags ?? []);
      // Sprint 8 (S8.4): publish the SAME asset the preview shows (export-first).
      const imageUrl = String(
        (kind === 'story' ? resolveStoryPublishImageUrl(artifact) : null)
        || resolvePublishImageUrl(artifact)
        || resolveArtifactImg(artifact)
        || (content.imageUrl as string) || (meta.imageUrl as string)
        || resolved?.imageUrl || artifact.contentUrl || '',
      );
      const videoUrl = String(
        (kind === 'reel' || kind === 'story')
          ? (resolveStoryPublishVideoUrl(artifact) || '')
          : '',
      );
      // Carousel URLs — check all known field names (snake and camelCase)
      const mediaUrls = resolveCarouselUrls(content, meta);

      // postType: only use carousel when we actually have 2+ media URLs.
      // If kind=carousel but no carousel_urls → degrade to feed (single photo post).
      const postType = kind === 'story' ? 'story'
        : kind === 'reel' ? 'reels'
        : (mediaUrls.length >= 2 ? 'carousel' : 'feed');

      // Sprint 10 (S10.5): publish export gate — block Canva edit pages only (not Remotion editorial URLs)
      if (postType === 'reels') {
        if (!isPublishableMediaUrl(videoUrl)) {
          throw new Error('Reel videosu dışa aktarılmamış. Önce videoyu üretin/dışa aktarın.');
        }
      } else if (postType === 'carousel') {
        if (mediaUrls.length < 2 || mediaUrls.some((u) => !isPublishableMediaUrl(String(u)))) {
          throw new Error('Carousel için en az 2 görsel gerekli. Bu içerik henüz üretilmemiş veya tek fotoğraf içeriyor.');
        }
      } else if (postType === 'story') {
        const hasVideo = isPlayableVideoUrl(videoUrl);
        const hasImage = isPublishableMediaUrl(imageUrl);
        if (!hasVideo && !hasImage) {
          throw new Error('Story videosu veya görseli hazır değil.');
        }
      } else if (!isPublishableMediaUrl(imageUrl)) {
        throw new Error('Görsel dışa aktarılmamış (Canva tasarımını export edin).');
      }

      // Resolve absolute video URL for publish
      const resolvePublicVideoUrl = (url: string): string => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        if (url.startsWith('/api/')) return `${window.location.origin}${url}`;
        // R2 key path — pass as-is; server presigns in mertcafe/post
        if (/^\/[0-9a-f-]{36}\/(stories|video|reel|image)\//i.test(url)) return url;
        if (url.startsWith('/')) return `${window.location.origin}${url}`;
        return `${window.location.origin}/${url}`;
      };
      const publicVideoUrl = resolvePublicVideoUrl(videoUrl);

      const publishPayload: Record<string, unknown> = {
        post_type: postType,
        workspaceId: tenantId,
        artifactId: artifact.id,
      };
      if (publishAuth.useOAuthAccount) {
        publishPayload.use_oauth_account = true;
      } else if (publishAuth.accountId) {
        publishPayload.account_id = publishAuth.accountId;
      }
      if (postType === 'story') {
        if (isPlayableVideoUrl(publicVideoUrl)) {
          // Video story (Remotion MP4 / fal motion) — video takes priority over image
          publishPayload.video_url = publicVideoUrl;
        } else {
          publishPayload.image_url = imageUrl;
        }
      } else if (postType === 'feed') {
        publishPayload.image_url = imageUrl;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }
      if (postType === 'reels') {
        publishPayload.video_url = publicVideoUrl || videoUrl;
        publishPayload.share_to_feed = true;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }
      if (postType === 'carousel') {
        publishPayload.media_urls = mediaUrls;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }

      const publishRes = await fetch('/api/mertcafe/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishPayload),
      });
      const publishJson = await publishRes.json().catch(() => ({}));
      if (!publishRes.ok) {
        throw new Error(
          humanizeMertcafePublishError(String((publishJson as { error?: string }).error || ''))
            || `Paylaşım başarısız (${publishRes.status})`,
        );
      }

      await apiClient.approveArtifact(artifact.id, 'Approved and published from feed');
      return publishJson;
    },
    onSuccess: (_data, artifact) => {
      setPublishErrors((prev) => {
        const next = { ...prev };
        delete next[artifact.id];
        return next;
      });
      const message = formatPublishFeedback(detectKind(artifact));
      setPublishSuccess((prev) => [...prev.slice(-2), { id: artifact.id, message }]);
      window.setTimeout(() => {
        setPublishSuccess((prev) => prev.filter((entry) => entry.id !== artifact.id));
      }, 6000);
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
    onError: (err, artifact) => {
      setPublishErrors((prev) => ({ ...prev, [artifact.id]: err instanceof Error ? err.message : 'Paylaşım başarısız' }));
    },
  });
  const revisionMutation = useMutation({
    mutationFn: (id: string) => apiClient.requestRevision(id, 'Revision requested from feed'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  });

  const pendingCount = useMemo(
    () => allArtifacts.filter((a) => a.status === 'pending_review').length,
    [allArtifacts],
  );
  const approvedCount = useMemo(
    () => allArtifacts.filter((a) => a.status === 'approved').length,
    [allArtifacts],
  );

  const tenantBrand = useTenantBrandContext();
  const feedHandle = resolveFeedHandle({}, tenantBrand);
  const feedLogoUrl = tenantBrand.logoUrl
    ? (resolveClientMediaUrl(tenantBrand.logoUrl) ?? tenantBrand.logoUrl)
    : undefined;

  // Story bubble bar — per-idea rings (not headline-deduped feed list)
  const storyArtifacts = React.useMemo(() => {
    const pool = dedupedRaw.filter((a) => isFeedStoryItem(a) && isArtifactFeedPublishable(a));
    const visibilityFiltered = pool.filter((a) => {
      if (showApproved) return a.status === 'approved';
      const m = (a.metadata ?? {}) as Record<string, unknown>;
      const alreadyShared = Boolean(m.ig_media_id || m.post_id || m.published_at);
      return a.status === 'pending_review' && !alreadyShared;
    });
    if (operatorMode) {
      const deduped = dedupeStoryBarArtifacts(visibilityFiltered);
      const scoped = missionFilterId
        ? deduped.filter((a) => parseArtifactMissionId(a) === missionFilterId)
        : deduped;
      return [
        ...scoped.filter((a) => a.status === 'pending_review'),
        ...scoped.filter((a) => a.status === 'approved'),
      ].sort(compareArtifactsByProductionTime);
    }
    return filterConsumerStoryBar(visibilityFiltered, {
      maxRings: 10,
      missionId: missionFilterId,
    });
  }, [dedupedRaw, missionFilterId, operatorMode, showApproved]);

  const storyBarItems = React.useMemo((): StoryBarItem[] => [
    ...storyArtifacts.map((artifact) => ({ kind: 'artifact' as const, artifact })),
    ...activeScheduledTemplates.map((template) => ({ kind: 'scheduled' as const, template })),
  ], [storyArtifacts, activeScheduledTemplates]);

  // Story viewer helpers
  const resolveStoryVideo = (artifact: OutputArtifact): string | null => resolveFeedPreviewVideoUrl(artifact);
  const resolveScheduledMediaUrl = (url: string): string => resolveClientMediaUrl(url) ?? url;
  const resolveStoryPoster = (artifact: OutputArtifact): string | null => {
    const producedStill = resolveFeedProducedStillUrl(artifact);
    if (producedStill) return producedStill;

    const poster = resolvePosterUrl(artifact);
    if (poster) {
      const resolved = resolveImg(poster);
      if (resolved && !isGalleryProxyPreviewUrl(resolved)) return resolved;
    }

    const c = parseArtifactContent(artifact.content);
    const m = (artifact.metadata ?? {}) as Record<string, unknown>;
    const img = String((c as any)?.imageUrl || m?.reference_photo_url || '').trim();
    if (img && !img.endsWith('.mp4') && !isGalleryProxyPreviewUrl(img)) {
      const resolved = resolveImg(img);
      if (resolved) return resolved;
    }
    return resolveArtifactImg(artifact);
  };
  const openStory = (idx: number) => {
    setStoryViewIdx(idx);
    setScheduledMediaIdx(0);
    setStoryProgress(0);
  };
  const closeStory = () => {
    setStoryViewIdx(null);
    setScheduledMediaIdx(0);
    setStoryProgress(0);
  };
  const nextStory = () => {
    if (storyViewIdx === null) return;
    const item = storyBarItems[storyViewIdx];
    if (item?.kind === 'scheduled' && scheduledMediaIdx < item.template.media_items.length - 1) {
      setScheduledMediaIdx((i) => i + 1);
      setStoryProgress(0);
      return;
    }
    if (storyViewIdx < storyBarItems.length - 1) {
      setStoryViewIdx(storyViewIdx + 1);
      setScheduledMediaIdx(0);
      setStoryProgress(0);
    } else {
      closeStory();
    }
  };
  const prevStory = () => {
    if (storyViewIdx === null) return;
    if (scheduledMediaIdx > 0) {
      setScheduledMediaIdx((i) => i - 1);
      setStoryProgress(0);
      return;
    }
    if (storyViewIdx > 0) {
      const prevIdx = storyViewIdx - 1;
      const prevItem = storyBarItems[prevIdx];
      setStoryViewIdx(prevIdx);
      setScheduledMediaIdx(
        prevItem?.kind === 'scheduled'
          ? Math.max(0, prevItem.template.media_items.length - 1)
          : 0,
      );
      setStoryProgress(0);
    }
  };

  const storySlideDurationMs = React.useCallback((item: StoryBarItem, mediaIdx: number): number => {
    if (item.kind === 'artifact') {
      return resolveStoryVideo(item.artifact) ? 8000 : 5000;
    }
    const media = item.template.media_items[mediaIdx];
    return media?.type === 'video' ? 8000 : 5000;
  }, []);

  // Story progress auto-advance (8s for video, 5s for photo)
  React.useEffect(() => {
    if (storyViewIdx === null) return;
    const item = storyBarItems[storyViewIdx];
    if (!item) return;
    const dur = storySlideDurationMs(item, scheduledMediaIdx);
    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += 100;
      setStoryProgress(Math.min(100, (elapsed / dur) * 100));
      if (elapsed >= dur) { clearInterval(interval); nextStory(); }
    }, 100);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyViewIdx, scheduledMediaIdx, storyBarItems]);

  // Auto-switch to pending view when new items arrive while user is in galeri view
  React.useEffect(() => {
    const prev = prevPendingRef.current;
    if (pendingCount > prev && showApproved) {
      setShowApproved(false);
    }
    prevPendingRef.current = pendingCount;
  }, [pendingCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredFeedArtifacts = useMemo(() => allArtifacts
    // allArtifacts zaten galeri modunda approved, pending modunda pending_review içeriyor
    .filter(a => showApproved ? a.status === 'approved' : a.status === 'pending_review')
    // isArtifactFeedReady (via filterFeedDisplayArtifacts) already gates display-ready items,
    // including failed Remotion bundles with a poster still — do not hide them again here.
    .filter(a => {
      // Exclude old SVG announcement_calendar stories — replaced by Remotion
      try {
        const c = parseArtifactContent(a.content);
        const m = (a.metadata ?? {}) as Record<string, unknown>;
        const src = String((c as any)?.source || m?.source || '');
        if (src === 'announcement_calendar') return false;
      } catch { /* ok */ }
      return true;
    })
    // Stories live in the bubble bar — never in the main feed scroll (native Instagram).
    .filter(a => !isFeedStoryItem(a as any))
    // Native-IG behaviour: once the user has shared/posted an item it leaves the
    // working feed. Gallery view (showApproved) keeps the published history.
    .filter(a => {
      if (showApproved) return true;
      const m = (a.metadata ?? {}) as Record<string, unknown>;
      const alreadyShared = Boolean(m.ig_media_id || m.post_id || m.published_at);
      return !alreadyShared;
    })
    .filter(a => {
      if (missionFilterId) return parseArtifactMissionId(a) === missionFilterId;
      return true;
    })
    .filter(a => {
      if (filter === 'ad') {
        const k = detectKind(a as any);
        return isPaidAdArtifact(a) || k === 'ad' || k === 'ad_creative';
      }
      // designed_post → Meta/Google türevleri ayrı artifact; ana feed'de tek kart göster
      if (!isOrganicFeedArtifact(a as OutputArtifact)) return false;
      if (filter === 'all') return true;
      const k = detectKind(a as any);
      if (filter === 'post') return k === 'post' || k === 'image';
      if (filter === 'reel') return k === 'reel' || k === 'video';
      if (filter === 'story') return k === 'story';
      return true;
    })
    .filter(a => artifactMatchesSlotFilter(a, slotFilter, detectKind))
    // Lazy list handles viewport rendering; cap filtered pool to API window.
    .slice(0, MOBILE_ARTIFACT_FEED_LIMIT),
    [allArtifacts, showApproved, missionFilterId, filter, slotFilter, operatorMode],
  );

  const artifacts = useMemo(
    () => sortFeedArtifactsForDisplay(filteredFeedArtifacts),
    [filteredFeedArtifacts],
  );

  const feedPostCount = useMemo(() => allArtifacts.filter((a) => {
    const k = detectKind(a);
    return k === 'post' || k === 'reel' || detectPreviewMode(a, k) === 'carousel';
  }).length, [allArtifacts]);

  const artifactsRef = useRef(artifacts);
  artifactsRef.current = artifacts;

  const handleApproveById = useCallback((artifactId: string) => {
    const art = artifactsRef.current.find((a) => a.id === artifactId);
    if (art) approveMutation.mutate(art);
  }, [approveMutation.mutate]);

  const handleRevisionById = useCallback((artifactId: string) => {
    revisionMutation.mutate(artifactId);
  }, [revisionMutation.mutate]);

  const handleRetryRenderById = useCallback((artifactId: string) => {
    void retryStoryRender(artifactId);
  }, [retryStoryRender]);

  const handleOpenMetaAdById = useCallback((artifactId: string) => {
    const art = artifactsRef.current.find((a) => a.id === artifactId);
    if (art) setBoostAdArtifact(art);
  }, []);

  const handleOpenGoogleAd = useCallback(() => {
    navigate('ads');
  }, [navigate]);

  const feedBg = !operatorMode
    ? (t.isDark ? '#000' : t.bg)
    : (platformView === 'instagram' ? '#000' : (t.isDark ? '#0a0a0f' : '#f7f7f7'));
  const clientStoryBarBg = feedBg;
  const storyRingBorder = feedBg;

  // Post / reel / carousel in feed scroll; stories open from the bubble bar above.
  const TABS: { id: FeedFilter; label: string; icon?: string }[] = operatorMode
    ? [
        { id: 'all', label: 'Tümü', icon: '⊞' },
        { id: 'post', label: 'Gönderi', icon: '□' },
        { id: 'story', label: 'Hikaye', icon: '○' },
        { id: 'reel', label: 'Reel', icon: '▶' },
        { id: 'ad', label: 'Reklam', icon: '📊' },
      ]
    : [
        { id: 'all', label: 'Tümü' },
        { id: 'post', label: 'Gönderi' },
        { id: 'story', label: 'Hikaye' },
        { id: 'reel', label: 'Reel' },
        { id: 'ad', label: 'Reklam' },
      ];

  const SLOT_TABS: { id: FeedSlotFilter; label: string }[] =
    filter === 'post'
      ? [
          { id: 'all', label: 'Tüm post' },
          { id: 'organic', label: 'Galeri' },
          { id: 'designed', label: 'Tasarım' },
        ]
      : [];

  React.useEffect(() => {
    setSlotFilter('all');
  }, [filter]);

  const feedPostsLoading = !operatorMode
    && Boolean(tenantId)
    && artifactsPending
    && dedupedRaw.length === 0;

  const feedRefreshing = pullRefreshing || artifactsFetching;

  return (
    <div
      ref={feedScrollRef}
      className={!operatorMode ? 'ig-feed-shell mobile-tab-scroll' : 'mobile-tab-scroll'}
      style={{
        background: feedBg,
        paddingBottom: 104,
        width: '100%',
        transform: pullActive ? `translateY(${pullDistance}px)` : undefined,
        transition: pullActive && !pullRefreshing ? 'none' : 'transform 220ms ease',
      }}
      onTouchStart={!operatorMode ? onFeedTouchStart : undefined}
      onTouchMove={!operatorMode ? onFeedTouchMove : undefined}
      onTouchEnd={!operatorMode ? onFeedTouchEnd : undefined}
    >
      {!operatorMode && (pullActive || feedRefreshing) && (
        <div
          className="ig-feed-pull-indicator"
          aria-hidden
          style={{
            opacity: pullReady || feedRefreshing ? 1 : 0.55,
          }}
        >
          <div
            className={`ig-feed-pull-spinner${feedRefreshing ? ' is-spinning' : ''}`}
            style={{
              transform: feedRefreshing ? undefined : `rotate(${Math.min(320, pullDistance * 3)}deg)`,
            }}
          />
        </div>
      )}

      {/* ─── Sticky Header ─────────────────────────────────────────── */}
      {!operatorMode ? (
        <div style={{ position: 'sticky', top: 0, zIndex: 30 }}>
          <MobileBrandNavbar
            dark={t.isDark}
            rightSlot={(
              <FeedNavbarActions
                showApproved={showApproved}
                pendingCount={pendingCount}
                approvedCount={approvedCount}
                onShowPending={() => setShowApproved(false)}
                onShowPublished={() => { if (approvedCount > 0) setShowApproved(true); }}
                dark={t.isDark}
              />
            )}
          />
        </div>
      ) : (
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        ...brandNavbarBackground(brandPalette, { dark: platformView === 'instagram' || t.isDark }),
        borderBottom: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'}`,
        paddingTop: 'calc(env(safe-area-inset-top,0px) + 8px)',
      }}>
        <>
        {/* Title row — agency */}
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <MobileNavMenuButton
            onClick={() => navigate('more')}
            dark={platformView === 'instagram' || t.isDark}
          />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.03em' }}>
              İçerik
            </span>
            {pendingCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 700, color: t.warning }}>{pendingCount}</span>
            )}
            {pipelineStatus === 'running' && (
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.live,
                animation: 'liveGlow 2s infinite', flexShrink: 0 }} />
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
            borderRadius: 10, padding: 3,
          }}>
            {[
              { id: false, label: pendingCount > 0 ? `Bekleyen ${pendingCount}` : 'Bekleyen' },
              { id: true, label: approvedCount > 0 ? `Galeri ${approvedCount}` : 'Galeri' },
            ].map(({ id, label }) => (
              <button
                key={String(id)}
                onClick={() => setShowApproved(id)}
                style={{
                  padding: '5px 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                  background: showApproved === id
                    ? (t.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)')
                    : 'transparent',
                  color: showApproved === id ? t.textPrimary : t.textMuted,
                  fontSize: 11, fontWeight: showApproved === id ? 700 : 500,
                  transition: 'all 150ms ease',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {productionBudgetBlocked && (
          <div style={{
            margin: '0 16px 10px', padding: '10px 12px', borderRadius: 12,
            background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)',
            fontSize: 12, lineHeight: 1.5, color: t.danger,
          }}>
            Bugünkü içerik üretimi tamamlandı — yarın devam edecek.
          </div>
        )}

        {tenantId && brandAlignment && !brandAlignment.canAutoProduce && (
          <div style={{
            margin: '0 16px 10px',
            padding: '10px 12px',
            borderRadius: 12,
            background: t.isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)',
            border: `0.5px solid ${t.isDark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.30)'}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.warning, marginBottom: 4 }}>
              {debugMode
                ? `Otonom üretim kapalı (BAS ${brandAlignment.bas ?? '—'}/100)`
                : 'Marka profiliniz tamamlanıyor'}
            </div>
            <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
              {debugMode
                ? (
                  <>
                    Feed açılınca yeni kampanya otomatik başlamaz. Onaylı misyonlarda Kampanyalar →
                    «Feed&apos;e gönderileri üret» kullanın veya marka skorlarını 100&apos;e çıkarın.
                    {brandAlignment.weakest?.label && (
                      <span style={{ display: 'block', marginTop: 3, color: t.textMuted }}>
                        En zayıf: {brandAlignment.weakest.label} ({brandAlignment.weakest.score ?? '—'})
                      </span>
                    )}
                  </>
                )
                : 'Marka ayarlarınızı tamamladığınızda yeni kampanyalar otomatik başlar. Mevcut onaylı kampanyalarınız etkilenmez.'}
            </div>
            <button
              type="button"
              onClick={() => navigate('brand')}
              style={{
                marginTop: 8, padding: '6px 12px', borderRadius: 8,
                border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, color: '#fff',
                background: t.warning,
              }}
            >
              Marka ayarları →
            </button>
          </div>
        )}

        {pipelineStatus === 'running' && pendingCount === 0 && !productionBudgetBlocked && (
          <div style={{
            margin: '0 16px 10px',
            padding: '10px 12px',
            borderRadius: 12,
            background: t.isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
            border: `0.5px solid ${t.isDark ? 'rgba(16,185,129,0.25)' : 'rgba(16,185,129,0.30)'}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              border: '1.5px solid rgba(52,211,153,0.35)',
              borderTop: '1.5px solid #34d399',
              animation: 'spinSlow 1s linear infinite',
            }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#34d399', marginBottom: 2 }}>
                Misyon hazırlanıyor
              </div>
              <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                Strateji, fikirler ve ajans tasarım kartları hazırlanıyor — içerikler
                birkaç dakika içinde burada görünür.
              </div>
            </div>
          </div>
        )}

        {/* Platform preview tabs — Instagram / TikTok / X */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px' }}>
          {PLATFORM_TABS.map((pt) => {
            const active = platformView === pt.id;
            return (
              <button key={pt.id} type="button" onClick={() => setPlatformView(pt.id)}
                style={{
                  flex: 1, padding: '9px 4px', borderRadius: 12, cursor: 'pointer',
                  border: active ? 'none' : `0.5px solid ${platformView === 'instagram' ? 'rgba(255,255,255,0.12)' : t.separator}`,
                  background: active ? pt.activeBg : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? '#fff' : (platformView === 'instagram' ? 'rgba(255,255,255,0.35)' : t.textMuted)}>
                  <path d={pt.svgPath} />
                </svg>
                <span style={{
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? '#fff' : (platformView === 'instagram' ? 'rgba(255,255,255,0.45)' : t.textMuted),
                }}>
                  {pt.label}
                </span>
              </button>
            );
          })}
        </div>

        {missionIds.length > 0 && (
          <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
            paddingLeft: 16, gap: 6, paddingBottom: 8 }}>
            <button
              type="button"
              onClick={() => setMissionFilterId(null)}
              style={{
                flexShrink: 0, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                background: !missionFilterId
                  ? (platformView === 'instagram' ? 'rgba(255,255,255,0.12)' : (t.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'))
                  : 'transparent',
                border: `0.5px solid ${!missionFilterId ? 'rgba(59,130,246,0.5)' : (platformView === 'instagram' ? 'rgba(255,255,255,0.12)' : t.separator)}`,
                color: !missionFilterId ? '#3B82F6' : (platformView === 'instagram' ? 'rgba(255,255,255,0.5)' : t.textMuted),
                fontSize: 11, fontWeight: 700,
              }}>
              Tüm planlar
            </button>
            {missionIds.slice(0, 8).map((mid) => {
              const active = missionFilterId === mid;
              const title = missionTitleById.get(mid) ?? `Plan ${mid.slice(0, 8)}…`;
              return (
                <button
                  key={mid}
                  type="button"
                  onClick={() => setMissionFilterId(active ? null : mid)}
                  style={{
                    flexShrink: 0, maxWidth: 160, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                    background: active
                      ? (platformView === 'instagram' ? 'rgba(255,255,255,0.12)' : (t.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'))
                      : 'transparent',
                    border: `0.5px solid ${active ? 'rgba(59,130,246,0.5)' : (platformView === 'instagram' ? 'rgba(255,255,255,0.12)' : t.separator)}`,
                    color: active ? '#3B82F6' : (platformView === 'instagram' ? 'rgba(255,255,255,0.5)' : t.textMuted),
                    fontSize: 11, fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                  {title.slice(0, 32)}
                </button>
              );
            })}
          </div>
        )}

        {missionFilterId && filteredMissionContext && (
          <div style={{
            margin: '0 16px 10px', padding: '12px 14px', borderRadius: 14,
            background: platformView === 'instagram'
              ? 'rgba(255,255,255,0.06)'
              : (t.isDark ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.06)'),
            border: `0.5px solid ${platformView === 'instagram' ? 'rgba(255,255,255,0.1)' : 'rgba(59,130,246,0.22)'}`,
          }}>
            {filteredMissionContext.theme && (
              <div style={{
                fontSize: 12, fontWeight: 700, lineHeight: 1.4, marginBottom: 6,
                color: platformView === 'instagram' ? 'rgba(255,255,255,0.92)' : t.textPrimary,
              }}>
                {filteredMissionContext.theme}
              </div>
            )}
            <div style={{
              fontSize: 11, lineHeight: 1.45,
              color: platformView === 'instagram' ? 'rgba(255,255,255,0.55)' : t.textMuted,
            }}>
              {debugMode ? (
                <>
                  {filteredMissionContext.pipeline.manifestReady}/{filteredMissionContext.pipeline.manifestRequired} slot hazır
                  {' · '}
                  {filteredMissionContext.pipeline.publishReady}/{filteredMissionContext.pipeline.productionTarget} yayına hazır
                  {filteredMissionContext.fdScore != null && (
                    <> · FD {filteredMissionContext.fdScore}</>
                  )}
                  {filteredMissionContext.manifestCoverage != null && (
                    <> · Manifest {filteredMissionContext.manifestCoverage}%</>
                  )}
                  {brandAlignment && (
                    <>
                      {' · '}
                      BAS {brandAlignment.bas}
                      {alignmentSubScore(brandAlignment, 'GIS') != null && (
                        <> · GIS {alignmentSubScore(brandAlignment, 'GIS')}</>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  {filteredMissionContext.pipeline.publishReady}/{filteredMissionContext.pipeline.productionTarget} içerik hazır
                  {filteredMissionContext.pipeline.publishReady < filteredMissionContext.pipeline.productionTarget
                    ? ' · kalan gönderiler hazırlanıyor'
                    : ' · onayınızı bekliyor'}
                </>
              )}
            </div>
          </div>
        )}

        <div style={{
          display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
          paddingLeft: 16, paddingRight: 8, gap: 6, paddingBottom: 12,
        }}>
          {TABS.map(tab => {
            const active = filter === tab.id;
            const tabColor = tab.id === 'reel' ? '#F43F5E'
              : tab.id === 'story' ? '#8AABBD'
              : tab.id === 'ad' ? '#F59E0B'
              : tab.id === 'post' ? '#60A5FA'
              : t.textPrimary;
            return (
              <button key={tab.id} onClick={() => setFilter(tab.id)} style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                background: active ? `${tabColor}18` : 'transparent',
                border: `0.5px solid ${active ? `${tabColor}40` : t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`,
                color: active ? tabColor : t.textMuted,
                fontSize: 12, fontWeight: active ? 800 : 500,
                letterSpacing: active ? '0.01em' : '0',
                transition: 'all 160ms ease',
                display: 'flex', alignItems: 'center', gap: tab.icon ? 5 : 0,
              }}>
                {tab.icon && <span style={{ fontSize: 11 }}>{tab.icon}</span>}
                {tab.label}
              </button>
            );
          })}
        </div>

        {SLOT_TABS.length > 0 && (
          <div style={{ display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
            paddingLeft: 16, gap: 6, paddingBottom: 10 }}>
            {SLOT_TABS.map((tab) => {
              const active = slotFilter === tab.id;
              const ig = platformView === 'instagram';
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSlotFilter(tab.id)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 12px',
                    borderRadius: 16,
                    cursor: 'pointer',
                    background: active
                      ? (ig ? 'rgba(138,171,189,0.25)' : (t.isDark ? 'rgba(138,171,189,0.2)' : 'rgba(138,171,189,0.12)'))
                      : 'transparent',
                    border: `0.5px solid ${active ? 'rgba(138,171,189,0.45)' : (ig ? 'rgba(255,255,255,0.1)' : t.separator)}`,
                    color: active ? (ig ? '#E9D5FF' : t.textPrimary) : (ig ? 'rgba(255,255,255,0.4)' : t.textMuted),
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
          </>
      </div>
      )}

      {publishSuccess.length > 0 && (
        <div style={{ padding: '10px 16px 0' }}>
          {publishSuccess.map(({ id, message }) => (
            <div key={id} style={{
              fontSize: 13, fontWeight: 700, color: '#10B981',
              padding: '10px 14px', borderRadius: 12,
              background: t.isDark ? 'rgba(16,185,129,0.12)' : 'rgba(16,185,129,0.08)',
              border: '0.5px solid rgba(16,185,129,0.25)',
              marginBottom: 6,
            }}>
              {message}
            </div>
          ))}
        </div>
      )}

      {/* ── Mission hazırlanıyor banner — pipeline tetiklendi, içerik henüz gelmedi ── */}
      {pipelineStatus === 'running' && pendingCount === 0 && !artifactsPending && !showApproved && (
        <div style={{
          margin: '10px 16px 4px',
          padding: '12px 14px',
          borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(52,211,153,0.05))',
          border: '0.5px solid rgba(16,185,129,0.25)',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 3,
            border: '1.5px solid rgba(52,211,153,0.35)',
            borderTop: '1.5px solid #34d399',
            animation: 'spinSlow 1s linear infinite',
          }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#34d399', marginBottom: 3 }}>
              Misyon hazırlanıyor
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
              Strateji, içerik fikirleri ve ajans tasarım kartları hazırlanıyor.
              İçerikler birkaç dakika içinde Feed'e düşer.
            </div>
          </div>
        </div>
      )}

      {/* Profile stats bar — agency only; IG home has no profile block in feed */}
      {operatorMode && platformView === 'instagram' && artifacts.length + storyArtifacts.length > 0 && (
        <InstagramProfileBar
          handle={feedHandle}
          logoUrl={feedLogoUrl}
          postCount={feedPostCount}
          storyCount={storyArtifacts.length}
        />
      )}

      {/* ── Story Bubble Bar — always visible, all platform views ── */}
      {(storyArtifacts.length > 0 || activeScheduledTemplates.length > 0) && (
        <div style={{
          display: 'flex', overflowX: 'auto', scrollbarWidth: 'none',
          padding: '12px 16px 14px',
          gap: 14,
          borderBottom: `0.5px solid ${t.separator}`,
          background: operatorMode && platformView === 'instagram' ? '#000' : clientStoryBarBg,
        }}>
          {storyArtifacts.map((art, idx) => {
            const poster = resolveStoryPoster(art);
            const vid = resolveStoryVideo(art);
            const meta = (art.metadata ?? {}) as Record<string, unknown>;
            const brandName = String(meta.brandName || '').trim();
            const isPending = art.status === 'pending_review';
            const isViewed = storyViewIdx !== null && storyViewIdx > idx;
            const isRendering = isBundleRendering(art);
            const isFailed = isBundleFailed(art) && !vid;
            const initials = brandName ? brandName.slice(0, 2).toUpperCase() : 'S';
            const grafikerScore = typeof meta.grafiker_score === 'number' ? meta.grafiker_score : null;
            const isRemotionVid = Boolean(vid);
            // Remotion stories: purple-to-gold gradient | Rendering: amber | Failed: red | Viewed: grey
            const ringBg = isViewed || !isPending
              ? t.separator
              : isFailed
              ? 'linear-gradient(135deg, #dc2626, #ef4444, #f87171)'
              : isRendering && !isRemotionVid
              ? 'linear-gradient(135deg, #f59e0b, #fbbf24, #fcd34d)'
              : isRemotionVid
              ? 'linear-gradient(135deg, #4D7088, #8AABBD, #c9a96e, #f59e0b)'
              : 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';

            return (
              <div
                key={art.id}
                role="button"
                tabIndex={0}
                onClick={() => openStory(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openStory(idx);
                  }
                }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 5, background: 'none', border: 'none', cursor: 'pointer',
                  flexShrink: 0, padding: 0 }}
              >
                {/* Gradient ring — purple-gold for Remotion, Instagram for regular */}
                <div style={{
                  width: 68, height: 68, borderRadius: '50%', padding: 2.5,
                  background: ringBg,
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: '100%', height: '100%', borderRadius: '50%',
                    overflow: 'hidden',
                    border: `2px solid ${operatorMode && platformView === 'instagram' ? '#000' : storyRingBorder}`,
                    background: t.isDark ? '#1a1a2e' : '#e5e5e5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                    {poster ? (
                      <SafeCoverImage
                        src={poster}
                        fallbacks={[resolveImg(art.contentUrl ?? undefined)]}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary }}>{initials}</span>
                    )}
                    {/* Remotion video badge */}
                    {vid && (
                      <div style={{
                        position: 'absolute', bottom: 0, right: 0,
                        width: 18, height: 18, borderRadius: '50%',
                        background: '#8AABBD', border: `1.5px solid ${operatorMode && platformView === 'instagram' ? '#000' : storyRingBorder}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 8, color: '#fff',
                      }}>▶</div>
                    )}
                    {/* Grafiker score badge */}
                    {debugMode && grafikerScore !== null && grafikerScore >= 8 && (
                      <div style={{
                        position: 'absolute', top: 0, right: 0,
                        width: 16, height: 16, borderRadius: '50%',
                        background: '#10B981', border: `1.5px solid ${operatorMode && platformView === 'instagram' ? '#000' : storyRingBorder}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 7, color: '#fff', fontWeight: 800,
                      }}>★</div>
                    )}
                  </div>
                </div>
                {/* Label */}
                <div style={{ textAlign: 'center', maxWidth: 88 }}>
                  <div style={{
                    fontSize: 10, color: isViewed ? t.textMuted : t.textPrimary,
                    fontWeight: isPending ? 700 : 400,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {brandName || 'Story'}
                  </div>
                  {operatorMode && storyRetryIsBusy(art) && !isRemotionVid && !isViewed && (
                    <div style={{ fontSize: 9, color: '#F59E0B', fontWeight: 700, marginTop: 1 }}>
                      Render…
                    </div>
                  )}
                  <StoryRetryButton
                    artifact={art}
                    retrying={retryingStoryId === art.id}
                    onRetry={() => { void retryStoryRender(art.id); }}
                    variant="bubble"
                  />
                  {operatorMode && isRemotionVid && !isViewed && (
                    <div style={{ fontSize: 9, color: '#9DBECE', fontWeight: 700, marginTop: 1 }}>
                      ▶ Video
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Scheduled template bubbles — recurring content */}
          {activeScheduledTemplates.map((tpl, tplIdx) => (
            <div
              key={tpl.template_id}
              role="button"
              tabIndex={0}
              onClick={() => openStory(storyArtifacts.length + tplIdx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openStory(storyArtifacts.length + tplIdx);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 5, background: 'none', border: 'none', cursor: 'pointer',
                flexShrink: 0, padding: 0 }}
            >
              <div style={{
                width: 68, height: 68, borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981, #34d399, #6ee7b7)',
                padding: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '100%', height: '100%', borderRadius: '50%',
                  border: `2.5px solid ${operatorMode && platformView === 'instagram' ? '#000' : storyRingBorder}`,
                  overflow: 'hidden', position: 'relative',
                }}>
                  {tpl.media_items[0]?.type === 'video' ? (
                    <video
                      src={tpl.media_items[0].url}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      muted
                    />
                  ) : tpl.media_items[0]?.url ? (
                    <img
                      src={tpl.media_items[0].url}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      alt={tpl.name}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      background: '#374151', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, color: '#9ca3af',
                    }}>
                      {tpl.name.slice(0, 2)}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'center', maxWidth: 72 }}>
                <div style={{
                  fontSize: 10, color: t.textPrimary, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {tpl.name}
                </div>
                <div style={{ fontSize: 8, color: '#10b981', marginTop: 1 }}>
                  {tpl.schedule_time}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Story Viewer (IG native 9:16 — mobile frame içinde) ── */}
      {storyViewIdx !== null && storyBarItems[storyViewIdx] && typeof window !== 'undefined' && (
        createPortal(
          <div className="ig-story-viewer-backdrop" style={{ animation: 'fadeIn 120ms ease both' }}>
            <div className="ig-story-viewer-column">
            <div className="ig-story-viewer-stage">
              {/* Progress bars */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
                display: 'flex', gap: 3,
                padding: 'max(10px, env(safe-area-inset-top)) 10px 0',
              }}>
                {(() => {
                  const item = storyBarItems[storyViewIdx!]!;
                  const slideCount = item.kind === 'scheduled'
                    ? Math.max(1, item.template.media_items.length)
                    : 1;
                  return Array.from({ length: slideCount }, (_, si) => (
                    <div key={si} style={{
                      flex: 1, height: 2.5, borderRadius: 2,
                      background: 'rgba(255,255,255,0.25)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 2, background: '#fff',
                        width: si < scheduledMediaIdx ? '100%'
                          : si === scheduledMediaIdx ? `${storyProgress}%` : '0%',
                        transition: si === scheduledMediaIdx ? 'none' : undefined,
                      }} />
                    </div>
                  ));
                })()}
              </div>

              {/* Header */}
              <div style={{
                position: 'absolute', top: 'max(28px, calc(env(safe-area-inset-top) + 16px))',
                left: 0, right: 0, zIndex: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
              }}>
                {(() => {
                  const item = storyBarItems[storyViewIdx!]!;
                  if (item.kind === 'scheduled') {
                    const media = item.template.media_items[scheduledMediaIdx] ?? item.template.media_items[0];
                    const thumb = media ? resolveScheduledMediaUrl(media.url) : null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                          border: '1.5px solid rgba(16,185,129,0.8)' }}>
                          {thumb ? (
                            media?.type === 'video' ? (
                              <video src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                            ) : (
                              <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: '#065f46',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, color: '#fff' }}>
                              {item.template.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.template.name}</div>
                          <div style={{ fontSize: 10, color: 'rgba(16,185,129,0.9)' }}>
                            Zamanlanmış · {item.template.schedule_time}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  const art = item.artifact;
                  const poster = resolveStoryPoster(art);
                  const meta = (art.metadata ?? {}) as Record<string, unknown>;
                  const brandName = String(meta.brandName || 'Story');
                  const ago = timeAgo(art.createdAt);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                        border: '1.5px solid rgba(255,255,255,0.6)' }}>
                        {poster
                          ? <img src={poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <div style={{ width: '100%', height: '100%', background: '#333',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 12, fontWeight: 800, color: '#fff' }}>
                              {brandName.slice(0, 2).toUpperCase()}
                            </div>
                        }
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{brandName}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>{ago}</div>
                      </div>
                    </div>
                  );
                })()}
                <button onClick={closeStory} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#fff', fontSize: 22, padding: 6, lineHeight: 1,
                }}>✕</button>
              </div>

              {/* Story content — full-bleed 9:16 cover (IG-style, no side bars) */}
              {(() => {
                const item = storyBarItems[storyViewIdx!]!;
                const mediaStyle: React.CSSProperties = {
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                };

                if (item.kind === 'scheduled') {
                  const media = item.template.media_items[scheduledMediaIdx] ?? item.template.media_items[0];
                  const url = media ? resolveScheduledMediaUrl(media.url) : null;
                  const poster = url;
                  return (
                    <>
                      {poster ? (
                        <div
                          aria-hidden
                          style={{
                            position: 'absolute',
                            inset: -24,
                            backgroundImage: `url(${poster})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            filter: 'blur(36px) brightness(0.35)',
                            transform: 'scale(1.08)',
                          }}
                        />
                      ) : null}
                      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                        {url && media?.type === 'video' ? (
                          <StoryPreviewVideo
                            key={url}
                            src={url}
                            poster={poster ?? undefined}
                            backgroundMusicUrl={undefined}
                            style={mediaStyle}
                          />
                        ) : url ? (
                          <StoryStillPreview
                            src={url}
                            backgroundMusicUrl={storyMusicUrl}
                            style={mediaStyle}
                          />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: '#111',
                            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 40, opacity: 0.2 }}>◉</span>
                          </div>
                        )}
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 5, pointerEvents: 'none' }}>
                          <div style={{ flex: 1, pointerEvents: 'auto' }} onClick={prevStory} aria-hidden />
                          <div style={{ flex: 1, pointerEvents: 'auto' }} onClick={nextStory} aria-hidden />
                        </div>
                      </div>
                    </>
                  );
                }

                const art = item.artifact;
                const vid = resolveStoryVideo(art);
                const poster = resolveStoryPoster(art);
                return (
                  <>
                    {poster ? (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          inset: -24,
                          backgroundImage: `url(${poster})`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          filter: 'blur(36px) brightness(0.35)',
                          transform: 'scale(1.08)',
                        }}
                      />
                    ) : null}
                    <div style={{
                      position: 'absolute', inset: 0,
                      overflow: 'hidden',
                    }}>
                    {vid ? (
                      <StoryPreviewVideo
                        key={vid}
                        src={vid}
                        poster={poster ?? undefined}
                        backgroundMusicUrl={undefined}
                        style={mediaStyle}
                      />
                    ) : poster ? (
                      <StoryStillPreview
                        src={poster}
                        backgroundMusicUrl={storyMusicUrl}
                        style={mediaStyle}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#111',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 40, opacity: 0.2 }}>◉</span>
                      </div>
                    )}

                    {/* Tap zones: left = prev, right = next — header/dock excluded */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 5, pointerEvents: 'none' }}>
                      <div style={{ flex: 1, pointerEvents: 'auto' }} onClick={prevStory} aria-hidden />
                      <div style={{ flex: 1, pointerEvents: 'auto' }} onClick={nextStory} aria-hidden />
                    </div>
                  </div>
                  </>
                );
              })()}
            </div>

            {/* Action dock — below story, never covers content */}
            <div className="ig-story-viewer-dock" style={{
              flexShrink: 0, zIndex: 20,
              padding: '10px 14px max(12px, env(safe-area-inset-bottom))',
              background: 'rgba(8,8,10,0.98)',
              borderTop: '0.5px solid rgba(255,255,255,0.08)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {(() => {
                const item = storyBarItems[storyViewIdx!]!;
                if (item.kind === 'scheduled') {
                  const tpl = item.template;
                  const endLabel = tpl.schedule_end_time ? ` – ${tpl.schedule_end_time}` : '';
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 4px',
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>
                          Zamanlanmış {tpl.format === 'reel' ? 'Reel' : 'Story'}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(16,185,129,0.85)', marginTop: 2 }}>
                          Her planlı günde {tpl.schedule_time}{endLabel} arası feed&apos;de görünür
                        </div>
                      </div>
                      <span style={{
                        fontSize: 10, padding: '4px 10px', borderRadius: 20,
                        background: 'rgba(16,185,129,0.2)', color: '#34d399', fontWeight: 700,
                      }}>
                        CANLI
                      </span>
                    </div>
                  );
                }
                const art = item.artifact;
                const isPending = art.status === 'pending_review';
                const c = parseArtifactContent(art.content);
                const m = (art.metadata ?? {}) as Record<string, unknown>;
                const vid = resolveStoryVideo(art);
                const isRemotionVideo = Boolean(vid);
                const isRendering = isBundleRendering(art);
                const canApprove = isPending && !isRendering && (isRemotionVideo || !isProductionBundleStory(art));
                const grafiker = typeof m.grafiker_score === 'number' ? m.grafiker_score : null;
                const compositionId = String((c as any)?.compositionId || m?.compositionId || '');
                const isLocalVideo = vid?.startsWith('/api/remotion/video/');

                return (
                  <>
                    {/* Remotion info bar */}
                    {debugMode && isRemotionVideo && (
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderRadius: 10,
                        background: 'rgba(138,171,189,0.20)', border: '0.5px solid rgba(138,171,189,0.4)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#9DBECE', fontWeight: 700 }}>
                            ▶ Story {compositionId.replace('Story', '')}
                          </span>
                          {debugMode && grafiker !== null && (
                            <span style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 10,
                              background: grafiker >= 8 ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
                              color: grafiker >= 8 ? '#10B981' : '#F59E0B', fontWeight: 700,
                            }}>
                              ★ {grafiker}/10
                            </span>
                          )}
                        </div>
                        {/* Download button for Instagram */}
                        {vid && (
                          <a href={vid} download={`remotion-story-${art.id?.slice(0,8)}.mp4`}
                            style={{
                              fontSize: 10, padding: '4px 10px', borderRadius: 8,
                              background: 'rgba(255,255,255,0.15)', color: '#fff',
                              fontWeight: 700, textDecoration: 'none',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                            ↓ İndir
                          </a>
                        )}
                      </div>
                    )}

                    {/* Local video warning */}
                    {isLocalVideo && (
                      <div style={{
                        fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'center',
                        fontStyle: 'italic',
                      }}>
                        Dev ortamı: R2 olmadan doğrudan Instagram yayını yapılamaz
                      </div>
                    )}

                    {isRendering && (
                      <div style={{
                        fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
                        padding: '8px 12px', borderRadius: 10,
                        background: 'rgba(245,158,11,0.18)', border: '0.5px solid rgba(245,158,11,0.35)',
                      }}>
                        Video hazırlanıyor… (~2 dk)
                      </div>
                    )}

                    {publishErrors[art.id] && (
                      <div style={{
                        fontSize: 11, color: '#FCA5A5', textAlign: 'center',
                        padding: '8px 12px', borderRadius: 10,
                        background: 'rgba(239,68,68,0.18)', border: '0.5px solid rgba(239,68,68,0.35)',
                      }}>
                        {publishErrors[art.id]}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', position: 'relative', zIndex: 31 }}>
                    {canRetryStoryRender(art) && (
                      <StoryRetryButton
                        artifact={art}
                        retrying={retryingStoryId === art.id}
                        onRetry={() => { void retryStoryRender(art.id); }}
                        variant="viewer"
                      />
                    )}
                    {canApprove && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void approveMutation.mutateAsync(art)
                            .then(() => nextStory())
                            .catch(() => undefined);
                        }}
                        disabled={approveMutation.isPending}
                        style={{
                          flex: 1, minWidth: 0, padding: '11px 12px', borderRadius: 12, border: 'none',
                          background: '#10B981', color: '#fff', fontSize: 13, fontWeight: 700,
                          cursor: approveMutation.isPending ? 'wait' : 'pointer',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6,
                          opacity: approveMutation.isPending ? 0.85 : 1,
                          whiteSpace: 'nowrap',
                        }}>
                        {approveMutation.isPending ? (
                          <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Paylaşılıyor…</>
                        ) : (
                          <>{isRemotionVideo ? '▶ Story paylaş' : '✓ Onayla'}</>
                        )}
                      </button>
                    )}
                    <button type="button" onClick={(e) => { e.stopPropagation(); closeStory(); openApproval(art.id); }}
                      style={{
                        flex: canApprove ? '0 0 auto' : 1, padding: '11px 16px', borderRadius: 12,
                        border: 'none',
                        background: 'rgba(255,255,255,0.10)', color: '#fff',
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}>
                      {canApprove ? 'Düzenle' : isPending ? 'İncele' : '···'}
                    </button>
                    {!isPending && (
                      <button onClick={nextStory}
                        style={{
                          flex: '0 0 auto', padding: '11px 14px', borderRadius: 12, border: 'none',
                          background: 'rgba(255,255,255,0.10)', color: '#fff',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                        Sonraki →
                      </button>
                    )}
                    </div>
                  </>
                );
              })()}
            </div>
            </div>
          </div>,
          getMobilePortalRoot()
        )
      )}

      {/* ── Reel fullscreen viewer (IG tap-to-expand 9:16) ── */}
      {reelViewerArtifact && typeof window !== 'undefined' && createPortal(
        <div
          className="ig-story-viewer-backdrop"
          style={{ animation: 'fadeIn 120ms ease both' }}
          onClick={() => setReelViewerArtifact(null)}
        >
          <div
            className="ig-story-viewer-column"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ig-story-viewer-stage" style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setReelViewerArtifact(null)}
                aria-label="Kapat"
                style={{
                  position: 'absolute',
                  top: 'max(12px, env(safe-area-inset-top))',
                  left: 12,
                  zIndex: 20,
                  background: 'rgba(0,0,0,0.45)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  color: '#fff',
                  fontSize: 18,
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
              <PlatformNativePreview
                platform="instagram"
                mode="reel"
                content={artifactToNativeContent(reelViewerArtifact)}
                handle={feedHandle}
                logoUrl={feedLogoUrl}
                isPending={reelViewerArtifact.status === 'pending_review'}
                timeLabel={timeAgo(reelViewerArtifact.createdAt)}
                reelImmersive
              />
            </div>
          </div>
        </div>,
        getMobilePortalRoot(),
      )}

      {/* Feed */}
      {feedPostsLoading ? (
        <FeedLoadingSkeleton message="Gönderiler yükleniyor…" />
      ) : artifacts.length === 0 ? (
        !operatorMode ? (
          <div className="feed-empty">
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.35 }}>📸</div>
            <div className="feed-empty-title">
              {showApproved ? 'Galeri boş' : 'Yeni içerik yok'}
            </div>
            <div className="feed-empty-body">
              {showApproved
                ? 'Onaylanan içerikler burada görünür.'
                : !showApproved && storyBarItems.length > 0
                  ? 'Story içerikleriniz üst şeritte. Gönderi ve reel kartları burada listelenir.'
                : !showApproved && pendingPublishableCount > 0
                  ? 'İçerikler yükleniyor…'
                : rawPendingCount > pendingPublishableCount
                  ? `${rawPendingCount - pendingPublishableCount} içerik hazırlanıyor — bitince Akış'a düşecek.`
                  : pipelineStatus === 'running'
                    ? 'Kampanya hazırlanıyor — strateji ve içerik fikirleri oluşturuluyor.'
                    : brandAlignment && !brandAlignment.canAutoProduce
                      ? 'Marka profilinizi tamamlayın — ardından yeni planlar otomatik başlar.'
                      : 'Haftalık plandan onayladığınız kampanyalar hazır olunca burada görünür.'}
            </div>
            {!showApproved && missionFilterId && rawPendingCount > 0 && artifacts.length === 0 && (
              <button
                onClick={() => setMissionFilterId(null)}
                style={{
                  marginBottom: 12, padding: '10px 18px', borderRadius: 20, border: 'none',
                  background: 'rgba(59,130,246,0.2)', color: '#60A5FA', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Tüm plan içeriklerini göster
              </button>
            )}
            {showApproved && pendingCount > 0 && (
              <button
                onClick={() => setShowApproved(false)}
                style={{
                  padding: '11px 22px', borderRadius: 22, border: 'none',
                  background: 'linear-gradient(135deg, #4D7088, #5A82A0)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Yeni üretimler ({pendingCount})
              </button>
            )}
            {!showApproved && approvedCount > 0 && (
              <button
                onClick={() => setShowApproved(true)}
                style={{
                  padding: '11px 22px', borderRadius: 22, border: 'none',
                  background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Galeriyi gör ({approvedCount})
              </button>
            )}
            {!showApproved && (
              <button
                onClick={() => navigate('missions')}
                style={{
                  padding: '11px 22px', borderRadius: 22, border: 'none',
                  background: 'linear-gradient(135deg, #4D7088, #5A82A0)',
                  color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  marginTop: approvedCount > 0 ? 10 : 0,
                }}
              >
                Haftalık plana git
              </button>
            )}
          </div>
        ) : (
        <div style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.15 }}>📸</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
            {showApproved ? 'Galeri boş' : 'Yeni içerik yok'}
          </div>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 16 }}>
            {showApproved
              ? 'Onaylanan içerikler burada görünür.'
              : rawPendingCount > pendingPublishableCount
                ? `${rawPendingCount - pendingPublishableCount} içerik hazırlanıyor — render bitince Feed'e düşecek.`
                : pipelineStatus === 'running'
                  ? 'Kampanya hazırlanıyor — strateji, içerik fikirleri ve ajans tasarım kartları oluşturuluyor. Birkaç dakika içinde içerikler burada görünür.'
                  : brandAlignment && !brandAlignment.canAutoProduce
                    ? (debugMode
                      ? 'Otonom üretim kapalı (BAS < 100). Kampanyalar\'da onaylı misyon için «Feed\'e gönderileri üret» veya hatalı kampanyayı ↺ yeniden başlatın.'
                      : 'Marka profilinizi tamamlayın — ardından yeni kampanyalar otomatik başlar.')
                    : (debugMode
                      ? 'Mission Hub\'dan bir misyon başlatın — içerikler üretilince burada görünür.'
                      : 'Kampanyalar sekmesinden yeni plan onaylayın — içerikler hazır olunca burada görünür.')}
          </div>
          {!showApproved && missionFilterId && rawPendingCount > 0 && artifacts.length === 0 && (
            <button
              onClick={() => setMissionFilterId(null)}
              style={{
                marginBottom: 12, padding: '8px 16px', borderRadius: 20, border: 'none',
                background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Tüm mission içeriklerini göster
            </button>
          )}
          {showApproved && pendingCount > 0 && (
            <button
              onClick={() => setShowApproved(false)}
              style={{
                padding: '10px 20px', borderRadius: 20, border: 'none',
                background: `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`,
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ✨ Yeni Üretimler ({pendingCount})
            </button>
          )}
          {!showApproved && approvedCount > 0 && (
            <button
              onClick={() => setShowApproved(true)}
              style={{
                padding: '10px 20px', borderRadius: 20, border: 'none',
                background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                color: t.textPrimary, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Galeriyi Gör ({approvedCount})
            </button>
          )}
          {!showApproved && (
            <button
              onClick={() => navigate('missions')}
              style={{
                padding: '10px 20px', borderRadius: 20, border: 'none',
                background: `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`,
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                marginTop: approvedCount > 0 ? 8 : 0,
              }}
            >
              {debugMode ? 'Mission Hub\'a Git' : 'Haftalık Plana Git'}
            </button>
          )}
        </div>
        )
      ) : (
        <div style={{ background: feedBg }}>
          <FeedLazyPostList
            items={artifacts}
            itemKey={(artifact) => artifact.id}
            pageSize={MOBILE_ARTIFACT_FEED_RENDER_PAGE}
            loadMoreLabel="Daha fazla gönderi yükleniyor…"
            renderItem={(artifact, idx) => {
              const isApproving = approveMutation.isPending && approveMutation.variables?.id === artifact.id;
              const isRevisioning = revisionMutation.isPending && revisionMutation.variables === artifact.id;
              return (
                <div
                  style={{
                    animation: idx < 6
                      ? `cardEnter 280ms cubic-bezier(0.22,1,0.36,1) both`
                      : undefined,
                    animationDelay: idx < 6 ? `${Math.min(idx * 40, 240)}ms` : undefined,
                  }}
                >
                  <NativeFeedCard
                    artifact={artifact}
                    platform={operatorMode ? platformView : 'instagram'}
                    workspaceId={tenantId ?? undefined}
                    t={t}
                    storyMusicUrl={storyMusicUrl}
                    missionIdeationLookup={missionIdeationLookup}
                    approving={isApproving}
                    revisioning={isRevisioning}
                    retryingRender={retryingStoryId === artifact.id}
                    onApprove={handleApproveById}
                    onRevision={handleRevisionById}
                    onRetryRender={handleRetryRenderById}
                    onOpenMetaAd={handleOpenMetaAdById}
                    onOpenGoogleAd={handleOpenGoogleAd}
                    onOpenReelFullscreen={
                      !operatorMode && detectFeedArtifactKind(artifact) === 'reel'
                        ? () => setReelViewerArtifact(artifact)
                        : undefined
                    }
                  />
                </div>
              );
            }}
          />
          {artifactsFetching && artifacts.length > 0 && (
            <div style={{ padding: '8px 16px 24px', textAlign: 'center', fontSize: 11, opacity: 0.4, color: '#fff' }}>
              Arşiv güncelleniyor…
            </div>
          )}
        </div>
      )}
      {Object.keys(publishErrors).length > 0 && (
        <div style={{ padding: '10px 16px 0' }}>
          {Object.entries(publishErrors).slice(-2).map(([artifactId, message]) => (
            <div key={artifactId} style={{ fontSize: 12, color: '#fb7185', marginBottom: 6 }}>
              ⚠ Paylaşım hatası: {message}
            </div>
          ))}
          {!tenantId && (
            <div style={{ fontSize: 12, color: '#fb7185' }}>
              ⚠ Tenant bilgisi bulunamadı. Tekrar giriş yapıp deneyin.
            </div>
          )}
        </div>
      )}
      {boostAdArtifact && (
        <BoostPostSheet
          isOpen
          artifactId={boostAdArtifact.id}
          workspaceId={tenantId ?? undefined}
          caption={parseArtifactContent(boostAdArtifact.content).caption as string | undefined}
          imageUrl={boostAdArtifact.contentUrl ?? undefined}
          onClose={() => setBoostAdArtifact(null)}
        />
      )}

      {/* FAB — New Brief */}
      <button
        onClick={() => navigate('new-brief')}
        aria-label="Yeni İstek"
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)',
          right: 20,
          zIndex: 98,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: '#8AABBD',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(138,171,189,0.4)',
          animation: 'fabPulse 3s ease-in-out infinite',
          transition: 'transform 120ms ease',
        }}
        onPointerEnter={e => { (e.currentTarget as HTMLButtonElement).style.animation = 'none'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
        onPointerLeave={e => { (e.currentTarget as HTMLButtonElement).style.animation = 'fabPulse 3s ease-in-out infinite'; (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#07090F" strokeWidth={2.5} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

'use client';

/**
 * Instagram profile → posts / Reels / stories viewer.
 * Grid tap opens a vertical feed starting at that post (native IG).
 * Reels tab opens the snap pager. Highlights open a story sequence.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../theme-context';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { useMobileStore } from '../mobile-store';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import {
  MOBILE_ARTIFACT_FEED_LIMIT,
  MOBILE_ARTIFACT_FEED_PAGE,
} from '../../_lib/mobile-artifacts';
import { filterFeedDisplayArtifacts } from '@/lib/weekly-publish-package';
import { isOrganicFeedArtifact } from '@/lib/ad-publish-utils';
import {
  buildFeedArtifactViewModel,
  detectFeedArtifactKind,
} from '@/lib/artifact-view-model';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { resolveFeedHandle } from '@/lib/tenant-brand-context';
import { FeedLazyPostList } from '../FeedLazyPostList';
import { resolveIgFeedChrome } from '../ig-feed-chrome';
import { getImmersivePortalRoot } from '../mobile-client-config';
import {
  artifactToNativeContent,
  PlatformNativePreview,
  StoryPreviewVideo,
  StoryStillPreview,
} from '../platform-native-previews';
import {
  CommentsBottomSheet,
  IgStoryChrome,
  MediaPlaybackProvider,
  ReelsScreen,
  ShareBottomSheet,
  useFeedEngagement,
} from '../feed';
import type { FeedEngagementState } from '../feed/types';
import type { OutputArtifact } from '@/types';

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (Number.isNaN(m) || m < 1) return 'az önce';
  if (m < 60) return `${m} dakika`;
  if (m < 1440) return `${Math.floor(m / 60)} saat`;
  return `${Math.floor(m / 1440)} gün`;
}

function BackChevron({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 19l-7-7 7-7" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ProfileIgPost({
  artifact,
  handle,
  logoUrl,
  dark,
  engagement,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onOpenShare,
  onOpenReel,
}: {
  artifact: OutputArtifact;
  handle: string;
  logoUrl?: string;
  dark: boolean;
  engagement: FeedEngagementState;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onOpenComments: () => void;
  onOpenShare: () => void;
  onOpenReel?: () => void;
}) {
  const brand = useTenantBrandContext();
  const vm = useMemo(() => buildFeedArtifactViewModel(artifact), [artifact]);
  const chrome = resolveIgFeedChrome(dark);
  const kind = vm.kind;
  const mode = vm.previewMode;
  const postHandle = resolveFeedHandle(vm.meta, brand) || handle;

  return (
    <div
      className="ig-feed-post"
      style={{
        background: chrome.shell,
        borderBottom: `0.5px solid ${chrome.separator}`,
      }}
    >
      <PlatformNativePreview
        platform="instagram"
        mode={mode}
        content={vm.content}
        handle={postHandle}
        logoUrl={logoUrl}
        isPending={vm.isPendingReview}
        timeLabel={timeAgo(artifact.createdAt)}
        inFeedScroll
        formatTag={kind === 'carousel' ? 'carousel' : kind === 'reel' ? 'reel' : 'post'}
        igChromeDark={dark}
        onReelOpen={mode === 'reel' || kind === 'reel' ? onOpenReel : undefined}
        engagementId={artifact.id}
        engagement={engagement}
        onToggleLike={onToggleLike}
        onToggleSave={onToggleSave}
        onOpenComments={onOpenComments}
        onOpenShare={onOpenShare}
      />
    </div>
  );
}

function StorySequenceViewer({
  items,
  initialId,
  handle,
  logoUrl,
  onClose,
  getEngagement,
  onToggleLike,
  onOpenComments,
  onOpenShare,
  sheetOpen = false,
}: {
  items: OutputArtifact[];
  initialId: string;
  handle: string;
  logoUrl?: string;
  onClose: () => void;
  getEngagement: (id: string) => FeedEngagementState;
  onToggleLike: (id: string) => void;
  onOpenComments: (id: string) => void;
  onOpenShare: (id: string) => void;
  sheetOpen?: boolean;
}) {
  const start = Math.max(0, items.findIndex((a) => a.id === initialId));
  const [idx, setIdx] = useState(start);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const item = items[idx];
  const content = useMemo(
    () => (item ? artifactToNativeContent(item) : null),
    [item],
  );
  const durationMs = content?.videoUrl ? 8000 : 5000;

  const goNext = useCallback(() => {
    setProgress(0);
    setIdx((i) => {
      if (i >= items.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
  }, [items.length, onClose]);

  const goPrev = useCallback(() => {
    setProgress(0);
    setIdx((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('sa-reels-open');
    document.body.classList.add('sa-reels-open');
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.classList.remove('sa-reels-open');
      document.body.classList.remove('sa-reels-open');
    };
  }, []);

  useEffect(() => {
    if (paused || sheetOpen || !item) return;
    const started = Date.now();
    const tick = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / durationMs);
      setProgress(p);
      if (p >= 1) goNext();
    }, 50);
    return () => window.clearInterval(tick);
  }, [idx, paused, sheetOpen, durationMs, item, goNext]);

  if (!item || !content || typeof window === 'undefined') return null;

  const engagement = item ? getEngagement(item.id) : null;

  return createPortal(
    <div
      className="ig-story-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Hikaye"
    >
      <div className="ig-story-viewer-column">
      <div className="ig-story-viewer-stage">
        {content.videoUrl ? (
          <StoryPreviewVideo
            src={content.videoUrl}
            poster={content.imageUrl ?? undefined}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : content.imageUrl ? (
          <StoryStillPreview
            src={content.imageUrl}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#1a1020,#050508)' }} />
        )}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, transparent 26%, transparent 64%, rgba(0,0,0,0.42) 100%)',
        }} />
        <button
          type="button"
          aria-label="Önceki hikaye"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
          onClick={goPrev}
          style={{
            position: 'absolute', inset: '0 55% 0 0', zIndex: 20,
            border: 'none', background: 'transparent', cursor: 'pointer',
          }}
        />
        <button
          type="button"
          aria-label="Sonraki hikaye"
          onPointerDown={() => setPaused(true)}
          onPointerUp={() => setPaused(false)}
          onPointerCancel={() => setPaused(false)}
          onClick={goNext}
          style={{
            position: 'absolute', inset: '0 0 0 45%', zIndex: 20,
            border: 'none', background: 'transparent', cursor: 'pointer',
          }}
        />
        {item && engagement && (
          <IgStoryChrome
            barCount={items.length}
            activeIndex={idx}
            activeProgress={progress * 100}
            avatarUrl={logoUrl}
            title={handle}
            subtitle={timeAgo(item.createdAt)}
            liked={engagement.isLiked}
            onClose={onClose}
            onLike={() => onToggleLike(item.id)}
            onShare={() => onOpenShare(item.id)}
            onReply={() => onOpenComments(item.id)}
          />
        )}
      </div>
      </div>
    </div>,
    getImmersivePortalRoot(),
  );
}

function ProfilePostsFeedInner() {
  const { t } = useTheme();
  const brand = useTenantBrandContext();
  const goBack = useMobileStore((s) => s.goBack);
  const navigate = useMobileStore((s) => s.navigate);
  const selectedArtifactId = useMobileStore((s) => s.selectedArtifactId);
  const mode = useMobileStore((s) => s.profilePostsMode);
  const feedListLimit = useMobileStore((s) => s.feedListLimit);
  const setFeedListLimit = useMobileStore((s) => s.setFeedListLimit);
  const chrome = resolveIgFeedChrome(t.isDark);
  const engagementApi = useFeedEngagement();

  const [reelId, setReelId] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const { data: artifacts = [] } = useMobileArtifacts({
    params: { limit: feedListLimit },
    subscribeOnly: true,
  });

  const growArchive = useCallback(() => {
    setFeedListLimit(Math.min(feedListLimit + MOBILE_ARTIFACT_FEED_PAGE, MOBILE_ARTIFACT_FEED_LIMIT));
  }, [feedListLimit, setFeedListLimit]);

  const { postCards, reelCards, storyCards } = useMemo(() => {
    const produced = artifacts.filter(
      (a) => a.status === 'pending_review' || a.status === 'approved',
    );
    const display = filterFeedDisplayArtifacts(produced).filter(isOrganicFeedArtifact);
    const posts = display.filter((a) => detectFeedArtifactKind(a) !== 'story');
    const reels = posts.filter((a) => detectFeedArtifactKind(a) === 'reel');
    const stories = display.filter((a) => detectFeedArtifactKind(a) === 'story');
    return { postCards: posts, reelCards: reels, storyCards: stories };
  }, [artifacts]);

  const handle = brand.displayHandle || brand.instagramHandle || 'markam';
  const avatarRaw = brand.instagramProfilePicUrl || brand.logoUrl || '';
  const logoUrl = avatarRaw ? (resolveClientMediaUrl(avatarRaw) ?? avatarRaw) : undefined;

  const startId = selectedArtifactId ?? postCards[0]?.id ?? '';
  const startIndex = Math.max(0, postCards.findIndex((a) => a.id === startId));
  const feedItems = postCards.slice(startIndex);
  const hasMoreArchive = artifacts.length >= feedListLimit
    && feedListLimit < MOBILE_ARTIFACT_FEED_LIMIT;

  const itemKey = useCallback((item: OutputArtifact) => item.id, []);

  const sheetTarget = sheetId
    ? (postCards.find((a) => a.id === sheetId) ?? reelCards.find((a) => a.id === sheetId) ?? null)
    : null;
  const shareVm = sheetTarget ? buildFeedArtifactViewModel(sheetTarget) : null;

  if (mode === 'stories') {
    return (
      <>
        <StorySequenceViewer
          items={storyCards.length > 0 ? storyCards : postCards}
          initialId={startId}
          handle={handle}
          logoUrl={logoUrl}
          onClose={goBack}
          getEngagement={engagementApi.get}
          onToggleLike={(id) => { void engagementApi.toggleLike(id); }}
          onOpenComments={(id) => {
            setSheetId(id);
            setCommentsOpen(true);
          }}
          onOpenShare={(id) => {
            setSheetId(id);
            setShareOpen(true);
          }}
          sheetOpen={commentsOpen || shareOpen}
        />
        <CommentsBottomSheet
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          comments={sheetId ? engagementApi.getComments(sheetId) : []}
          onSubmit={(text) => { if (sheetId) void engagementApi.addComment(sheetId, text); }}
        />
        <ShareBottomSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={shareVm?.content.headline || handle}
          shareText={shareVm?.content.caption}
        />
      </>
    );
  }

  if (mode === 'reels') {
    return (
      <>
        <ReelsScreen
          items={reelCards.length > 0 ? reelCards : postCards.filter((a) => detectFeedArtifactKind(a) === 'reel')}
          initialId={startId}
          handle={handle}
          logoUrl={logoUrl}
          onClose={goBack}
          onOpenCamera={() => {
            goBack();
            navigate('new-brief');
          }}
          getEngagement={engagementApi.get}
          onToggleLike={(id) => { void engagementApi.toggleLike(id); }}
          onToggleSave={(id) => { void engagementApi.toggleSave(id); }}
          onOpenComments={(id) => {
            setSheetId(id);
            setCommentsOpen(true);
          }}
          onOpenShare={(id) => {
            setSheetId(id);
            setShareOpen(true);
          }}
          sheetOpen={commentsOpen || shareOpen}
        />
        <CommentsBottomSheet
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          comments={sheetId ? engagementApi.getComments(sheetId) : []}
          onSubmit={(text) => { if (sheetId) void engagementApi.addComment(sheetId, text); }}
        />
        <ShareBottomSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title={shareVm?.content.headline || handle}
          shareText={shareVm?.content.caption}
        />
      </>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: chrome.shell,
      paddingBottom: 108,
    }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: 'calc(env(safe-area-inset-top, 0px) + 6px) 6px 8px',
        background: chrome.shell,
        borderBottom: `0.5px solid ${chrome.separator}`,
      }}>
        <button
          type="button"
          onClick={goBack}
          aria-label="Geri"
          style={{
            width: 44,
            height: 44,
            border: 'none',
            background: 'transparent',
            color: chrome.icon,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <BackChevron color={chrome.icon} />
        </button>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'center', paddingRight: 44 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: chrome.textMuted,
            letterSpacing: '0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {handle}
          </div>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: chrome.text,
            letterSpacing: '-0.02em',
            marginTop: -1,
          }}>
            Gönderiler
          </div>
        </div>
      </header>

      <FeedLazyPostList
        items={feedItems}
        itemKey={itemKey}
        pageSize={4}
        hasMoreRemote={hasMoreArchive}
        onNearEnd={growArchive}
        loadMoreLabel="Daha fazla gönderi…"
        renderItem={(artifact) => (
          <ProfileIgPost
            artifact={artifact}
            handle={handle}
            logoUrl={logoUrl}
            dark={t.isDark}
            engagement={engagementApi.get(artifact.id)}
            onToggleLike={() => { void engagementApi.toggleLike(artifact.id); }}
            onToggleSave={() => { void engagementApi.toggleSave(artifact.id); }}
            onOpenComments={() => {
              setSheetId(artifact.id);
              setCommentsOpen(true);
            }}
            onOpenShare={() => {
              setSheetId(artifact.id);
              setShareOpen(true);
            }}
            onOpenReel={() => setReelId(artifact.id)}
          />
        )}
      />

      {reelId && (
        <ReelsScreen
          items={reelCards.length > 0 ? reelCards : postCards.filter((a) => detectFeedArtifactKind(a) === 'reel')}
          initialId={reelId}
          handle={handle}
          logoUrl={logoUrl}
          onClose={() => setReelId(null)}
          onOpenCamera={() => {
            setReelId(null);
            navigate('new-brief');
          }}
          getEngagement={engagementApi.get}
          onToggleLike={(id) => { void engagementApi.toggleLike(id); }}
          onToggleSave={(id) => { void engagementApi.toggleSave(id); }}
          onOpenComments={(id) => {
            setSheetId(id);
            setCommentsOpen(true);
          }}
          onOpenShare={(id) => {
            setSheetId(id);
            setShareOpen(true);
          }}
          sheetOpen={commentsOpen || shareOpen}
        />
      )}

      <CommentsBottomSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        comments={sheetId ? engagementApi.getComments(sheetId) : []}
        onSubmit={(text) => { if (sheetId) void engagementApi.addComment(sheetId, text); }}
      />
      <ShareBottomSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title={shareVm?.content.headline || handle}
        shareText={shareVm?.content.caption}
      />
    </div>
  );
}

export function ProfilePostsFeed() {
  return (
    <MediaPlaybackProvider>
      <ProfilePostsFeedInner />
    </MediaPlaybackProvider>
  );
}

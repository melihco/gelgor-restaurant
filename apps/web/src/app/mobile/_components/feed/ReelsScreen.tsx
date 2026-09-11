'use client';

/**
 * Full-screen Reels pager — CSS scroll-snap + visibility-gated playback.
 * Opens from feed reel tap; starts at the selected artifact.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { OutputArtifact } from '@/types';
import { getImmersivePortalRoot } from '../mobile-client-config';
import { artifactToNativeContent, type NativeContentData } from '../platform-native-previews';
import { DoubleTapHeart } from './DoubleTapHeart';
import { useMediaPlayback } from './media-playback-context';
import type { FeedEngagementState } from './types';
import {
  IgAudioDisc,
  IgBookmark,
  IgCamera,
  IgChevronLeft,
  IgComment,
  IgHeart,
  IgMoreDots,
  IgPaperPlane,
  igIconHit,
} from './ig-native-icons';

export interface ReelsScreenProps {
  items: OutputArtifact[];
  initialId: string;
  handle: string;
  logoUrl?: string;
  onClose: () => void;
  getEngagement: (id: string) => FeedEngagementState;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
  onOpenComments: (id: string) => void;
  onOpenShare: (id: string) => void;
  onOpenCamera?: () => void;
  sheetOpen?: boolean;
  missionIdeationLookup?: ReadonlyMap<string, string>;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}B`;
  return n.toLocaleString('tr-TR');
}

function ReelSlide({
  artifact,
  content,
  handle,
  logoUrl,
  active,
  muted,
  pausedByUi,
  engagement,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onOpenShare,
  onToggleMute,
  onTogglePause,
  onMore,
}: {
  artifact: OutputArtifact;
  content: NativeContentData;
  handle: string;
  logoUrl?: string;
  active: boolean;
  muted: boolean;
  pausedByUi: boolean;
  engagement: FeedEngagementState;
  onToggleLike: () => void;
  onToggleSave: () => void;
  onOpenComments: () => void;
  onOpenShare: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onMore: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef(0);
  const [heartBurst, setHeartBurst] = useState(0);
  const [showPauseIcon, setShowPauseIcon] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const h = handle.startsWith('@') ? handle : `@${handle}`;
  const { registerController } = useMediaPlayback();

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    return registerController(artifact.id, () => {
      el.pause();
    });
  }, [artifact.id, registerController]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    if (active && !pausedByUi) {
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [active, muted, pausedByUi, content.videoUrl]);

  useEffect(() => {
    const el = videoRef.current;
    const bar = progressRef.current;
    if (!el || !bar || !active) return;
    let raf = 0;
    const tick = () => {
      const pct = el.duration ? (el.currentTime / el.duration) * 100 : 0;
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, pct / 100))})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, content.videoUrl]);

  const onMediaTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (!engagement.isLiked) onToggleLike();
      setHeartBurst((n) => n + 1);
      return;
    }
    lastTapRef.current = now;
    window.setTimeout(() => {
      if (Date.now() - lastTapRef.current >= 260) {
        onTogglePause();
        setShowPauseIcon(true);
        window.setTimeout(() => setShowPauseIcon(false), 500);
      }
    }, 280);
  };

  return (
    <section
      className="sa-reels-slide"
      data-artifact-id={artifact.id}
      aria-label={`Reel — ${h}`}
    >
      {content.videoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef}
          src={content.videoUrl}
          poster={content.imageUrl ?? undefined}
          playsInline
          loop
          muted={muted}
          preload={active ? 'auto' : 'metadata'}
          onClick={onMediaTap}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            background: '#000',
          }}
        />
      ) : content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.imageUrl}
          alt=""
          onClick={onMediaTap}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0a0a0a', color: 'rgba(255,255,255,0.5)',
          fontSize: 13, fontWeight: 600,
        }}>
          Video hazırlanıyor
        </div>
      )}

      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 42%, rgba(0,0,0,0.28) 100%)',
        }}
      />

      <DoubleTapHeart visible={heartBurst > 0} key={heartBurst} />

      {showPauseIcon && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none', zIndex: 30,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%', background: 'rgba(0,0,0,0.42)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {pausedByUi ? (
              <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><polygon points="8 5 19 12 8 19 8 5" /></svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff">
                <rect x="6" y="5" width="4.5" height="14" rx="1" />
                <rect x="13.5" y="5" width="4.5" height="14" rx="1" />
              </svg>
            )}
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute',
        right: 6,
        bottom: 'max(92px, calc(env(safe-area-inset-bottom) + 78px))',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
          border: '1.5px solid #fff', background: '#222',
        }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 800, color: '#fff', fontSize: 14,
            }}>
              {h.replace('@', '')[0]?.toUpperCase()}
            </div>
          )}
        </div>

        <ReelRailBtn
          label={formatCount(engagement.likeCount)}
          ariaLabel={engagement.isLiked ? 'Beğeniyi kaldır' : 'Beğen'}
          onClick={onToggleLike}
        >
          <IgHeart filled={engagement.isLiked} />
        </ReelRailBtn>
        <ReelRailBtn
          label={formatCount(engagement.commentCount)}
          ariaLabel="Yorumlar"
          onClick={onOpenComments}
        >
          <IgComment />
        </ReelRailBtn>
        <ReelRailBtn
          label={formatCount(engagement.shareCount)}
          ariaLabel="Gönder"
          onClick={onOpenShare}
        >
          <IgPaperPlane />
        </ReelRailBtn>
        <ReelRailBtn
          ariaLabel={engagement.isSaved ? 'Kaydı kaldır' : 'Kaydet'}
          onClick={onToggleSave}
        >
          <IgBookmark filled={engagement.isSaved} />
        </ReelRailBtn>
        <button type="button" aria-label="Diğer" onClick={onMore} style={igIconHit}>
          <IgMoreDots />
        </button>
        <button
          type="button"
          aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
          onClick={onToggleMute}
          style={{ ...igIconHit, height: 52 }}
        >
          <IgAudioDisc spinning={active && !pausedByUi && !muted} coverUrl={logoUrl} />
        </button>
      </div>

      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: 'rgba(255,255,255,0.22)',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <div
          ref={progressRef}
          className="sa-reels-progress-fill"
          style={{
            height: '100%',
            width: '100%',
            background: '#fff',
            transformOrigin: 'left center',
            transform: 'scaleX(0)',
          }}
        />
      </div>

      <div style={{
        position: 'absolute',
        left: 14,
        right: 72,
        bottom: 'max(28px, calc(env(safe-area-inset-bottom) + 20px))',
        zIndex: 15,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: '#fff',
            textShadow: '0 1px 3px rgba(0,0,0,0.55)',
          }}>
            {h}
          </span>
        </div>
        {content.caption && (
          <button
            type="button"
            onClick={() => setCaptionExpanded((v) => !v)}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              textAlign: 'left', width: '100%',
            }}
          >
            <p style={{
              fontSize: 14, color: 'rgba(255,255,255,0.92)', margin: 0, lineHeight: 1.45,
              display: captionExpanded ? 'block' : '-webkit-box',
              WebkitLineClamp: captionExpanded ? undefined : 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 1px 4px rgba(0,0,0,0.55)',
            }}>
              {content.caption}
            </p>
            {!captionExpanded && content.caption.length > 90 && (
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
                devamını gör
              </span>
            )}
          </button>
        )}
        {(content.music || content.hashtags.length > 0) && (
          <div style={{
            marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.75)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span aria-hidden>♪</span>
            <span style={{
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {content.music || content.hashtags.slice(0, 3).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function ReelRailBtn({
  label,
  ariaLabel,
  onClick,
  children,
}: {
  label?: string;
  ariaLabel: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={ariaLabel} onClick={onClick} style={{
      ...igIconHit,
      flexDirection: 'column',
      height: 'auto',
      minHeight: 44,
      gap: 2,
    }}>
      {children}
      {label != null && (
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          lineHeight: 1.1,
        }}>
          {label}
        </span>
      )}
    </button>
  );
}

export function ReelsScreen({
  items,
  initialId,
  handle,
  logoUrl,
  onClose,
  getEngagement,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onOpenShare,
  onOpenCamera,
  sheetOpen = false,
  missionIdeationLookup,
}: ReelsScreenProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState(initialId);
  const [paused, setPaused] = useState(false);
  const { preferUnmuted, setPreferUnmuted, setGloballyPaused, pauseAll } = useMediaPlayback();
  const muted = !preferUnmuted;

  const startIndex = useMemo(
    () => Math.max(0, items.findIndex((a) => a.id === initialId)),
    [items, initialId],
  );

  const contents = useMemo(
    () => items.map((a) => ({
      artifact: a,
      content: artifactToNativeContent(a, missionIdeationLookup),
    })),
    [items, missionIdeationLookup],
  );

  useEffect(() => {
    setGloballyPaused(true);
    pauseAll();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('sa-reels-open');
    document.body.classList.add('sa-reels-open');
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.classList.remove('sa-reels-open');
      document.body.classList.remove('sa-reels-open');
      setGloballyPaused(false);
    };
  }, [setGloballyPaused, pauseAll]);

  useEffect(() => {
    setPaused(sheetOpen);
  }, [sheetOpen]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-artifact-id="${initialId}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ block: 'start' });
    }
  }, [initialId]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const slides = Array.from(root.querySelectorAll<HTMLElement>('.sa-reels-slide'));
    const obs = new IntersectionObserver(
      (entries) => {
        let best: { id: string; ratio: number } | null = null;
        for (const entry of entries) {
          const id = entry.target.getAttribute('data-artifact-id');
          if (!id) continue;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            if (!best || entry.intersectionRatio > best.ratio) {
              best = { id, ratio: entry.intersectionRatio };
            }
          }
        }
        if (best) {
          setActiveId(best.id);
          setPaused(false);
        }
      },
      { root, threshold: [0.55, 0.65, 0.8, 1] },
    );
    slides.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [contents.length]);

  const onNearEnd = useCallback(() => {
    /* Pagination hook — parent FeedLazyPostList + artifact pool already loads ahead.
       TODO(backend): dedicated reels cursor pagination when feed grows. */
  }, []);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const onScroll = () => {
      const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
      if (remaining < root.clientHeight * 1.5) onNearEnd();
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [onNearEnd]);

  if (typeof window === 'undefined') return null;

  return createPortal(
    <div className="sa-reels-root" role="dialog" aria-modal="true" aria-label="Reels">
      <div style={{
        position: 'absolute',
        top: 'max(6px, env(safe-area-inset-top))',
        left: 4,
        right: 4,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Geri"
          style={{ ...igIconHit, pointerEvents: 'auto' }}
        >
          <IgChevronLeft />
        </button>
        <span style={{
          fontSize: 17, fontWeight: 700, color: '#fff',
          textShadow: '0 1px 4px rgba(0,0,0,0.55)', pointerEvents: 'none',
          letterSpacing: '-0.02em',
        }}>
          Reels
        </span>
        <button
          type="button"
          onClick={onOpenCamera}
          aria-label="Reel çek"
          style={{ ...igIconHit, pointerEvents: onOpenCamera ? 'auto' : 'none', opacity: onOpenCamera ? 1 : 0 }}
        >
          <IgCamera />
        </button>
      </div>

      <div ref={scrollerRef} className="sa-reels-scroller">
        {contents.map(({ artifact, content }, index) => {
          const near = Math.abs(index - startIndex) <= 1 || artifact.id === activeId;
          if (!near && Math.abs(index - contents.findIndex((c) => c.artifact.id === activeId)) > 1) {
            /* Keep DOM for snap smoothness but light preload only for neighbors */
          }
          const shouldPreload = Math.abs(
            index - contents.findIndex((c) => c.artifact.id === activeId),
          ) <= 1;
          return (
            <ReelSlide
              key={artifact.id}
              artifact={artifact}
              content={shouldPreload || artifact.id === activeId ? content : { ...content, videoUrl: content.videoUrl }}
              handle={handle}
              logoUrl={logoUrl}
              active={artifact.id === activeId}
              muted={muted}
              pausedByUi={paused || sheetOpen}
              engagement={getEngagement(artifact.id)}
              onToggleLike={() => onToggleLike(artifact.id)}
              onToggleSave={() => onToggleSave(artifact.id)}
              onOpenComments={() => onOpenComments(artifact.id)}
              onOpenShare={() => onOpenShare(artifact.id)}
              onToggleMute={() => setPreferUnmuted(muted)}
              onTogglePause={() => setPaused((p) => !p)}
              onMore={() => onOpenShare(artifact.id)}
            />
          );
        })}
        {contents.length === 0 && (
          <div className="sa-reels-slide" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.6)', fontSize: 15,
          }}>
            Gösterilecek Reel yok
          </div>
        )}
      </div>
    </div>,
    getImmersivePortalRoot(),
  );
}

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
            objectFit: 'contain',
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
            objectFit: 'contain',
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

      {showPauseIcon && pausedByUi && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', pointerEvents: 'none', zIndex: 30,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><polygon points="8 5 19 12 8 19 8 5" /></svg>
          </div>
        </div>
      )}

      <div
        ref={progressRef}
        className="sa-reels-progress-fill"
        style={{
          position: 'absolute',
          top: 'max(8px, env(safe-area-inset-top))',
          left: 0,
          right: 0,
          height: 2,
          background: 'rgba(255,255,255,0.85)',
          transformOrigin: 'left center',
          transform: 'scaleX(0)',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      />

      <div style={{
        position: 'absolute',
        right: 10,
        bottom: 'max(88px, calc(env(safe-area-inset-bottom) + 72px))',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
      }}>
        <div style={{ position: 'relative', marginBottom: 4 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid #fff', background: '#222',
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
        </div>

        <ActionBtn
          label={formatCount(engagement.likeCount)}
          ariaLabel={engagement.isLiked ? 'Beğeniyi kaldır' : 'Beğen'}
          onClick={onToggleLike}
          active={engagement.isLiked}
          heart
        />
        <ActionBtn
          label={formatCount(engagement.commentCount)}
          ariaLabel="Yorumlar"
          onClick={onOpenComments}
          comment
        />
        <ActionBtn label="Paylaş" ariaLabel="Paylaş" onClick={onOpenShare} share />
        <ActionBtn
          label={engagement.isSaved ? 'Kaydedildi' : 'Kaydet'}
          ariaLabel={engagement.isSaved ? 'Kaydı kaldır' : 'Kaydet'}
          onClick={onToggleSave}
          saved={engagement.isSaved}
          bookmark
        />
        <button
          type="button"
          aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
          onClick={onToggleMute}
          style={iconBtnStyle}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      <div style={{
        position: 'absolute',
        left: 14,
        right: 72,
        bottom: 'max(28px, calc(env(safe-area-inset-bottom) + 20px))',
        zIndex: 15,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{h}</span>
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

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  color: '#fff',
  minWidth: 44,
  minHeight: 44,
  justifyContent: 'center',
};

function ActionBtn({
  label,
  ariaLabel,
  onClick,
  heart,
  comment,
  share,
  bookmark,
  saved,
  active,
}: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  heart?: boolean;
  comment?: boolean;
  share?: boolean;
  bookmark?: boolean;
  saved?: boolean;
  active?: boolean;
}) {
  return (
    <button type="button" aria-label={ariaLabel} onClick={onClick} style={iconBtnStyle}>
      {heart && (
        <svg width="28" height="28" viewBox="0 0 24 24" fill={active ? '#FF3040' : 'none'} stroke={active ? '#FF3040' : '#fff'} strokeWidth="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      )}
      {comment && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      )}
      {share && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
          <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      )}
      {bookmark && (
        <svg width="26" height="26" viewBox="0 0 24 24" fill={saved ? '#fff' : 'none'} stroke="#fff" strokeWidth="2">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      )}
      <span style={{ fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>{label}</span>
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
    return () => {
      document.body.style.overflow = prev;
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
        top: 'max(10px, env(safe-area-inset-top))',
        left: 12,
        right: 12,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        pointerEvents: 'none',
      }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Reels kapat"
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none',
            background: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 20,
            cursor: 'pointer', pointerEvents: 'auto', lineHeight: 1,
          }}
        >
          ←
        </button>
        <span style={{
          fontSize: 16, fontWeight: 700, color: '#fff',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)', pointerEvents: 'none',
        }}>
          Reels
        </span>
        <div style={{ width: 44 }} aria-hidden />
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

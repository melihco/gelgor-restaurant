'use client';
/**
 * Platform-native preview components — Instagram / TikTok / X pixel-faithful layouts.
 * Shared by PlatformFeed and PlatformPreviewStudio.
 */
import React, { useRef, useState, useEffect } from 'react';
import type { OutputArtifact } from '@/types';
import { parseArtifactContent, resolveArtifact, resolveCarouselUrls, normalizeHashtags } from './artifact-utils';
import { resolveClientMediaUrl } from '@/lib/media-url';
import {
  resolveBrandedPostUrl,
  resolvePosterUrl,
  resolveStoryVideoUrl,
  resolveStoryVideoClientUrl,
} from '@/lib/production-bundle';

export type PreviewPlatform = 'instagram' | 'tiktok' | 'x';
export type PreviewMode = 'feed' | 'reel' | 'story' | 'carousel';

export interface NativeContentData {
  imageUrl: string | null;
  videoUrl: string | null;
  caption: string;
  hashtags: string[];
  cta: string;
  headline: string;
  kind: string;
  music?: string;
  location?: string;
  carouselUrls?: string[];
  templateId?: string;
  compositionId?: string;
  grafikerScore?: number | null;
}

/** Feed preview video — decode/play only when visible in the scroll viewport. */
function VisibilityGatedVideo({
  src,
  loop = false,
  poster,
  style,
  onError,
  onEnded,
}: {
  src: string;
  loop?: boolean;
  poster?: string;
  style?: React.CSSProperties;
  onError?: () => void;
  onEnded?: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const syncPlayback = (inView: boolean) => {
      if (inView) {
        void el.play().catch(() => undefined);
      } else {
        el.pause();
      }
    };

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        syncPlayback(entry.isIntersecting && entry.intersectionRatio >= 0.25);
      },
      { threshold: [0, 0.25, 0.5] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [src]);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={ref}
      src={src}
      poster={poster}
      loop={loop}
      muted
      playsInline
      preload="metadata"
      onError={onError}
      onEnded={onEnded}
      style={style}
    />
  );
}

export function artifactToNativeContent(artifact: OutputArtifact): NativeContentData {
  const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
  const c = parseArtifactContent(artifact.content);
  const m = (artifact.metadata ?? {}) as Record<string, unknown>;

  const videoUrl = resolveStoryVideoUrl(artifact)
    ?? resolveClientMediaUrl(
      (c.videoUrl as string) || (m.videoUrl as string) || (m.video_url as string)
      || (artifact.contentUrl?.match(/\.(mp4|webm|mov)/i) ? artifact.contentUrl : null),
    );

  const branded = resolveClientMediaUrl(resolveBrandedPostUrl(artifact));
  const poster = resolveClientMediaUrl(resolvePosterUrl(artifact));

  const carouselUrls = resolveCarouselUrls(c, m)
    .map((u) => resolveClientMediaUrl(u) ?? u)
    .filter(Boolean);

  let imageUrl = branded ?? poster;
  if (!imageUrl) {
    imageUrl = resolveClientMediaUrl(resolved?.imageUrl)
      ?? resolveClientMediaUrl((c.imageUrl as string) || (m.imageUrl as string))
      ?? resolveClientMediaUrl(
        !videoUrl && artifact.contentUrl && !/\.(mp4|webm|mov)(\?|$)/i.test(artifact.contentUrl)
          ? artifact.contentUrl
          : null,
      );
  }
  if (videoUrl && poster) imageUrl = poster;
  if (carouselUrls.length >= 2) imageUrl = carouselUrls[0] ?? imageUrl;

  const hashtags = normalizeHashtags(c.hashtags ?? m.hashtags ?? resolved?.hashtags ?? [], 10);

  return {
    imageUrl,
    videoUrl,
    caption: String(resolved?.caption || c.caption || m.caption || ''),
    hashtags,
    cta: String(resolved?.cta || c.cta || m.cta || ''),
    headline: String(resolved?.headline || c.headline || m.headline || artifact.title || ''),
    kind: String(resolved?.contentType || c.kind || c.contentType || m.kind || ''),
    music: String(m.music || c.music || ''),
    location: String(m.location || c.location || ''),
    carouselUrls: carouselUrls.length >= 2 ? carouselUrls : undefined,
    templateId: String(m.template_id || m.posterTemplateId || c.templateId || c.posterTemplateId || ''),
    compositionId: String(m.compositionId || c.compositionId || ''),
    grafikerScore: typeof m.grafiker_score === 'number' ? m.grafiker_score : null,
  };
}

export function detectPreviewMode(artifact: OutputArtifact, kind: string): PreviewMode {
  const c = parseArtifactContent(artifact.content);
  const m = (artifact.metadata ?? {}) as Record<string, unknown>;
  if (resolveCarouselUrls(c, m).length >= 2) return 'carousel';
  if (kind === 'reel' || kind === 'video') return 'reel';
  if (kind === 'story') return 'story';
  return 'feed';
}

// ─── Story progress ───────────────────────────────────────────────────────────
function StoryProgressBar({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 2, borderRadius: 2,
          background: i < active ? '#fff' : i === active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)' }} />
      ))}
    </div>
  );
}

function ActionRail({ likes, comments, color = '#fff', onLike, liked }: {
  likes: number; comments: number; color?: string; onLike: () => void; liked: boolean;
}) {
  const actions = [
    { label: liked ? likes + 1 : likes, onClick: onLike, heart: true },
    { label: comments, onClick: undefined, heart: false },
    { label: 'Paylaş', onClick: undefined, heart: false },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      {actions.map((a, i) => (
        <button key={i} type="button" onClick={a.onClick}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {a.heart ? (
            <svg width="28" height="28" viewBox="0 0 24 24"
              fill={liked ? '#E1306C' : 'none'}
              stroke={liked ? '#E1306C' : color} strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          ) : i === 1 ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          )}
          <span style={{ fontSize: 12, color, fontWeight: 600,
            textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
            {typeof a.label === 'number' ? a.label.toLocaleString('tr-TR') : a.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function AvatarRing({ logoUrl, handle, size = 34 }: { logoUrl?: string; handle: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      padding: 2, background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%',
        border: '2px solid #000', overflow: 'hidden', background: '#222',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.35, fontWeight: 800, color: '#fff' }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : handle.replace('@', '')[0]?.toUpperCase()}
      </div>
    </div>
  );
}

// ─── Instagram Feed Post ──────────────────────────────────────────────────────
export function InstagramFeedNative({ content, handle, logoUrl, isPending, timeLabel }: {
  content: NativeContentData; handle: string; logoUrl?: string; isPending?: boolean; timeLabel?: string;
}) {
  const [liked, setLiked] = useState(true);
  const [slide, setSlide] = useState(0);
  const images = content.carouselUrls?.length ? content.carouselUrls : content.imageUrl ? [content.imageUrl] : [];
  const current = images[slide] ?? null;

  return (
    <div style={{ background: '#000' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <AvatarRing logoUrl={logoUrl} handle={handle} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{handle.startsWith('@') ? handle : `@${handle}`}</div>
          {content.location && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{content.location}</div>}
        </div>
        {isPending && (
          <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10,
            background: 'rgba(245,158,11,0.2)', color: '#F59E0B', fontWeight: 700 }}>Bekliyor</span>
        )}
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 20 }}>···</span>
      </div>

      <div style={{ aspectRatio: '4/5', background: '#111', position: 'relative', overflow: 'hidden' }}
        onTouchStart={(e) => { (e.currentTarget as any)._tx = e.touches[0]?.clientX; }}
        onTouchEnd={(e) => {
          const tx = (e.currentTarget as any)._tx;
          const dx = (e.changedTouches[0]?.clientX ?? 0) - (tx ?? 0);
          if (images.length > 1 && dx < -40 && slide < images.length - 1) setSlide(slide + 1);
          if (images.length > 1 && dx > 40 && slide > 0) setSlide(slide - 1);
        }}>
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="" referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: isPending
              ? 'linear-gradient(135deg, #141820 0%, #0a0c12 100%)'
              : 'linear-gradient(135deg, #1a1a2e, #16213e)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
          }}>
            {isPending && (
              <>
                <div className="feed-skel-shimmer" style={{
                  width: '72%', height: '58%', borderRadius: 4,
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                  Görsel hazırlanıyor…
                </span>
              </>
            )}
          </div>
        )}
        {images.length > 1 && (
          <>
            <div style={{ position: 'absolute', top: 12, right: 12, padding: '4px 10px', borderRadius: 12,
              background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
              {slide + 1}/{images.length}
            </div>
            <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 5 }}>
              {images.map((_, i) => (
                <div key={i} style={{ width: i === slide ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === slide ? '#fff' : 'rgba(255,255,255,0.4)' }} />
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button type="button" onClick={() => setLiked((l) => !l)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill={liked ? '#E1306C' : 'none'}
            stroke={liked ? '#E1306C' : 'rgba(255,255,255,0.9)'} strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        <div style={{ marginLeft: 'auto' }}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
      </div>

      <div style={{ padding: '0 14px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          {(liked ? 2847 : 2846).toLocaleString('tr-TR')} beğeni
        </div>
        {content.caption && (
          <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.55 }}>
            <span style={{ fontWeight: 700 }}>{handle.startsWith('@') ? handle : `@${handle}`}</span>{' '}
            <span style={{ color: 'rgba(255,255,255,0.85)' }}>{content.caption}</span>
          </div>
        )}
        {content.hashtags.length > 0 && (
          <div style={{ fontSize: 14, color: '#60A5FA', marginTop: 4, lineHeight: 1.6 }}>
            {content.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ')}
          </div>
        )}
        {timeLabel && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>{timeLabel}</div>}
      </div>
    </div>
  );
}

// ─── Instagram Reel ─────────────────────────────────────────────────────────────
export function InstagramReelNative({ content, handle, logoUrl, isPending }: {
  content: NativeContentData; handle: string; logoUrl?: string; isPending?: boolean;
}) {
  const [liked, setLiked] = useState(true);
  const h = handle.startsWith('@') ? handle : `@${handle}`;

  return (
    <div style={{ position: 'relative', background: '#000', aspectRatio: '9/16', maxHeight: '85vh', overflow: 'hidden' }}>
      {content.videoUrl ? (
        <VisibilityGatedVideo
          src={content.videoUrl}
          loop
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%, rgba(0,0,0,0.35) 100%)' }} />

      <div style={{ position: 'absolute', top: 12, left: 14, right: 14, zIndex: 5,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Reels</span>
        {isPending && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: 'rgba(245,158,11,0.85)', color: '#000', fontWeight: 700 }}>Bekliyor</span>}
      </div>

      <div style={{ position: 'absolute', right: 12, bottom: 80, zIndex: 5 }}>
        <ActionRail likes={18400} comments={342} onLike={() => setLiked((l) => !l)} liked={liked} />
      </div>

      <div style={{ position: 'absolute', bottom: 16, left: 14, right: 64, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <AvatarRing logoUrl={logoUrl} handle={h} size={32} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{h}</span>
        </div>
        {content.caption && (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', margin: 0, lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {content.caption}
          </p>
        )}
      </div>
    </div>
  );
}

/** Tam ekran story — 9:16 çerçeveyi doldurur; yatay görsellerde blur arka plan + ortada tam görüntü. */
export function StoryFullscreenImage({ src, style }: {
  src: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'center',
          filter: 'blur(28px) brightness(0.4)', transform: 'scale(1.12)',
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'contain', objectPosition: 'center',
        }}
      />
    </div>
  );
}

/** Designed story still (Remotion poster) — single cover layer, no blur ghost. */
export function StoryCoverImage({ src, style }: {
  src: string;
  style?: React.CSSProperties;
}) {
  const { objectFit: _ignored, ...rest } = style ?? {};
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        objectFit: 'cover', objectPosition: 'center',
        ...rest,
      }}
    />
  );
}

// Story preview: play once then hold last frame — looping re-triggers intro text motion (jitter).
export function StoryPreviewVideo({ src, poster, style }: {
  src: string;
  poster?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    setVideoFailed(false);
    setVideoReady(false);
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el || videoFailed) return;

    const tryPlay = () => {
      void el.play().catch(() => undefined);
    };

    tryPlay();

    const syncPlayback = (inView: boolean) => {
      if (inView) {
        tryPlay();
      } else {
        el.pause();
      }
    };

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        syncPlayback(entry.isIntersecting && entry.intersectionRatio >= 0.1);
      },
      { threshold: [0, 0.1, 0.25, 0.5] },
    );
    obs.observe(el);

    const failTimer = window.setTimeout(() => {
      if (!videoReady && el.readyState < 2) {
        setVideoFailed(true);
      }
    }, 8000);

    return () => {
      window.clearTimeout(failTimer);
      obs.disconnect();
    };
  }, [src, videoFailed, videoReady]);

  const confirmVideoReady = () => {
    const v = ref.current;
    if (!v || v.videoWidth <= 0 || v.videoHeight <= 0) {
      setVideoFailed(true);
      return;
    }
    setVideoReady(true);
  };

  if (videoFailed) {
    if (poster) {
      return <StoryCoverImage src={poster} style={style} />;
    }
    return (
      <div style={{
        ...style,
        background: 'linear-gradient(160deg, #1a1a2e 0%, #0d0d14 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.35)',
        fontSize: 13,
        fontWeight: 600,
      }}>
        Video yüklenemedi
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      ...style,
    }}>
      {poster ? (
        <StoryCoverImage
          src={poster}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 0,
          }}
        />
      ) : null}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        playsInline
        autoPlay
        preload="auto"
        crossOrigin="anonymous"
        onError={() => setVideoFailed(true)}
        onLoadedData={confirmVideoReady}
        onCanPlay={confirmVideoReady}
        onPlaying={confirmVideoReady}
        onEnded={() => {
          const v = ref.current;
          if (!v || !Number.isFinite(v.duration)) return;
          v.pause();
          v.currentTime = Math.max(0, v.duration - 0.04);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          zIndex: 1,
          opacity: videoReady ? 1 : 0,
          transition: 'opacity 180ms ease',
        }}
      />
    </div>
  );
}

// ─── Instagram Story (image + Remotion video) ─────────────────────────────────
export function InstagramStoryNative({ content, handle, logoUrl, isPending }: {
  content: NativeContentData; handle: string; logoUrl?: string; isPending?: boolean;
}) {
  const h = handle.startsWith('@') ? handle : `@${handle}`;

  return (
    <div style={{ position: 'relative', background: '#000', aspectRatio: '9/16', maxHeight: '85vh', overflow: 'hidden' }}>
      {content.videoUrl ? (
        <StoryPreviewVideo
          src={content.videoUrl}
          poster={content.imageUrl ?? undefined}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : content.imageUrl ? (
        <StoryCoverImage src={content.imageUrl} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#3a1040,#0d0515)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.55) 100%)' }} />

      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '10px 12px 0' }}>
        <StoryProgressBar count={1} active={0} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <AvatarRing logoUrl={logoUrl} handle={h} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{h}</span>
            {content.templateId && (
              <span style={{ fontSize: 10, marginLeft: 8, color: 'rgba(157,190,206,0.9)', fontWeight: 600 }}>
                {content.templateId.replace(/^remotion_|^poster_/i, '').replace(/_/g, ' ')}
              </span>
            )}
          </div>
          {isPending && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(245,158,11,0.85)', color: '#000', fontWeight: 700 }}>Bekliyor</span>}
        </div>
      </div>

      {content.cta && (
        <div style={{ position: 'absolute', bottom: '28%', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
          <div style={{ padding: '10px 24px', borderRadius: 24, background: 'rgba(255,255,255,0.92)',
            color: '#000', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {content.cta}
          </div>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 16, left: 12, right: 12, zIndex: 10 }}>
        <div style={{ flex: 1, padding: '11px 16px', borderRadius: 24,
          border: '1.5px solid rgba(255,255,255,0.4)', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
          Yanıtla…
        </div>
      </div>

      {content.grafikerScore != null && content.grafikerScore >= 7 && (
        <div style={{ position: 'absolute', top: 56, right: 12, zIndex: 12, padding: '3px 8px', borderRadius: 8,
          background: content.grafikerScore >= 8 ? 'rgba(16,185,129,0.8)' : 'rgba(245,158,11,0.8)',
          color: '#fff', fontSize: 10, fontWeight: 800 }}>
          ★ {content.grafikerScore}/10
        </div>
      )}
    </div>
  );
}

// ─── TikTok ───────────────────────────────────────────────────────────────────
export function TikTokNative({ content, handle, logoUrl, isPending }: {
  content: NativeContentData; handle: string; logoUrl?: string; isPending?: boolean;
}) {
  const [liked, setLiked] = useState(true);
  const h = handle.startsWith('@') ? handle : `@${handle}`;

  return (
    <div style={{ position: 'relative', background: '#010101', aspectRatio: '9/16', maxHeight: '85vh', overflow: 'hidden' }}>
      {content.videoUrl ? (
        <VisibilityGatedVideo
          src={content.videoUrl}
          loop
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.3) 100%)' }} />
      {isPending && (
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 5, fontSize: 10, padding: '3px 9px',
          borderRadius: 20, background: 'rgba(245,158,11,0.9)', color: '#000', fontWeight: 700 }}>Bekliyor</div>
      )}
      <div style={{ position: 'absolute', right: 10, bottom: 80, zIndex: 5 }}>
        <ActionRail likes={84200} comments={1240} onLike={() => setLiked((l) => !l)} liked={liked} />
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 64, zIndex: 5, padding: '0 14px 18px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{h}</div>
        {content.caption && <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', margin: '0 0 10px', lineHeight: 1.5 }}>{content.caption}</p>}
        {content.hashtags.length > 0 && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
            {content.hashtags.slice(0, 4).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── X / Twitter ──────────────────────────────────────────────────────────────
export function XNative({ content, handle, logoUrl, isPending }: {
  content: NativeContentData; handle: string; logoUrl?: string; isPending?: boolean;
}) {
  const [liked, setLiked] = useState(false);
  const h = handle.replace('@', '');
  const tweetText = [content.caption, content.hashtags.slice(0, 4).map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ')].filter(Boolean).join('\n\n');

  return (
    <div style={{ background: '#000', padding: '16px' }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: '#fff' }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : h[0]?.toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{h.charAt(0).toUpperCase() + h.slice(1)}</span>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>@{h}</span>
            {isPending && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 700 }}>Bekliyor</span>}
          </div>
          {tweetText && <p style={{ fontSize: 15, color: '#fff', lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{tweetText}</p>}
          {(content.imageUrl || content.videoUrl) && (
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.15)', marginBottom: 12, aspectRatio: '16/9', background: '#111' }}>
              {content.videoUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={content.videoUrl} controls muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : content.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={content.imageUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : null}
            </div>
          )}
          <div style={{ display: 'flex', gap: 20, paddingBottom: 8, borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
            <button type="button" onClick={() => setLiked((l) => !l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: liked ? '#E1306C' : 'rgba(255,255,255,0.4)', fontSize: 14 }}>
              ♥ {liked ? '2.9K' : '2.8K'}
            </button>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>💬 24</span>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>↻ 156</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Unified router ───────────────────────────────────────────────────────────
export function PlatformNativePreview({
  platform,
  mode,
  content,
  handle,
  logoUrl,
  isPending,
  timeLabel,
}: {
  platform: PreviewPlatform;
  mode: PreviewMode;
  content: NativeContentData;
  handle: string;
  logoUrl?: string;
  isPending?: boolean;
  timeLabel?: string;
}) {
  if (platform === 'tiktok') {
    return <TikTokNative content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} />;
  }
  if (platform === 'x') {
    return <XNative content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} />;
  }
  if (mode === 'reel') return <InstagramReelNative content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} />;
  if (mode === 'story') return <InstagramStoryNative content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} />;
  return <InstagramFeedNative content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} timeLabel={timeLabel} />;
}

export const PLATFORM_TABS: { id: PreviewPlatform; label: string; svgPath: string; activeBg: string }[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    svgPath: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
    activeBg: 'linear-gradient(45deg,rgba(240,148,51,0.85),rgba(220,39,67,0.85),rgba(188,24,136,0.85))',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    svgPath: 'M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.37 6.37 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.21a8.16 8.16 0 004.77 1.52V7.27a4.85 4.85 0 01-1-.58z',
    activeBg: 'rgba(238,29,82,0.2)',
  },
  {
    id: 'x',
    label: 'X',
    svgPath: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    activeBg: 'rgba(255,255,255,0.15)',
  },
];

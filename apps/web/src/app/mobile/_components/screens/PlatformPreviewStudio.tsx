'use client';
/**
 * PLATFORM PREVIEW STUDIO
 * Premium native mobile creative review experience.
 * Customers review AI-generated content exactly as it appears on each platform.
 */
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { resolveArtifact, parseArtifactContent } from '../artifact-utils';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { resolveBrandedPostUrl, resolvePosterUrl } from '@/lib/production-bundle';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { BoostPostSheet } from '../BoostPostSheet';
import type { OutputArtifact } from '@/types';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import {
  artifactToNativeContent,
  detectPreviewMode,
  PlatformNativePreview,
  PLATFORM_TABS,
  type PreviewPlatform,
} from '../platform-native-previews';

// ─── Types ────────────────────────────────────────────────────────────────────
type Platform = PreviewPlatform;
type IGSubMode = 'feed' | 'reel' | 'story';

interface ContentData {
  imageUrl: string | null;
  videoUrl: string | null;
  caption: string;
  hashtags: string[];
  cta: string;
  headline: string;
  kind: string;
  music?: string;
  location?: string;
}

function extractContent(artifact: OutputArtifact): ContentData {
  const resolved = resolveArtifact(artifact);
  const c = parseArtifactContent(artifact.content);
  const m = (artifact.metadata ?? {}) as Record<string, unknown>;

  const videoUrl = resolved.videoUrl
    ?? resolveClientMediaUrl(
      (c.videoUrl as string) || (m.videoUrl as string)
      || (artifact.contentUrl?.match(/\.(mp4|webm|mov)/i) ? artifact.contentUrl : null),
    );

  const imageUrl = resolved.imageUrl
    ?? resolveClientMediaUrl(resolveBrandedPostUrl(artifact))
    ?? resolveClientMediaUrl(resolvePosterUrl(artifact))
    ?? resolveClientMediaUrl(
      !videoUrl && artifact.contentUrl && !/\.(mp4|webm|mov)(\?|$)/i.test(artifact.contentUrl)
        ? artifact.contentUrl
        : null,
    );

  return {
    imageUrl,
    videoUrl,
    caption: resolved.caption || (c.caption as string) || (m.caption as string) || '',
    hashtags: (resolved.hashtags.length ? resolved.hashtags : ((c.hashtags ?? m.hashtags ?? []) as string[])).slice(0, 10),
    cta: resolved.cta || (c.cta as string) || (m.cta as string) || '',
    headline: resolved.headline || (c.headline as string) || (m.headline as string) || artifact.title || '',
    kind: resolved.contentType || (c.kind as string) || (c.contentType as string) || '',
    music: (m.music as string) || '',
    location: (m.location as string) || '',
  };
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const D = {
  bg: '#0a0a0f',
  surface: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.1)',
  textPrimary: '#f0f0f5',
  textSecondary: 'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.28)',
  accent: '#a78bfa',
  accentGlow: 'rgba(167,139,250,0.25)',
  danger: '#ef4444',
  success: '#10b981',
  gold: '#f59e0b',
};

// ─── Story Progress Bar ───────────────────────────────────────────────────────
function StoryProgressBar({ count, active }: { count: number; active: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, padding: '0 12px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 2, borderRadius: 2,
          background: i < active ? '#fff' : i === active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
          overflow: 'hidden' }}>
          {i === active && (
            <div style={{ height: '100%', background: '#fff', borderRadius: 2,
              animation: 'story-progress 5s linear forwards',
              width: '0%' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Platform Action Rail (shared for IG Reel + TikTok) ──────────────────────
function ActionRail({ likes, comments, color = '#fff', onLike, liked }: {
  likes: number; comments: number; color?: string; onLike: () => void; liked: boolean;
}) {
  const actions = [
    {
      label: liked ? likes + 1 : likes,
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24"
          fill={liked ? '#E1306C' : 'none'}
          stroke={liked ? '#E1306C' : color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      ), onClick: onLike,
    },
    {
      label: comments,
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
    {
      label: 'Paylaş',
      icon: (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
          stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      ),
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
      {actions.map((a, i) => (
        <button key={i} onClick={a.onClick}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          {a.icon}
          <span style={{ fontSize: 12, color, fontWeight: 600,
            textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
            {typeof a.label === 'number' ? a.label.toLocaleString('tr-TR') : a.label}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── INSTAGRAM FEED PREVIEW ───────────────────────────────────────────────────
function InstagramFeedPreview({ content, handle, logoUrl, isPending }: {
  content: ContentData; handle: string; logoUrl: string; isPending: boolean;
}) {
  const [liked, setLiked] = useState(true);
  const isCarousel = content.kind.includes('carousel');

  return (
    <div style={{ background: '#000', flex: 1, overflowY: 'auto' }}>
      {/* Creator header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          padding: 2, background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%',
            border: '2px solid #000', overflow: 'hidden', background: '#222',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : handle[0]?.toUpperCase()}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>@{handle}</div>
          {content.location && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{content.location}</div>}
        </div>
        {isPending && (
          <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 10,
            background: 'rgba(245,158,11,0.2)', color: '#F59E0B', fontWeight: 700, border: '0.5px solid rgba(245,158,11,0.3)' }}>
            Bekliyor
          </span>
        )}
        <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer', fontSize: 20, padding: 4 }}>···</button>
      </div>

      {/* Media — 4:5 portrait */}
      <div style={{ aspectRatio: '4/5', background: '#111', position: 'relative', overflow: 'hidden' }}>
        {content.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={content.imageUrl} alt="" referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg,rgba(225,48,108,0.12),rgba(131,58,180,0.08))' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9l4-4 4 4 4-4 4 4"/>
            </svg>
          </div>
        )}
        {/* Carousel dots */}
        {isCarousel && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 5 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: i === 0 ? 18 : 6, height: 6, borderRadius: 3,
                background: i === 0 ? '#fff' : 'rgba(255,255,255,0.4)',
                transition: 'width 200ms' }} />
            ))}
          </div>
        )}
      </div>

      {/* Action row */}
      <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button onClick={() => setLiked(l => !l)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
          <svg width="26" height="26" viewBox="0 0 24 24"
            fill={liked ? '#E1306C' : 'none'}
            stroke={liked ? '#E1306C' : 'rgba(255,255,255,0.9)'} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: liked ? 'scale(1.15)' : 'scale(1)', transition: 'transform 120ms' }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
      </div>

      {/* Likes + caption */}
      <div style={{ padding: '0 14px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          {(liked ? 2847 : 2846).toLocaleString('tr-TR')} beğeni
        </div>
        {content.caption && (
          <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.55 }}>
            <span style={{ fontWeight: 700 }}>{handle}</span>{' '}
            <span style={{ color: 'rgba(255,255,255,0.8)' }}>
              {content.caption.slice(0, 120)}{content.caption.length > 120 ? '… daha fazla' : ''}
            </span>
          </div>
        )}
        {content.hashtags.length > 0 && (
          <div style={{ fontSize: 14, color: '#60A5FA', marginTop: 4, lineHeight: 1.6 }}>
            {content.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>3 saat önce</div>
      </div>
    </div>
  );
}

// ─── INSTAGRAM REEL PREVIEW ───────────────────────────────────────────────────
function InstagramReelPreview({ content, handle, logoUrl, isPending }: {
  content: ContentData; handle: string; logoUrl: string; isPending: boolean;
}) {
  const [liked, setLiked] = useState(true);

  return (
    <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
      {/* Full-bleed background — video preferred for Runway reels */}
      {content.videoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={content.videoUrl} autoPlay loop muted playsInline
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" referrerPolicy="no-referrer"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, #1a0a20 0%, #0d0815 100%)' }} />
      )}

      {/* Scrim */}
      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.1) 50%, rgba(0,0,0,0.4) 100%)',
        pointerEvents: 'none' }} />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 12, left: 0, right: 0, zIndex: 5,
        padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>Reels</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isPending && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10,
              background: 'rgba(245,158,11,0.85)', color: '#000', fontWeight: 700 }}>Bekliyor</span>
          )}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
          </svg>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 5 }}>
        <div style={{ height: '100%', width: '38%', background: 'rgba(255,255,255,0.9)' }} />
      </div>

      {/* Right action rail */}
      <div style={{ position: 'absolute', right: 12, bottom: 90, zIndex: 5 }}>
        <ActionRail likes={18400} comments={342} onLike={() => setLiked(l => !l)} liked={liked} />
        {/* More */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 18, cursor: 'pointer' }}>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 22 }}>···</span>
        </div>
      </div>

      {/* Bottom left info */}
      <div style={{ position: 'absolute', bottom: 16, left: 14, right: 64, zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid #fff', background: '#333', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : handle[0]?.toUpperCase()}
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>@{handle}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: 6, padding: '2px 8px', fontWeight: 500 }}>Takip Et</span>
        </div>
        {content.caption && (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 1.45, margin: '0 0 8px',
            textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {content.caption}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {content.music || `Orijinal ses · @${handle}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── INSTAGRAM STORY PREVIEW ──────────────────────────────────────────────────
function InstagramStoryPreview({ content, handle, logoUrl, isPending }: {
  content: ContentData; handle: string; logoUrl: string; isPending: boolean;
}) {
  return (
    <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
      {content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" referrerPolicy="no-referrer"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg,#3a1040 0%,#1a0828 50%,#0d0515 100%)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.55) 100%)', pointerEvents: 'none' }} />

      {/* Story chrome */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: '10px 12px 0' }}>
        <StoryProgressBar count={3} active={1} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid #fff', background: '#333', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#fff' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : handle[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>@{handle}</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>3 sa</span>
          </div>
          {isPending && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(245,158,11,0.85)', color: '#000', fontWeight: 700 }}>Bekliyor</span>}
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 22, padding: 4 }}>×</button>
        </div>
      </div>

      {/* CTA sticker area */}
      {content.cta && (
        <div style={{ position: 'absolute', bottom: '28%', left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
          <div style={{ padding: '10px 24px', borderRadius: 24, background: 'rgba(255,255,255,0.92)',
            color: '#000', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {content.cta}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>
      )}

      {/* Reply bar */}
      <div style={{ position: 'absolute', bottom: 16, left: 12, right: 12, zIndex: 10 }}>
        {content.caption && (
          <p style={{ fontSize: 14, color: '#fff', textAlign: 'center', marginBottom: 12,
            textShadow: '0 1px 4px rgba(0,0,0,0.8)', lineHeight: 1.4 }}>
            {content.caption.slice(0, 80)}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, padding: '11px 16px', borderRadius: 24,
            border: '1.5px solid rgba(255,255,255,0.4)', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            Yanıtla…
          </div>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ─── INSTAGRAM PREVIEW (with sub-tabs) ───────────────────────────────────────
function InstagramPreview({ content, handle, logoUrl, isPending, initialSubMode = 'feed' }: {
  content: ContentData; handle: string; logoUrl: string; isPending: boolean;
  initialSubMode?: IGSubMode;
}) {
  const [subMode, setSubMode] = useState<IGSubMode>(initialSubMode);
  // Sync when parent detects kind from loaded artifact
  const prevInitRef = useRef(initialSubMode);
  if (prevInitRef.current !== initialSubMode) {
    prevInitRef.current = initialSubMode;
    setSubMode(initialSubMode);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {subMode === 'feed'  && <InstagramFeedPreview  content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} />}
      {subMode === 'reel'  && <InstagramReelPreview  content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} />}
      {subMode === 'story' && <InstagramStoryPreview content={content} handle={handle} logoUrl={logoUrl} isPending={isPending} />}
    </div>
  );
}

// ─── TIKTOK PREVIEW ───────────────────────────────────────────────────────────
function TikTokPreview({ content, handle, logoUrl, isPending }: {
  content: ContentData; handle: string; logoUrl: string; isPending: boolean;
}) {
  const [liked, setLiked] = useState(true);
  const music = content.music || `Orijinal ses · @${handle}`;

  return (
    <div style={{ flex: 1, position: 'relative', background: '#010101', overflow: 'hidden' }}>
      {content.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageUrl} alt="" referrerPolicy="no-referrer"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 30% 40%, rgba(105,201,208,0.12) 0%, rgba(238,29,82,0.08) 60%, #010101 100%)' }} />
      )}

      <div style={{ position: 'absolute', inset: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.2) 40%, rgba(0,0,0,0.3) 100%)',
        pointerEvents: 'none' }} />

      {isPending && (
        <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 5,
          fontSize: 10, padding: '3px 9px', borderRadius: 20,
          background: 'rgba(245,158,11,0.9)', color: '#000', fontWeight: 700 }}>Bekliyor</div>
      )}

      {/* Right action rail */}
      <div style={{ position: 'absolute', right: 10, bottom: 80, zIndex: 5,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        {/* Avatar */}
        <div style={{ marginBottom: 8, position: 'relative' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid #fff', background: '#333',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : handle[0]?.toUpperCase()}
          </div>
          <div style={{ position: 'absolute', bottom: -10, left: '50%', transform: 'translateX(-50%)',
            width: 22, height: 22, borderRadius: '50%', background: '#EE1D52',
            border: '2px solid #010101', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 16, color: '#fff', fontWeight: 800, lineHeight: 1 }}>+</div>
        </div>
        <ActionRail likes={84200} comments={1240} color="#fff" onLike={() => setLiked(l => !l)} liked={liked} />
        {/* Share */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 4, cursor: 'pointer' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Paylaş</span>
        </div>
        {/* Spinning disc */}
        <div style={{ width: 44, height: 44, borderRadius: '50%', marginTop: 10,
          background: 'radial-gradient(circle at 35% 35%, #666, #222 55%, #000)',
          border: '3px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'spinSlow 3s linear infinite', position: 'relative' }}>
          <div style={{ width: 13, height: 13, borderRadius: '50%', background: '#1a1a1a', border: '2px solid #444', position: 'absolute' }} />
        </div>
      </div>

      {/* Bottom left */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 64, zIndex: 5, padding: '0 14px 18px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>@{handle}</div>
        {content.caption && (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', lineHeight: 1.5, margin: '0 0 10px',
            textShadow: '0 1px 2px rgba(0,0,0,0.7)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {content.caption}
          </p>
        )}
        {content.hashtags.length > 0 && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500, marginBottom: 10 }}>
            {content.hashtags.slice(0, 4).map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{music}</span>
        </div>
      </div>
    </div>
  );
}

// ─── X PREVIEW ────────────────────────────────────────────────────────────────
function XPreview({ content, handle, logoUrl, isPending }: {
  content: ContentData; handle: string; logoUrl: string; isPending: boolean;
}) {
  const [liked, setLiked] = useState(false);
  const tweetText = [content.caption, content.hashtags.slice(0, 4).map(h => h.startsWith('#') ? h : `#${h}`).join(' ')].filter(Boolean).join('\n\n');
  const charCount = tweetText.length;
  const isThread = charCount > 280;

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#000' }}>
      {/* Tweet card */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {/* Avatar */}
          <div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
            background: isPending ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff' }}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : handle[0]?.toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : 'Marka'}
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1D9BF0">
                <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91-1.01-1.01-2.52-1.27-3.91-.81C14.67 2.88 13.43 2 12 2s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81-1.01 1.01-1.27 2.52-.81 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91 1.01 1.01 2.52 1.27 3.91.81C9.33 21.12 10.57 22 12 22s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81 1.01-1.01 1.27-2.52.81-3.91C21.12 14.67 22 13.43 22 12z"/>
              </svg>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>@{handle}</span>
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>· 3s</span>
              {isPending && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 700, border: '0.5px solid rgba(245,158,11,0.3)' }}>Bekliyor</span>}
            </div>

            {/* Tweet text */}
            {tweetText && (
              <p style={{ fontSize: 15, color: '#fff', lineHeight: 1.6, margin: '0 0 12px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {isThread ? tweetText.slice(0, 280) + '…' : tweetText}
              </p>
            )}

            {/* Thread indicator */}
            {isThread && (
              <div style={{ fontSize: 14, color: '#1D9BF0', marginBottom: 12, cursor: 'pointer' }}>
                Devamını göster
              </div>
            )}

            {/* Image card */}
            {content.imageUrl && (
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.15)',
                marginBottom: 12, aspectRatio: '16/9', background: '#111' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={content.imageUrl} alt="" referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
            )}

            {/* Char count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ position: 'relative', width: 22, height: 22 }}>
                <svg width="22" height="22" viewBox="0 0 22 22">
                  <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2"/>
                  <circle cx="11" cy="11" r="9" fill="none"
                    stroke={charCount > 280 ? '#EF4444' : charCount > 250 ? '#F59E0B' : '#1D9BF0'}
                    strokeWidth="2" strokeDasharray={`${Math.min(charCount / 280, 1) * 56.5} 56.5`}
                    strokeLinecap="round" transform="rotate(-90 11 11)"/>
                </svg>
                {charCount > 250 && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 8, fontWeight: 700,
                    color: charCount > 280 ? '#EF4444' : '#F59E0B' }}>
                    {280 - Math.min(charCount, 280)}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>{charCount} / 280</span>
              {isThread && <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 10, background: 'rgba(29,155,240,0.12)', color: '#1D9BF0', fontWeight: 600 }}>Thread</span>}
            </div>

            {/* Engagement row */}
            <div style={{ display: 'flex', gap: 20, paddingBottom: 14,
              borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              {[
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, count: '24' },
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>, count: '156' },
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill={liked ? '#E1306C' : 'none'} stroke={liked ? '#E1306C' : 'rgba(255,255,255,0.4)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }} onClick={() => setLiked(l => !l)}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>, count: liked ? '2.9K' : '2.8K' },
                { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, count: '84K' },
              ].map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5,
                  color: 'rgba(255,255,255,0.4)', fontSize: 14, cursor: 'pointer' }}>
                  {a.icon}<span>{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── REVISION BOTTOM SHEET ────────────────────────────────────────────────────
const CHIPS: Record<Platform, string[]> = {
  instagram: ['Daha premium', 'Daha kısa', 'Güçlü CTA', 'Daha duygusal', 'Caption iyileştir', 'Görsel değiştir', 'Story native', 'Daha lifestyle'],
  tiktok:    ['Daha hızlı hook', 'Daha native', 'Daha enerjik', 'Caption kısa', 'Daha ürün odaklı', 'Format değiştir'],
  x:         ['Daha kısa', 'Daha keskin', 'Daha profesyonel', 'Thread yap', 'Hook güçlendir', 'Daha duygusal'],
};

function RevisionSheet({ platform, onClose, onSubmit }: {
  platform: Platform; onClose: () => void; onSubmit: (chips: string[], note: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
      <div style={{ background: '#161620', borderRadius: '24px 24px 0 0', padding: '0 0 32px', maxHeight: '75vh', overflowY: 'auto' }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ padding: '8px 20px 16px' }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: D.textPrimary, marginBottom: 4 }}>Revizyon İste</p>
          <p style={{ fontSize: 13, color: D.textSecondary }}>AI bu versiyonu revize edecek</p>
        </div>
        {/* Chips */}
        <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CHIPS[platform].map(c => {
            const on = selected.includes(c);
            return (
              <button key={c} onClick={() => setSelected(s => on ? s.filter(x => x !== c) : [...s, c])}
                style={{ padding: '9px 16px', borderRadius: 22, cursor: 'pointer', fontSize: 14, fontWeight: on ? 700 : 500,
                  background: on ? D.accentGlow : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${on ? D.accent : 'rgba(255,255,255,0.1)'}`,
                  color: on ? D.accent : D.textSecondary, transition: 'all 150ms' }}>
                {c}
              </button>
            );
          })}
        </div>
        {/* Note */}
        <div style={{ padding: '0 20px 16px' }}>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Özel not ekle…" rows={3}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 14, resize: 'none', outline: 'none',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: D.textPrimary, fontSize: 14, lineHeight: 1.55, boxSizing: 'border-box' }} />
        </div>
        <div style={{ padding: '0 20px' }}>
          <button onClick={() => onSubmit(selected, note)} disabled={selected.length === 0 && !note.trim()}
            style={{ width: '100%', padding: '14px', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: selected.length > 0 || note.trim() ? D.accent : 'rgba(255,255,255,0.08)',
              color: selected.length > 0 || note.trim() ? '#fff' : D.textMuted,
              fontSize: 15, fontWeight: 700, transition: 'all 200ms' }}>
            Revizyon Gönder {selected.length > 0 ? `(${selected.length} seçim)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI EXPLANATION SHEET ──────────────────────────────────────────────────────
function AIExplanationSheet({ artifact, onClose }: { artifact: OutputArtifact; onClose: () => void }) {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  // Parse content JSON for agent-generated reasoning fields
  const content = parseArtifactContent(artifact.content);
  const ideas = (content._array as Record<string, unknown>[]) || [];
  const firstIdea = ideas[0] || content;

  // Real agent data extraction
  const strategicPurpose =
    (meta.strategic_purpose as string) ||
    (firstIdea.strategic_purpose as string) ||
    '';
  const missionBrief = (meta.mission_brief as string) || '';
  const visualDirection = (firstIdea.visual_direction as string) || '';
  const hookType = (firstIdea.caption_hook_type as string) || '';
  const templateUseCase = (firstIdea.template_use_case as string) || '';
  const postingTime = (firstIdea.posting_time_suggestion as string) || '';
  const productionNotes = (firstIdea.production_notes as string) || '';

  // Engagement prediction with reasoning
  const engagement = (firstIdea.engagement_prediction ?? {}) as {
    primary?: string; primary_reasoning?: string;
    alt?: string; alt_reasoning?: string;
    best_pick?: string;
  };
  const engPrimary = engagement.primary || '';
  const engReason = engagement.primary_reasoning || '';

  // Confidence score: prefer real engagement → otherwise omit the section
  const confidenceFromEng: number | null = (() => {
    if (!engPrimary) return null;
    const lvl = engPrimary.toLowerCase();
    if (lvl === 'high') return 87;
    if (lvl === 'medium') return 62;
    if (lvl === 'low') return 38;
    return null;
  })();

  // Compose items — only show what has real data
  const fmt = (s: string) => s.replace(/_/g, ' ');
  const items: { label: string; value: string }[] = [];
  if (strategicPurpose) items.push({ label: 'Stratejik amaç', value: strategicPurpose });
  if (missionBrief)     items.push({ label: 'Kampanya brief', value: missionBrief });
  if (visualDirection)  items.push({ label: 'Görsel yönlendirme', value: visualDirection });
  if (hookType)         items.push({ label: 'Caption hook stratejisi', value: fmt(hookType) });
  if (templateUseCase)  items.push({ label: 'Şablon amacı', value: fmt(templateUseCase) });
  if (postingTime)      items.push({ label: 'Yayın zamanı önerisi', value: postingTime });
  if (productionNotes)  items.push({ label: 'Prodüksiyon notu', value: productionNotes });

  // Always show platform format
  const kind = (meta.kind as string) || (firstIdea.content_kind as string) || (content.contentType as string) || 'instagram_post';
  items.push({ label: 'Format', value: fmt(kind) });

  const hasReasoning = items.length > 1 || engReason;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
      <div style={{ background: '#161620', borderRadius: '24px 24px 0 0', padding: '0 0 36px',
        maxHeight: '70vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ padding: '8px 20px 20px' }}>
          <p style={{ fontSize: 17, fontWeight: 700, color: D.textPrimary, marginBottom: 2 }}>Bu İçerik Neden Seçildi?</p>
          <p style={{ fontSize: 13, color: D.textSecondary }}>
            {hasReasoning ? 'AI ajanın kararları hakkında şeffaf bilgi' : 'Bu içerik için ek açıklama mevcut değil'}
          </p>
        </div>
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Engagement prediction — pinned top, most important */}
          {engPrimary && (
            <div style={{ padding: '14px 16px', borderRadius: 16,
              background: engPrimary.toLowerCase() === 'high'
                ? 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))'
                : engPrimary.toLowerCase() === 'medium'
                  ? 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(245,158,11,0.03))'
                  : 'linear-gradient(135deg, rgba(148,163,184,0.10), rgba(148,163,184,0.03))',
              border: `0.5px solid ${
                engPrimary.toLowerCase() === 'high' ? 'rgba(16,185,129,0.3)' :
                engPrimary.toLowerCase() === 'medium' ? 'rgba(245,158,11,0.3)' :
                'rgba(148,163,184,0.25)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700,
                  color: engPrimary.toLowerCase() === 'high' ? '#10B981'
                    : engPrimary.toLowerCase() === 'medium' ? '#F59E0B' : '#94A3B8',
                  textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Tahmini Etkileşim
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: D.textPrimary }}>
                  {engPrimary.toLowerCase() === 'high' ? 'Yüksek'
                    : engPrimary.toLowerCase() === 'medium' ? 'Orta' : 'Düşük'}
                </span>
              </div>
              {engReason && (
                <p style={{ fontSize: 13, color: D.textSecondary, lineHeight: 1.55, margin: 0 }}>
                  {engReason}
                </p>
              )}
            </div>
          )}

          {/* Reasoning items */}
          {items.map((item, i) => (
            <div key={i} style={{ padding: '12px 14px', borderRadius: 14,
              background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: D.accent, textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</p>
              <p style={{ fontSize: 14, color: D.textPrimary, lineHeight: 1.5, margin: 0 }}>{item.value}</p>
            </div>
          ))}

          {/* Confidence score — only if derived from real engagement signal */}
          {confidenceFromEng !== null && (
            <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(167,139,250,0.06)',
              border: '0.5px solid rgba(167,139,250,0.2)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: D.accent, textTransform: 'uppercase',
                letterSpacing: '0.08em', marginBottom: 8 }}>Güven Skoru (etkileşim tahminine göre)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3,
                  background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${confidenceFromEng}%`, borderRadius: 3,
                    background: `linear-gradient(90deg, ${D.accent}, #60A5FA)` }} />
                </div>
                <span style={{ fontSize: 16, fontWeight: 800, color: D.textPrimary }}>{confidenceFromEng}%</span>
              </div>
            </div>
          )}

          {/* No reasoning fallback */}
          {!hasReasoning && (
            <div style={{ padding: '20px 14px', borderRadius: 14,
              background: 'rgba(255,255,255,0.02)',
              border: '0.5px dashed rgba(255,255,255,0.12)',
              textAlign: 'center', color: D.textSecondary, fontSize: 12, lineHeight: 1.6 }}>
              Bu içerik manuel oluşturulmuş veya ajan reasoning'i kaydedilmemiş.
              <br />Yeni AI üretimleri detaylı açıklama içerir.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── APPROVAL DOCK ────────────────────────────────────────────────────────────
function ApprovalDock({ status, approving, onApprove, onRevise, onRegenerate, onExplain, onBoost }: {
  status: string; approving: boolean;
  onApprove: () => void; onRevise: () => void; onRegenerate: () => void;
  onExplain: () => void; onBoost: () => void;
}) {
  const isApproved = status === 'approved';
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
      padding: '12px 16px calc(env(safe-area-inset-bottom,0px) + 14px)',
      background: 'linear-gradient(to top, rgba(10,10,15,0.98) 0%, rgba(10,10,15,0.85) 100%)',
      backdropFilter: 'blur(24px)',
      borderTop: '0.5px solid rgba(255,255,255,0.08)',
    }}>
      {isApproved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Reklam Ver — birincil aksiyon onaylı içerikte */}
          <button onClick={onBoost}
            style={{ width: '100%', padding: '14px', borderRadius: 16, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.9), rgba(239,68,68,0.8))',
              color: '#fff', fontSize: 14, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
            📣 Bu Görseli Tanıt
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, padding: '11px', borderRadius: 14, display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 6,
              background: 'rgba(16,185,129,0.1)', border: '0.5px solid rgba(16,185,129,0.25)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981' }}>Onaylandı</span>
            </div>
            <button onClick={onRevise}
              style={{ flex: 1, padding: '11px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
              Revize Et
            </button>
            <button onClick={onExplain}
              style={{ padding: '11px 14px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.55)', fontSize: 12 }}>
              AI ✦
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Primary — Approve */}
          <button onClick={onApprove} disabled={approving}
            style={{ width: '100%', padding: '15px', borderRadius: 18, border: 'none', cursor: 'pointer',
              background: approving ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg,rgba(16,185,129,0.9),rgba(5,150,105,0.85))',
              color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: approving ? 'none' : '0 4px 24px rgba(16,185,129,0.3)' }}>
            {approving ? (
              <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor…</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Onayla & Yayın Kuyruğuna Al</>
            )}
          </button>
          {/* Secondary row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onRevise}
              style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(167,139,250,0.1)', border: '0.5px solid rgba(167,139,250,0.25)',
                color: D.accent, fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.68"/></svg>
              Revize Et
            </button>
            <button onClick={onRegenerate}
              style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Yeniden Üret
            </button>
            <button onClick={onExplain}
              style={{ padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              AI ✦
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VARIATION SWITCHER ───────────────────────────────────────────────────────
function VariationSwitcher({ total, active, onChange }: { total: number; active: number; onChange: (i: number) => void }) {
  if (total <= 1) return null;
  const labels = ['V1', 'V2', 'V3', 'V4', 'V5'];
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '8px 16px',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      {Array.from({ length: total }).map((_, i) => (
        <button key={i} onClick={() => onChange(i)}
          style={{ padding: '5px 12px', borderRadius: 16, cursor: 'pointer', border: 'none',
            background: i === active ? D.accent : 'rgba(255,255,255,0.08)',
            color: i === active ? '#fff' : 'rgba(255,255,255,0.4)',
            fontSize: 12, fontWeight: i === active ? 700 : 500, transition: 'all 150ms' }}>
          {labels[i] ?? `V${i+1}`}
        </button>
      ))}
    </div>
  );
}

// ─── PLATFORM PREVIEW STUDIO (Main) ──────────────────────────────────────────
export function PlatformPreviewStudio() {
  const { goBack, selectedArtifactId } = useMobileStore();
  const queryClient = useQueryClient();

  const [platform, setPlatform] = useState<Platform>('instagram');
  const [variantIdx, setVariantIdx] = useState(0);
  const [showRevision, setShowRevision] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showBoost, setShowBoost] = useState(false);

  // Auto-detect platform + sub-mode from artifact kind — set once when artifact loads.
  // Keeps the initial render on 'instagram/feed' until data arrives, then corrects.
  const [autoInitDone, setAutoInitDone] = useState(false);

  // Load selected artifact + related artifacts (variants)
  const { data: artifact } = useQuery({
    queryKey: ['artifact', selectedArtifactId],
    queryFn: async () => {
      if (!selectedArtifactId) return null;
      try { return await apiClient.getArtifact(selectedArtifactId); } catch { return null; }
    },
    enabled: !!selectedArtifactId,
    staleTime: 30_000,
  });

  const { data: allArtifacts = [] } = useMobileArtifacts({
    subscribeOnly: true,
  });

  // Build variant list from artifacts with similar content type
  const variants = (() => {
    if (!artifact) return [];
    // Same platform/type artifacts as variants (mock up to 3)
    const same = (allArtifacts as any[]).filter(a =>
      a.id !== artifact.id &&
      (a.status === 'pending_review' || a.status === 'approved')
    ).slice(0, 2);
    return [artifact, ...same];
  })();

  const currentArtifact = variants[variantIdx] ?? artifact;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveArtifact(id, 'Approved from Platform Preview Studio'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  });
  const revisionMutation = useMutation({
    mutationFn: ({ id, chips, note }: { id: string; chips: string[]; note: string }) =>
      apiClient.requestRevision(id, [chips.join(', '), note].filter(Boolean).join(' · ') || 'Revision requested'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artifacts'] }); setShowRevision(false); },
  });

  const tenantBrand = useTenantBrandContext();
  const handle = tenantBrand.displayHandle;
  const logoUrl = tenantBrand.logoUrl
    ? resolveClientMediaUrl(tenantBrand.logoUrl) ?? tenantBrand.logoUrl
    : '';

  if (!artifact || !currentArtifact) {
    return (
      <div style={{ height: '100dvh', background: D.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid rgba(167,139,250,0.2)`,
          borderTop: `2px solid ${D.accent}`, animation: 'spinSlow 1s linear infinite' }} />
        <span style={{ fontSize: 14, color: D.textSecondary }}>Yükleniyor…</span>
      </div>
    );
  }

  const content = extractContent(currentArtifact as OutputArtifact);
  const nativeContent = artifactToNativeContent(currentArtifact as OutputArtifact);
  const previewMode = detectPreviewMode(currentArtifact as OutputArtifact, content.kind.toLowerCase().includes('reel') ? 'reel' : content.kind.toLowerCase().includes('story') ? 'story' : 'post');

  // ── Auto-detect platform + sub-mode from artifact kind ──────────────────
  // Run once after artifact loads — no user action required.
  const kindLower = content.kind.toLowerCase();
  if (!autoInitDone && content.kind) {
    const detectedPlatform: Platform =
      kindLower.includes('tiktok') ? 'tiktok'
      : kindLower.includes('_x_') || kindLower === 'x_post' ? 'x'
      : 'instagram';

    if (detectedPlatform !== platform) setPlatform(detectedPlatform);
    setAutoInitDone(true);
  }

  // Derive initial IG sub-mode for InstagramPreview from kind (passed as prop)
  const igInitialSubMode: 'feed' | 'reel' | 'story' =
    (kindLower.includes('reel') || !!content.videoUrl) ? 'reel'
    : kindLower.includes('story') ? 'story'
    : 'feed';

  const isPending = (currentArtifact as any).status === 'pending_review';
  const campaignName = (currentArtifact as any).title || 'Kampanya İçeriği';

  // Platform tab definitions with SVG icons
  const platformTabs = PLATFORM_TABS.map((pt) => ({
    id: pt.id,
    label: `${pt.label} Preview`,
    svgPath: pt.svgPath,
  }));

  const bgByPlatform = platform === 'tiktok' ? '#010101' : '#000';

  return (
    <>
      <div style={{ height: '100dvh', background: bgByPlatform, display: 'flex', flexDirection: 'column',
        transition: 'background 300ms', overflow: 'hidden', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif' }}>

        {/* ── HEADER ── */}
        <div style={{
          flexShrink: 0,
          paddingTop: 'calc(env(safe-area-inset-top,0px) + 10px)',
          padding: 'calc(env(safe-area-inset-top,0px) + 10px) 16px 0',
          background: bgByPlatform,
        }}>
          {/* Back + campaign name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={goBack} style={{ background: 'none', border: 'none', cursor: 'pointer',
              width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'rgba(255,255,255,0.7)', flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M10 6l-5 6 5 6"/>
              </svg>
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.9)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                {campaignName}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%',
                  background: isPending ? '#F59E0B' : '#10B981',
                  boxShadow: isPending ? '0 0 6px #F59E0B' : '0 0 6px #10B981' }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                  {isPending ? 'Onay Bekliyor' : 'Onaylandı'}
                </span>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8,
                  background: 'rgba(167,139,250,0.12)', color: D.accent, fontWeight: 700 }}>
                  ✦ AI
                </span>
              </div>
            </div>
          </div>

          {/* Platform tabs — icon only */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
            {platformTabs.map(pt => {
              const isActive = platform === pt.id;
              return (
                <button key={pt.id} onClick={() => setPlatform(pt.id)}
                  style={{ flex: 1, padding: '10px 4px', borderRadius: 12, cursor: 'pointer',
                    border: isActive ? 'none' : '0.5px solid rgba(255,255,255,0.1)',
                    background: isActive
                      ? pt.id === 'instagram' ? 'linear-gradient(45deg,rgba(240,148,51,0.7),rgba(220,39,67,0.7),rgba(188,24,136,0.7))'
                        : pt.id === 'x' ? 'rgba(255,255,255,0.15)' : 'rgba(238,29,82,0.15)'
                      : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isActive ? '0 2px 12px rgba(0,0,0,0.4)' : 'none',
                    transition: 'all 180ms' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24"
                    fill={isActive ? '#fff' : 'rgba(255,255,255,0.3)'}>
                    <path d={pt.svgPath} />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>


        {/* ── PREVIEW AREA ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          paddingBottom: isPending ? 130 : 80 }}>
          <PlatformNativePreview
            platform={platform}
            mode={previewMode}
            content={nativeContent}
            handle={handle}
            logoUrl={logoUrl}
            isPending={isPending}
          />
        </div>
      </div>

      {/* ── APPROVAL DOCK ── */}
      <ApprovalDock
        status={(currentArtifact as any).status}
        approving={approveMutation.isPending}
        onApprove={() => approveMutation.mutate((currentArtifact as any).id)}
        onRevise={() => setShowRevision(true)}
        onRegenerate={() => {}}
        onExplain={() => setShowAI(true)}
        onBoost={() => setShowBoost(true)}
      />

      {/* ── BOOST SHEET ── */}
      <BoostPostSheet
        artifactId={(currentArtifact as any).id}
        igMediaId={(currentArtifact as any).metadata?.ig_media_id ?? (currentArtifact as any).metadata?.post_id}
        caption={content.caption}
        imageUrl={content.imageUrl || resolveClientMediaUrl((currentArtifact as any).contentUrl) || ''}
        isOpen={showBoost}
        onClose={() => setShowBoost(false)}
      />

      {/* ── SHEETS ── */}
      {showRevision && (
        <RevisionSheet
          platform={platform}
          onClose={() => setShowRevision(false)}
          onSubmit={(chips, note) => revisionMutation.mutate({ id: (currentArtifact as any).id, chips, note })}
        />
      )}
      {showAI && (
        <AIExplanationSheet artifact={currentArtifact as OutputArtifact} onClose={() => setShowAI(false)} />
      )}

      {/* Inline CSS for story progress animation */}
      <style>{`
        @keyframes story-progress { from { width: 0% } to { width: 100% } }
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
      `}</style>
    </>
  );
}

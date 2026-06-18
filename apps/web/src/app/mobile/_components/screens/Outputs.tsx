'use client';
import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { resolveArtifact, parseArtifactContent, findScheduledForArtifact, resolveCarouselUrls } from '../artifact-utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { OutputArtifact } from '@/types';
import type { T } from '../theme-context';
import { VisualReviewBadge } from '../VisualReviewSheet';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';
import { buildTenantBrandContext } from '@/lib/tenant-brand-context';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';
import { resolveMertcafePublishAuth, assertMertcafePublishReady, humanizeMertcafePublishError } from '@/lib/mertcafe-publish-auth';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import { MOBILE_ARTIFACT_OUTPUTS_LIMIT } from '../../_lib/mobile-artifacts';

type Platform = 'instagram' | 'x' | 'tiktok';
type BrandProfile = { handle: string; name: string; logoUrl: string };

function buildBrandProfileFromQueries(
  profile: unknown,
  brandCtx: unknown,
  proxyLogo: (url: string) => string,
): BrandProfile {
  const brand = buildTenantBrandContext(profile as any, brandCtx as Record<string, unknown> | null);
  return {
    handle: brand.displayHandle,
    name: brand.brandName || 'Brand',
    logoUrl: brand.logoUrl ? proxyLogo(brand.logoUrl) : '',
  };
}

// ── Platform configs ────────────────────────────────────────────────────────
const PLATFORMS: { id: Platform; label: string; color: string; bg: string; svgPath: string }[] = [
  {
    id: 'instagram', label: 'Instagram', color: '#E1306C',
    bg: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
    // Instagram camera SVG
    svgPath: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  },
  {
    id: 'x', label: 'X', color: '#fff', bg: '#000',
    // X (Twitter) logo SVG
    svgPath: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    id: 'tiktok', label: 'TikTok', color: '#fff', bg: '#010101',
    // TikTok music note logo SVG
    svgPath: 'M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.37 6.37 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V9.21a8.16 8.16 0 004.77 1.52V7.27a4.85 4.85 0 01-1-.58z',
  },
];

function timeAgoShort(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m}dk`;
  if (m < 1440) return `${Math.floor(m / 60)}s`;
  return `${Math.floor(m / 1440)}g`;
}

// Reads natural image dimensions and returns the closest IG-standard aspect ratio
function useImageAspect(url: string | null): string {
  const [ratio, setRatio] = useState<string>('4/5');
  useEffect(() => {
    if (!url) return;
    const img = new window.Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!h) return;
      const r = w / h;
      if (r >= 1.3)       setRatio('1.91/1'); // landscape
      else if (r >= 0.9)  setRatio('1/1');    // square
      else                setRatio('4/5');     // portrait (max portrait IG allows)
    };
    img.src = url;
  }, [url]);
  return ratio;
}

/** Detect draft artifacts — marked by [DRAFT] prefix in review comment */
function isDraftArtifact(artifact: OutputArtifact): boolean {
  const d = (artifact as any).reviewDecision;
  const comment = typeof d?.comments === 'string' ? d.comments : '';
  return comment.startsWith('[DRAFT]');
}

function resolveImg(url: string | null | undefined): string | null {
  return resolveClientMediaUrl(url);
}

/** Pick the best displayable image URL from an artifact's content JSON. */
function resolveArtifactImg(artifact: { contentUrl?: string | null; content?: string | null; metadata?: unknown }): string | null {
  const content = (() => { try { return JSON.parse(artifact.content ?? '{}'); } catch { return {}; } })() as Record<string, unknown>;
  const rendered = (content.renderedPreview ?? {}) as Record<string, unknown>;
  const meta    = (artifact.metadata ?? {}) as Record<string, unknown>;
  const candidates: Array<unknown> = [
    content.canvaThumbnail, content.canvaThumb,
    rendered.imageUrl, rendered.thumbnailUrl,
    (rendered.canvaDesign as Record<string, unknown> | undefined)?.thumbnailUrl,
    content.imageUrl,
    meta.imageUrl, meta.canvaThumbnail,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const resolved = resolveImg(c.trim());
      if (resolved) return resolved;
    }
  }
  const cu = artifact.contentUrl;
  if (cu && !cu.includes('canva.com/design')) return resolveImg(cu);
  return null;
}

function proxyUrl(url: string | null | undefined): string {
  return resolveClientMediaUrl(url) ?? '';
}

// ── Instagram caption block — birebir IG feed görünümü ──────────────────────
function IGCaptionBlock({ handle, name, caption, hashtags, createdAt, liked }: {
  handle: string; name: string; caption: string; hashtags: string[];
  createdAt: string; liked: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 125;
  const allHashtags = hashtags.map(h => h.startsWith('#') ? h : `#${h}`);
  const hashStr = allHashtags.join(' ');
  const fullText = [caption, hashStr].filter(Boolean).join('\n');
  const isTruncated = fullText.length > LIMIT && !expanded;
  const displayText = isTruncated ? fullText.slice(0, LIMIT) : fullText;

  // Split text into caption part and hashtag-coloured spans
  function renderText(text: string) {
    return text.split(/(\s+)/).map((word, i) => {
      if (word.startsWith('#')) {
        return <span key={i} style={{ color: '#60A5FA' }}>{word}</span>;
      }
      if (word.startsWith('@')) {
        return <span key={i} style={{ color: '#60A5FA' }}>{word}</span>;
      }
      return <span key={i}>{word}</span>;
    });
  }

  // Pseudo-random likes count seeded by handle to avoid "126" every time
  const seed = handle.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const baseLikes = 800 + (seed % 9200);
  const likeCount = liked ? baseLikes + 1 : baseLikes;

  return (
    <div style={{ padding: '2px 12px 10px' }}>
      {/* Likes count */}
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 5 }}>
        {likeCount.toLocaleString('tr-TR')} beğeni
      </div>

      {/* Caption + hashtags — inline flow like real IG */}
      {fullText && (
        <div style={{ fontSize: 14, color: '#fff', lineHeight: 1.55, wordBreak: 'break-word' }}>
          <span style={{ fontWeight: 700 }}>{handle} </span>
          {renderText(displayText)}
          {isTruncated && (
            <span
              onClick={() => setExpanded(true)}
              style={{ color: 'rgba(255,255,255,0.45)', cursor: 'pointer', marginLeft: 2 }}>
              … daha fazla
            </span>
          )}
        </div>
      )}

      {/* Timestamp */}
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, letterSpacing: '0.01em' }}>
        {timeAgoShort(createdAt)}
      </div>
    </div>
  );
}

// ── Instagram native post ────────────────────────────────────────────────────
function IGNativePost({ artifact, res, t, onApprove, onTap, approving, brandProfile }: {
  artifact: OutputArtifact; res: ReturnType<typeof resolveArtifact>; t: T;
  onApprove: () => void; onTap: () => void; approving: boolean;
  brandProfile: BrandProfile;
}) {
  const [liked, setLiked] = useState(false);
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  // For reels: prefer videoUrl over imageUrl
  const videoUrl = res.videoUrl
    || resolveImg((content.videoUrl as string) || (meta.videoUrl as string) || '')
    || (artifact.contentUrl?.match(/\.(mp4|webm|mov)/i) ? artifact.contentUrl : null);
  const img      = resolveArtifactImg(artifact) ?? resolveImg(res.imageUrl ?? undefined);
  const caption  = res.caption || (content.caption as string) || (meta.caption as string) || '';
  const hashtags = (res.hashtags?.length ? res.hashtags : ((content.hashtags ?? meta.hashtags ?? []) as string[])).slice(0, 10);
  const location = (meta.location as string) || (content.location as string) || '';
  const handle   = brandProfile.handle;
  // Initials: "Bitez Dondurma" → "BD", "Marka" → "M"
  const initials = brandProfile.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const likes    = liked ? 127 : 126;
  const isPending = artifact.status === 'pending_review';
  const detectedRatio = useImageAspect(img);

  // Detect story format
  const kind = (content.kind as string) || (content.contentType as string) || '';
  const isStory = kind.includes('story');
  const isReel  = kind.includes('reel');

  // ── REEL layout — full-bleed 9:16, actions overlaid on right (Instagram native) ──
  if (isReel) {
    const reelSrc = videoUrl || img; // video preferred, image fallback
    const isVideo = !!videoUrl;
    return (
      <div style={{ background: '#000', marginBottom: 2, position: 'relative' }}>
        {/* Full 9:16 container */}
        <div style={{ position: 'relative', aspectRatio: '9/16', overflow: 'hidden', background: '#111' }}>
          {reelSrc ? (
            isVideo ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={reelSrc}
                autoPlay
                loop
                muted
                playsInline
                onClick={onTap}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', cursor: 'pointer' }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={reelSrc} alt="" referrerPolicy="no-referrer" onClick={onTap}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                  objectFit: 'cover', cursor: 'pointer' }} />
            )
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: '#1a1a1a' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          )}

          {/* Gradient scrim bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
            pointerEvents: 'none' }} />

          {/* Top row: Reels label + mute + more */}
          <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* Reels icon */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/>
                <path d="M8.5 2v20M2 8.5h19M2 15.5h19M15.5 2v20" stroke="#000" strokeWidth="1.2" fill="none"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Reels</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isPending && (
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10,
                  background: 'rgba(245,158,11,0.9)', color: '#000', fontWeight: 700 }}>Bekliyor</span>
              )}
              {/* Mute icon */}
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Right sidebar — action buttons */}
          <div style={{ position: 'absolute', right: 10, bottom: 80, zIndex: 5,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            {/* Like */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button onClick={() => setLiked(l => !l)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                <svg width="28" height="28" viewBox="0 0 24 24"
                  fill={liked ? '#E1306C' : 'none'}
                  stroke={liked ? '#E1306C' : 'rgba(255,255,255,0.9)'} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))', transition: 'transform 150ms' }}>
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>{likes.toLocaleString()}</span>
            </div>
            {/* Comment */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button onClick={onTap} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>234</span>
            </div>
            {/* Share */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}>
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>Paylaş</span>
            </div>
            {/* More */}
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.9)', fontSize: 22, padding: 0, lineHeight: 0 }}>···</button>
          </div>

          {/* Bottom left — handle + caption + audio */}
          <div style={{ position: 'absolute', bottom: 16, left: 12, right: 60, zIndex: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden',
                border: '1.5px solid #fff', background: brandProfile.logoUrl ? 'transparent' : '#333', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: '#fff' }}>
                {brandProfile.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={brandProfile.logoUrl} alt="" referrerPolicy="no-referrer"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : initials}
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                {handle}
              </span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.6)', borderRadius: 6,
                padding: '1px 6px', fontWeight: 500 }}>Takip Et</span>
            </div>
            {caption && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4, margin: '0 0 8px',
                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {caption}
              </p>
            )}
            {/* Audio bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Orijinal ses · {handle}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Review + Approve bar below reel */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: '#000', flexWrap: 'wrap' }}>
          {(videoUrl || img) && (
            <VisualReviewBadge
              imageUrl={videoUrl || img!}
              thumbnailUrl={img ?? undefined}
              context={{ contentType: 'instagram_reel', platform: 'Instagram', brandName: handle, caption: caption?.slice(0, 200) }}
            />
          )}
          {isPending && (
            <>
              <button onClick={onApprove} disabled={approving}
                style={{ flex: 1, minWidth: 100, padding: '11px', borderRadius: 8, cursor: 'pointer', border: 'none',
                  background: 'rgba(16,185,129,0.15)', color: '#10B981', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {approving ? <><div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid rgba(16,185,129,0.3)', borderTop: '2px solid #10B981', animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor…</> : '✓ Onayla'}
              </button>
              <button onClick={onTap}
                style={{ padding: '11px 16px', borderRadius: 8, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>···</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Regular POST / STORY layout ──
  return (
    <div style={{ background: '#000', marginBottom: 2 }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Avatar with gradient ring */}
        <div style={{ flexShrink: 0, padding: 2, borderRadius: '50%',
          background: isPending ? 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)' : 'rgba(255,255,255,0.15)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%',
            background: brandProfile.logoUrl ? 'transparent' : '#111',
            border: '2px solid #000', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff' }}>
            {brandProfile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandProfile.logoUrl} alt={handle} referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : initials}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
            {handle}
          </div>
          {location && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{location}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isPending && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10,
              background: 'rgba(245,158,11,0.2)', color: '#F59E0B', fontWeight: 700 }}>
              Bekliyor
            </span>
          )}
          {isStory && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Story</span>}
          {isReel  && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Reel</span>}
          <button onClick={onTap} style={{ background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18, padding: 4 }}>···</button>
        </div>
      </div>

      {/* Image — aspect ratio detected from actual image dimensions, clamped to IG standards */}
      {(() => {
        const fmtKind = (content.contentType as string || kind).toLowerCase();
        const isCarousel = fmtKind.includes('carousel');
        const ratio = isStory ? '4/5' : isCarousel ? '1/1' : detectedRatio;
        return (
      <div onClick={onTap} style={{ cursor: 'pointer',
        aspectRatio: ratio,
        background: '#1a1a1a', overflow: 'hidden', position: 'relative' }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg,rgba(225,48,108,0.15),rgba(188,24,136,0.08))',
            fontSize: 48, opacity: 0.2 }}>📷</div>
        )}
        {isReel && (
          <div style={{ position: 'absolute', bottom: 12, right: 12,
            background: 'rgba(0,0,0,0.7)', borderRadius: '50%',
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        )}
      </div>
        );
      })()}

      {/* IG Action row — real SVG icons, heart pre-liked */}
      <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Heart — filled red (liked) */}
        <button onClick={() => setLiked(l => !l)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill={liked ? '#E1306C' : 'none'}
            stroke={liked ? '#E1306C' : 'rgba(255,255,255,0.9)'} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: liked ? 'scale(1.1)' : 'scale(1)', transition: 'transform 150ms' }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
        {/* Comment bubble */}
        <button onClick={onTap} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
        {/* Paper plane (DM/send) */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
        {/* Bookmark — right aligned */}
        <div style={{ marginLeft: 'auto' }}>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Likes + caption — Instagram native layout */}
      <IGCaptionBlock
        handle={handle}
        name={brandProfile.name}
        caption={caption}
        hashtags={hashtags}
        createdAt={artifact.createdAt}
        liked={liked}
      />

      {/* Visual Review + Agency approve bar */}
      <div style={{ margin: '0 12px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {img && (
          <VisualReviewBadge
            imageUrl={img}
            thumbnailUrl={img}
            context={{ contentType: isStory ? 'instagram_story' : 'instagram_post', platform: 'Instagram', brandName: handle, caption: caption?.slice(0, 200) }}
          />
        )}
      </div>
      {isPending && (
        <div style={{ margin: '0 12px 14px', display: 'flex', gap: 8 }}>
          <button onClick={onApprove} disabled={approving}
            style={{ flex: 1, padding: '10px', borderRadius: 12, cursor: 'pointer', border: 'none',
              background: 'rgba(16,185,129,0.15)', color: '#10B981', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
            {approving ? <><div style={{ width: 11, height: 11, borderRadius: '50%',
              border: '2px solid rgba(16,185,129,0.3)', borderTop: '2px solid #10B981',
              animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor…</> : '✓ Onayla'}
          </button>
          <button onClick={onTap}
            style={{ padding: '10px 14px', borderRadius: 12, cursor: 'pointer',
              background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>···</button>
        </div>
      )}
    </div>
  );
}

// ── X (Twitter) native post ──────────────────────────────────────────────────
function XNativePost({ artifact, res, t, onApprove, onTap, approving, brandProfile }: {
  artifact: OutputArtifact; res: ReturnType<typeof resolveArtifact>; t: T;
  onApprove: () => void; onTap: () => void; approving: boolean;
  brandProfile: BrandProfile;
}) {
  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const img      = resolveArtifactImg(artifact) ?? resolveImg(res.imageUrl ?? undefined);
  const caption  = res.caption || (content.caption as string) || (meta.caption as string) || '';
  const hashtags = (res.hashtags?.length ? res.hashtags : ((content.hashtags ?? meta.hashtags ?? []) as string[])).slice(0, 5);
  const isPending = artifact.status === 'pending_review';

  // On X, blend caption + hashtags into tweet text
  const tweetText = [caption, hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')].filter(Boolean).join('\n\n');

  return (
    <div style={{ padding: '14px 16px', borderBottom: '0.5px solid #2f3336' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* Avatar */}
        <div style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: brandProfile.logoUrl ? 'transparent' : (isPending ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.1)'),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800, color: '#fff' }}>
          {brandProfile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandProfile.logoUrl} alt="" referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ) : (brandProfile.handle[0] ?? 'M').toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{brandProfile.name}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#1D9BF0">
              <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91-1.01-1.01-2.52-1.27-3.91-.81C14.67 2.88 13.43 2 12 2s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81-1.01 1.01-1.27 2.52-.81 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91 1.01 1.01 2.52 1.27 3.91.81C9.33 21.12 10.57 22 12 22s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81 1.01-1.01 1.27-2.52.81-3.91C21.12 14.67 22 13.43 22 12z"/>
            </svg>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>@{brandProfile.handle} · {timeAgoShort(artifact.createdAt)}</span>
            {isPending && (
              <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 8,
                background: 'rgba(245,158,11,0.15)', color: '#F59E0B', fontWeight: 700 }}>Bekliyor</span>
            )}
          </div>

          {/* Tweet text */}
          {tweetText && (
            <p style={{ fontSize: 15, color: '#fff', lineHeight: 1.55, margin: '0 0 10px',
              whiteSpace: 'pre-wrap' }}>
              {tweetText.slice(0, 280)}
            </p>
          )}

          {/* Image card */}
          {img && (
            <div onClick={onTap} style={{ cursor: 'pointer', borderRadius: 14, overflow: 'hidden',
              border: '0.5px solid #333', marginBottom: 10, aspectRatio: '16/9', background: '#1a1a1a' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}

          {/* X engagement row — real X/Twitter SVG icons */}
          <div style={{ display: 'flex', gap: 18, marginBottom: isPending ? 10 : 0 }}>
            {/* Comment */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span style={{ fontSize: 13 }}>15</span>
            </div>
            {/* Repost (X's retweet) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              <span style={{ fontSize: 13 }}>32</span>
            </div>
            {/* Heart — liked */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#E1306C', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#E1306C" stroke="#E1306C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
              <span style={{ fontSize: 13 }}>126</span>
            </div>
            {/* Analytics bar chart */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              <span style={{ fontSize: 13 }}>4.2K</span>
            </div>
            {/* Share */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', marginLeft: 'auto' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </div>
          </div>

          {isPending && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={onApprove} disabled={approving}
                style={{ flex: 1, padding: '9px', borderRadius: 20, cursor: 'pointer', border: 'none',
                  background: '#1D9BF0', color: '#fff', fontSize: 13, fontWeight: 700 }}>
                {approving ? 'Onaylanıyor…' : '✓ Onayla'}
              </button>
              <button onClick={onTap}
                style={{ padding: '9px 14px', borderRadius: 20, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>···</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── TikTok native post ───────────────────────────────────────────────────────
function TikTokNativePost({ artifact, res, onApprove, onTap, approving, brandProfile, isFirst = false }: {
  artifact: OutputArtifact; res: ReturnType<typeof resolveArtifact>; t: T;
  onApprove: () => void; onTap: () => void; approving: boolean;
  brandProfile: BrandProfile;
  isFirst?: boolean;
}) {
  const [liked, setLiked] = useState(false);
  const content = parseArtifactContent(artifact.content);
  const meta     = (artifact.metadata ?? {}) as Record<string, unknown>;
  const videoUrl = res.videoUrl
    || resolveImg((content.videoUrl as string) || (meta.videoUrl as string) || '')
    || (artifact.contentUrl?.match(/\.(mp4|webm|mov)/i) ? artifact.contentUrl : null);
  const img      = resolveArtifactImg(artifact) ?? resolveImg(res.imageUrl ?? undefined);
  const isVideo  = !!videoUrl;
  const caption  = res.caption || (content.caption as string) || (meta.caption as string) || '';
  const hashtags = (res.hashtags?.length ? res.hashtags : ((content.hashtags ?? meta.hashtags ?? []) as string[])).slice(0, 5);
  const music    = (meta.music as string) || `Orijinal ses · @${brandProfile.handle}`;
  const isPending = artifact.status === 'pending_review';
  const likeCount = liked ? '12.4K' : '12.3K';

  const Btn = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
    <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
      <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 11, color: '#fff', fontWeight: '600',
        textShadow: '0 1px 3px rgba(0,0,0,0.9)', letterSpacing: '0.01em' }}>{label}</span>
    </button>
  );

  return (
    <div style={{ position: 'relative', height: '100dvh', minHeight: 500,
      background: '#000', overflow: 'hidden' }}>

      {/* ── Full-bleed background — video preferred over image ── */}
      {isVideo && videoUrl ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={videoUrl} autoPlay loop muted playsInline onClick={onTap}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', cursor: 'pointer' }} />
      ) : img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" referrerPolicy="no-referrer" onClick={onTap}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', cursor: 'pointer' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg,#1a0a15 0%,#060206 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 72, opacity: 0.08 }}>♪</span>
        </div>
      )}

      {/* ── Gradient scrims ── */}
      {/* top fade for nav readability */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 100%)',
        pointerEvents: 'none' }} />
      {/* bottom fade for captions */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%',
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
        pointerEvents: 'none' }} />

      {/* ── Top nav — only on first post ── */}
      {isFirst && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
          paddingTop: 'calc(env(safe-area-inset-top,0px) + 8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(env(safe-area-inset-top,0px) + 10px) 16px 8px' }}>
          {/* Search left */}
          <button style={{ position: 'absolute', left: 16, background: 'none', border: 'none',
            cursor: 'pointer', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
          {/* Tabs center */}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.55)', fontWeight: 600, cursor: 'pointer' }}>Takip</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 16, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Seni İçin</span>
              <div style={{ width: 20, height: 2, borderRadius: 2, background: '#fff' }} />
            </div>
          </div>
          {/* Live right */}
          <button style={{ position: 'absolute', right: 16, background: 'none', border: 'none',
            cursor: 'pointer', padding: 4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"
              strokeLinecap="round">
              <path d="M15.5 8.5a6 6 0 0 1 0 7M8.5 8.5a6 6 0 0 0 0 7M5 5a12 12 0 0 0 0 14M19 5a12 12 0 0 1 0 14"/>
              <circle cx="12" cy="12" r="2" fill="#fff" stroke="none"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Pending badge ── */}
      {isPending && (
        <div style={{ position: 'absolute', top: isFirst ? 'calc(env(safe-area-inset-top,0px) + 58px)' : 14,
          left: 14, zIndex: 10,
          fontSize: 10, padding: '3px 10px', borderRadius: 20,
          background: 'rgba(245,158,11,0.92)', color: '#000', fontWeight: 700,
          backdropFilter: 'blur(4px)' }}>
          İnceleme Bekliyor
        </div>
      )}

      {/* ── Right sidebar ── */}
      <div style={{ position: 'absolute', right: 8,
        bottom: 'calc(env(safe-area-inset-bottom,0px) + 90px)',
        zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        {/* Avatar */}
        <div style={{ marginBottom: 18, position: 'relative' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid #fff', background: brandProfile.logoUrl ? 'transparent' : '#222',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 800, color: '#fff' }}>
            {brandProfile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandProfile.logoUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (brandProfile.handle[0] ?? 'T').toUpperCase()}
          </div>
          <div style={{ position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
            width: 20, height: 20, borderRadius: '50%', background: '#FE2C55',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #000', fontSize: 15, color: '#fff', fontWeight: 800, lineHeight: 1 }}>+</div>
        </div>

        {/* Like */}
        <Btn label={likeCount} icon={
          <svg width="30" height="30" viewBox="0 0 24 24"
            fill={liked ? '#FE2C55' : '#fff'} stroke={liked ? '#FE2C55' : '#fff'} strokeWidth="0.5"
            onClick={(e) => { e.stopPropagation(); setLiked(l => !l); }}
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))', cursor: 'pointer' }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>} />

        {/* Comment */}
        <Btn label="847" icon={
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>} />

        {/* Bookmark */}
        <Btn label="2.1K" icon={
          <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" stroke="none"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>} />

        {/* Share */}
        <Btn label="Paylaş" icon={
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>} />

        {/* Spinning disc */}
        <div style={{ marginTop: 6, width: 44, height: 44, borderRadius: '50%',
          background: '#111', border: '3px solid #444', position: 'relative', overflow: 'hidden',
          animation: 'spinSlow 4s linear infinite', flexShrink: 0 }}>
          {brandProfile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandProfile.logoUrl} alt="" referrerPolicy="no-referrer"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 35% 35%, #666 0%, #222 55%, #000 100%)' }} />
          )}
          {/* Center hole */}
          <div style={{ position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 11, height: 11, borderRadius: '50%',
            background: '#000', border: '1.5px solid #555', zIndex: 2 }} />
        </div>
      </div>

      {/* ── Bottom left — handle + caption + hashtags + music ── */}
      <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom,0px) + 90px)',
        left: 0, right: 68, zIndex: 10, padding: '0 14px 0 12px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 5,
          textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          @{brandProfile.handle}
        </div>
        {caption && (
          <p style={{ fontSize: 14, color: '#fff', lineHeight: 1.45,
            margin: '0 0 6px', textShadow: '0 1px 3px rgba(0,0,0,0.7)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {caption}
          </p>
        )}
        {hashtags.length > 0 && (
          <div style={{ fontSize: 14, color: '#fff', fontWeight: 600, marginBottom: 10,
            textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
            {hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
          </div>
        )}
        {/* Music bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#333',
            border: '1px solid #666', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)',
              display: 'inline-block', whiteSpace: 'nowrap',
              animation: 'marquee 10s linear infinite' }}>
              {music}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{music}
            </span>
          </div>
        </div>

        {/* Approve dock */}
        {isPending && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={onApprove} disabled={approving}
              style={{ flex: 1, padding: '11px', borderRadius: 8, cursor: 'pointer', border: 'none',
                background: 'rgba(16,185,129,0.92)', color: '#fff', fontSize: 14, fontWeight: 700 }}>
              {approving ? 'Onaylanıyor…' : '✓ Onayla'}
            </button>
            <button onClick={onTap}
              style={{ padding: '11px 18px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(255,255,255,0.15)', border: '0.5px solid rgba(255,255,255,0.25)',
                color: '#fff', fontSize: 14 }}>···</button>
          </div>
        )}
      </div>

      {/* ── Video progress bar (bottom, above nav) ── */}
      <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom,0px) + 83px)',
        left: 0, right: 0, height: 2, zIndex: 10 }}>
        <div style={{ height: '100%', width: '38%', background: '#fff', borderRadius: 2 }} />
        <div style={{ position: 'absolute', top: 0, right: 0, left: '38%', height: '100%',
          background: 'rgba(255,255,255,0.25)', borderRadius: 2 }} />
      </div>
    </div>
  );
}

type Filter     = 'all' | 'pending' | 'approved' | 'image' | 'video';
type ResolvedItem = { raw: OutputArtifact; res: ReturnType<typeof resolveArtifact> };

// ── Type detection ──────────────────────────────────────────────────────
type ContentKind = 'story' | 'reel' | 'post' | 'carousel' | 'plan' | 'report' | 'ad' | 'other';

function detectKind(res: ReturnType<typeof resolveArtifact>): ContentKind {
  const ct = (res.contentType ?? '').toLowerCase().replace(/^\d+$/, '');
  if (ct.includes('story'))    return 'story';
  if (ct.includes('reel'))     return 'reel';
  if (ct.includes('carousel')) return 'carousel';
  if (ct.includes('post') || ct.includes('caption')) return 'post';
  if (ct.includes('plan') || ct.includes('calendar')) return 'plan';
  if (ct.includes('report') || ct.includes('analiz') || ct.includes('weekly') || ct.includes('traffic')) return 'report';
  if (ct.includes('ad') || ct.includes('reklam'))   return 'ad';
  if (res.kind === 'video') return 'reel';
  if (res.kind === 'image') return 'post';
  if ((res.ideas?.length ?? 0) > 1) return 'plan';
  return 'other';
}

// Aspect ratio per type
function kindAspect(k: ContentKind): string {
  if (k === 'story' || k === 'reel') return '9/16';
  if (k === 'carousel') return '4/5';
  if (k === 'post') return '4/5';
  return '1/1';
}

// Accent color per type
const KIND_COLOR: Record<ContentKind, string> = {
  story:    '#C084FC',
  reel:     '#F472B6',
  post:     '#60A5FA',
  carousel: '#818CF8',
  plan:     '#34D399',
  report:   '#F59E0B',
  ad:       '#FCD34D',
  other:    '#9DBECE',
};

// Label per type
const KIND_LABEL: Record<ContentKind, string> = {
  story:    'Story',
  reel:     'Reel',
  post:     'Post',
  carousel: 'Carousel',
  plan:     'İçerik Planı',
  report:   'Rapor',
  ad:       'Reklam',
  other:    'İçerik',
};

// Icon per type
const KIND_ICON: Record<ContentKind, string> = {
  story:    '▋',
  reel:     '▶',
  post:     '□',
  carousel: '⊞',
  plan:     '≡',
  report:   '↗',
  ad:       '◎',
  other:    '✦',
};

function timeAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'Az önce';
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}sa`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// ── Gallery Card ────────────────────────────────────────────────────────
function GalleryCard({ item, onClick, scheduled = false }: { item: ResolvedItem; onClick: () => void; scheduled?: boolean }) {
  const { t } = useTheme();
  const [imgErr, setImgErr] = useState(false);
  const { raw, res } = item;
  const kind     = detectKind(res);
  const aspect   = kindAspect(kind);
  const color    = KIND_COLOR[kind];
  const label    = KIND_LABEL[kind];
  const icon     = KIND_ICON[kind];
  const isPending = raw.status === 'pending_review';
  const isApproved = raw.status === 'approved';
  const isDraft = isDraftArtifact(raw);
  const img = (!imgErr && (res.thumbnailUrl ?? res.imageUrl)) || null;
  const title = res.headline ?? res.title ?? '';
  const caption = res.caption ?? res.summary ?? '';
  const isPortrait = kind === 'story' || kind === 'reel';
  const isText = kind === 'plan' || kind === 'report';

  // Background gradient per type
  const bgGrad = isPortrait
    ? `linear-gradient(180deg, #1a0030 0%, #0d1040 50%, #050818 100%)`
    : kind === 'ad'
    ? `linear-gradient(160deg, #1a1000 0%, #2d2000 50%, #0d0800 100%)`
    : kind === 'report'
    ? `linear-gradient(160deg, #001a12 0%, #003a22 50%, #000d08 100%)`
    : `linear-gradient(160deg, #001a3a 0%, #0a2a5a 50%, #000d20 100%)`;

  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden',
        aspectRatio: aspect, width: '100%',
        cursor: 'pointer', border: 'none', display: 'block',
        background: '#000',
        boxShadow: isPending
          ? `0 0 0 1.5px rgba(245,158,11,0.5), 0 6px 24px rgba(0,0,0,0.5)`
          : `0 4px 20px rgba(0,0,0,0.45)`,
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* Real image */}
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={title} referrerPolicy="no-referrer"
          onError={() => setImgErr(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}

      {/* Placeholder when no image */}
      {!img && (
        <div style={{ position: 'absolute', inset: 0, background: bgGrad,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 14 }}>

          {/* Ambient glow */}
          <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: '80%', height: '40%',
            background: `radial-gradient(ellipse, ${color}18 0%, transparent 70%)`,
            pointerEvents: 'none' }} />

          {/* Type icon */}
          <div style={{ width: 42, height: 42, borderRadius: 13,
            background: `${color}15`, border: `1px solid ${color}28`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 10, fontSize: 18, color }}>
            {icon}
          </div>

          {title && (
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0',
              textAlign: 'center', lineHeight: 1.3, maxWidth: '90%',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
              {title}
            </div>
          )}

          {caption && !isText && (
            <div style={{ fontSize: 10, color: 'rgba(226,232,240,0.45)', textAlign: 'center',
              marginTop: 5, lineHeight: 1.4, maxWidth: '88%',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden' }}>
              {caption.replace(/#\w+/g, '').trim()}
            </div>
          )}
        </div>
      )}

      {/* Cinematic vignette over real images */}
      {img && (
        <div style={{ position: 'absolute', inset: 0,
          background: 'linear-gradient(0deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.0) 50%, rgba(0,0,0,0.2) 100%)',
          pointerEvents: 'none' }} />
      )}

      {/* Story-style progress bar (story/reel) */}
      {isPortrait && (
        <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 5,
          height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.3)',
          overflow: 'hidden' }}>
          <div style={{ width: '60%', height: '100%', background: 'rgba(255,255,255,0.9)',
            borderRadius: 1 }} />
        </div>
      )}

      {/* Reel play overlay */}
      {kind === 'reel' && img && (
        <div style={{ position: 'absolute', bottom: 36, right: 10, zIndex: 5,
          width: 28, height: 28, borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, color: '#fff', marginLeft: 2 }}>▶</span>
        </div>
      )}

      {/* Carousel pages indicator */}
      {kind === 'carousel' && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 5,
          padding: '2px 7px', borderRadius: 20,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          fontSize: 9, color: '#fff', fontWeight: 600 }}>
          ⊞ 1+
        </div>
      )}

      {/* Top badges */}
      <div style={{ position: 'absolute', top: isPortrait ? 18 : 8, left: 8, right: 8,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 10 }}>
        <div style={{ fontSize: 9, padding: '3px 8px', borderRadius: 20,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          color: color, fontWeight: 700, letterSpacing: '0.03em',
          border: `0.5px solid ${color}30` }}>
          {label}
        </div>
        {scheduled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 8px', borderRadius: 20,
            background: 'rgba(96,165,250,0.85)', backdropFilter: 'blur(8px)',
            fontSize: 9, fontWeight: 700, color: '#fff' }}>
            🕐 Zamanlandı
          </div>
        )}
        {!scheduled && isDraft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 8px', borderRadius: 20,
            background: 'rgba(148,163,184,0.85)', backdropFilter: 'blur(8px)',
            fontSize: 9, fontWeight: 700, color: '#fff' }}>
            💾 Taslak
          </div>
        )}
        {!scheduled && !isDraft && isPending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 3,
            padding: '3px 7px', borderRadius: 20,
            background: 'rgba(245,158,11,0.9)', backdropFilter: 'blur(8px)',
            fontSize: 9, fontWeight: 700, color: '#000' }}>
            ● İncele
          </div>
        )}
        {!scheduled && !isDraft && isApproved && (
          <div style={{ width: 18, height: 18, borderRadius: '50%',
            background: 'rgba(16,185,129,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: '#fff' }}>✓</div>
        )}
      </div>

      {/* Bottom bar — title + meta over image */}
      {img && (title || res.createdAt) && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '8px 10px 10px', zIndex: 10 }}>
          {title && (
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2,
              marginBottom: 3, overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
              {title}
            </div>
          )}
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
            {timeAgo(res.createdAt)}
          </div>
        </div>
      )}

      {/* Bottom color accent line */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${color}80, transparent)`,
        zIndex: 4 }} />
    </button>
  );
}

// ── Filter pill ─────────────────────────────────────────────────────────
function FilterPill({ id, label, active, count, onClick, t }: {
  id: Filter; label: string; active: boolean; count?: number; onClick: () => void; t: T;
}) {
  const color = id === 'pending' ? t.warning : id === 'approved' ? t.success : t.accent;
  return (
    <button onClick={onClick} style={{
      flexShrink: 0, padding: '8px 16px', borderRadius: 30, cursor: 'pointer',
      fontSize: 13, fontWeight: active ? 700 : 400,
      background: active ? `${color}14` : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'),
      border: `0.5px solid ${active ? color + '30' : t.separator}`,
      color: active ? color : t.textTertiary,
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {label}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 11, padding: '0 5px', borderRadius: 10,
          background: active ? `${color}22` : (t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'),
          color: active ? color : t.textMuted, fontWeight: 700 }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────
function Skeleton({ t }: { t: T }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[0, 1].map(col => (
        <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: col * 22 }}>
          {[200, 140, 260].map((h, i) => (
            <div key={i} style={{ height: h, borderRadius: 18,
              background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)',
              animation: 'shimmer 1.4s ease-in-out infinite' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Smart grid: stories/reels get their own section ─────────────────────
function SmartGrid({ items, onOpen, scheduledIds = new Set() }: {
  items: ResolvedItem[];
  onOpen: (item: ResolvedItem) => void;
  scheduledIds?: Set<string>;
}) {
  const { t } = useTheme();

  const portrait = items.filter(i => { const k = detectKind(i.res); return k === 'story' || k === 'reel'; });
  const square   = items.filter(i => { const k = detectKind(i.res); return k !== 'story' && k !== 'reel' && k !== 'plan' && k !== 'report'; });
  const text     = items.filter(i => { const k = detectKind(i.res); return k === 'plan' || k === 'report'; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Stories & Reels — 3-column narrow portrait */}
      {portrait.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor,
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Story & Reel
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {portrait.map(item => (
              <GalleryCard key={item.raw.id} item={item} onClick={() => onOpen(item)} scheduled={scheduledIds.has(item.raw.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Posts, carousels, ads — 2-column */}
      {square.length > 0 && (
        <div>
          {portrait.length > 0 && (
            <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor,
              letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
              Post & Reklam
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {square.filter((_, i) => i % 2 === 0).map(item => (
                <GalleryCard key={item.raw.id} item={item} onClick={() => onOpen(item)} scheduled={scheduledIds.has(item.raw.id)} />
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 20 }}>
              {square.filter((_, i) => i % 2 === 1).map(item => (
                <GalleryCard key={item.raw.id} item={item} onClick={() => onOpen(item)} scheduled={scheduledIds.has(item.raw.id)} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content plans & reports — full width */}
      {text.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor,
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
            Planlar & Raporlar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {text.map(item => (
              <GalleryCard key={item.raw.id} item={item} onClick={() => onOpen(item)} scheduled={scheduledIds.has(item.raw.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Instagram Story Viewer (full-screen overlay, multi-story navigation) ─────
function IGStoryViewer({ stories, initialIndex = 0, brandProfile, onClose, onApprove, approving }: {
  stories: OutputArtifact[];
  initialIndex?: number;
  brandProfile: BrandProfile;
  onClose: () => void;
  onApprove: (id: string) => void;
  approving: boolean;
}) {
  const [idx, setIdx] = useState(initialIndex);
  const artifact = stories[idx]!;

  const content = parseArtifactContent(artifact.content);
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const img = resolveArtifactImg(artifact);
  const caption = (content.caption as string) || (meta.caption as string) || '';
  const isPending = artifact.status === 'pending_review';

  const goNext = () => { if (idx < stories.length - 1) setIdx(i => i + 1); else onClose(); };
  const goPrev = () => { if (idx > 0) setIdx(i => i - 1); };

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      minHeight: '-webkit-fill-available',
      zIndex: 400,
      background: '#000',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      overscrollBehavior: 'none',
    }}
    >
      {/* ── Full-screen media (background layer) ── */}
      <div style={{ position: 'absolute', inset: 0, background: '#000' }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" referrerPolicy="no-referrer"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'linear-gradient(135deg,#3a1040,#1a0828)' }}>
            <span style={{ fontSize: 60, opacity: 0.15 }}>↕</span>
          </div>
        )}
      </div>

      {/* ── Tap zones — sol %35 = önceki, sağ %65 = sonraki ── */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 10 }}>
        <div style={{ width: '35%', height: '100%', cursor: 'pointer' }} onClick={goPrev} />
        <div style={{ flex: 1, height: '100%', cursor: 'pointer' }} onClick={goNext} />
      </div>

      {/* ── Top chrome — progress bars + header ── */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: 'calc(env(safe-area-inset-top,0px) + 8px) 10px 0' }}>

        {/* Per-story progress bars */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
          {stories.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 2, borderRadius: 2,
              background: i < idx ? '#fff' : 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
              {i === idx && (
                <div style={{ height: '100%', background: '#fff', borderRadius: 2,
                  animation: 'storyProgress 5s linear forwards' }} />
              )}
            </div>
          ))}
        </div>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
            border: '2px solid #fff', flexShrink: 0,
            background: brandProfile.logoUrl ? 'transparent' : '#333',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff' }}>
            {brandProfile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandProfile.logoUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : brandProfile.handle[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>@{brandProfile.handle}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>
              {timeAgoShort(artifact.createdAt)}
            </span>
          </div>
          {isPending && (
            <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10,
              background: 'rgba(245,158,11,0.85)', color: '#000', fontWeight: 700 }}>Bekliyor</span>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', color: '#fff', fontSize: 24, padding: 4, lineHeight: 1, zIndex: 30 }}>×</button>
        </div>
      </div>

      {/* ── Bottom — caption + reply/approve ── */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.72))',
        padding: '48px 14px calc(env(safe-area-inset-bottom,0px) + 18px)' }}>
        {caption && (
          <p style={{ fontSize: 14, color: '#fff', lineHeight: 1.5, marginBottom: 12, opacity: 0.92 }}>
            {caption.slice(0, 140)}
          </p>
        )}
        {/* Story index indicator */}
        {stories.length > 1 && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
            {idx + 1} / {stories.length}
          </div>
        )}
        {isPending ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onApprove(artifact.id)} disabled={approving}
              style={{ flex: 1, padding: '12px', borderRadius: 24, border: 'none', cursor: 'pointer',
                background: 'rgba(16,185,129,0.9)', color: '#fff', fontSize: 14, fontWeight: 700 }}>
              {approving ? 'Onaylanıyor…' : '✓ Onayla'}
            </button>
            <button onClick={goNext}
              style={{ padding: '12px 18px', borderRadius: 24, cursor: 'pointer',
                background: 'rgba(255,255,255,0.15)', border: '0.5px solid rgba(255,255,255,0.3)',
                color: '#fff', fontSize: 13, fontWeight: 600 }}>
              {idx < stories.length - 1 ? 'Sonraki →' : 'Kapat'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ flex: 1, padding: '10px 16px', borderRadius: 24,
              border: '1px solid rgba(255,255,255,0.35)', color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
              Mesaj gönder…
            </div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Platform Feed Tab ────────────────────────────────────────────────────────
function PlatformTab({ platform, artifacts, t, openApproval, openCreative, openPlatformPreview, brandProfile, workspaceId }: {
  platform: Platform; artifacts: OutputArtifact[]; t: T;
  openApproval: (id: string) => void; openCreative: (id: string) => void;
  openPlatformPreview: (id: string) => void;
  brandProfile: BrandProfile;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const [viewingStoryIdx, setViewingStoryIdx] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const approveMutation = useMutation({
    mutationFn: async (artifact: OutputArtifact) => {
      if (!workspaceId) {
        throw new Error('Tenant seçili değil.');
      }
      const mcStatus = await apiClient.getMertcafeStatus(workspaceId);
      assertMertcafePublishReady(mcStatus);
      const publishAuth = resolveMertcafePublishAuth(mcStatus);

      const resolved = (() => { try { return resolveArtifact(artifact); } catch { return null; } })();
      const content = parseArtifactContent(artifact.content);
      const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
      const kindToken = String(
        (content.kind as string)
        || (content.contentType as string)
        || (meta.kind as string)
        || (meta.contentType as string)
        || resolved?.contentType
        || artifact.artifactType
        || '',
      ).toLowerCase();

      const caption = String(
        (content.caption as string)
        || (meta.caption as string)
        || resolved?.caption
        || '',
      );
      const hashtags = ((content.hashtags ?? meta.hashtags ?? resolved?.hashtags ?? []) as string[])
        .map(String)
        .filter(Boolean);
      const imageUrl = String(
        (content.imageUrl as string)
        || (meta.imageUrl as string)
        || resolved?.imageUrl
        || artifact.contentUrl
        || '',
      );
      const videoUrl = String(
        (content.videoUrl as string)
        || (meta.videoUrl as string)
        || resolved?.videoUrl
        || '',
      );
      const normalizedMediaUrls = resolveCarouselUrls(content, meta);

      const isStory = kindToken.includes('story');
      const isReel = kindToken.includes('reel');
      const isCarousel = normalizedMediaUrls.length >= 2;
      const postType = isStory ? 'story' : isReel ? 'reels' : isCarousel ? 'carousel' : 'feed';

      const publishPayload: Record<string, unknown> = {
        post_type: postType,
        artifactId: artifact.id,
        workspaceId,
      };
      if (publishAuth.useOAuthAccount) {
        publishPayload.use_oauth_account = true;
      } else if (publishAuth.accountId) {
        publishPayload.account_id = publishAuth.accountId;
      }
      if (postType === 'story') {
        if (videoUrl) {
          publishPayload.video_url = videoUrl;
        } else {
          publishPayload.image_url = imageUrl;
        }
      } else if (postType === 'feed') {
        publishPayload.image_url = imageUrl;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }
      if (postType === 'reels') {
        publishPayload.video_url = videoUrl;
        publishPayload.share_to_feed = true;
        publishPayload.content = caption;
        publishPayload.hashtags = hashtags;
      }
      if (postType === 'carousel') {
        publishPayload.media_urls = normalizedMediaUrls;
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

      await apiClient.approveArtifact(artifact.id, 'Approved and published from platform feed');
      return publishJson;
    },
    onMutate: () => setPublishError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
    onError: (err) => setPublishError(err instanceof Error ? err.message : 'Paylaşım başarısız'),
  });

  const sorted = [...artifacts].sort((a, b) => {
    if (a.status === 'pending_review' && b.status !== 'pending_review') return -1;
    if (b.status === 'pending_review' && a.status !== 'pending_review') return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }).slice(0, 50);

  // Separate stories from posts (for Instagram)
  const isStoryArtifact = (a: OutputArtifact) => {
    try { const c = JSON.parse(a.content || '{}'); return String(c.kind || '').includes('story'); } catch { return false; }
  };
  const stories  = platform === 'instagram' ? sorted.filter(isStoryArtifact) : [];
  const feedItems = platform === 'instagram' ? sorted.filter(a => !isStoryArtifact(a)) : sorted;

  if (sorted.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center',
        background: platform === 'tiktok' ? '#010101' : '#000', minHeight: 300 }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.15 }}>
          {platform === 'instagram' ? '📷' : platform === 'x' ? '✕' : '♪'}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Henüz içerik yok</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Mission Hub'dan içerik üret</div>
      </div>
    );
  }

  return (
    <div style={{ background: platform === 'tiktok' ? '#010101' : '#000' }}>

      {/* ── INSTAGRAM STORIES ROW ── */}
      {platform === 'instagram' && (
        <div style={{
          borderBottom: '0.5px solid #1a1a1a',
          paddingBottom: 12,
        }}>
          <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '12px 14px 0',
            scrollbarWidth: 'none' }}>
            {/* Brand's own story slot */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                {/* Gradient ring — always "unseen" red/orange for brand */}
                <div style={{
                  width: 66, height: 66, borderRadius: '50%', padding: 2,
                  background: stories.length > 0
                    ? 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)'
                    : 'rgba(255,255,255,0.15)',
                }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%',
                    border: '3px solid #000', overflow: 'hidden', background: '#222',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 800, color: '#fff' }}>
                    {brandProfile.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brandProfile.logoUrl} alt="" referrerPolicy="no-referrer"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : brandProfile.handle[0]?.toUpperCase()}
                  </div>
                </div>
                {stories.length > 0 && (
                  <div style={{ position: 'absolute', bottom: 0, right: 0,
                    width: 20, height: 20, borderRadius: '50%', background: '#0095f6',
                    border: '2px solid #000', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 13, color: '#fff', fontWeight: 800 }}>+</div>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)',
                textAlign: 'center', maxWidth: 66, overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {brandProfile.handle.slice(0, 8) || 'Senin'}
              </span>
            </div>

            {/* Story bubbles for each story artifact */}
            {stories.map((artifact, i) => {
              const c = parseArtifactContent(artifact.content);
              const img: string | null = resolveArtifactImg(artifact);
              const isPending = artifact.status === 'pending_review';
              return (
                <button key={artifact.id} onClick={() => setViewingStoryIdx(i)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 5, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {/* Gradient ring — orange/red for pending (unviewed), gray for approved */}
                  <div style={{
                    width: 66, height: 66, borderRadius: '50%', padding: 2,
                    background: isPending
                      ? 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)'
                      : 'rgba(255,255,255,0.2)',
                  }}>
                    <div style={{ width: '100%', height: '100%', borderRadius: '50%',
                      border: '3px solid #000', overflow: 'hidden', background: '#222',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" referrerPolicy="no-referrer"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ fontSize: 22, opacity: 0.3 }}>↕</div>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: isPending ? '#fff' : 'rgba(255,255,255,0.5)',
                    textAlign: 'center', maxWidth: 66, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isPending ? 'Bekliyor' : `Story ${i + 1}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FEED POSTS ── */}
      {feedItems.map((artifact, idx) => {
        let res: ReturnType<typeof resolveArtifact>;
        try { res = resolveArtifact(artifact); } catch { return null; }
        const isApproving = approveMutation.isPending && approveMutation.variables?.id === artifact.id;
        const onApprove = () => approveMutation.mutate(artifact);
        const onTap = () => openPlatformPreview(artifact.id);
        if (platform === 'instagram')
          return <IGNativePost key={artifact.id} artifact={artifact} res={res} t={t}
            onApprove={onApprove} onTap={onTap} approving={isApproving} brandProfile={brandProfile} />;
        if (platform === 'x')
          return <XNativePost key={artifact.id} artifact={artifact} res={res} t={t}
            onApprove={onApprove} onTap={onTap} approving={isApproving} brandProfile={brandProfile} />;
        return <TikTokNativePost key={artifact.id} artifact={artifact} res={res} t={t}
          onApprove={onApprove} onTap={onTap} approving={isApproving}
          brandProfile={brandProfile} isFirst={idx === 0} />;
      })}

      {/* Story viewer — portalla AppShell kaydırmasından çıkar */}
      {viewingStoryIdx !== null && stories.length > 0 &&
        createPortal(
          <IGStoryViewer
            stories={stories}
            initialIndex={viewingStoryIdx}
            brandProfile={brandProfile}
            onClose={() => setViewingStoryIdx(null)}
            onApprove={(id) => {
              const selected = stories.find((s) => s.id === id);
              if (selected) approveMutation.mutate(selected);
            }}
            approving={approveMutation.isPending}
          />,
          document.body,
        )}
      {publishError && (
        <div style={{ padding: '10px 12px', color: '#fb7185', fontSize: 12, fontWeight: 600 }}>
          ⚠ {publishError}
        </div>
      )}
    </div>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────
export function Outputs() {
  const { t } = useTheme();
  const { openApproval, openCreative, navigate, openPlatformPreview } = useMobileStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [activePlatform, setActivePlatform] = useState<Platform | 'all'>('instagram');

  const { data: rawArtifacts = [], isLoading, error } = useMobileArtifacts({
    subscribeOnly: true,
    params: { limit: MOBILE_ARTIFACT_OUTPUTS_LIMIT },
  });

  // Brand profile — instagram handle + name + logo for native post headers
  const { tenantId } = useWorkspaceStore();
  const { data: profile } = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 5 * 60_000,
  });
  const { data: productionSnapshot } = useQuery({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(tenantId),
    staleTime: 60_000, // 1 min — logo_url artık doluyor, sık yenile
    enabled: !!tenantId,
  });
  const brandCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);
  const brandProfile = buildBrandProfileFromQueries(profile, brandCtx, proxyUrl);

  // Scheduled posts — for "Zamanlandı" badge on cards
  const { data: scheduledPosts = [] } = useQuery({
    queryKey: ['scheduled-posts', tenantId],
    queryFn: () => apiClient.getScheduledPosts(tenantId),
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });
  const scheduledIds = (() => {
    const ids = new Set<string>();
    for (const a of rawArtifacts as OutputArtifact[]) {
      if (findScheduledForArtifact(a, scheduledPosts)) ids.add(a.id);
    }
    return ids;
  })();

  const publishableArtifacts = useMemo(
    () => filterFeedPublishableArtifacts(rawArtifacts as OutputArtifact[]),
    [rawArtifacts],
  );

  const all: ResolvedItem[] = publishableArtifacts.slice(0, 120).flatMap(a => {
    try { return [{ raw: a, res: resolveArtifact(a) }]; } catch { return []; }
  });

  const filtered = all.filter(({ raw, res }) => {
    if (filter === 'all')      return true;
    if (filter === 'pending')  return raw.status === 'pending_review';
    if (filter === 'approved') return raw.status === 'approved';
    if (filter === 'image')    return !!res.imageUrl;
    if (filter === 'video')    return !!res.videoUrl;
    return true;
  });

  const pending  = all.filter(({ raw }) => raw.status === 'pending_review');
  const approved = all.filter(({ raw }) => raw.status === 'approved');

  function open(item: ResolvedItem) {
    openPlatformPreview(item.raw.id);
  }

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, transition: 'background 250ms ease', position: 'relative' }}>

      {/* ── Floating "Yeni" FAB — bottom right, always on top ── */}
      <button onClick={() => navigate('new-brief')} style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
        right: 20,
        zIndex: 50,
        width: 56, height: 56, borderRadius: '50%',
        background: 'linear-gradient(135deg, #4D7088, #5A82A0)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(77,112,136,0.55), 0 2px 8px rgba(0,0,0,0.3)',
        transition: 'transform 150ms ease',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      {/* ── PLATFORM TAB HEADER — scrolls away with content ── */}
      <div style={{
        paddingTop: 'calc(env(safe-area-inset-top,0px) + 12px)',
        paddingBottom: 10,
        paddingLeft: 16,
        paddingRight: 16,
        background: activePlatform === 'all' ? t.bg
          : activePlatform === 'tiktok' ? '#010101' : '#000',
        borderBottom: activePlatform === 'all' ? `0.5px solid ${t.separator}` : 'none',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Tümü butonu */}
          <button onClick={() => setActivePlatform('all')}
            style={{
              padding: '11px 14px', borderRadius: 14, cursor: 'pointer', flexShrink: 0,
              border: `0.5px solid ${activePlatform === 'all' ? t.accent + '55' : t.separator}`,
              background: activePlatform === 'all' ? (t.isDark ? 'rgba(157,190,206,0.1)' : 'rgba(157,190,206,0.08)') : 'transparent',
              fontSize: 12, fontWeight: 600,
              color: activePlatform === 'all' ? t.accent : (t.isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)'),
              whiteSpace: 'nowrap', transition: 'all 180ms ease',
            }}>
            Tümü
          </button>

          {/* Platform ikonları */}
          {PLATFORMS.map(p => {
            const isActive = activePlatform === p.id;
            const iconFill = isActive ? '#fff'
              : t.isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.35)';
            return (
              <button key={p.id} onClick={() => setActivePlatform(p.id)}
                style={{
                  flex: 1, padding: '11px 4px', borderRadius: 14, cursor: 'pointer',
                  border: isActive ? 'none' : `0.5px solid ${t.separator}`,
                  background: isActive ? p.bg : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isActive ? '0 2px 16px rgba(0,0,0,0.45)' : 'none',
                  transition: 'all 180ms ease',
                }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill={iconFill}>
                  <path d={p.svgPath} />
                </svg>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── PLATFORM FEED ── */}
      {activePlatform !== 'all' && (
        <PlatformTab
          platform={activePlatform}
          artifacts={(rawArtifacts as OutputArtifact[]).filter(a =>
            a.status === 'pending_review' || a.status === 'approved'
          )}
          t={t}
          openApproval={openApproval}
          openCreative={openCreative}
          openPlatformPreview={openPlatformPreview}
          brandProfile={brandProfile}
          workspaceId={tenantId}
        />
      )}

      {/* ── ALL — gallery grid ── */}
      {activePlatform === 'all' && (
        <div style={{ padding: '16px 16px 100px' }}>
          {isLoading && <Skeleton t={t} />}
          {!isLoading && error && (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.3 }}>⚠</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.danger }}>Yüklenemedi</div>
            </div>
          )}
          {!isLoading && !error && (rawArtifacts as OutputArtifact[]).length === 0 && (
            <div style={{ padding: '60px 24px 40px', textAlign: 'center', position: 'relative' }}>
              {/* Cinematic illustration — concentric gradient rings + sparkle */}
              <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 24px' }}>
                {/* Outer pulse ring */}
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(157,190,206,0.18) 0%, transparent 65%)',
                  animation: 'breathe 3s ease-in-out infinite' }} />
                {/* Mid ring */}
                <div style={{ position: 'absolute', inset: 24, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(96,165,250,0.16) 0%, transparent 60%)' }} />
                {/* Inner glow */}
                <div style={{ position: 'absolute', inset: 44, borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(244,114,182,0.22) 0%, rgba(157,190,206,0.10) 70%, transparent 100%)' }} />
                {/* Sparkle */}
                <div style={{ position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 48, color: '#fff', opacity: 0.95,
                  textShadow: '0 4px 24px rgba(157,190,206,0.55)' }}>✦</div>
              </div>

              <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary,
                marginBottom: 8, letterSpacing: '-0.03em' }}>
                AI ekibin hazır
              </div>
              <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 28,
                lineHeight: 1.6, maxWidth: 280, margin: '0 auto 28px' }}>
                Bir brief ver veya yeni bir kampanya başlat — ilk içerikler birkaç dakika içinde burada belirir.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 260, margin: '0 auto' }}>
                <button onClick={() => navigate('missions')} style={{
                  padding: '14px', borderRadius: 16, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #4D7088, #5A82A0)',
                  border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                  boxShadow: '0 4px 18px rgba(77,112,136,0.4)',
                  letterSpacing: '-0.01em' }}>
                  ✦ Mission Hub'a Git
                </button>
                <button onClick={() => navigate('new-brief')} style={{
                  padding: '12px', borderRadius: 14, cursor: 'pointer',
                  background: 'transparent',
                  border: `0.5px solid ${t.separator}`,
                  color: t.textMuted, fontSize: 13, fontWeight: 600 }}>
                  Yeni Brief Oluştur
                </button>
              </div>
            </div>
          )}
          {!isLoading && !error && (rawArtifacts as OutputArtifact[]).length > 0 && (() => {
            const all = (rawArtifacts as OutputArtifact[]).slice(0, 80).flatMap(a => {
              try { return [{ raw: a, res: resolveArtifact(a) }]; } catch { return []; }
            });
            return <SmartGrid items={all} onOpen={item => openPlatformPreview(item.raw.id)} scheduledIds={scheduledIds} />;
          })()}
        </div>
      )}

    </div>
  );
}

'use client';
/**
 * Mobile-native artifact viewer.
 * Uses the same signalFromArtifact() normalization as admin panel,
 * then renders mobile-optimised Instagram previews.
 */
import { useState } from 'react';
import { signalFromArtifact } from '@/components/artifacts/artifact-preview';
import type { ArtifactSignal, ArtifactIdea } from '@/components/artifacts/artifact-preview';
import type { OutputArtifact } from '@/types';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { useTheme } from './theme-context';

// ─── Helpers ──────────────────────────────────────────────────────────
function resolveImageSrc(url: string | null | undefined): string | null {
  return resolveClientMediaUrl(url);
}

function formatLabel(contentType: string | undefined): string {
  const ct = (contentType ?? '').toLowerCase();
  if (ct.includes('story'))    return 'Story';
  if (ct.includes('reel'))     return 'Reel';
  if (ct.includes('carousel')) return 'Carousel';
  if (ct.includes('4x5') || ct.includes('portrait')) return 'Post 4:5';
  if (ct.includes('plan') || ct.includes('calendar')) return 'Content Plan';
  return 'Post';
}

// ─── Instagram Post Preview ──────────────────────────────────────────
function IgPost({
  signal,
  immersive = false,
  location = '',
  ctaText = '',
  conceptTitle = '',
  showHeader = false,   // hide the avatar/handle row by default in preview contexts
}: {
  signal: ArtifactSignal;
  immersive?: boolean;
  location?: string;
  ctaText?: string;
  conceptTitle?: string;
  showHeader?: boolean;
}) {
  const rawHandle = (signal.brand?.handle ?? '').replace('@', '');
  const handle    = rawHandle || (signal.brand as any)?.name || '';
  const img      = resolveImageSrc(signal.imageUrl);
  const caption  = signal.caption ?? signal.summary ?? '';
  const hashtags = (signal.hashtags ?? []).slice(0, 12).map(h => h.startsWith('#') ? h : `#${h}`);
  const headline = conceptTitle || signal.summary || '';

  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  return (
    <div style={{
      background: '#fff',
      borderRadius: immersive ? 0 : 14,
      overflow: 'hidden',
      boxShadow: immersive ? 'none' : '0 1px 12px rgba(0,0,0,0.10)',
      width: '100%',
      maxWidth: '100%',   // always full-width, no 390px cap that causes overflow
      margin: '0 auto',
      fontFamily: font,
      boxSizing: 'border-box' as const,
    }}>

      {/* ── Header (Instagram layout) — only shown when explicitly enabled ── */}
      {showHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
          {/* Avatar with Instagram gradient ring */}
          <div style={{ width: 34, height: 34, borderRadius: '50%', padding: 2, background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', flexShrink: 0 }}>
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2 }}>
              <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg,#4D7088,#5A82A0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>
                {(handle || 'B').slice(0,1).toUpperCase()}
              </div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#000', lineHeight: 1.2 }}>{handle || 'brand'}</div>
            {location && <div style={{ fontSize: 11, color: '#00376b', marginTop: 1 }}>{location}</div>}
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
            <circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>
          </svg>
        </div>
      )}

      {/* ── Image / Visual — full image always visible, no cropping ── */}
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={caption.slice(0, 60)} referrerPolicy="no-referrer"
          style={{
            width: '100%',
            height: 'auto',       // natural height — never crops
            display: 'block',
            maxWidth: '100%',
          }} />
      ) : (
        /* Branded concept post — like Instagram branded text posts */
        <div style={{
          width: '100%', aspectRatio: immersive ? '4/5' : '1/1',
          background: 'linear-gradient(160deg, #0c0024 0%, #1a0055 30%, #0a1a4a 65%, #050812 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden', padding: 28,
        }}>
          {/* Glow layers */}
          <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: '120%', height: '50%', background: 'radial-gradient(ellipse, rgba(77,112,136,0.2) 0%, transparent 65%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '5%', right: '-10%', width: '80%', height: '40%', background: 'radial-gradient(ellipse, rgba(59,130,246,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />

          {/* Brand monogram */}
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, zIndex: 2 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>{handle.slice(0,1).toUpperCase()}</span>
          </div>

          {/* Headline */}
          {headline && (
            <div style={{ zIndex: 2, textAlign: 'center', marginBottom: 14, maxWidth: '90%' }}>
              <div style={{ fontSize: immersive ? 24 : 18, fontWeight: 900, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.025em', textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
                {headline}
              </div>
            </div>
          )}

          {/* Separator */}
          <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.2)', marginBottom: 14, zIndex: 2 }} />

          {/* Caption preview */}
          {caption && (
            <p style={{ zIndex: 2, fontSize: immersive ? 13 : 11, color: 'rgba(226,232,240,0.65)', lineHeight: 1.6, textAlign: 'center', maxWidth: '88%', margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {caption}
            </p>
          )}

          {/* CTA */}
          {ctaText && (
            <div style={{ marginTop: 20, zIndex: 2, padding: '8px 20px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em' }}>
              {ctaText}
            </div>
          )}

          {/* Bottom handle */}
          <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', zIndex: 2 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>@{handle}</span>
          </div>
        </div>
      )}

      {/* ── Instagram action bar ── */}
      <div style={{ padding: '10px 14px 5px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Heart */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        {/* Comment */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {/* Share */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
        {/* Bookmark (right-aligned) */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      </div>

      {/* ── Caption area ── */}
      <div style={{ padding: '2px 14px 14px' }}>
        {/* Like count */}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#000', marginBottom: 4 }}>
          {(Math.floor(Math.random() * 900) + 100).toLocaleString()} beğeni
        </div>
        {/* Caption with handle */}
        {caption && (
          <div style={{ fontSize: 14, color: '#000', lineHeight: 1.5, marginBottom: 5 }}>
            <span style={{ fontWeight: 700 }}>{handle} </span>
            <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {/* Strip embedded hashtags from caption to show separately */}
              {caption.replace(/#\w+/g, '').trim()}
            </span>
          </div>
        )}
        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div style={{ fontSize: 14, color: '#00376b', lineHeight: 1.6 }}>
            {hashtags.join(' ')}
          </div>
        )}
        {/* Time */}
        <div style={{ fontSize: 11, color: '#8e8e8e', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Az önce
        </div>
      </div>
    </div>
  );
}

// ─── Instagram Story/Reel Preview ────────────────────────────────────
function IgStoryReel({
  signal,
  isReel,
  fullScreen = false,
  immersive = false,
}: {
  signal: ArtifactSignal;
  isReel: boolean;
  fullScreen?: boolean;
  immersive?: boolean;
}) {
  const handle  = signal.brand?.handle ?? '@brand';
  const img     = resolveImageSrc(signal.imageUrl);
  const videoSrc = resolveImageSrc(signal.videoUrl);
  /** Story mock’unda çoğu slot caption yerine yalnızca headline üretir — summary ile doldur */
  const caption  = (signal.caption ?? signal.summary ?? '').trim();
  const hashtags = (signal.hashtags ?? []).slice(0, 15);

  const showTopChrome = !fullScreen || immersive;

  // fullScreen: true viewport (no chrome). immersive: büyük görsel, ince üst çubuk.
  const containerStyle: React.CSSProperties = fullScreen && !immersive
    ? {
        position: 'relative',
        width: '100%', height: '100dvh',
        overflow: 'hidden', background: '#000',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }
    : immersive
      ? {
          position: 'relative',
          width: '100%',
          aspectRatio: '9/16',
          maxHeight: '86dvh',
          minHeight: '52dvh',
          margin: '0 auto',
          borderRadius: 0,
          overflow: 'hidden',
          background: '#000',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }
      : {
          position: 'relative', aspectRatio: '9/16',
          width: '100%', maxWidth: 300, margin: '0 auto',
          borderRadius: 18, overflow: 'hidden',
          background: '#1a1a2e',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        };

  return (
    <div style={containerStyle}>
      {/* Background */}
      {videoSrc && isReel ? (
        <video src={videoSrc} muted playsInline loop autoPlay
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" referrerPolicy="no-referrer"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#9DBECE,#f472b6,#60a5fa)' }} />
      )}

      {/* Bottom gradient */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(0deg, rgba(0,0,0,0.75) 0%, transparent 100%)' }} />

      {/* Top: story progress + handle */}
      {showTopChrome && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          padding: immersive ? '10px 10px 6px' : '12px 12px 8px',
          zIndex: 4,
        }}>
          <div style={{ display: 'flex', gap: immersive ? 2 : 3, marginBottom: immersive ? 6 : 8 }}>
            {[1,2,3].map((i) => (
              <div key={i} style={{ flex: 1, height: immersive ? 2 : 2.5, borderRadius: 2, background: i === 1 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: immersive ? 6 : 8 }}>
            <div style={{
              width: immersive ? 26 : 30,
              height: immersive ? 26 : 30,
              borderRadius: '50%',
              background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
              border: immersive ? '1px solid #fff' : '1.5px solid #fff',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: immersive ? 11 : 12, fontWeight: 600, color: '#fff' }}>{handle.replace('@','')}</span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>now</span>
            <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.45)', fontSize: immersive ? 10 : 14, letterSpacing: 2, lineHeight: 1 }}>· · ·</span>
          </div>
        </div>
      )}

      {/* Bottom content */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: fullScreen && !immersive ? '0 16px 82px' : immersive ? '0 12px 16px' : '0 14px 14px',
        zIndex: 3,
      }}>
        {caption && (
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.4, marginBottom: 5, textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {caption}
          </div>
        )}
        {hashtags.length > 0 && (
          <div style={{ fontSize: 11, color: '#b2dffc', lineHeight: 1.5, marginBottom: 8,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
          </div>
        )}

        {isReel ? (
          /* Reel side actions */
          <div style={{ position: 'absolute', right: 10, bottom: 60, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            {[
              { icon: 'heart', count: '12.4k' },
              { icon: 'comment', count: '328' },
              { icon: 'send', count: '' },
            ].map(({ icon, count }) => (
              <div key={icon} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  {icon === 'heart'   && <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="white"/>}
                  {icon === 'comment' && <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>}
                  {icon === 'send'    && <><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill="white"/></>}
                </svg>
                {count && <span style={{ fontSize: 10, color: '#fff', fontWeight: 600 }}>{count}</span>}
              </div>
            ))}
          </div>
        ) : (
          /* Story reply bar */
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, padding: '8px 14px', borderRadius: 30, border: '1px solid rgba(255,255,255,0.5)', color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>
              Mesaj gönder...
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar day card (day/theme/brief format) ───────────────────────
function CalendarDayCard({ idea, index, total, t, isActive, onSelect }: {
  idea: any; index: number; total: number; t: ReturnType<typeof useTheme>['t'];
  isActive: boolean; onSelect: () => void;
}) {
  const day  = idea.day ?? index + 1;
  const date = idea.date_suggestion ?? '';
  const theme = idea.theme ?? idea.title ?? `Gün ${day}`;
  const brief = idea.brief ?? idea.description ?? '';
  const type  = (idea.content_type ?? idea.contentType ?? 'post').replace(/_/g, ' ');
  const priority = idea.priority ?? 'medium';

  const priorityColor = priority === 'high' || priority === 'critical'
    ? '#F59E0B'
    : priority === 'low' ? '#60A5FA' : '#9DBECE';

  return (
    <button onClick={onSelect} style={{
      width: '100%', textAlign: 'left', padding: '16px 18px', cursor: 'pointer',
      background: isActive
        ? (t.isDark ? 'rgba(77,112,136,0.10)' : 'rgba(109,40,217,0.06)')
        : (t.isDark ? 'rgba(255,255,255,0.03)' : '#fff'),
      border: `0.5px solid ${isActive ? 'rgba(77,112,136,0.35)' : t.separator}`,
      borderRadius: 16,
      boxShadow: !t.isDark ? (isActive ? '0 2px 12px rgba(109,40,217,0.08)' : '0 1px 6px rgba(0,0,0,0.05)') : 'none',
      position: 'relative', overflow: 'hidden',
    }}>
      {isActive && t.isDark && <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: '0.5px', background: 'linear-gradient(90deg,transparent,rgba(77,112,136,0.6),transparent)' }} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Day number badge */}
          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: isActive ? 'rgba(77,112,136,0.14)' : (t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 9, color: isActive ? '#9DBECE' : t.labelColor, fontWeight: 700, lineHeight: 1 }}>GÜN</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: isActive ? '#9DBECE' : t.textPrimary, lineHeight: 1.1 }}>{day}</div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, lineHeight: 1.2, marginBottom: 2 }}>{theme}</div>
            {date && <div style={{ fontSize: 11, color: t.textMuted }}>📅 {date}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: t.isDark ? 'rgba(96,165,250,0.12)' : 'rgba(37,99,235,0.07)', color: '#60A5FA', fontWeight: 600, textTransform: 'capitalize' }}>{type}</span>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: `${priorityColor}12`, color: priorityColor, fontWeight: 600, textTransform: 'capitalize' }}>{priority}</span>
        </div>
      </div>
      {brief && (
        <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.55, margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {brief}
        </p>
      )}
    </button>
  );
}

// ─── Content Plan (multiple ideas) ───────────────────────────────────
function ContentPlanView({ signal, immersiveVisual = false }: { signal: ArtifactSignal; immersiveVisual?: boolean }) {
  const { t } = useTheme();
  const [active, setActive] = useState(0);
  const ideas = signal.ideas ?? [];
  if (ideas.length === 0) return null;

  const idea = ideas[active] ?? ideas[0]!;

  // Detect calendar format (day/theme/brief) vs ideation format (headline/caption_draft/image)
  const isCalendarFormat = ideas.some((i: any) => i.day !== undefined || (i.theme && !i.headline && !i.caption_draft));

  const fl   = formatLabel(idea.contentType ?? idea.contentKind);
  const img  = resolveImageSrc(
    idea.imageUrl
    ?? idea.visualProductionSpec?.selectedGalleryUrl
    ?? (idea as any).image_url
    ?? null
  );
  const isVertical = fl === 'Story' || fl === 'Reel';

  // Rich caption: prefer caption_draft > caption > headline (LLM often puts copy only in headline)
  const richCaption =
    (idea as any).caption_draft
    ?? idea.caption
    ?? idea.headline
    ?? idea.title
    ?? (idea as any).concept_title
    ?? (idea as any).visual_direction
    ?? signal.caption
    ?? '';

  // Headline for display
  const richHeadline =
    idea.headline
    ?? idea.title
    ?? (idea as any).concept_title
    ?? signal.summary
    ?? '';

  // Hashtags (may already contain '#' or not)
  const richHashtags = (
    (idea.hashtags?.length ? idea.hashtags : signal.hashtags) ?? []
  ) as string[];

  // CTA
  const ctaText = (idea as any).cta ?? idea.cta ?? '';

  // Visual direction (production brief)
  const visualDir = idea.visualDirection ?? (idea as any).visual_direction ?? '';

  // Location
  const location = (idea as any).location ?? '';

  const fakeSignal: ArtifactSignal = {
    ...signal,
    imageUrl: img ?? signal.imageUrl,
    caption: richCaption,
    hashtags: richHashtags,
    summary: richHeadline,
    cta: ctaText || signal.cta,
  };

  const pillRow = (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, marginBottom: immersiveVisual ? 0 : 14, flexShrink: 0 }}>
      {ideas.map((ideaItem, i) => {
        const label = formatLabel(ideaItem.contentType ?? ideaItem.contentKind);
        const conceptName = (ideaItem as any).concept_title ?? ideaItem.headline ?? ideaItem.title ?? '';
        const isSel = i === active;
        const colors: Record<string, string> = { Story: '#f472b6', Reel: '#f472b6', Post: '#60a5fa', 'Post 4:5': '#60a5fa', Carousel: '#9DBECE' };
        const c = colors[label] ?? '#9DBECE';
        // Pill shows "Post · Concept" format when concept name exists
        const pillText = conceptName
          ? `${label} ${i + 1}  ·  ${conceptName.length > 14 ? conceptName.slice(0, 14) + '…' : conceptName}`
          : `${label} ${i + 1}`;
        return (
          <button
            key={i} type="button" onClick={() => setActive(i)}
            style={{
              flexShrink: 0,
              padding: immersiveVisual ? '5px 12px' : '6px 14px',
              borderRadius: 30, cursor: 'pointer',
              fontSize: immersiveVisual ? 10.5 : 12,
              fontWeight: isSel ? 700 : 400,
              background: isSel ? `${c}22` : 'rgba(255,255,255,0.10)',
              border: `0.5px solid ${isSel ? `${c}50` : 'rgba(255,255,255,0.14)'}`,
              color: isSel ? '#fff' : 'rgba(255,255,255,0.65)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
            }}
          >
            {pillText}
          </button>
        );
      })}
    </div>
  );

  // ── CALENDAR FORMAT — compact scrollable list ──
  if (isCalendarFormat) {
    return (
      <div style={{ width: '100%' }}>
        {/* Compact header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>İçerik Takvimi</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: t.accentDim, color: t.accent, fontWeight: 700 }}>
            {ideas.length} gün
          </span>
        </div>

        {/* All days as compact rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {ideas.map((dayIdea: any, i: number) => {
            const day   = dayIdea.day ?? i + 1;
            const date  = dayIdea.date_suggestion ?? '';
            const theme = dayIdea.theme ?? dayIdea.title ?? `Gün ${day}`;
            const brief = dayIdea.brief ?? dayIdea.description ?? '';
            const type  = (dayIdea.content_type ?? dayIdea.contentType ?? 'post').replace(/_/g, ' ');
            const priority = dayIdea.priority ?? 'medium';
            const isActive = i === active;
            const priorityColor = priority === 'high' || priority === 'critical' ? '#F59E0B' : priority === 'low' ? '#60A5FA' : '#9DBECE';

            return (
              <button key={i} onClick={() => setActive(i)} style={{
                width: '100%', textAlign: 'left', padding: '11px 14px',
                borderRadius: 13, cursor: 'pointer',
                background: isActive
                  ? (t.isDark ? 'rgba(77,112,136,0.10)' : 'rgba(109,40,217,0.06)')
                  : (t.isDark ? 'rgba(255,255,255,0.03)' : '#fff'),
                border: `0.5px solid ${isActive ? 'rgba(77,112,136,0.35)' : t.separator}`,
                boxShadow: !t.isDark && !isActive ? '0 1px 4px rgba(0,0,0,0.04)' : 'none',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {/* Day badge */}
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: isActive ? 'rgba(77,112,136,0.14)' : (t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 8, color: isActive ? '#9DBECE' : t.labelColor, fontWeight: 700, lineHeight: 1 }}>G</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isActive ? '#9DBECE' : t.textPrimary, lineHeight: 1.1 }}>{day}</div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {theme}
                  </div>
                  {brief && (
                    <div style={{ fontSize: 11, color: t.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {brief}
                    </div>
                  )}
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: t.isDark ? 'rgba(96,165,250,0.12)' : 'rgba(37,99,235,0.07)', color: '#60A5FA', fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{type}</span>
                  {date && <span style={{ fontSize: 9, color: t.textMuted }}>{date}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      {immersiveVisual ? (
        <>
          {/* Visual — clean, no overlaid pill nav */}
          {isVertical ? (
            <IgStoryReel signal={fakeSignal} isReel={fl === 'Reel'} immersive />
          ) : (
            <IgPost signal={fakeSignal} immersive location={location} ctaText={ctaText} conceptTitle={richHeadline} />
          )}
          {/* Pill nav — BELOW the image when immersive, not over it */}
          {ideas.length > 1 && (
            <div style={{ padding: '10px 12px 4px' }}>
              {pillRow}
            </div>
          )}
        </>
      ) : (
        <>
          {pillRow}
          {isVertical ? (
            <IgStoryReel signal={fakeSignal} isReel={fl === 'Reel'} />
          ) : (
            <IgPost signal={fakeSignal} location={location} ctaText={ctaText} conceptTitle={richHeadline} />
          )}
        </>
      )}

      {/* Idea details */}
      {(idea.caption || idea.hashtags?.length || idea.visualDirection || idea.postingTime) && (
        <div style={{ marginTop: immersiveVisual ? 10 : 14, ...t.surfaceCard, padding: immersiveVisual ? '12px' : '14px' }}>
          {/* Concept title */}
          {((idea as any).concept_title || richHeadline) && (
            <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 8, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
              {(idea as any).concept_title || richHeadline}
            </div>
          )}

          {/* Meta row: format + location + posting time */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: t.isDark ? 'rgba(96,165,250,0.10)' : 'rgba(37,99,235,0.07)', color: '#60A5FA', fontWeight: 600, textTransform: 'capitalize' }}>
              {fl}
            </span>
            {location && (
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: t.textTertiary }}>
                📍 {location}
              </span>
            )}
            {(idea as any).posting_time_suggestion && (
              <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', color: t.textTertiary }}>
                🕐 {(idea as any).posting_time_suggestion}
              </span>
            )}
          </div>

          {/* Caption */}
          {richCaption && (
            <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.65, margin: '0 0 10px' }}>{richCaption}</p>
          )}

          {/* Hashtags */}
          {richHashtags.length > 0 && (
            <p style={{ fontSize: 12, color: '#3B82F6', lineHeight: 1.55, margin: '0 0 10px' }}>
              {richHashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
            </p>
          )}

          {/* CTA */}
          {ctaText && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 30, background: t.isDark ? 'rgba(77,112,136,0.12)' : 'rgba(109,40,217,0.07)', border: `0.5px solid ${t.accentBorder}`, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: t.accent }}>{ctaText} →</span>
            </div>
          )}

          {/* Visual direction brief */}
          {visualDir && (
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'rgba(245,158,11,0.07)', border: '0.5px solid rgba(245,158,11,0.18)', marginBottom: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Görsel Yön</div>
              <p style={{ fontSize: 12, color: '#92400E', lineHeight: 1.5, margin: 0 }}>{visualDir}</p>
            </div>
          )}

          {/* Strategic purpose */}
          {(idea as any).strategic_purpose && (
            <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, lineHeight: 1.5, fontStyle: 'italic' }}>
              {(idea as any).strategic_purpose}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Text / Report / Generic ─────────────────────────────────────────
function TextReportView({ signal }: { signal: ArtifactSignal }) {
  const { t } = useTheme();
  return (
    <div style={{ ...t.surfaceCard, padding: '18px' }}>
      {signal.summary && (
        <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>{signal.summary}</p>
      )}
      {(signal.metrics ?? []).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          {(signal.metrics ?? []).slice(0, 6).map((m, i) => (
            <div key={i}>
              <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                {String(m.value)}
              </div>
            </div>
          ))}
        </div>
      )}
      {(signal.recommendations ?? []).length > 0 && (
        <div style={{ marginTop: 14 }}>
          {(signal.recommendations ?? []).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────
interface Props {
  artifact: OutputArtifact;
  compact?: boolean;
  /** Onay ekranı vb.: story/reel/post önizlemesi neredeyse tam genişlik ve yüksek görsel alanı */
  immersiveVisual?: boolean;
  /** Approval ekranı: `resolveArtifact` ile tamamlanan plan sinyali (signalFromArtifact bazı JSON gövdelerinde fikir kaçırır) */
  signal?: ArtifactSignal;
}

export function MobileArtifactView({ artifact, compact = false, immersiveVisual = false, signal: signalProp }: Props) {
  const { t } = useTheme();
  const signal = signalProp ?? signalFromArtifact(artifact);
  const kind   = signal.kind;
  const fl     = formatLabel(signal.ideas?.[0]?.contentType ?? signal.ideas?.[0]?.contentKind ?? kind);

  return (
    <div>
      {/* Kind badge */}
      {!compact && !immersiveVisual && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            {kind === 'instagram_post'   ? 'Instagram Post'  :
             kind === 'instagram_story'  ? 'Instagram Story' :
             kind === 'instagram_reel'   ? 'Instagram Reel'  :
             kind === 'instagram_plan'   ? 'İçerik Planı'    :
             kind === 'ad_campaign'      ? 'Reklam Kampanyası':
             kind === 'review_reply'     ? 'Yorum Yanıtı'    :
             kind === 'analytics_report' ? 'Analitik Raporu' :
             kind === 'review_analysis'  ? 'Yorum Analizi'   :
             'İçerik'}
          </span>
          {signal.ideas && signal.ideas.length > 1 && (
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: t.accentDim, color: t.accent, fontWeight: 600 }}>
              {signal.ideas.length} fikir
            </span>
          )}
        </div>
      )}

      {/* Route to correct preview — type-native Instagram rendering */}
      {kind === 'instagram_plan' || (signal.ideas && signal.ideas.length > 0)
        ? <ContentPlanView signal={signal} immersiveVisual={immersiveVisual} />
        : kind === 'instagram_story'
        ? <IgStoryReel signal={signal} isReel={false}
            fullScreen={compact && !immersiveVisual}
            immersive={immersiveVisual} />
        : kind === 'instagram_reel'
        ? <IgStoryReel signal={signal} isReel={true}
            fullScreen={compact && !immersiveVisual}
            immersive={immersiveVisual} />
        : (kind === 'instagram_post' || signal.imageUrl || signal.videoUrl)
        ? <IgPost signal={signal} />
        : <TextReportView signal={signal} />
      }

      {/* Caption fallback for post (already inside IgPost but show here for report/generic) */}
      {(kind === 'analytics_report' || kind === 'review_reply' || kind === 'strategy') && signal.caption && (
        <div style={{ marginTop: 12, ...t.surfaceCard, padding: '14px' }}>
          <div style={{ fontSize: 11, color: t.labelColor, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Caption / Yanıt</div>
          <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.65, margin: 0 }}>{signal.caption}</p>
        </div>
      )}
    </div>
  );
}

export { signalFromArtifact };
export type { ArtifactSignal };

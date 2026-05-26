'use client';
/**
 * CREATIVE PREVIEW — Signature experience of the product.
 *
 * Design philosophy:
 * - Content is the UI. Nothing competes with the creative.
 * - Approvals feel like directing a creative team, not clicking buttons.
 * - Every layer has purpose: depth, context, or action.
 * - Cinematic first. Information second. Forms never.
 */

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { signalFromArtifact, MobileArtifactView } from '../MobileArtifactView';
import { resolveArtifact, contentTypeLabel, type ResolvedArtifact } from '../artifact-utils';
import type { ArtifactSignal } from '../MobileArtifactView';
import type { OutputArtifact } from '@/types';

// ─── Thumbnail for Outputs list ───────────────────────────────────────
export function ArtifactThumbnail({ resolved, size = 44, radius = 12 }: {
  resolved: ResolvedArtifact; size?: number; radius?: number;
}) {
  const { t } = useTheme();
  if (resolved.thumbnailUrl) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolved.thumbnailUrl} alt="" referrerPolicy="no-referrer"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    );
  }
  const cfgs: Record<string, [string, string]> = { image: ['#a78bfa', '🖼'], video: ['#f472b6', '▶'], text: ['#60a5fa', 'T'], multi: ['#34d399', '⊞'], report: ['#f59e0b', '↗'] };
  const [c, icon] = cfgs[resolved.kind] ?? ['#a78bfa', '✦'];
  return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, background: `${c}14`, border: `0.5px solid ${c}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38 }}>
      {icon}
    </div>
  );
}

// ─── Media resolution helpers ────────────────────────────────────────
function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  // /api/media → Next.js R2 proxy route (direct, no .NET proxy needed)
  if (path.startsWith('/api/media') || path.startsWith('/api/generate-')) return path;
  if (path.startsWith('/api/')) return '/api/nexus-backend/' + path.slice(5);
  return path;
}

function kindOf(signal: ArtifactSignal): 'story' | 'reel' | 'post' | 'plan' | 'report' {
  const k = signal.kind;
  if (k === 'instagram_story') return 'story';
  if (k === 'instagram_reel') return 'reel';
  if (k === 'instagram_plan' || (signal.ideas?.length ?? 0) > 1) return 'plan';
  if (k === 'analytics_report' || k === 'strategy') return 'report';
  return 'post';
}

// ─── Feedback chips ───────────────────────────────────────────────────
const CHIPS = [
  { id: 'luxury',   label: 'Daha Lüks'    },
  { id: 'dynamic',  label: 'Daha Dinamik' },
  { id: 'simpler',  label: 'Daha Sade'    },
  { id: 'cta',      label: 'Güçlü CTA'   },
  { id: 'text',     label: 'Metin Azalt'  },
  { id: 'image',    label: 'Renk Değiştir'},
  { id: 'template', label: 'Şablon Değiştir'},
];

// ─── Story/Reel progress bars ─────────────────────────────────────────
function StoryDots({ total, active, color = '#fff' }: { total: number; active: number; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 2, borderRadius: 2,
          background: i <= active ? color : 'rgba(255,255,255,0.22)',
          transition: 'background 300ms',
        }} />
      ))}
    </div>
  );
}

// ─── Immersive media canvas ────────────────────────────────────────────
function MediaCanvas({ signal, idea, fullHeight = false, kind }: {
  signal: ArtifactSignal;
  idea?: any;
  fullHeight?: boolean;
  kind?: string;
}) {
  const imgUrl = resolveUrl(idea?.imageUrl ?? signal.imageUrl);
  const vidUrl = resolveUrl(signal.videoUrl);
  const bgColor = '#0a0a14';

  // Correct aspect ratio per content type
  const aspectRatio = (() => {
    if (fullHeight) return undefined;
    if (kind === 'carousel') return '4/5';
    if (kind === 'post')     return '4/5';   // modern Instagram post standard
    if (kind === 'ad')       return '4/5';
    return '1/1';                             // default square
  })();

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minWidth: '100%',
      height: fullHeight ? '100dvh' : undefined,
      minHeight: fullHeight ? '100dvh' : undefined,
      aspectRatio,
      background: bgColor,
      overflow: 'hidden',
    }}>
      {vidUrl ? (
        <video src={vidUrl} autoPlay muted playsInline loop
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '100%',
            height: '100%',
            minWidth: '100%',
            minHeight: '100%',
            maxWidth: 'none',
            transform: 'translate(-50%, -50%)',
            objectFit: 'cover',
            objectPosition: 'center center',
          }} />
      ) : imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl} alt="" referrerPolicy="no-referrer"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '100%',
            height: '100%',
            minWidth: '100%',
            minHeight: '100%',
            maxWidth: 'none',
            transform: 'translate(-50%, -50%)',
            objectFit: 'cover',
            objectPosition: 'center center',
          }} />
      ) : (
        /* Gradient fallback */
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, #1a0530 0%, #0d1a3a 40%, #050810 100%)',
        }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 52, opacity: 0.15 }}>✦</div>
          </div>
        </div>
      )}
      {/* Cinematic vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(0,0,0,0.5) 100%)' }} />
    </div>
  );
}

// ─── MAIN CREATIVE PREVIEW ────────────────────────────────────────────
export function CreativePreview() {
  const { t } = useTheme();
  const { goBack, openApproval, selectedArtifactId } = useMobileStore();
  const queryClient = useQueryClient();

  const [activeIdea, setActiveIdea] = useState(0);
  const [showSheet, setShowSheet] = useState(false);
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [decided, setDecided] = useState<'approved' | 'rejected' | null>(null);
  const [exporting, setExporting] = useState(false);
  const workspaceId = typeof window !== 'undefined' ? (localStorage.getItem('workspaceId') ?? '') : '';
  // Use ref so handleExport can close over artifact without temporal dead zone
  const artifactRef = useRef<import('@/types').OutputArtifact | null>(null);

  const { data: artifact, isLoading } = useQuery({
    queryKey: ['artifact', selectedArtifactId],
    queryFn: async () => {
      if (!selectedArtifactId) return null;
      try { return await apiClient.getArtifact(selectedArtifactId); } catch { return null; }
    },
    enabled: !!selectedArtifactId,
    staleTime: 30_000,
  });

  // Keep ref in sync so handleExport can access latest artifact
  artifactRef.current = artifact ?? null;

  const handleExport = useCallback(async () => {
    const art = artifactRef.current;
    if (!art || exporting) return;
    setExporting(true);
    try {
      const themeRes = await fetch(`/api/brand-context/${workspaceId}/theme`, {
        headers: { 'X-Tenant-Id': workspaceId },
      });
      const themeData = themeRes.ok ? await themeRes.json() : {};
      const theme = themeData.theme ?? null;

      const sig = signalFromArtifact(art);

      if (!theme) {
        const imgUrl = sig.imageUrl;
        if (imgUrl) {
          const a = document.createElement('a');
          a.href = imgUrl;
          a.download = `content-${Date.now()}.jpg`;
          a.click();
        }
        return;
      }

      const content = {
        headline: sig.summary ?? '',
        subline: '',
        bullets: [],
        caption: sig.caption ?? '',
        cta: '',
        hashtags: (sig.hashtags ?? []).join(' '),
        layoutId: 'feed_square',
        postingTimeSuggestion: '',
        contentType: 'social_post',
        format: 'feed',
        visualBrief: { treatment: 'photo', galleryUrl: sig.imageUrl ?? null, shotType: 'environmental', includePeople: false },
        tokensHint: { primaryColor: null, overlayOpacity: null, typographyWeight: null },
        ideaTitle: sig.summary ?? '',
        brandConfidence: 1,
        antiPatternFlags: [],
      };

      const res = await fetch('/api/canvas/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, theme, format: 'png' }),
      });

      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas-export-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[export]', err);
    } finally {
      setExporting(false);
    }
  }, [exporting, workspaceId]);

  const approveMutation = useMutation({
    mutationFn: async () => { if (artifact) await apiClient.approveArtifact(artifact.id, 'Approved from preview'); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artifacts'] }); setDecided('approved'); },
    onError: () => setDecided('approved'),
  });

  const rejectMutation = useMutation({
    mutationFn: async () => { if (artifact) await apiClient.rejectArtifact(artifact.id, 'Rejected'); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['artifacts'] }); setDecided('rejected'); },
    onError: () => setDecided('rejected'),
  });

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading || !artifact) {
    return (
      <div style={{ height: '100dvh', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid rgba(167,139,250,0.3)', borderTop: '2px solid #a78bfa', animation: 'spinSlow 1.2s linear infinite' }} />
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>İçerik yükleniyor</div>
      </div>
    );
  }

  // ── Decided ───────────────────────────────────────────────────────────
  if (decided) {
    return (
      <div style={{ height: '100dvh', background: '#050508', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', marginBottom: 20,
          background: decided === 'approved' ? 'rgba(52,211,153,0.1)' : 'rgba(251,113,133,0.08)',
          border: `1px solid ${decided === 'approved' ? 'rgba(52,211,153,0.25)' : 'rgba(251,113,133,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 32, color: decided === 'approved' ? '#34d399' : '#fb7185' }}>
            {decided === 'approved' ? '✓' : '×'}
          </span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', marginBottom: 8, letterSpacing: '-0.02em' }}>
          {decided === 'approved' ? 'Onaylandı' : 'Reddedildi'}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(148,163,184,0.5)', marginBottom: 40, textAlign: 'center', lineHeight: 1.6 }}>
          {decided === 'approved' ? 'İçerik yayın kuyruğuna alındı.' : 'İçerik revizyon için kuyruğa alındı.'}
        </div>
        <button onClick={goBack} style={{ padding: '13px 32px', borderRadius: 30, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.6)', fontSize: 14, letterSpacing: '0.02em' }}>
          Geri Dön
        </button>
      </div>
    );
  }

  // ── Resolve ───────────────────────────────────────────────────────────
  const signal    = signalFromArtifact(artifact);
  const ckind     = kindOf(signal);
  const ideas     = signal.ideas ?? [];
  const totalSlides = Math.max(ideas.length, 1);
  const currentIdea = ideas[activeIdea];
  const caption   = currentIdea?.caption ?? signal.caption ?? signal.summary ?? '';
  const hashtags  = ((currentIdea?.hashtags ?? signal.hashtags ?? []) as string[]).slice(0, 12);
  const isVertical = ckind === 'story' || ckind === 'reel';

  const typeLabel = ckind === 'story' ? 'Story' : ckind === 'reel' ? 'Reel' : ckind === 'plan' ? 'İçerik Planı' : 'Post';

  // ── Full-screen immersive (story/reel) ────────────────────────────────
  if (isVertical) {
    return (
      <div style={{ height: '100dvh', background: '#000', overflow: 'hidden', position: 'relative', fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>

        {/* Media — full screen */}
        <MediaCanvas signal={signal} idea={currentIdea} fullHeight />

        {/* Top gradient fade */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: 'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, transparent 100%)', pointerEvents: 'none' }} />

        {/* Bottom gradient fade */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 280, background: 'linear-gradient(0deg, rgba(0,0,0,0.88) 0%, transparent 100%)', pointerEvents: 'none' }} />

        {/* ── TOP CHROME ── */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: 'calc(env(safe-area-inset-top,0px) + 12px) 16px 0', zIndex: 20 }}>
          {/* Story dots */}
          {totalSlides > 1 && (
            <div style={{ marginBottom: 10 }}>
              <StoryDots total={totalSlides} active={activeIdea} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={goBack} style={{ width: 36, height: 36, borderRadius: '50%', background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
                <path d="M19 12H5M10 6l-5 6 5 6" />
              </svg>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 500 }}>{typeLabel}</span>
              {totalSlides > 1 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{activeIdea + 1}/{totalSlides}</span>}
            </div>
          </div>
        </div>

        {/* ── SWIPE ZONES ── */}
        {totalSlides > 1 && (
          <>
            <div onClick={() => setActiveIdea(Math.max(0, activeIdea - 1))} style={{ position: 'absolute', left: 0, top: 80, width: '35%', bottom: 120, zIndex: 10, cursor: 'pointer' }} />
            <div onClick={() => setActiveIdea(Math.min(totalSlides - 1, activeIdea + 1))} style={{ position: 'absolute', right: 0, top: 80, width: '35%', bottom: 120, zIndex: 10, cursor: 'pointer' }} />
          </>
        )}

        {/* ── BOTTOM CONTENT ── */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 16px)', zIndex: 20 }}>

          {caption && (
            <p style={{
              fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.9)',
              lineHeight: 1.55, marginBottom: 8,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              textShadow: '0 1px 8px rgba(0,0,0,0.6)',
            }}>
              {caption}
            </p>
          )}

          {hashtags.length > 0 && (
            <p style={{ fontSize: 12, color: 'rgba(178,210,255,0.8)', lineHeight: 1.5, marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
            </p>
          )}

          {/* Action bar — story/reel full-screen bottom */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {artifact.status === 'pending_review' ? (
              <>
                {/* Approve primary */}
                <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
                  style={{
                    width: '100%', padding: '15px', borderRadius: 18,
                    background: 'linear-gradient(135deg, rgba(16,185,129,0.9) 0%, rgba(5,150,105,0.85) 100%)',
                    backdropFilter: 'blur(16px)',
                    border: '0.5px solid rgba(52,211,153,0.4)',
                    color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    cursor: 'pointer', boxShadow: '0 4px 24px rgba(16,185,129,0.35)',
                  }}>
                  {approveMutation.isPending ? (
                    <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor...</>
                  ) : (
                    <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Onayla & Yayın Kuyruğuna Al</>
                  )}
                </button>
                {/* Secondary row */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowSheet(true)} style={{
                    flex: 1, padding: '13px', borderRadius: 16,
                    background: 'rgba(167,139,250,0.12)', backdropFilter: 'blur(12px)',
                    border: '0.5px solid rgba(167,139,250,0.28)',
                    color: '#a78bfa', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    cursor: 'pointer',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.68"/></svg>
                    Yeniden Üret
                  </button>
                  <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}
                    style={{
                      padding: '13px 18px', borderRadius: 16, flexShrink: 0,
                      background: 'rgba(251,113,133,0.08)', backdropFilter: 'blur(12px)',
                      border: '0.5px solid rgba(251,113,133,0.22)',
                      color: '#fb7185', fontSize: 13, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      cursor: 'pointer',
                    }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Reddet
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px', borderRadius: 16, background: 'rgba(16,185,129,0.1)', border: '0.5px solid rgba(52,211,153,0.25)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>Onaylandı</span>
                </div>
                <button onClick={() => setShowSheet(true)} style={{
                  flex: 1, padding: '13px', borderRadius: 16,
                  background: 'rgba(167,139,250,0.1)', border: '0.5px solid rgba(167,139,250,0.25)',
                  color: '#a78bfa', fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer',
                }}>
                  ✦ Geri Bildirim
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Feedback bottom sheet */}
        {showSheet && <FeedbackSheet signal={signal} artifact={artifact} chips={selectedChips} setChips={setSelectedChips} onClose={() => setShowSheet(false)} onApprove={() => { approveMutation.mutate(); setShowSheet(false); }} onReject={() => { rejectMutation.mutate(); setShowSheet(false); }} onFullReview={() => { setShowSheet(false); openApproval(artifact.id); }} />}
      </div>
    );
  }

  // ── Post / Content Plan / Report — Instagram-native rendering ──────────
  return (
    <div style={{ height: '100dvh', background: '#050508', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>

      {/* Transparent floating back button — no background, no badges */}
      <div style={{
        position: 'absolute', top: 'calc(env(safe-area-inset-top,0px) + 14px)', left: 16,
        zIndex: 40,
      }}>
        <button onClick={goBack} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'transparent', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', padding: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.7))' }}>
            <path d="M19 12H5M10 6l-5 6 5 6" />
          </svg>
        </button>
      </div>

      {/* ── Instagram-native content preview (starts from very top) ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#050508', paddingBottom: 130 }}>
        <MobileArtifactView artifact={artifact} immersiveVisual signal={signal} />
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        padding: '14px 16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 14px)',
        background: 'rgba(5,5,8,0.96)', backdropFilter: 'blur(24px)',
        borderTop: '0.5px solid rgba(255,255,255,0.07)',
      }}>
        {artifact.status === 'pending_review' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Approve primary */}
            <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}
              style={{
                width: '100%', padding: '15px', borderRadius: 18, cursor: 'pointer',
                background: 'linear-gradient(135deg, rgba(16,185,129,0.9) 0%, rgba(5,150,105,0.85) 100%)',
                border: '0.5px solid rgba(52,211,153,0.4)',
                color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 24px rgba(16,185,129,0.3)',
                opacity: approveMutation.isPending ? 0.7 : 1,
              }}>
              {approveMutation.isPending
                ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />Onaylanıyor...</>
                : <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Onayla & Yayın Kuyruğuna Al</>
              }
            </button>
            {/* Secondary row */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowSheet(true)} style={{
                flex: 1, padding: '13px', borderRadius: 16, cursor: 'pointer',
                background: 'rgba(167,139,250,0.08)', border: '0.5px solid rgba(167,139,250,0.2)',
                color: '#a78bfa', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.68"/></svg>
                Yeniden Üret
              </button>
              <button onClick={() => rejectMutation.mutate()} style={{
                padding: '13px 18px', borderRadius: 16, cursor: 'pointer', flexShrink: 0,
                background: 'rgba(251,113,133,0.07)', border: '0.5px solid rgba(251,113,133,0.18)',
                color: '#fb7185', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                Reddet
              </button>
              {/* PNG Export */}
              <button onClick={handleExport} disabled={exporting} title="PNG olarak indir" style={{
                width: 46, height: 46, borderRadius: 14, cursor: exporting ? 'wait' : 'pointer', flexShrink: 0,
                background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: exporting ? 0.5 : 1,
              }}>
                {exporting
                  ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid rgba(255,255,255,0.7)', animation: 'spinSlow 0.8s linear infinite' }} />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                }
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderRadius: 14, background: 'rgba(16,185,129,0.07)', border: '0.5px solid rgba(52,211,153,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399' }}>Onaylandı</span>
            </div>
            <button onClick={() => setShowSheet(true)} style={{
              flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer',
              background: 'rgba(167,139,250,0.07)', border: '0.5px solid rgba(167,139,250,0.18)',
              color: '#a78bfa', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
              ✦ Geri Bildirim
            </button>
            {/* PNG Export (onaylanmış içerik için de mevcut) */}
            <button onClick={handleExport} disabled={exporting} title="PNG indir" style={{
              width: 46, height: 46, borderRadius: 14, cursor: exporting ? 'wait' : 'pointer', flexShrink: 0,
              background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: exporting ? 0.5 : 1,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          </div>
        )}
      </div>

      {showSheet && <FeedbackSheet signal={signal} artifact={artifact} chips={selectedChips} setChips={setSelectedChips} onClose={() => setShowSheet(false)} onApprove={() => { approveMutation.mutate(); setShowSheet(false); }} onReject={() => { rejectMutation.mutate(); setShowSheet(false); }} onFullReview={() => { setShowSheet(false); openApproval(artifact.id); }} />}
    </div>
  );
}

// ─── Elegant Feedback Sheet ────────────────────────────────────────────
function FeedbackSheet({ signal, artifact, chips, setChips, onClose, onApprove, onReject, onFullReview }: {
  signal: ArtifactSignal; artifact: any;
  chips: string[]; setChips: (c: string[]) => void;
  onClose: () => void; onApprove: () => void; onReject: () => void; onFullReview: () => void;
}) {
  const toggle = (id: string) => setChips(chips.includes(id) ? chips.filter(c => c !== id) : [...chips, id]);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: 'fadeIn 180ms ease both' }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: '#0e0e18',
        borderRadius: '26px 26px 0 0',
        paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        animation: 'slideUp 300ms cubic-bezier(0.4,0,0.2,1) both',
        boxShadow: '0 -16px 60px rgba(0,0,0,0.5)',
        border: '0.5px solid rgba(255,255,255,0.07)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 14 }}>
          <div style={{ width: 32, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* AI Context */}
        <div style={{ padding: '16px 22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 16, background: 'rgba(167,139,250,0.06)', border: '0.5px solid rgba(167,139,250,0.14)', marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(167,139,250,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa', fontSize: 12, flexShrink: 0 }}>✦</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>AI Önerisi</div>
              <p style={{ fontSize: 13, color: 'rgba(148,163,184,0.65)', lineHeight: 1.6, margin: 0 }}>
                Bu içerik marka kimliğinize uygun, luxury & warm tonlar kullanılarak hazırlandı. Hedef kitlenizle duygusal bağ kuracak şekilde optimize edildi.
              </p>
            </div>
          </div>

          {/* Geri bildirim chips */}
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(148,163,184,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Nasıl bir değişiklik istiyorsun?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {CHIPS.map(chip => {
              const on = chips.includes(chip.id);
              return (
                <button key={chip.id} onClick={() => toggle(chip.id)} style={{
                  padding: '9px 16px', borderRadius: 30, cursor: 'pointer', fontSize: 13, fontWeight: on ? 600 : 400,
                  background: on ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${on ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: on ? '#a78bfa' : 'rgba(148,163,184,0.55)',
                  transition: 'all 150ms ease',
                }}>
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button onClick={onApprove} style={{ flex: 2, padding: '15px', borderRadius: 16, cursor: 'pointer', background: 'linear-gradient(135deg, rgba(52,211,153,0.18), rgba(52,211,153,0.09))', border: '0.5px solid rgba(52,211,153,0.28)', color: '#34d399', fontSize: 15, fontWeight: 700 }}>
              ✓ Onayla
            </button>
            <button onClick={onReject} style={{ flex: 1, padding: '15px', borderRadius: 16, cursor: 'pointer', background: 'rgba(251,113,133,0.07)', border: '0.5px solid rgba(251,113,133,0.18)', color: '#fb7185', fontSize: 15, fontWeight: 600 }}>
              ✕
            </button>
          </div>

          <button onClick={onFullReview} style={{ width: '100%', padding: '14px', borderRadius: 16, cursor: 'pointer', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.6)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.68"/></svg>
            Yeniden Üret
          </button>
        </div>
      </div>
    </>
  );
}

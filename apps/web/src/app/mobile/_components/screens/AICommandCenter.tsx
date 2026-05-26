'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useMobileStore } from '../mobile-store';
import { useAuthStore } from '../auth-store';
import { ProfileSheet } from '../ProfileSheet';
import { apiClient } from '@/lib/api-client';
import { resolveArtifact } from '../artifact-utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { OutputArtifact, RecommendedTask } from '@/types';

const AGENT_ROLE_TO_NUM: Record<string, number> = {
  review_agent: 8, content_agent: 3, content_strategy_agent: 2,
  ads_agent: 7, analytics_agent: 11,
};

function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m}dk`;
  return `${Math.floor(m / 60)}sa`;
}

function resolveImg(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http') || url.startsWith('/api/')) return url;
  return url;
}

const C = {
  bg:      '#000',
  s1:      'rgba(255,255,255,0.055)',
  border:  'rgba(255,255,255,0.08)',
  t1:      '#fff',
  t2:      'rgba(255,255,255,0.55)',
  t3:      'rgba(255,255,255,0.28)',
  accent:  '#A78BFA',
  warn:    '#F59E0B',
  success: '#10B981',
};

const Divider = () => <div style={{ height: '0.5px', background: C.border }} />;
const ChevronRight = ({ color = C.t3 }: { color?: string }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

type QuickItem = 'icerikler' | 'mission' | 'marka' | 'analiz' | 'reklamlar' | 'brief';

// ── Quick item definitions ───────────────────────────────────────────────────
const QUICK_ITEMS: { id: QuickItem; label: string; icon: React.ReactNode; accent: string }[] = [
  {
    id: 'icerikler', label: 'İçerikler', accent: C.accent,
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  },
  {
    id: 'mission', label: 'Mission', accent: '#C084FC',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(192,132,252,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  },
  {
    id: 'marka', label: 'Marka', accent: '#60A5FA',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  },
  {
    id: 'analiz', label: 'Analiz', accent: '#34D399',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  },
  {
    id: 'reklamlar', label: 'Reklamlar', accent: '#FBBF24',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  },
  {
    id: 'brief', label: 'Yeni Brief', accent: '#F87171',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  },
];

// ── Preview panels ────────────────────────────────────────────────────────────

function PreviewIcerikler({ artifacts, pending, navigate, openPlatformPreview }: {
  artifacts: OutputArtifact[]; pending: OutputArtifact[];
  navigate: (s: any) => void; openPlatformPreview: (id: string) => void;
}) {
  const recent = [...artifacts].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 12px' }}>
        {[
          { v: pending.length, label: 'Onay Bekliyor', color: C.warn },
          { v: artifacts.filter(a => a.status === 'approved').length, label: 'Onaylı', color: C.success },
          { v: artifacts.length, label: 'Toplam', color: C.t2 },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px',
            background: C.bg, borderRadius: 12, border: `0.5px solid ${C.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color,
              letterSpacing: '-0.04em' }}>{s.v}</div>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Last 3 items */}
      {recent.length > 0 && (
        <div style={{ padding: '0 16px 6px' }}>
          <div style={{ fontSize: 10, color: C.t3, letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 8 }}>Son Üretimler</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {recent.map(a => {
              const res = (() => { try { return resolveArtifact(a); } catch { return null; } })();
              const img = resolveImg(res?.thumbnailUrl ?? res?.imageUrl);
              return (
                <button key={a.id} onClick={() => openPlatformPreview(a.id)} style={{
                  flex: 1, aspectRatio: '1/1', borderRadius: 10, overflow: 'hidden',
                  cursor: 'pointer', border: `0.5px solid ${C.border}`,
                  background: '#111', position: 'relative',
                }}>
                  {img
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={img} alt="" referrerPolicy="no-referrer"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 16, opacity: 0.07 }}>✦</span>
                      </div>
                  }
                  <div style={{ position: 'absolute', top: 5, right: 5,
                    width: 5, height: 5, borderRadius: '50%',
                    background: a.status === 'approved' ? C.success : a.status === 'pending_review' ? C.warn : 'transparent' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PreviewCTA label="Tüm İçeriklere Git" onClick={() => navigate('outputs')} color={C.accent} />
    </div>
  );
}

function PreviewMission({ missions, navigate }: { missions: any[]; navigate: (s: any) => void }) {
  const items = missions.slice(0, 3);
  return (
    <div>
      <div style={{ padding: '10px 16px 6px' }}>
        <div style={{ fontSize: 10, color: C.t3, letterSpacing: '0.08em',
          textTransform: 'uppercase', marginBottom: 10 }}>Aktif Kampanyalar</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: C.t3, padding: '12px 0', textAlign: 'center' }}>
            Aktif kampanya yok
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((m: any, i: number) => (
              <div key={m.id}>
                {i > 0 && <Divider />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  {/* Mini ring */}
                  <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
                    <svg width="32" height="32" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="16" cy="16" r="12" fill="none"
                        stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                      <circle cx="16" cy="16" r="12" fill="none"
                        stroke="#C084FC" strokeWidth="2.5"
                        strokeDasharray={`${(m.completion_pct ?? 0) * 75.4 / 100} 75.4`}
                        strokeLinecap="round" />
                    </svg>
                    <span style={{ position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%,-50%)',
                      fontSize: 7, fontWeight: 700, color: '#C084FC' }}>
                      {m.completion_pct ?? 0}%
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.t1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      letterSpacing: '-0.02em' }}>{m.title}</div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                      {m.completed_nodes ?? 0}/{m.total_nodes ?? '?'} görev
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <PreviewCTA label="Mission Hub'a Git" onClick={() => navigate('missions')} color="#C084FC" />
    </div>
  );
}

function PreviewMarka({ tenantId, navigate }: { tenantId: string; navigate: (s: any) => void }) {
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['company-profile', tenantId],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 10 * 60_000,
    enabled: Boolean(tenantId),
  });
  const { data: brandCtx, isLoading: ctxLoading } = useQuery({
    queryKey: ['brand-context-data', tenantId],
    queryFn: () => apiClient.getBrandContextData(tenantId),
    staleTime: 10 * 60_000,
    enabled: !!tenantId,
  });

  const isLoading = profileLoading || ctxLoading;
  const p = profile as any;
  const b = brandCtx as any;
  const logoUrl = p?.logoUrl || b?.logo_url || '';
  const name = p?.brandName || b?.business_name || '—';
  const industry = b?.industry || b?.business_type || '—';
  const tone = b?.brand_tone || '—';
  const location = b?.location || p?.location || '—';
  const ig = p?.instagramHandle || b?.instagram_handle || '';
  const score = b?.discovery_confidence ?? null;

  const proxyLogo = logoUrl ? `/api/media-proxy?url=${encodeURIComponent(logoUrl)}` : '';

  const rows = [
    { label: 'Sektör', value: industry },
    { label: 'Ton', value: tone },
    { label: 'Konum', value: location },
    ...(ig ? [{ label: 'Instagram', value: `@${ig.replace('@', '')}` }] : []),
  ].filter(r => r.value && r.value !== '—');

  if (isLoading) return (
    <div style={{ padding: '18px 16px' }}>
      {[80, 55, 100, 70].map((w, i) => (
        <div key={i} style={{ height: 12, borderRadius: 6, marginBottom: 10,
          width: `${w}%`, background: 'rgba(255,255,255,0.06)',
          animation: 'shimmer 1.4s ease-in-out infinite' }} />
      ))}
    </div>
  );

  return (
    <div>
      {/* Brand identity header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px 12px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden',
          background: '#111', border: `0.5px solid ${C.border}`, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 700, color: C.t2 }}>
          {proxyLogo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={proxyLogo} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : name[0]?.toUpperCase()
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.t1, letterSpacing: '-0.03em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {name}
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>{industry}</div>
        </div>
        {score !== null && (
          <div style={{ flexShrink: 0, position: 'relative', width: 38, height: 38 }}>
            <svg width="38" height="38" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="19" cy="19" r="15" fill="none"
                stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
              <circle cx="19" cy="19" r="15" fill="none"
                stroke="#60A5FA" strokeWidth="3"
                strokeDasharray={`${(score / 100) * 94.2} 94.2`}
                strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#60A5FA' }}>{score}</div>
          </div>
        )}
      </div>

      {/* Detail rows */}
      <div style={{ padding: '0 16px 6px' }}>
        {rows.map((r, i) => (
          <div key={r.label}>
            {i > 0 && <Divider />}
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '9px 0' }}>
              <span style={{ fontSize: 12, color: C.t3 }}>{r.label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: C.t2,
                maxWidth: 180, textAlign: 'right', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.value}</span>
            </div>
          </div>
        ))}
      </div>

      <PreviewCTA label="Marka Ayarlarına Git" onClick={() => navigate('brand')} color="#60A5FA" />
    </div>
  );
}

function PreviewAnaliz({ ops, navigate }: { ops: any; navigate: (s: any) => void }) {
  const runs = ops?.recentAgentRuns ?? [];
  const done = runs.filter((r: any) => r.status?.toLowerCase() === 'completed');
  const failed = runs.filter((r: any) => r.status?.toLowerCase() === 'failed');
  const live = runs.filter((r: any) => r.status?.toLowerCase() === 'running');

  const stats = [
    { v: live.length, label: 'Canlı', color: C.success },
    { v: done.length, label: 'Tamamlanan', color: C.t2 },
    { v: failed.length, label: 'Başarısız', color: '#F87171' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 12px' }}>
        {stats.map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px',
            background: C.bg, borderRadius: 12, border: `0.5px solid ${C.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color,
              letterSpacing: '-0.04em' }}>{s.v}</div>
            <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {/* Last runs */}
      {runs.slice(0, 3).length > 0 && (
        <div style={{ padding: '0 16px 6px' }}>
          <div style={{ fontSize: 10, color: C.t3, letterSpacing: '0.08em',
            textTransform: 'uppercase', marginBottom: 8 }}>Son Çalışmalar</div>
          {runs.slice(0, 3).map((r: any, i: number) => (
            <div key={r.id ?? i}>
              {i > 0 && <Divider />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: r.status === 'running' ? C.success
                    : r.status === 'completed' ? C.t3 : '#F87171' }} />
                <div style={{ flex: 1, fontSize: 12, color: C.t2, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.agentRole?.replace('_agent', '') ?? r.taskType ?? 'Görev'}
                </div>
                <span style={{ fontSize: 10, color: C.t3 }}>{timeAgo(r.startedAt ?? r.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <PreviewCTA label="AI Aktivitesine Git" onClick={() => navigate('ai-activity')} color="#34D399" />
    </div>
  );
}

function PreviewReklamlar({ artifacts, navigate, openPlatformPreview }: {
  artifacts: OutputArtifact[]; navigate: (s: any) => void; openPlatformPreview: (id: string) => void;
}) {
  const ads = artifacts.filter(a => {
    const ct = (a as any).contentType?.toLowerCase() ?? '';
    return ct.includes('ad') || ct.includes('reklam') || ct.includes('campaign');
  }).slice(0, 3);

  const recent = ads.length > 0 ? ads : artifacts.slice(0, 3);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 12px' }}>
        {recent.map(a => {
          const res = (() => { try { return resolveArtifact(a); } catch { return null; } })();
          const img = resolveImg(res?.thumbnailUrl ?? res?.imageUrl);
          return (
            <button key={a.id} onClick={() => openPlatformPreview(a.id)} style={{
              flex: 1, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
              border: `0.5px solid ${C.border}`, background: '#111', textAlign: 'left',
            }}>
              <div style={{ aspectRatio: '1/1', position: 'relative' }}>
                {img
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={img} alt="" referrerPolicy="no-referrer"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
                      <span style={{ fontSize: 14, opacity: 0.07 }}>✦</span>
                    </div>
                }
              </div>
              <div style={{ padding: '6px 8px 8px' }}>
                <div style={{ fontSize: 10, color: C.t3, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(a.title ?? 'Reklam').slice(0, 14)}
                </div>
              </div>
            </button>
          );
        })}
        {recent.length === 0 && (
          <div style={{ flex: 1, fontSize: 13, color: C.t3, textAlign: 'center', padding: '20px 0' }}>
            Henüz reklam içeriği yok
          </div>
        )}
      </div>
      <PreviewCTA label="Reklamlara Git" onClick={() => navigate('ads')} color="#FBBF24" />
    </div>
  );
}

function PreviewBrief({ navigate }: { navigate: (s: any) => void }) {
  return (
    <div style={{ padding: '16px 16px 6px' }}>
      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, marginBottom: 16 }}>
        AI ekibine yeni bir görev ver — içerik, strateji, reklam veya analiz brief'i oluştur.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { label: '✦  İçerik Brief', sub: 'Post, reel, story fikri', dest: 'new-brief' },
          { label: '🚀  Kampanya', sub: 'Mission başlat', dest: 'missions' },
        ].map(item => (
          <button key={item.label} onClick={() => navigate(item.dest as any)} style={{
            width: '100%', padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
            background: C.bg, border: `0.5px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.t1 }}>{item.label}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{item.sub}</div>
            </div>
            <ChevronRight />
          </button>
        ))}
      </div>
      <div style={{ height: 12 }} />
    </div>
  );
}

function PreviewCTA({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <div style={{ padding: '8px 16px 14px' }}>
      <button onClick={onClick} style={{
        width: '100%', padding: '12px', borderRadius: 14, cursor: 'pointer',
        background: 'transparent', border: `0.5px solid ${color}33`,
        fontSize: 13, fontWeight: 600, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AICommandCenter() {
  const { navigate, openPlatformPreview } = useMobileStore();
  const { user, openProfile, showProfile, closeProfile } = useAuthStore();
  const { officeId, tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();

  const brandName = (user as any)?.tenantName ?? user?.displayName ?? 'Workspace';
  const initials  = brandName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const today     = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  const { data: rawArtifacts = [] } = useQuery({
    queryKey: ['artifacts'], queryFn: () => apiClient.getArtifacts(),
    refetchInterval: 30_000, staleTime: 15_000, retry: 1,
  });
  const { data: ops } = useQuery({
    queryKey: ['operations-summary'], queryFn: () => apiClient.getOperationsSummary(),
    refetchInterval: 15_000, staleTime: 10_000,
  });
  const { data: agents = [] } = useQuery({
    queryKey: ['agents', officeId], queryFn: () => apiClient.getAgents(officeId),
    staleTime: 5 * 60_000, retry: false, enabled: Boolean(officeId),
  });
  const { data: recs } = useQuery({
    queryKey: ['recommendations', tenantId], queryFn: () => apiClient.getRecommendations(tenantId),
    staleTime: 5 * 60_000, retry: false, enabled: Boolean(tenantId),
  });
  const { data: missionsData } = useQuery({
    queryKey: ['missions', tenantId], queryFn: () => apiClient.listMissions(tenantId, 'in_flight'),
    staleTime: 15_000, retry: false, enabled: Boolean(tenantId),
  });

  const artifacts  = (rawArtifacts as OutputArtifact[]).slice(0, 60);
  const pending    = artifacts.filter(a => a.status === 'pending_review').slice(0, 8);
  const recent     = [...artifacts].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 9);
  const liveRuns   = (ops?.recentAgentRuns ?? []).filter((r: any) => r.status?.toLowerCase() === 'running');
  const allMissions = (missionsData as any)?.missions ?? (missionsData as any) ?? [];
  const inFlight   = Array.isArray(allMissions)
    ? allMissions.filter((m: any) => m.status === 'in_flight' || m.status === 'approved').slice(0, 4)
    : [];
  const topRecs    = (recs?.recommendations ?? []).slice(0, 3);

  const [selectedQuick, setSelectedQuick] = useState<QuickItem | null>('marka');
  const [execKey, setExecKey] = useState<string | null>(null);

  const execMutation = useMutation({
    mutationFn: async (rec: RecommendedTask) => {
      const agentNum = AGENT_ROLE_TO_NUM[rec.agent_role];
      const agent = (agents as any[]).find(a =>
        a.agentType === agentNum || String(a.agentType) === String(agentNum));
      if (!agent) throw new Error('Ajan bulunamadı');
      setExecKey(rec.task_type + rec.title);
      return apiClient.executeAgent(agent.id, {
        taskType: rec.task_type, inputData: { ...rec.input_data, brief: rec.brief },
      });
    },
    onSettled: () => {
      setExecKey(null);
      queryClient.invalidateQueries({ queryKey: ['operations-summary'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
    },
  });

  const isEmpty = pending.length === 0;

  // Which quick item is highlighted
  const activeItem = QUICK_ITEMS.find(q => q.id === selectedQuick);

  return (
    <>
      {showProfile && <ProfileSheet onClose={closeProfile} />}
      <div style={{
        minHeight: '100dvh', background: C.bg, paddingBottom: 100,
        fontFamily: '-apple-system,"SF Pro Display","SF Pro Text",system-ui,sans-serif',
      }}>

        {/* WIDGET 1 — HEADER */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px 20px',
          borderBottom: `0.5px solid ${C.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 12, color: C.t3, marginBottom: 5 }}>{today}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.t1,
                letterSpacing: '-0.04em', lineHeight: 1.1 }}>
                {greeting},<br /><span style={{ color: C.t2 }}>{brandName}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => navigate('notifications')} style={{
                width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                background: C.s1, border: `0.5px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke={C.t3} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {pending.length > 0 && (
                  <div style={{ position: 'absolute', top: 7, right: 7,
                    width: 7, height: 7, borderRadius: '50%', background: C.warn }} />
                )}
              </button>
              <button onClick={openProfile} style={{
                width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                background: 'linear-gradient(135deg,#7C3AED,#6366F1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff', border: 'none',
              }}>{initials}</button>
            </div>
          </div>

          {/* KPI strip */}
          <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
            {[
              { v: pending.length, label: 'Onay Bekliyor', color: C.warn, dest: 'outputs' },
              { v: inFlight.length, label: 'Aktif Kampanya', color: C.accent, dest: 'missions' },
              { v: liveRuns.length, label: 'Canlı Ajan', color: C.success, dest: 'ai-activity' },
            ].map(k => (
              <button key={k.label} onClick={() => navigate(k.dest as any)} style={{
                flex: 1, padding: '11px 8px', borderRadius: 14, cursor: 'pointer',
                background: C.s1, border: `0.5px solid ${C.border}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 22, fontWeight: 700,
                  color: k.v > 0 ? k.color : C.t3, letterSpacing: '-0.04em', lineHeight: 1 }}>{k.v}</span>
                <span style={{ fontSize: 10, color: C.t3, fontWeight: 500,
                  textAlign: 'center', lineHeight: 1.2 }}>{k.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* WIDGET 2 — LIVE AI ACTIVITY */}
        {liveRuns.length > 0 && (
          <button onClick={() => navigate('ai-activity')} style={{
            width: '100%', padding: '14px 20px', cursor: 'pointer',
            background: 'rgba(16,185,129,0.06)', border: 'none',
            borderBottom: `0.5px solid rgba(16,185,129,0.12)`,
            display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.success,
              animation: 'liveGlow 2s infinite', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.success }}>
                {liveRuns.length} ajan aktif olarak çalışıyor
              </span>
            </div>
            <ChevronRight color={C.success} />
          </button>
        )}

        {/* WIDGET 4 — QUICK ACCESS + DYNAMIC PREVIEW */}
        <div style={{ paddingTop: 24 }}>
          {/* Pill bar — no label, pills speak for themselves */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto',
            paddingLeft: 20, paddingRight: 20, paddingBottom: 2, scrollbarWidth: 'none' }}>
            {QUICK_ITEMS.map(item => {
              const isActive = selectedQuick === item.id;
              return (
                <button key={item.id}
                  onClick={() => setSelectedQuick(item.id)}
                  style={{
                    flexShrink: 0, padding: '8px 14px', borderRadius: 22, cursor: 'pointer',
                    background: isActive ? `${item.accent}18` : C.s1,
                    border: `0.5px solid ${isActive ? item.accent + '55' : C.border}`,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 160ms ease',
                  }}>
                  {item.icon}
                  <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 500,
                    color: isActive ? item.accent : C.t2,
                    letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dynamic preview card */}
          {selectedQuick && activeItem && (
            <div style={{
              margin: '12px 20px 0',
              borderRadius: 20, overflow: 'hidden',
              background: C.s1, border: `0.5px solid ${activeItem.accent}33`,
              animation: 'scaleUp 200ms cubic-bezier(0.34,1.2,0.64,1) both',
            }}>
              {/* Card header — no close, user switches via pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 16px 0', marginBottom: 2 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8,
                  background: `${activeItem.accent}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {activeItem.icon}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700,
                  color: activeItem.accent, letterSpacing: '0.02em',
                  textTransform: 'uppercase' }}>
                  {activeItem.label}
                </span>
              </div>

              {/* Preview content by type */}
              {selectedQuick === 'icerikler' && (
                <PreviewIcerikler artifacts={artifacts} pending={pending}
                  navigate={navigate} openPlatformPreview={openPlatformPreview} />
              )}
              {selectedQuick === 'mission' && (
                <PreviewMission missions={inFlight} navigate={navigate} />
              )}
              {selectedQuick === 'marka' && (
                <PreviewMarka tenantId={tenantId} navigate={navigate} />
              )}
              {selectedQuick === 'analiz' && (
                <PreviewAnaliz ops={ops} navigate={navigate} />
              )}
              {selectedQuick === 'reklamlar' && (
                <PreviewReklamlar artifacts={artifacts} navigate={navigate}
                  openPlatformPreview={openPlatformPreview} />
              )}
              {selectedQuick === 'brief' && (
                <PreviewBrief navigate={navigate} />
              )}
            </div>
          )}
        </div>

        {/* WIDGET 3 — PENDING APPROVALS */}
        {pending.length > 0 && (
          <div style={{ paddingTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', marginBottom: 14 }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.t3,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Onay Bekliyor</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ padding: '3px 9px', borderRadius: 20,
                  background: 'rgba(245,158,11,0.1)', border: `0.5px solid rgba(245,158,11,0.25)` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.warn }}>{pending.length}</span>
                </div>
                <button onClick={() => navigate('outputs')} style={{
                  fontSize: 12, color: C.t3, background: 'none', border: 'none', cursor: 'pointer' }}>
                  Tümü →
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto',
              paddingLeft: 20, paddingRight: 20, paddingBottom: 4, scrollbarWidth: 'none' }}>
              {pending.map(a => {
                const res = (() => { try { return resolveArtifact(a); } catch { return null; } })();
                const img = resolveImg(res?.thumbnailUrl ?? res?.imageUrl);
                return (
                  <button key={a.id} onClick={() => openPlatformPreview(a.id)} style={{
                    flexShrink: 0, width: 124, borderRadius: 18, overflow: 'hidden',
                    cursor: 'pointer', border: `0.5px solid ${C.border}`,
                    background: '#0a0a0a', textAlign: 'left',
                  }}>
                    <div style={{ height: 170, position: 'relative', overflow: 'hidden', background: '#111' }}>
                      {img
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={img} alt="" referrerPolicy="no-referrer"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 24, opacity: 0.07 }}>✦</span>
                          </div>
                      }
                      <div style={{ position: 'absolute', inset: 0,
                        background: 'linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 55%)' }} />
                      <div style={{ position: 'absolute', top: 10, left: 10,
                        width: 7, height: 7, borderRadius: '50%', background: C.warn,
                        boxShadow: `0 0 6px ${C.warn}` }} />
                    </div>
                    <div style={{ padding: '9px 11px 12px' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.t2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        letterSpacing: '-0.01em' }}>
                        {(a.title ?? '').slice(0, 18) || 'İçerik'}
                      </div>
                      <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}>{timeAgo(a.createdAt)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {isEmpty && (
          <div style={{ padding: '80px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.15em',
              textTransform: 'uppercase', marginBottom: 20 }}>Başlayalım</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.t1,
              letterSpacing: '-0.04em', marginBottom: 10 }}>Hazırız</div>
            <div style={{ fontSize: 14, color: C.t3, lineHeight: 1.7,
              marginBottom: 36, maxWidth: 260, margin: '0 auto 36px' }}>
              Mission Hub'dan yeni bir kampanya başlat.
            </div>
            <button onClick={() => navigate('missions')} style={{
              padding: '13px 32px', borderRadius: 30, cursor: 'pointer',
              background: C.s1, border: `0.5px solid ${C.border}`,
              color: C.t2, fontSize: 14, fontWeight: 600,
            }}>
              Mission Hub →
            </button>
          </div>
        )}

      </div>
    </>
  );
}

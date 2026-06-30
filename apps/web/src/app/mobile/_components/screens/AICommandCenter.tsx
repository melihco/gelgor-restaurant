'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useMobileStore } from '../mobile-store';
import { useAuthStore } from '../auth-store';
import { ProfileSheet } from '../ProfileSheet';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { apiClient } from '@/lib/api-client';
import { resolveArtifact } from '@/lib/artifact-utils';
import { resolvePosterUrl } from '@/lib/production-bundle';
import { SafeCoverImage } from '../SafeCoverImage';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { OutputArtifact, RecommendedTask } from '@/types';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';
import { isMobileOperatorMode } from '../mobile-client-config';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import { MOBILE_ARTIFACT_FEED_LIMIT } from '../../_lib/mobile-artifacts';
import { useTheme } from '../theme-context';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';

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
  return resolveClientMediaUrl(url);
}

// ── Quick access items ─────────────────────────────────────────────────────

type QuickItem = 'icerikler' | 'mission' | 'marka' | 'analiz' | 'reklamlar';

const QUICK_ITEMS: { id: QuickItem; label: string; dest: string }[] = [
  { id: 'icerikler', label: 'İçerikler', dest: 'feed' },
  { id: 'mission',   label: 'Haftalık Plan', dest: 'missions' },
  { id: 'marka',     label: 'Marka',     dest: 'brand' },
  { id: 'analiz',    label: 'Performans', dest: 'insights' },
  { id: 'reklamlar', label: 'Reklamlar', dest: 'ads' },
];

// ── Preview panels ─────────────────────────────────────────────────────────

function PreviewCTA({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <div style={{ padding: '8px 16px 14px' }}>
      <button onClick={onClick} style={{
        width: '100%', padding: '12px', borderRadius: 12, cursor: 'pointer',
        background: 'transparent',
        border: `0.5px solid ${t.separatorStrong}`,
        fontSize: 13, fontWeight: 600, color: t.textSecondary,
      }}>
        {label} →
      </button>
    </div>
  );
}

function PreviewIcerikler({ artifacts, pending, navigate, openPlatformPreview }: {
  artifacts: OutputArtifact[]; pending: OutputArtifact[];
  navigate: (s: any) => void; openPlatformPreview: (id: string) => void;
}) {
  const { t } = useTheme();
  const recent = [...artifacts].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 3);

  return (
    <div>
      <div style={{ display: 'flex', padding: '14px 16px 10px', gap: 8 }}>
        {[
          { v: pending.length, label: 'Bekliyor', color: t.warning },
          { v: artifacts.filter(a => a.status === 'approved').length, label: 'Onaylı', color: t.success },
          { v: artifacts.length, label: 'Toplam', color: t.textTertiary },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px',
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            borderRadius: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.v > 0 ? s.color : t.textMuted,
              letterSpacing: '-0.04em', lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {recent.length > 0 && (
        <div style={{ padding: '0 16px 6px' }}>
          <div style={{ fontSize: 10, color: t.textMuted, letterSpacing: '0.07em',
            textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Son Üretimler</div>
          <div style={{ display: 'flex', gap: 7 }}>
            {recent.map(a => {
              const res = (() => { try { return resolveArtifact(a); } catch { return null; } })();
              const img = resolveImg(res?.thumbnailUrl ?? res?.imageUrl);
              return (
                <button key={a.id} onClick={() => openPlatformPreview(a.id)} style={{
                  flex: 1, aspectRatio: '1/1', borderRadius: 10, overflow: 'hidden',
                  cursor: 'pointer', border: `0.5px solid ${t.separator}`,
                  background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                  position: 'relative',
                }}>
                  {img
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={img} alt="" referrerPolicy="no-referrer"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : null
                  }
                  {/* Status dot */}
                  <div style={{ position: 'absolute', bottom: 5, right: 5,
                    width: 6, height: 6, borderRadius: '50%',
                    background: a.status === 'approved' ? t.success : a.status === 'pending_review' ? t.warning : 'transparent' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <PreviewCTA label="Onay akışına git" onClick={() => navigate('feed')} />
    </div>
  );
}

function PreviewMission({ missions, navigate }: { missions: any[]; navigate: (s: any) => void }) {
  const { t } = useTheme();
  const items = missions.slice(0, 3);
  return (
    <div>
      <div style={{ padding: '10px 16px 4px' }}>
        <div style={{ fontSize: 10, color: t.textMuted, letterSpacing: '0.07em',
          textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Aktif Kampanyalar</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textMuted, padding: '16px 0', textAlign: 'center' }}>
            Aktif kampanya yok
          </div>
        ) : (
          items.map((m: any, i: number) => {
            const pct = m.completion_pct ?? 0;
            const r = 13, circ = 2 * Math.PI * r;
            return (
              <div key={m.id}>
                {i > 0 && <div style={{ height: '0.5px', background: t.separator }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                  <div style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
                    <svg width="32" height="32" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="16" cy="16" r={r} fill="none" stroke={t.separator} strokeWidth="2.5" />
                      <circle cx="16" cy="16" r={r} fill="none" stroke={t.accent} strokeWidth="2.5"
                        strokeDasharray={`${pct * circ / 100} ${circ}`} strokeLinecap="round" />
                    </svg>
                    <span style={{ position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%,-50%)',
                      fontSize: 7, fontWeight: 800, color: t.accent }}>{pct}%</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      letterSpacing: '-0.02em' }}>{m.title}</div>
                    <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                      {m.completed_nodes ?? 0}/{m.total_nodes ?? '?'} görev
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <PreviewCTA label="Haftalık Plana Git" onClick={() => navigate('missions')} />
    </div>
  );
}

function PreviewMarka({ tenantId, navigate }: { tenantId: string; navigate: (s: any) => void }) {
  const { t } = useTheme();
  const { data: profile } = useQuery({
    queryKey: ['company-profile', tenantId],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 10 * 60_000,
    enabled: Boolean(tenantId),
  });
  const { data: productionSnapshot } = useQuery({
    queryKey: ['production-context-snapshot', tenantId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(tenantId),
    staleTime: 10 * 60_000,
    enabled: !!tenantId,
  });
  const brandCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);

  const p = profile as any;
  const b = brandCtx as any;
  const name = p?.brandName || b?.business_name || '—';
  const industry = b?.industry || b?.business_type || '';
  const tone = b?.brand_tone || '';
  const rows = [
    { label: 'Sektör', value: industry },
    { label: 'Ton', value: tone },
    { label: 'Konum', value: b?.location || p?.location || '' },
  ].filter(r => r.value);

  return (
    <div>
      <div style={{ padding: '14px 16px 10px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary,
          letterSpacing: '-0.03em', marginBottom: 8 }}>{name}</div>
        {rows.map((r, i) => (
          <div key={r.label}>
            {i > 0 && <div style={{ height: '0.5px', background: t.separator }} />}
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '8px 0' }}>
              <span style={{ fontSize: 12, color: t.textMuted }}>{r.label}</span>
              <span style={{ fontSize: 12, color: t.textSecondary, fontWeight: 500 }}>{r.value}</span>
            </div>
          </div>
        ))}
      </div>
      <PreviewCTA label="Marka ayarlarına git" onClick={() => navigate('brand')} />
    </div>
  );
}

function PreviewAnaliz({ ops, navigate }: { ops: any; navigate: (s: any) => void }) {
  const { t } = useTheme();
  const runs = ops?.recentAgentRuns ?? [];
  const live = runs.filter((r: any) => r.status?.toLowerCase() === 'running').length;
  const done = runs.filter((r: any) => r.status?.toLowerCase() === 'completed').length;

  return (
    <div>
      <div style={{ display: 'flex', padding: '14px 16px 10px', gap: 8 }}>
        {[
          { v: live, label: 'Canlı', color: t.success },
          { v: done, label: 'Tamamlandı', color: t.textTertiary },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 6px',
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', borderRadius: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.v > 0 ? s.color : t.textMuted,
              letterSpacing: '-0.04em', lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <PreviewCTA label="Performansa git" onClick={() => navigate('insights')} />
    </div>
  );
}

function PreviewReklamlar({ navigate }: { navigate: (s: any) => void }) {
  return <PreviewCTA label="Reklamlara git" onClick={() => navigate('ads')} />;
}

// ── Main ──────────────────────────────────────────────────────────────────

export function AICommandCenter() {
  const { navigate, openPlatformPreview } = useMobileStore();
  const { user, openProfile, showProfile, closeProfile } = useAuthStore();
  const { officeId, tenantId } = useWorkspaceStore();
  const { t } = useTheme();
  const queryClient = useQueryClient();

  const brandName = (user as any)?.tenantName ?? user?.displayName ?? 'Workspace';
  const firstName = brandName.split(' ')[0] ?? brandName;
  const initials  = brandName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const hour      = new Date().getHours();
  const greeting  = hour < 5 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  const { data: rawArtifacts = [] } = useMobileArtifacts({
    subscribeOnly: true,
    params: { limit: MOBILE_ARTIFACT_FEED_LIMIT },
  });
  const { data: ops } = useQuery({
    queryKey: ['operations-summary'], queryFn: () => apiClient.getOperationsSummary(),
    refetchInterval: 30_000, staleTime: 30_000, refetchIntervalInBackground: false,
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

  const artifacts  = filterFeedPublishableArtifacts(rawArtifacts as OutputArtifact[]).slice(0, 80);
  const pending    = artifacts.filter(a => a.status === 'pending_review').slice(0, 16);
  const liveRuns   = (ops?.recentAgentRuns ?? []).filter((r: any) => r.status?.toLowerCase() === 'running');
  const allMissions = (missionsData as any)?.missions ?? (missionsData as any) ?? [];
  const inFlight   = Array.isArray(allMissions)
    ? allMissions.filter((m: any) => m.status === 'in_flight' || m.status === 'approved').slice(0, 4)
    : [];
  const topRecs    = (recs?.recommendations ?? []).slice(0, 3);
  const approvedCount = artifacts.filter(a => a.status === 'approved').length;
  const operatorMode  = isMobileOperatorMode();
  const isEmpty       = pending.length === 0 && artifacts.length === 0;

  const [selectedQuick, setSelectedQuick] = useState<QuickItem>('icerikler');
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

  const visibleQuickItems = QUICK_ITEMS.filter(item =>
    operatorMode || (item.id !== 'analiz'));

  return (
    <>
      {showProfile && <ProfileSheet onClose={closeProfile} />}

      <div style={{
        minHeight: '100dvh',
        background: t.bg,
        paddingBottom: 100,
      }}>

        {/* ─── HEADER ─────────────────────────────────────────────── */}
        <div style={{
          padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px 20px',
          borderBottom: `0.5px solid ${t.separator}`,
        }}>

          {/* Top row: logo + profile */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <SmartAgencyLogo variant="mark" framed className="!h-7 !w-7" />
            <button onClick={openProfile} style={{
              width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
              background: t.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#fff', border: 'none',
            }}>{initials}</button>
          </div>

          {/* Greeting */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: t.textTertiary, marginBottom: 2 }}>{greeting}</div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: t.textPrimary, lineHeight: 1.05 }}>
              {firstName}
            </div>
          </div>

          {/* KPI strip — numbers only, no decoration */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { v: pending.length,   label: 'Onay Bekliyor', dest: 'feed',     accent: pending.length > 0 },
              { v: inFlight.length,  label: 'Aktif Plan',    dest: 'missions', accent: false },
              { v: approvedCount,    label: 'Yayında',       dest: 'feed',     accent: false },
            ].map(k => (
              <button key={k.label} onClick={() => navigate(k.dest as any)} style={{
                flex: 1, padding: '12px 8px 10px', borderRadius: 14, cursor: 'pointer',
                border: 'none',
                background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{
                  fontSize: 24, fontWeight: 900, lineHeight: 1,
                  color: k.accent && k.v > 0 ? t.warning : k.v > 0 ? t.textPrimary : t.textMuted,
                  letterSpacing: '-0.05em',
                }}>{k.v}</span>
                <span style={{
                  fontSize: 9.5, color: t.textMuted, fontWeight: 500, textAlign: 'center', lineHeight: 1.2,
                }}>{k.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ─── PRIMARY ACTION (customer) ─────────────────────────── */}
        {!operatorMode && pending.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('feed')}
            style={{
              width: '100%', padding: '14px 20px', cursor: 'pointer',
              background: t.isDark ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.08)',
              border: 'none',
              borderBottom: `0.5px solid ${t.separator}`,
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            }}
          >
            <span style={{ flex: 1, fontSize: 14, color: t.warning, fontWeight: 700 }}>
              {pending.length} içerik onayınızı bekliyor
            </span>
            <span style={{ fontSize: 13, color: t.warning, fontWeight: 600 }}>→</span>
          </button>
        )}
        {!operatorMode && pending.length === 0 && inFlight.length > 0 && (
          <button
            type="button"
            onClick={() => navigate('missions')}
            style={{
              width: '100%', padding: '14px 20px', cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: `0.5px solid ${t.separator}`,
              display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            }}
          >
            <span style={{ flex: 1, fontSize: 14, color: t.accent, fontWeight: 600 }}>
              Haftalık planınız hazırlanıyor
            </span>
            <span style={{ fontSize: 12, color: t.textMuted }}>→</span>
          </button>
        )}

        {/* ─── LIVE BANNER (operator only) ────────────────────────── */}
        {operatorMode && liveRuns.length > 0 && (
          <button onClick={() => navigate('ai-activity')} style={{
            width: '100%', padding: '12px 20px', cursor: 'pointer',
            background: 'transparent', border: 'none',
            borderBottom: `0.5px solid ${t.separator}`,
            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.live,
              animation: 'liveGlow 2s infinite', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: t.live, fontWeight: 600 }}>
              {liveRuns.length} ajan çalışıyor
            </span>
            <span style={{ fontSize: 12, color: t.textMuted }}>→</span>
          </button>
        )}

        {/* ─── QUICK ACCESS ────────────────────────────────────────── */}
        <div style={{ padding: '20px 20px 0' }}>

          {/* Horizontal scroll — text only pills */}
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            scrollbarWidth: 'none', marginBottom: 12, paddingBottom: 2,
          }}>
            {visibleQuickItems.map(item => {
              const isActive = selectedQuick === item.id;
              return (
                <button key={item.id} onClick={() => setSelectedQuick(item.id)} style={{
                  flexShrink: 0, padding: '7px 14px', borderRadius: 20,
                  cursor: 'pointer', border: 'none',
                  background: isActive
                    ? (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)')
                    : 'transparent',
                  color: isActive ? t.textPrimary : t.textMuted,
                  fontSize: 13, fontWeight: isActive ? 700 : 500,
                  letterSpacing: '-0.01em',
                  transition: 'all 150ms ease',
                }}>
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Content panel — minimal card */}
          <div style={{
            borderRadius: 18, overflow: 'hidden',
            background: t.surface,
            border: `0.5px solid ${t.separator}`,
            animation: 'fadeIn 180ms ease both',
          }}>
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
              <PreviewReklamlar navigate={navigate} />
            )}
          </div>
        </div>

        {/* ─── AI RECOMMENDATIONS (operator) ──────────────────────── */}
        {operatorMode && topRecs.length > 0 && (
          <div style={{ padding: '20px 20px 0' }}>
            <div style={{ fontSize: 10, color: t.textMuted, letterSpacing: '0.07em',
              textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
              AI Önerileri
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1,
              background: t.surface, borderRadius: 18, overflow: 'hidden',
              border: `0.5px solid ${t.separator}` }}>
              {topRecs.map((rec: any, i: number) => (
                <button
                  key={rec.task_type + rec.title}
                  onClick={() => { if (!execMutation.isPending) execMutation.mutate(rec); }}
                  disabled={execMutation.isPending && execKey === rec.task_type + rec.title}
                  style={{
                    padding: '13px 16px', cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'transparent', border: 'none',
                    borderBottom: i < topRecs.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                    opacity: execMutation.isPending && execKey === rec.task_type + rec.title ? 0.5 : 1,
                  }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%',
                    background: t.accent, flexShrink: 0, opacity: 0.7 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      letterSpacing: '-0.01em' }}>{rec.title}</div>
                    {rec.brief && (
                      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rec.brief}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: t.textMuted }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── PENDING STRIP ───────────────────────────────────────── */}
        {pending.length > 0 && (
          <div style={{ paddingTop: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', marginBottom: 12 }}>
              <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: t.textMuted,
                letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Onay Bekliyor
              </span>
              <button onClick={() => navigate('feed')} style={{
                fontSize: 12, color: t.accent, background: 'none',
                border: 'none', cursor: 'pointer', fontWeight: 600,
              }}>
                Tümü →
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, overflowX: 'auto',
              paddingLeft: 20, paddingRight: 20, paddingBottom: 4, scrollbarWidth: 'none' }}>
              {pending.map(a => {
                const res = (() => { try { return resolveArtifact(a); } catch { return null; } })();
                const img = resolveImg(res?.thumbnailUrl ?? res?.imageUrl);
                const poster = resolveImg(resolvePosterUrl(a) ?? undefined);
                return (
                  <button key={a.id} onClick={() => openPlatformPreview(a.id)} style={{
                    flexShrink: 0, width: 120,
                    borderRadius: 16, overflow: 'hidden',
                    cursor: 'pointer',
                    background: t.surface,
                    border: `0.5px solid ${t.separator}`,
                    textAlign: 'left',
                  }}>
                    <div style={{ height: 164, position: 'relative', overflow: 'hidden',
                      background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
                      {(img || poster) && (
                        <SafeCoverImage
                          src={img ?? poster}
                          fallbacks={[poster, resolveImg(a.contentUrl ?? undefined)]}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                      <div style={{ position: 'absolute', inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)' }} />
                      {/* Simple dot indicator */}
                      <div style={{ position: 'absolute', top: 8, left: 8,
                        width: 6, height: 6, borderRadius: '50%', background: t.warning }} />
                    </div>
                    <div style={{ padding: '8px 10px 10px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: t.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        letterSpacing: '-0.01em' }}>
                        {(a.title ?? '').slice(0, 18) || 'İçerik'}
                      </div>
                      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                        {timeAgo(a.createdAt)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── EMPTY STATE ─────────────────────────────────────────── */}
        {isEmpty && (
          <div style={{ padding: '80px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary,
              letterSpacing: '-0.03em', marginBottom: 8 }}>Hazırız</div>
            <div style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.7,
              marginBottom: 28, maxWidth: 260, margin: '0 auto 28px' }}>
              Haftalık planınızı başlatın — AI markanıza uygun içerik önerileri hazırlar.
            </div>
            <button onClick={() => navigate('missions')} style={{
              padding: '13px 28px', borderRadius: 30, cursor: 'pointer',
              background: t.accent, border: 'none',
              color: '#fff', fontSize: 14, fontWeight: 700,
            }}>
              Haftalık Plana Git →
            </button>
          </div>
        )}

      </div>
    </>
  );
}

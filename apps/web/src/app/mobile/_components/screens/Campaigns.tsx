'use client';
/**
 * CAMPAIGNS — Real briefs from Nexus API.
 * Maps Brief → Campaign with status, progress from task completion.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Brief } from '@/types';

// ─── Brief → visual campaign ──────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string; dimKey: string }> = {
  draft:       { label: 'Taslak',      color: '#60a5fa', dimKey: 'rgba(96,165,250,0.10)'     },
  decomposed:  { label: 'Hazırlanıyor',color: '#9DBECE', dimKey: 'rgba(157,190,206,0.10)'    },
  in_progress: { label: 'Aktif',       color: '#34d399', dimKey: 'rgba(52,211,153,0.10)'     },
  review:      { label: 'İnceleme',    color: '#f59e0b', dimKey: 'rgba(245,158,11,0.10)'     },
  completed:   { label: 'Tamamlandı',  color: '#60a5fa', dimKey: 'rgba(96,165,250,0.10)'     },
  archived:    { label: 'Arşiv',       color: '#71717a', dimKey: 'rgba(113,113,122,0.08)'    },
};

const STATUS_COLORS = ['#9DBECE', '#f472b6', '#60a5fa', '#34d399', '#f59e0b', '#818cf8'];

function briefColor(index: number): string {
  return STATUS_COLORS[index % STATUS_COLORS.length]!;
}

function briefProgress(brief: Brief): number {
  const tasks = brief.tasks ?? [];
  if (tasks.length === 0) {
    if (brief.status === 'completed') return 100;
    if (brief.status === 'in_progress') return 50;
    if (brief.status === 'decomposed')  return 15;
    return 0;
  }
  const done = tasks.filter(t => t.status === 'completed').length;
  return Math.round((done / tasks.length) * 100);
}

function briefIcon(brief: Brief): string {
  const t = brief.title.toLowerCase();
  if (t.includes('story') || t.includes('hikaye'))   return '▋';
  if (t.includes('reel')  || t.includes('video'))    return '▶';
  if (t.includes('rapor') || t.includes('report') || t.includes('analiz')) return '↗';
  if (t.includes('reklam')|| t.includes('ads'))      return '◈';
  if (t.includes('brief') || t.includes('görev'))    return '⚡';
  return '■';
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60)  return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} sa önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

// ─── Brief card ────────────────────────────────────────────────────────
function BriefCard({ brief, index, onClick, featured = false }: {
  brief: Brief; index: number; onClick: () => void; featured?: boolean;
}) {
  const { t } = useTheme();
  const sc      = STATUS_MAP[brief.status] ?? STATUS_MAP['draft']!;
  const color   = briefColor(index);
  const progress = briefProgress(brief);
  const tasks    = brief.tasks ?? [];
  const doneTasks = tasks.filter(t2 => t2.status === 'completed').length;

  return (
    <button onClick={onClick} style={{
      padding: '18px 18px 16px',
      background: t.isDark
        ? `linear-gradient(145deg, ${color}07, rgba(255,255,255,0.025))`
        : '#fff',
      border: t.isDark ? `0.5px solid ${color}20` : 'none',
      borderRadius: 20, textAlign: 'left', cursor: 'pointer', width: '100%',
      boxShadow: !t.isDark ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
      position: 'relative', overflow: 'hidden',
    }}>
      {t.isDark && <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: '0.5px', background: `linear-gradient(90deg, transparent, ${color}55, transparent)` }} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        {/* Icon */}
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}15`, border: `0.5px solid ${color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, color }}>
          {briefIcon(brief)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {brief.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: sc.dimKey, color: sc.color, fontWeight: 600, letterSpacing: '0.04em' }}>
              {sc.label}
            </span>
            <span style={{ fontSize: 11, color: t.textMuted }}>{timeAgo(brief.createdAt)}</span>
          </div>
        </div>
        {/* Pending review indicator */}
        {brief.status === 'review' && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0, marginTop: 4, boxShadow: '0 0 8px rgba(245,158,11,0.8)', animation: 'liveGlow 2s infinite' }} />
        )}
      </div>

      {/* Progress */}
      {brief.status !== 'draft' && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: t.labelColor }}>
              {tasks.length > 0 ? `${doneTasks}/${tasks.length} görev` : 'Görevler hazırlanıyor'}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{progress}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 3, background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}>
            <div style={{ height: '100%', width: `${progress}%`, borderRadius: 3, background: `linear-gradient(90deg, ${color}cc, ${color})`, boxShadow: `0 0 6px ${color}40`, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      )}

      {/* Description excerpt */}
      {brief.description && (
        <div style={{ fontSize: 12, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {brief.description.slice(0, 80)}
        </div>
      )}
    </button>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────
function Skeleton() {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 120, borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff', animation: 'shimmer 1.4s ease-in-out infinite' }} />
      ))}
    </div>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────
type TabFilter = 'all' | 'active' | 'completed';

export function Campaigns() {
  const { t } = useTheme();
  const { openCampaign, navigate, goBack } = useMobileStore();
  const { officeId } = useWorkspaceStore();
  const [tab, setTab] = useState<TabFilter>('all');

  const { data: briefs = [], isLoading, error } = useQuery({
    queryKey: ['briefs', officeId],
    queryFn: () => apiClient.getBriefs(officeId),
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const filtered = briefs.filter((b: Brief) => {
    if (tab === 'all')       return true;
    if (tab === 'active')    return ['decomposed', 'in_progress', 'review'].includes(b.status);
    if (tab === 'completed') return ['completed', 'archived'].includes(b.status);
    return true;
  });

  const activeCnt    = briefs.filter((b: Brief) => ['decomposed', 'in_progress', 'review'].includes(b.status)).length;
  const completedCnt = briefs.filter((b: Brief) => ['completed'].includes(b.status)).length;

  const TABS: { id: TabFilter; label: string; count: number }[] = [
    { id: 'all',       label: 'Tümü',       count: briefs.length     },
    { id: 'active',    label: 'Aktif',      count: activeCnt         },
    { id: 'completed', label: 'Tamamlanan', count: completedCnt      },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, transition: 'background 300ms', fontFamily: '-apple-system, "SF Pro Display", sans-serif', paddingBottom: 96 }}>
      <MobileStackHeader
        t={t}
        title="Kampanyalar"
        onBack={goBack}
        right={(
          <button
            type="button"
            onClick={() => navigate('new-brief')}
            aria-label="Yeni brief"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              background: t.accent,
              color: '#fff',
              fontSize: 22,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            +
          </button>
        )}
      />

      <div style={{ padding: '0 20px', borderBottom: `0.5px solid ${t.separator}` }}>
        {!isLoading && (
          <p style={{ fontSize: 13, color: t.textTertiary, margin: '0 0 12px' }}>
            {activeCnt > 0 ? `${activeCnt} aktif görev` : `${briefs.length} brief`}
          </p>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(tb => {
            const isActive = tab === tb.id;
            return (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={{ flex: 1, padding: '11px 8px', textAlign: 'center', fontSize: 13, fontWeight: isActive ? 700 : 400, color: isActive ? t.accent : t.textTertiary, background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative' }}>
                {tb.label}
                {tb.count > 0 && <span style={{ marginLeft: 5, fontSize: 10, padding: '1px 5px', borderRadius: 10, background: isActive ? t.accentDim : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'), color: isActive ? t.accent : t.textMuted, fontWeight: 600 }}>{tb.count}</span>}
                {isActive && <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: '2px 2px 0 0', background: t.accent }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '16px 20px 0' }}>
        {isLoading ? (
          <Skeleton />
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ fontSize: 14, color: t.danger, marginBottom: 6, fontWeight: 600 }}>Yüklenemedi</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>API bağlantısını kontrol edin</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.15 }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              {tab === 'active' ? 'Aktif mission yok' : tab === 'completed' ? 'Tamamlanan yok' : 'Henüz brief yok'}
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 28, lineHeight: 1.6 }}>AI ekibine ilk briefi verin.</div>
            <button onClick={() => navigate('new-brief')} style={{ padding: '12px 28px', borderRadius: 30, cursor: 'pointer', background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 14, fontWeight: 600 }}>
              İlk Brief'i Oluştur →
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map((brief: Brief, index: number) => (
              <BriefCard
                key={brief.id}
                brief={brief}
                index={index}
                onClick={() => openCampaign(brief.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

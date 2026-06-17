'use client';
/**
 * CAMPAIGN DETAIL — Real Brief + TaskItems from Nexus API.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { CircleProgress } from '../ui-primitives';
import type { Brief, TaskItem } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────
const TASK_STATUS: Record<string, { label: string; color: string }> = {
  pending:     { label: 'Bekliyor',     color: '#71717a' },
  in_progress: { label: 'Devam Ediyor', color: '#34d399' },
  review:      { label: 'İnceleme',     color: '#f59e0b' },
  completed:   { label: 'Tamamlandı',   color: '#60a5fa' },
  blocked:     { label: 'Bloke',        color: '#f59e0b' },
  failed:      { label: 'Başarısız',    color: '#fb7185' },
};

const BRIEF_STATUS: Record<string, { label: string; color: string }> = {
  draft:       { label: 'Taslak',       color: '#60a5fa' },
  decomposed:  { label: 'Hazırlanıyor', color: '#9DBECE' },
  in_progress: { label: 'Aktif',        color: '#34d399' },
  review:      { label: 'İnceleme',     color: '#f59e0b' },
  completed:   { label: 'Tamamlandı',   color: '#60a5fa' },
  archived:    { label: 'Arşiv',        color: '#71717a' },
};

function progress(tasks: TaskItem[]): number {
  if (!tasks.length) return 0;
  return Math.round(tasks.filter(t => t.status === 'completed').length / tasks.length * 100);
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60)  return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h} sa önce`;
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const AGENT_COLORS: Record<string, string> = {
  writer: '#9DBECE', designer: '#f472b6', analyst: '#34d399',
  manager: '#a5b4fc', researcher: '#60a5fa', developer: '#818cf8',
};
function taskColor(task: TaskItem): string {
  const agent = ((task as any).assignedAgent ?? '').toLowerCase();
  for (const [k, v] of Object.entries(AGENT_COLORS)) {
    if (agent.includes(k)) return v;
  }
  return '#9DBECE';
}

type Tab = 'overview' | 'tasks' | 'outputs';

export function CampaignDetail() {
  const { t } = useTheme();
  const { goBack, selectedCampaignId, navigate } = useMobileStore();
  const [tab, setTab] = useState<Tab>('overview');

  // Fetch real brief
  const { data: brief, isLoading: briefLoading } = useQuery({
    queryKey: ['brief', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return null;
      try { return await apiClient.getBrief(selectedCampaignId); } catch { return null; }
    },
    enabled: !!selectedCampaignId,
    staleTime: 15_000,
  });

  // Fetch tasks for this brief
  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      try { return await apiClient.getTasks(selectedCampaignId); } catch { return []; }
    },
    enabled: !!selectedCampaignId,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  if (briefLoading || !brief) {
    return (
      <div style={{ height: '100dvh', background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: t.textMuted }}>Yükleniyor</div>
      </div>
    );
  }

  const allTasks  = tasks.length > 0 ? tasks : (brief.tasks ?? []);
  const prog      = progress(allTasks);
  const bs        = BRIEF_STATUS[brief.status] ?? BRIEF_STATUS['draft']!;
  const activeT   = allTasks.filter(t2 => t2.status === 'in_progress').length;
  const doneT     = allTasks.filter(t2 => t2.status === 'completed').length;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Genel Bakış' },
    { id: 'tasks',    label: `Görevler${allTasks.length > 0 ? ` (${allTasks.length})` : ''}` },
    { id: 'outputs',  label: 'Çıktılar'   },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, transition: 'background 300ms', fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>

      {/* Hero header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 16px) 20px 20px', background: t.isDark ? 'linear-gradient(180deg, rgba(77,112,136,0.07) 0%, transparent 100%)' : 'linear-gradient(180deg, rgba(77,112,136,0.03) 0%, transparent 100%)', borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <button onClick={goBack} style={{ width: 32, height: 32, borderRadius: '50%', ...t.iconBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.textSecondary} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M10 6l-5 6 5 6"/></svg>
          </button>
          <span style={{ fontSize: 12, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>Brief</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.025em', lineHeight: 1.2, marginBottom: 8 }}>
              {brief.title}
            </h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontWeight: 600, background: `${bs.color}14`, color: bs.color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{bs.label}</span>
              <span style={{ fontSize: 11, color: t.textMuted }}>{timeAgo(brief.createdAt)}</span>
              {activeT > 0 && <span style={{ fontSize: 11, color: t.live, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: t.live, display: 'inline-block', animation: 'liveGlow 2s infinite' }} />{activeT} aktif</span>}
            </div>
          </div>
          <CircleProgress value={prog} size={68} strokeWidth={6} color={t.accent} isDark={t.isDark} label={`${prog}%`} />
        </div>

        {/* Stats row */}
        {allTasks.length > 0 && (
          <div style={{ display: 'flex', gap: 16, marginTop: 14, paddingTop: 14, borderTop: `0.5px solid ${t.separator}` }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.live, fontVariantNumeric: 'tabular-nums' }}>{activeT}</div>
              <div style={{ fontSize: 10, color: t.labelColor }}>Aktif</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.success, fontVariantNumeric: 'tabular-nums' }}>{doneT}</div>
              <div style={{ fontSize: 10, color: t.labelColor }}>Tamamlandı</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{allTasks.length}</div>
              <div style={{ fontSize: 10, color: t.labelColor }}>Toplam</div>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `0.5px solid ${t.separator}`, background: t.isDark ? 'rgba(5,5,8,0.8)' : 'rgba(248,248,252,0.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10, overflowX: 'auto' }}>
        {TABS.map(tb => {
          const isActive = tab === tb.id;
          return (
            <button key={tb.id} onClick={() => setTab(tb.id)} style={{ flex: 1, padding: '12px 8px', textAlign: 'center', fontSize: 13, fontWeight: isActive ? 700 : 400, color: isActive ? t.accent : t.textTertiary, background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, minWidth: 90, whiteSpace: 'nowrap' }}>
              {tb.label}
              {isActive && <div style={{ position: 'absolute', bottom: 0, left: '20%', right: '20%', height: 2, borderRadius: '2px 2px 0 0', background: t.accent }} />}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ padding: '16px 20px', paddingBottom: 96 }}>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {brief.description && (
              <div style={{ ...t.surfaceCard, padding: '16px', borderRadius: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>Brief İçeriği</div>
                <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.65, margin: 0 }}>{brief.description}</p>
              </div>
            )}

            {/* Brief ID for reference */}
            <div style={{ ...t.surfaceCard, padding: '14px 16px', borderRadius: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: t.labelColor, marginBottom: 2 }}>Brief ID</div>
                <div style={{ fontSize: 12, color: t.textTertiary, fontFamily: 'monospace' }}>{brief.id.slice(0, 8)}…</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: t.labelColor, marginBottom: 2 }}>Oluşturuldu</div>
                <div style={{ fontSize: 12, color: t.textTertiary }}>{timeAgo(brief.createdAt)}</div>
              </div>
            </div>

            {allTasks.length === 0 && brief.status === 'draft' && (
              <div style={{ ...t.surfaceCard, padding: '20px', borderRadius: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>
                  Brief henüz decompose edilmemiş. Görevler oluşturulduğunda burada görünecek.
                </div>
              </div>
            )}
          </div>
        )}

        {/* TASKS */}
        {tab === 'tasks' && (
          <div>
            {tasksLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: t.textMuted, fontSize: 13 }}>Görevler yükleniyor...</div>
            ) : allTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0' }}>
                <div style={{ fontSize: 13, color: t.textMuted }}>
                  {brief.status === 'draft' ? 'Brief henüz decompose edilmedi' : 'Görev bulunamadı'}
                </div>
              </div>
            ) : (
              <div style={{ ...t.surfaceGroup, borderRadius: 18 }}>
                {allTasks.map((task, i) => {
                  const ts = TASK_STATUS[task.status] ?? TASK_STATUS['pending']!;
                  const color = taskColor(task);
                  return (
                    <div key={task.id} style={{ padding: '14px 16px', ...(i < allTasks.length - 1 ? t.surfaceRow : {}) }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                        {/* Status dot */}
                        <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4, background: ts.color, boxShadow: task.status === 'in_progress' ? `0 0 8px ${ts.color}80` : 'none', animation: task.status === 'in_progress' ? 'liveGlow 2s infinite' : 'none' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary, marginBottom: 3, lineHeight: 1.3 }}>{task.title}</div>
                          {task.description && (
                            <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.4, marginBottom: 5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {task.description}
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            {(task as any).assignedAgent && (
                              <span style={{ fontSize: 10, color, fontWeight: 600 }}>{(task as any).assignedAgent}</span>
                            )}
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: `${ts.color}12`, color: ts.color, fontWeight: 600 }}>{ts.label}</span>
                            {task.priority && task.priority !== 'medium' && (
                              <span style={{ fontSize: 10, color: task.priority === 'critical' ? '#fb7185' : task.priority === 'high' ? '#f59e0b' : t.textMuted }}>{task.priority === 'critical' ? '🔴' : task.priority === 'high' ? '🟡' : ''}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* OUTPUTS */}
        {tab === 'outputs' && (
          <div>
            <button
              onClick={() => navigate('outputs')}
              style={{ width: '100%', padding: '16px', borderRadius: 18, cursor: 'pointer', background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              Bu brief'in çıktılarını görüntüle →
            </button>
            <div style={{ marginTop: 12, fontSize: 12, color: t.textMuted, textAlign: 'center', lineHeight: 1.6 }}>
              Çıktılar ekranında "Tümü" listesinde bu brief'e ait içerikler ajan adıyla listelenir.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

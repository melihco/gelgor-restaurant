'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { useMobileStore } from './mobile-store';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { parseAgentSummary } from './activity-parser';
import { humanizeAgentError } from '@/lib/humanize-agent-error';

// ─── Agent meta ────────────────────────────────────────────────────────
const AGENT_META: Record<string, { role: string; color: string; icon: string }> = {
  blogwriter:                { role: 'İçerik Yazarı',   color: '#A78BFA', icon: '✍' },
  instagramcontentgenerator: { role: 'İçerik Üretici',  color: '#F472B6', icon: '✦' },
  socialmediadesigner:       { role: 'Tasarımcı',        color: '#F472B6', icon: '◈' },
  googleadsanalyst:          { role: 'Reklam Analisti',  color: '#60A5FA', icon: '◎' },
  analyticsanalyst:          { role: 'Veri Analisti',    color: '#34D399', icon: '↗' },
  customerreviewresponder:   { role: 'Yorum Uzmanı',     color: '#F59E0B', icon: '💬' },
  aiceo:                     { role: 'Strateji CEO',     color: '#A5B4FC', icon: '◆' },
  chatbotmanager:            { role: 'Bot Yöneticisi',   color: '#818CF8', icon: '⟳' },
  writer:    { role: 'Yazar',       color: '#A78BFA', icon: '✍' },
  designer:  { role: 'Tasarımcı',   color: '#F472B6', icon: '◈' },
  analyst:   { role: 'Analist',     color: '#34D399', icon: '↗' },
  manager:   { role: 'Yönetici',    color: '#A5B4FC', icon: '◆' },
  researcher:{ role: 'Araştırmacı', color: '#60A5FA', icon: '◎' },
};

function getMeta(agentType: string) {
  return AGENT_META[(agentType ?? '').toLowerCase()] ?? { role: 'AI Ajan', color: '#A78BFA', icon: '✦' };
}

// ─── Status ring ──────────────────────────────────────────────────────
function StatusRing({ color, active, size = 52 }: { color: string; active: boolean; size?: number }) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={active ? `${color}30` : 'rgba(255,255,255,0.06)'} strokeWidth="2.5" />
      {active && <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray={`${circ * 0.7} ${circ * 0.3}`} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />}
    </svg>
  );
}

// ─── Agent run item in the sheet ──────────────────────────────────────
interface RunItem {
  id: string;
  agentName: string;
  agentType: string;
  status: string;
  taskTitle: string;
  summary: string;
  tokensUsed: number;
  durationMs: number;
  startedAt: string;
  completedAt?: string | null;
  errorMessage?: string;
}

function fmtDuration(ms: number): string {
  if (!ms) return '';
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  const m = Math.floor(ms/60000), s = Math.floor((ms%60000)/1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function fmtTokens(n: number): string {
  if (!n) return '';
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return String(n);
}
function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'Az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h/24)} gün önce`;
}

// ─── Agent detail bottom sheet ────────────────────────────────────────
interface SheetProps {
  agentName: string;
  agentType: string;
  runs: RunItem[];
  onClose: () => void;
}

function AgentSheet({ agentName, agentType, runs, onClose }: SheetProps) {
  const { t } = useTheme();
  const { navigate } = useMobileStore();
  const { color, role, icon } = getMeta(agentType);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const activeRuns    = runs.filter(r => r.status.toLowerCase() === 'running');
  const completedRuns = runs.filter(r => r.status.toLowerCase() === 'completed');
  const failedRuns    = runs.filter(r => ['failed','error','cancelled'].includes(r.status.toLowerCase()));
  const initials = agentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const sheet = (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: 'fadeIn 200ms ease both' }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        maxHeight: '88dvh', display: 'flex', flexDirection: 'column',
        background: t.isDark ? '#0D0D1A' : '#f2f2f7',
        borderRadius: '26px 26px 0 0',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both',
        boxShadow: '0 -12px 50px rgba(0,0,0,0.4)',
        border: t.isDark ? `0.5px solid rgba(255,255,255,0.06)` : 'none',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Agent header */}
        <div style={{ padding: '8px 22px 16px', borderBottom: `0.5px solid ${t.separator}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar */}
            <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
              <StatusRing color={color} active={activeRuns.length > 0} size={52} />
              <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color, boxShadow: activeRuns.length > 0 ? `0 0 16px ${color}35` : 'none' }}>
                {initials}
              </div>
              {activeRuns.length > 0 && <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: color, border: `2px solid ${t.isDark ? '#0D0D1A' : '#f2f2f7'}`, boxShadow: `0 0 8px ${color}` }} />}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em' }}>{agentName}</div>
              <div style={{ fontSize: 12, color, fontWeight: 500, marginTop: 2 }}>{role}</div>
            </div>

            {/* Stats */}
            <div style={{ textAlign: 'right' }}>
              {activeRuns.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginBottom: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, animation: 'liveGlow 2s infinite' }} />
                  <span style={{ fontSize: 12, color, fontWeight: 700 }}>Aktif</span>
                </div>
              )}
              <div style={{ fontSize: 11, color: t.textMuted }}>{runs.length} görev toplam</div>
            </div>
          </div>

          {/* Quick stats row */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {[
              { label: 'Aktif',       value: activeRuns.length,    color: color },
              { label: 'Tamamlandı', value: completedRuns.length, color: t.success },
              { label: 'Hatalı',     value: failedRuns.length,    color: failedRuns.length > 0 ? t.danger : t.textMuted },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, padding: '10px 8px', borderRadius: 14, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 10, color: t.labelColor }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Run list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px' }}>
          {runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: t.textMuted, fontSize: 13 }}>
              Bu ajan için görev geçmişi bulunamadı
            </div>
          ) : (
            runs.map((run, i) => {
              const isActive  = run.status.toLowerCase() === 'running';
              const isFailed  = ['failed','error','cancelled'].includes(run.status.toLowerCase());
              const dotColor  = isActive ? color : isFailed ? t.danger : t.info;

              // Parse summary for human-readable preview
              const parsed    = parseAgentSummary(run.agentType, run.summary);
              const preview   = parsed.previewTitle ?? (run.summary ? run.summary.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim().slice(0, 80) : null);

              return (
                <div key={run.id} style={{
                  padding: '14px 0',
                  borderBottom: i < runs.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                  display: 'flex', gap: 12,
                }}>
                  {/* Dot */}
                  <div style={{ paddingTop: 4, flexShrink: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, boxShadow: isActive ? `0 0 8px ${dotColor}80` : 'none', animation: isActive ? 'liveGlow 2s infinite' : 'none' }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Task title */}
                    <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, lineHeight: 1.3, marginBottom: 4 }}>
                      {run.taskTitle || `${agentName} görevi`}
                    </div>

                    {/* Parsed summary preview */}
                    {preview && (
                      <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {preview}
                      </div>
                    )}

                    {/* Error */}
                    {run.errorMessage && (() => {
                      const h = humanizeAgentError(run.errorMessage);
                      return (
                        <div style={{ fontSize: 12, color: t.danger, padding: '6px 10px', borderRadius: 8, background: t.dangerDim, marginBottom: 6, lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>{h?.title ?? 'Hata'}</div>
                          <div style={{ fontSize: 11, color: t.textSecondary }}>{h?.detail ?? h?.summary ?? run.errorMessage}</div>
                        </div>
                      );
                    })()}

                    {/* Meta row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 20, background: isActive ? `${dotColor}12` : isFailed ? t.dangerDim : t.infoDim, color: dotColor, fontWeight: 600 }}>
                        {isActive ? '● Aktif' : isFailed ? 'Hata' : 'Tamamlandı'}
                      </span>
                      {run.durationMs > 0 && <span style={{ fontSize: 10, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(run.durationMs)}</span>}
                      {run.tokensUsed > 0 && <span style={{ fontSize: 10, color: t.textMuted }}>{fmtTokens(run.tokensUsed)} token</span>}
                      <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 'auto' }}>{timeAgo(run.startedAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 22px 0', flexShrink: 0, borderTop: `0.5px solid ${t.separator}` }}>
          <button onClick={() => { navigate('ai-activity'); onClose(); }} style={{ width: '100%', padding: '13px', borderRadius: 16, cursor: 'pointer', background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            Tüm AI Aktivitesini Gör →
          </button>
        </div>
      </div>
    </>
  );
  return createPortal(sheet, document.body);
}

// ─── Single agent card ─────────────────────────────────────────────────
function AgentCard({
  agentName, agentType, state, currentTask,
  completedToday, performanceScore, lastSummary, onClick,
}: {
  agentName: string; agentType: string;
  state: 'working' | 'idle' | 'blocked' | 'error' | 'completed';
  currentTask: string | null; completedToday: number;
  performanceScore: number; lastSummary: string | null;
  onClick: () => void;
}) {
  const { t } = useTheme();
  const { color, role } = getMeta(agentType);
  const isActive  = state === 'working';
  const isBlocked = state === 'blocked' || state === 'error';
  const initials  = agentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const statusColor = isActive ? color : isBlocked ? '#EF4444' : 'rgba(148,163,184,0.3)';
  const statusLabel = isActive ? 'Aktif' : isBlocked ? 'Bloke' : state === 'completed' ? 'Bitti' : 'Hazır';

  return (
    <button onClick={onClick} style={{
      flexShrink: 0, width: 158, borderRadius: 22, overflow: 'hidden',
      cursor: 'pointer', border: 'none', textAlign: 'left', position: 'relative',
      background: isActive
        ? t.isDark ? `linear-gradient(160deg,${color}16,#0D0D1A 60%)` : `linear-gradient(160deg,${color}10,#fff 60%)`
        : t.surface,
      boxShadow: isActive
        ? t.isDark ? `0 0 0 0.5px ${color}28,0 6px 28px rgba(0,0,0,0.55),0 0 40px ${color}0a` : `0 0 0 1px ${color}22,0 4px 16px rgba(0,0,0,0.08)`
        : t.isDark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 2px 12px rgba(0,0,0,0.06)',
      padding: '18px 16px 14px',
    }}>
      {isActive && <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px', background: `linear-gradient(90deg,transparent,${color}80,transparent)` }} />}

      {/* Avatar */}
      <div style={{ position: 'relative', width: 52, height: 52, marginBottom: 12 }}>
        <StatusRing color={color} active={isActive} size={52} />
        <div style={{ position: 'absolute', inset: 4, borderRadius: '50%', background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color, boxShadow: isActive ? `0 0 16px ${color}35` : 'none' }}>
          {initials}
        </div>
        {isActive && <div style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: '50%', background: color, border: `2px solid ${t.isDark ? '#0D0D1A' : '#fff'}`, boxShadow: `0 0 8px ${color}`, animation: 'liveGlow 2s infinite' }} />}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary, lineHeight: 1.2, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {agentName.replace(' Agent', '')}
      </div>
      <div style={{ fontSize: 10, color: isActive ? color : t.textMuted, fontWeight: isActive ? 600 : 400, marginBottom: 10 }}>
        {role}
      </div>
      <div style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 12, minHeight: 30 }}>
        {currentTask || lastSummary || (isActive ? 'Görev işleniyor...' : 'Görev bekliyor')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'}`, paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor, boxShadow: isActive ? `0 0 6px ${statusColor}` : 'none' }} />
          <span style={{ fontSize: 10, color: isActive ? statusColor : t.textMuted, fontWeight: isActive ? 600 : 400 }}>{statusLabel}</span>
        </div>
        {completedToday > 0 && <div style={{ fontSize: 10, color: t.textMuted }}>{completedToday} ✓</div>}
      </div>
      {performanceScore > 0 && (
        <div style={{ marginTop: 6, height: 2, borderRadius: 1, background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${performanceScore}%`, borderRadius: 1, background: color, opacity: 0.5 }} />
        </div>
      )}

      {/* Tap hint */}
      <div style={{ position: 'absolute', bottom: 10, right: 12, fontSize: 9, color: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }}>
        ↗
      </div>
    </button>
  );
}

// ─── Main component ────────────────────────────────────────────────────
interface Props {
  recentRuns: Array<{
    id: string; agentName: string; agentType: string; status: string;
    taskTitle: string; summary: string; tokensUsed: number;
    durationMs: number; startedAt: string; completedAt?: string | null;
    errorMessage?: string;
  }>;
}

export function AgentTeamBoard({ recentRuns }: Props) {
  const { t } = useTheme();
  const { navigate } = useMobileStore();
  const { officeId } = useWorkspaceStore();

  // Selected agent for bottom sheet
  const [selectedAgent, setSelectedAgent] = useState<{ name: string; type: string } | null>(null);

  const { data: rawAgents = [] } = useQuery({
    queryKey: ['agents', officeId],
    queryFn: async () => { try { return officeId ? await apiClient.getAgents(officeId) : []; } catch { return []; } },
    refetchInterval: 20_000, staleTime: 15_000,
  });

  // Build agent cards
  const agents = (() => {
    const agentsArr = rawAgents as any[];
    if (agentsArr.length > 0) {
      return agentsArr.map((agent: any) => {
        const latestRun = recentRuns.find(r =>
          r.agentType.toLowerCase() === (agent.backendAgentType ?? agent.type ?? '').toLowerCase() ||
          r.agentName.toLowerCase().includes((agent.name ?? '').toLowerCase().split(' ')[0])
        );
        const isRunning = latestRun?.status?.toLowerCase() === 'running' || agent.state === 'working';
        return {
          id: agent.id, agentName: agent.name ?? 'AI Agent',
          agentType: agent.backendAgentType ?? agent.type ?? '',
          state: (isRunning ? 'working' : agent.state ?? 'idle') as any,
          currentTask: latestRun?.taskTitle ?? null,
          completedToday: agent.completedTasks ?? 0,
          performanceScore: agent.performanceScore ?? 0,
          lastSummary: latestRun?.summary ? latestRun.summary.replace(/```json\n?/g,'').replace(/```\n?/g,'').slice(0,80) : null,
        };
      });
    }
    const seen = new Set<string>();
    return recentRuns
      .filter(r => { const k = r.agentType+r.agentName; if(seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6)
      .map((run, i) => ({
        id: run.id+i, agentName: run.agentName, agentType: run.agentType,
        state: run.status.toLowerCase() === 'running' ? 'working' as const : 'idle' as const,
        currentTask: run.taskTitle, completedToday: 0, performanceScore: 0,
        lastSummary: run.summary ? run.summary.replace(/```json\n?/g,'').replace(/```\n?/g,'').slice(0,80) : null,
      }));
  })();

  if (agents.length === 0) return null;

  const activeCount = agents.filter(a => a.state === 'working').length;

  // Get runs for selected agent
  const selectedRuns = selectedAgent
    ? recentRuns.filter((r) => {
        const firstNameWord = selectedAgent.name.trim().split(/\s+/).filter(Boolean)[0] ?? '';
        return (
          r.agentName.toLowerCase() === selectedAgent.name.toLowerCase() ||
          r.agentType.toLowerCase() === selectedAgent.type.toLowerCase() ||
          (firstNameWord.length > 0 && r.agentName.toLowerCase().includes(firstNameWord.toLowerCase()))
        );
      })
    : [];

  return (
    <>
      <div style={{ paddingTop: 32 }}>
        {/* Section header */}
        <div style={{ paddingLeft: 22, paddingRight: 22, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em' }}>AI Ekibi</span>
            {activeCount > 0 && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: 'rgba(16,185,129,0.10)', border: '0.5px solid rgba(16,185,129,0.22)' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10B981', animation: 'liveGlow 2s infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981' }}>{activeCount} aktif</span>
              </div>
            )}
          </div>
          <button onClick={() => navigate('agents')} style={{ fontSize: 12, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
            Yönet →
          </button>
        </div>

        {/* Agent cards — tap opens per-agent sheet */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingLeft: 22, paddingRight: 22, paddingBottom: 4 }}>
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agentName={agent.agentName}
              agentType={agent.agentType}
              state={agent.state}
              currentTask={agent.currentTask}
              completedToday={agent.completedToday}
              performanceScore={agent.performanceScore}
              lastSummary={agent.lastSummary}
              onClick={() => setSelectedAgent({ name: agent.agentName, type: agent.agentType })}
            />
          ))}
        </div>
      </div>

      {/* Agent detail sheet */}
      {selectedAgent && (
        <AgentSheet
          agentName={selectedAgent.name}
          agentType={selectedAgent.type}
          runs={selectedRuns}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </>
  );
}

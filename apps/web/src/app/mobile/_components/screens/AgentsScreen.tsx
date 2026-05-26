'use client';
/**
 * AGENTS SCREEN — Real stats from cross-referencing agents + operations summary.
 *
 * getAgents() → basic agent definitions (name, displayName, type, state)
 * getOperationsSummary() → run history → compute per-agent stats
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { parseAgentSummary } from '../activity-parser';
import { humanizeAgentError } from '@/lib/humanize-agent-error';
import { AssignMissionSheet } from '../AssignMissionSheet';
import type { T } from '../theme-context';

// ─── agentType number → PROFILES key ─────────────────────────────────
// Maps API agentType (int) and agent name variants to getRuntimeAgentProfile keys
const AGENT_TYPE_TO_PROFILE: Record<string, string> = {
  // By agentType number (from agents API)
  '0':  'AiCeo',
  '1':  'BlogWriter',
  '2':  'SocialMediaDesigner',
  '3':  'InstagramContentGenerator',
  '4':  'UiUxDesigner',
  '5':  'VideoEditor',
  '6':  'SeoSpecialist',
  '7':  'GoogleAdsAnalyst',
  '8':  'CustomerReviewResponder',
  '9':  'ChatbotManager',
  '10': 'AiStrategist',
  '11': 'AnalyticsAnalyst',
  '12': 'SocialMediaDesigner', // Content Strategy
  // By agent name (from agents API .name field)
  'ceo agent':                 'AiCeo',
  'ai strategist':             'AiStrategist',
  'blog writer':               'BlogWriter',
  'social media designer':     'SocialMediaDesigner',
  'instagram generator':       'InstagramContentGenerator',
  'google ads analyst':        'GoogleAdsAnalyst',
  'review responder':          'CustomerReviewResponder',
  'chatbot manager':           'ChatbotManager',
  'analytics analyst':         'AnalyticsAnalyst',
  'seo specialist':            'SeoSpecialist',
  'ui/ux designer':            'UiUxDesigner',
  'video editor':              'VideoEditor',
  'content strategy':          'SocialMediaDesigner',
  // By run agentType string (from operations summary)
  'aiceo':                     'AiCeo',
  'blogwriter':                'BlogWriter',
  'socialmediadesigner':       'SocialMediaDesigner',
  'instagramcontentgenerator': 'InstagramContentGenerator',
  'googleadsanalyst':          'GoogleAdsAnalyst',
  'customerreviewresponder':   'CustomerReviewResponder',
  'chatbotmanager':            'ChatbotManager',
  'analyticsanalyst':          'AnalyticsAnalyst',
  'aistrategist':              'AiStrategist',
};

function resolveProfileKey(agentTypeNum: string, agentName: string, runTypeStr: string): string {
  // Priority: run type string → agentType number → agent name
  if (runTypeStr) {
    const byRun = AGENT_TYPE_TO_PROFILE[runTypeStr.toLowerCase()];
    if (byRun) return byRun;
  }
  const byNum = AGENT_TYPE_TO_PROFILE[agentTypeNum];
  if (byNum) return byNum;
  const byName = AGENT_TYPE_TO_PROFILE[agentName.toLowerCase()];
  if (byName) return byName;
  return '';
}

// ─── Agent type → color + role ────────────────────────────────────────
const AGENT_META: Record<string, { role: string; color: string }> = {
  '1':  { role: 'İçerik Yazarı',   color: '#A78BFA' },  // BlogWriter
  '2':  { role: 'Tasarımcı',        color: '#F472B6' },  // SocialMediaDesigner
  '3':  { role: 'Araştırmacı',      color: '#60A5FA' },  // Researcher
  '4':  { role: 'Geliştirici',      color: '#818CF8' },  // Developer
  '5':  { role: 'Analist',          color: '#34D399' },  // Analyst
  '6':  { role: 'Yönetici',         color: '#A5B4FC' },  // Manager
  '7':  { role: 'Yorum Uzmanı',     color: '#F59E0B' },  // ReviewResponder
  '8':  { role: 'İçerik Üretici',   color: '#F472B6' },  // InstagramContentGenerator
  '9':  { role: 'Reklam Analisti',  color: '#60A5FA' },  // GoogleAdsAnalyst
  '10': { role: 'Strateji CEO',     color: '#A5B4FC' },  // AiCeo
  '11': { role: 'Veri Analisti',    color: '#34D399' },  // AnalyticsAnalyst
  '12': { role: 'Bot Yöneticisi',   color: '#818CF8' },  // ChatbotManager
};

function agentMeta(agentType: unknown) {
  return AGENT_META[String(agentType)] ?? { role: 'AI Ajan', color: '#A78BFA' };
}

// ─── Format helpers ───────────────────────────────────────────────────
function fmtDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
function fmtTokens(n: number): string {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'Az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

// ─── Agent run item ───────────────────────────────────────────────────
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
  errorMessage: string;
}

// ─── Merged agent data ────────────────────────────────────────────────
interface AgentData {
  id: string;
  name: string;              // display name e.g. "The Wordsmith"
  shortName: string;         // e.g. "Blog Writer"
  agentType: string;         // numeric type from agents API
  agentTypeString: string;   // string type from runs e.g. "BlogWriter"
  color: string;
  role: string;
  isEnabled: boolean;
  // Computed from runs
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  successRate: number;   // 0-100
  tokensTotal: number;
  avgDurationMs: number;
  lastRunAt: string | null;
  currentTask: string | null;
  recentRuns: RunItem[];
}

function buildAgentData(agents: any[], runs: RunItem[]): AgentData[] {
  return agents.map(agent => {
    const displayName = agent.displayName ?? agent.name ?? 'AI Agent';
    const shortName   = agent.name ?? '';
    const { color, role } = agentMeta(agent.agentType);

    // Match runs by displayName OR shortName
    const agentRuns = runs.filter(r =>
      r.agentName === displayName ||
      r.agentName === shortName ||
      r.agentName.toLowerCase().includes(displayName.toLowerCase().split(' ').pop() ?? '') ||
      displayName.toLowerCase().includes(r.agentName.toLowerCase().split(' ').pop() ?? '')
    );

    const completedRuns = agentRuns.filter(r => r.status.toLowerCase() === 'completed');
    const failedRuns    = agentRuns.filter(r => ['failed', 'error', 'cancelled'].includes(r.status.toLowerCase()));
    const runningRuns   = agentRuns.filter(r => r.status.toLowerCase() === 'running');

    const tokensTotal   = agentRuns.reduce((s, r) => s + (r.tokensUsed || 0), 0);
    const avgDurationMs = completedRuns.length > 0
      ? Math.round(completedRuns.reduce((s, r) => s + (r.durationMs || 0), 0) / completedRuns.length)
      : 0;

    const successRate = agentRuns.length > 0
      ? Math.round((completedRuns.length / agentRuns.length) * 100)
      : 0;

    const sorted = [...agentRuns].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    const lastRun = sorted[0];
    const currentTask = runningRuns[0]?.taskTitle ?? null;

    // Resolve profile key using all available signals
    const typeFromRun = agentRuns[0]?.agentType ?? '';
    const profileKey  = resolveProfileKey(String(agent.agentType), shortName, typeFromRun);
    return {
      id: agent.id,
      name: displayName,
      shortName,
      agentType: String(agent.agentType),
      agentTypeString: profileKey || typeFromRun,
      color, role,
      isEnabled: agent.isEnabled ?? true,
      totalRuns: agentRuns.length,
      completedRuns: completedRuns.length,
      failedRuns: failedRuns.length,
      runningRuns: runningRuns.length,
      successRate,
      tokensTotal,
      avgDurationMs,
      lastRunAt: lastRun?.startedAt ?? null,
      currentTask,
      recentRuns: sorted.slice(0, 10),
    };
  });
}

// ─── Stat chip ────────────────────────────────────────────────────────
function Stat({ label, value, color, t }: { label: string; value: string | number; color?: string; t: T }) {
  return (
    <div style={{ flex: 1, padding: '12px 10px', background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? t.textPrimary, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 10, color: t.labelColor, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ─── Agent detail panel (expandable) ─────────────────────────────────
function AgentPanel({ agent, t, onAssign }: { agent: AgentData; t: T; onAssign: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const isActive = agent.runningRuns > 0;

  return (
    <div style={{
      borderRadius: 20, overflow: 'hidden',
      background: t.isDark
        ? isActive ? `linear-gradient(145deg, ${agent.color}10, rgba(255,255,255,0.025))` : 'rgba(255,255,255,0.03)'
        : '#fff',
      boxShadow: t.isDark
        ? isActive ? `0 0 0 0.5px ${agent.color}25, 0 4px 20px rgba(0,0,0,0.45)` : '0 2px 12px rgba(0,0,0,0.35)'
        : '0 1px 8px rgba(0,0,0,0.07)',
      opacity: agent.isEnabled ? 1 : 0.5,
      marginBottom: 12,
    }}>
      {/* Header row */}
      <button onClick={() => setExpanded(!expanded)} style={{ width: '100%', padding: '16px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Avatar */}
        <div style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, background: `${agent.color}15`, border: `1px solid ${agent.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: agent.color, position: 'relative', boxShadow: isActive ? `0 0 16px ${agent.color}35` : 'none' }}>
          {initials}
          {isActive && (
            <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: agent.color, border: `2px solid ${t.isDark ? '#0D0D1A' : '#fff'}`, animation: 'liveGlow 2s infinite' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em', marginBottom: 2 }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: isActive ? agent.color : t.textTertiary, fontWeight: isActive ? 600 : 400 }}>
            {agent.role}
            {isActive && <span style={{ marginLeft: 6 }}>● Aktif</span>}
          </div>
          {agent.currentTask && (
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.currentTask}
            </div>
          )}
        </div>

        {/* Success rate ring */}
        <div style={{ flexShrink: 0, textAlign: 'center' }}>
          {agent.totalRuns > 0 ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: agent.successRate >= 70 ? t.success : agent.successRate >= 40 ? t.warning : t.danger, fontVariantNumeric: 'tabular-nums' }}>
                {agent.successRate}%
              </div>
              <div style={{ fontSize: 9, color: t.labelColor }}>başarı</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: t.textMuted }}>—</div>
              <div style={{ fontSize: 9, color: t.labelColor }}>henüz yok</div>
            </>
          )}
        </div>

        {/* Expand chevron */}
        <div style={{ color: t.textMuted, fontSize: 12, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 200ms', flexShrink: 0 }}>⌄</div>
      </button>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, padding: '0 18px 14px' }}>
        <Stat t={t} label="Toplam"       value={agent.totalRuns}                      color={t.accent} />
        <Stat t={t} label="Tamamlandı"   value={agent.completedRuns}                  color={t.success} />
        <Stat t={t} label="Hatalı"       value={agent.failedRuns}                     color={agent.failedRuns > 0 ? t.danger : t.textMuted} />
        <Stat t={t} label="Token"        value={fmtTokens(agent.tokensTotal)}          color={t.info} />
      </div>

      {/* Second stats row */}
      {agent.totalRuns > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '0 18px 14px', borderTop: `0.5px solid ${t.separator}`, paddingTop: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 2 }}>Ort. Süre</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{fmtDuration(agent.avgDurationMs)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 2 }}>Son Çalışma</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{timeAgo(agent.lastRunAt)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 2 }}>Durum</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: agent.isEnabled ? t.success : t.textMuted }}>
              {agent.isEnabled ? 'Aktif' : 'Pasif'}
            </div>
          </div>
        </div>
      )}

      {/* Expanded: recent runs */}
      {expanded && agent.recentRuns.length > 0 && (
        <div style={{ borderTop: `0.5px solid ${t.separator}` }}>
          <div style={{ padding: '10px 18px 6px', fontSize: 10, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Son {agent.recentRuns.length} Çalışma
          </div>
          {agent.recentRuns.map((run, i) => {
            const isRunning = run.status.toLowerCase() === 'running';
            const isFailed  = ['failed','error','cancelled'].includes(run.status.toLowerCase());
            const dotColor  = isRunning ? agent.color : isFailed ? t.danger : t.info;
            const parsed    = parseAgentSummary(run.agentType, run.summary);
            const preview   = parsed.previewTitle ?? (run.summary ? run.summary.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim().slice(0, 80) : null);

            return (
              <div key={run.id} style={{ padding: '12px 18px', borderTop: i > 0 ? `0.5px solid ${t.separator}` : 'none', display: 'flex', gap: 10 }}>
                <div style={{ paddingTop: 3, flexShrink: 0 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, boxShadow: isRunning ? `0 0 6px ${dotColor}` : 'none', animation: isRunning ? 'liveGlow 2s infinite' : 'none' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary, marginBottom: 3, lineHeight: 1.3 }}>
                    {run.taskTitle || 'Görev'}
                  </div>
                  {preview && (
                    <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {preview}
                    </div>
                  )}
                  {run.errorMessage && (() => {
                    const h = humanizeAgentError(run.errorMessage);
                    return (
                      <div style={{ fontSize: 11, color: t.danger, padding: '6px 10px', borderRadius: 8, background: t.dangerDim, marginBottom: 4, lineHeight: 1.45 }}>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>{h?.title ?? 'Hata'}</div>
                        <div style={{ color: t.textSecondary }}>{h?.summary ?? run.errorMessage}</div>
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: `${dotColor}12`, color: dotColor, fontWeight: 600 }}>
                      {isRunning ? '● Aktif' : isFailed ? 'Hata' : 'Bitti'}
                    </span>
                    {run.durationMs > 0 && <span style={{ fontSize: 10, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>{fmtDuration(run.durationMs)}</span>}
                    {run.tokensUsed > 0 && <span style={{ fontSize: 10, color: t.textMuted }}>{fmtTokens(run.tokensUsed)} token</span>}
                    <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 'auto' }}>{timeAgo(run.startedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expanded && agent.totalRuns === 0 && (
        <div style={{ padding: '14px 18px', borderTop: `0.5px solid ${t.separator}`, fontSize: 13, color: t.textMuted, textAlign: 'center' }}>
          Bu ajan henüz çalışmadı
        </div>
      )}

      {/* ─── ASSIGN MISSION BUTTON (always visible when expanded) ─── */}
      {expanded && agent.isEnabled && (
        <div style={{ padding: '10px 18px', borderTop: `0.5px solid ${t.separator}` }}>
          <button
            onClick={(e) => { e.stopPropagation(); onAssign(); }}
            style={{
              width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer',
              background: `linear-gradient(135deg, ${agent.color}cc, ${agent.color}99)`,
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 3px 14px ${agent.color}40`,
              letterSpacing: '-0.01em',
            }}
          >
            ⚡ Görev Ata
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────
export function AgentsScreen() {
  const { t } = useTheme();
  const { officeId } = useWorkspaceStore();
  const queryClient = useQueryClient();
  const [assignTarget, setAssignTarget] = useState<AgentData | null>(null);

  const { data: rawAgents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents', officeId],
    queryFn: async () => { try { return officeId ? await apiClient.getAgents(officeId) : []; } catch { return []; } },
    refetchInterval: 20_000, staleTime: 15_000,
  });

  const { data: opsSummary, isLoading: opsLoading } = useQuery({
    queryKey: ['operations-summary'],
    queryFn: () => apiClient.getOperationsSummary(),
    refetchInterval: 15_000, staleTime: 10_000,
  });

  const reconcileMutation = useMutation({
    mutationFn: () => apiClient.reconcileStaleAgentRuns(10),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operations-summary'] }),
  });

  const isLoading = agentsLoading || opsLoading;
  const runs: RunItem[] = (opsSummary?.recentAgentRuns ?? []) as RunItem[];
  const agents = buildAgentData(rawAgents as any[], runs);

  const totalActive   = agents.filter(a => a.runningRuns > 0).length;
  const totalFailed   = agents.reduce((s, a) => s + a.failedRuns, 0);
  const totalCompleted = agents.reduce((s, a) => s + a.completedRuns, 0);
  const totalTokens   = agents.reduce((s, a) => s + a.tokensTotal, 0);

  return (
    <>
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 96, transition: 'background 300ms' }}>

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 22px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
          AI Ekibi
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 16 }}>Agents</h1>

        {/* Summary stats — 2×2 grid for readable mobile layout */}
        {!isLoading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Aktif Ajan',      value: totalActive,              color: t.live    },
              { label: 'Tamamlanan',      value: totalCompleted,           color: t.success },
              { label: 'Hatalı',          value: totalFailed,              color: totalFailed > 0 ? t.danger : t.textMuted },
              { label: 'Token Kullanımı', value: fmtTokens(totalTokens),   color: t.accent  },
            ].map(s => (
              <div key={s.label} style={{ ...t.surfaceCard, padding: '14px 14px', textAlign: 'left' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1, marginBottom: 5, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: t.labelColor, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {totalFailed > 0 && (
          <button onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isPending} style={{ marginTop: 12, width: '100%', padding: '10px', borderRadius: 12, cursor: 'pointer', background: t.warningDim, border: `0.5px solid ${t.warning}25`, color: t.warning, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            ↻ {reconcileMutation.isPending ? 'Temizleniyor...' : `${totalFailed} stuck görevi temizle`}
          </button>
        )}
      </div>

      {/* Agent list */}
      <div style={{ padding: '16px 16px 0' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 140, borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', animation: 'shimmer 1.4s ease-in-out infinite' }} />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: t.textMuted, fontSize: 13 }}>
            Ajan bulunamadı
          </div>
        ) : (
          agents.map(agent => <AgentPanel key={agent.id} agent={agent} t={t} onAssign={() => setAssignTarget(agent)} />)
        )}
      </div>
    </div>
    {assignTarget && (
      <AssignMissionSheet
        agentId={assignTarget.id}
        agentName={assignTarget.name}
        agentTypeString={assignTarget.agentTypeString}
        agentColor={assignTarget.color}
        onClose={() => setAssignTarget(null)}
      />
    )}
    </>
  );
}

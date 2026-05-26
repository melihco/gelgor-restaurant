'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, ChevronRight, Square, Zap } from 'lucide-react';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { useInteractionStore } from '@/stores/interaction-store';
import { useOfficeStore } from '@/stores/office-store';
import { getRuntimeAgentProfile } from '@/lib/agent-runtime';
import { computeAgentActivityStats, getCrewLineForAgentType, type DashboardAgent } from '@/lib/dashboard-mappers';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { DEFAULT_OFFICE_ID } from '@/lib/runtime-config';

type Filter = 'all' | 'working' | 'idle' | 'risk';

const FILTER_OPTIONS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'working', label: 'Live' },
  { id: 'idle', label: 'Idle' },
  { id: 'risk', label: 'Risk' },
];

const AGENT_COLORS: Record<string, string> = {
  manager: '#818cf8', writer: '#a78bfa', designer: '#f472b6',
  researcher: '#60a5fa', analyst: '#34d399', developer: '#818cf8',
};

const CREW_LABELS: Record<string, string> = {
  review_agent: 'Reputation',
  content_agent: 'Content',
  ads_agent: 'Growth & Ads',
  analytics_agent: 'Analytics',
};

const STATE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  working:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  label: 'Live' },
  idle:      { color: '#64748b', bg: 'rgba(100,116,139,0.1)', label: 'Idle' },
  completed: { color: '#64748b', bg: 'rgba(100,116,139,0.1)', label: 'Done' },
  blocked:   { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'Blocked' },
  error:     { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  label: 'Error' },
};

function LivePulse({ color = '#22c55e' }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function AgentCard({
  agent, task, onOpen, onAssign, onCancelStuck, cancelPending,
}: {
  agent: DashboardAgent;
  task?: { title?: string };
  onOpen: () => void;
  onAssign: () => void;
  onCancelStuck?: () => void;
  cancelPending?: boolean;
}) {
  const color = AGENT_COLORS[agent.type] ?? '#818cf8';
  const state = STATE_CONFIG[agent.state] ?? STATE_CONFIG['idle']!;
  const profile = getRuntimeAgentProfile(agent.backendAgentType);
  const isWorking = agent.state === 'working';
  const isRisk = agent.state === 'blocked' || agent.state === 'error';

  return (
    <div
      className="group relative overflow-hidden rounded-2xl transition-all duration-200 hover:scale-[1.01]"
      style={{
        background: 'rgba(13,14,22,0.8)',
        border: `1px solid ${isRisk ? 'rgba(239,68,68,0.2)' : isWorking ? `${color}22` : 'rgba(255,255,255,0.06)'}`,
        boxShadow: isWorking ? `0 0 30px ${color}10` : 'none',
      }}
    >
      {isWorking && (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <div className="h-full w-full" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)`, animation: 'agentWorkingBar 2s linear infinite' }} />
        </div>
      )}
      <div className="p-5">
        <div className="flex items-start gap-3.5">
          <div className="relative shrink-0">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[13px] font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${color}dd, ${color}88)`, boxShadow: isWorking ? `0 0 20px ${color}50` : 'none' }}
            >
              {agent.name[0]}
            </div>
            {isWorking && <span className="absolute -bottom-0.5 -right-0.5"><LivePulse color={color} /></span>}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[14px] font-semibold text-white/90">{agent.name}</p>
              <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: state.bg, color: state.color, border: `1px solid ${state.color}30` }}>
                {state.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-600">
              {agent.roleLabel} · {CREW_LABELS[getCrewLineForAgentType(agent.backendAgentType)] ?? 'Core'}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700">{isWorking ? 'Currently executing' : 'Last task'}</p>
          <p className="mt-1 text-[12px] text-slate-400 line-clamp-2">{task?.title ?? profile.whatIDo}</p>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button" onClick={onOpen}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold text-white/80 transition hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <ChevronRight className="h-3.5 w-3.5" /> View
          </button>
          <button
            type="button" onClick={onAssign}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition hover:opacity-90"
            style={{ background: `${color}18`, border: `1px solid ${color}30`, color }}
          >
            <Zap className="h-3.5 w-3.5" /> Assign
          </button>
          {onCancelStuck && (
            <button
              type="button" onClick={onCancelStuck} disabled={cancelPending}
              className="flex items-center gap-1 rounded-xl px-2 py-2 text-[11px] text-red-500 transition hover:bg-red-500/10 disabled:opacity-40"
              title="Cancel stuck execution"
            >
              <Square className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useDashboardSnapshot();
  const { openAssignModal } = useInteractionStore();
  const { selectAgent, openPanel } = useOfficeStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [cancelStuckFor, setCancelStuckFor] = useState<string | null>(null);

  async function handleCancelStuck(apiAgentId: string) {
    if (!window.confirm('Cancel this stuck execution? The agent will return to idle.')) return;
    setCancelStuckFor(apiAgentId);
    try {
      const result = await apiClient.cancelStuckAgentExecution(apiAgentId, { minAgeMinutes: 0 });
      window.alert(result.message);
      await queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot', DEFAULT_OFFICE_ID] });
    } catch (error) {
      const { detail } = toUserFriendlyApiError(error);
      window.alert(detail);
    } finally {
      setCancelStuckFor(null);
    }
  }

  const agents = data?.agents ?? [];
  const tasks = data?.tasks ?? [];
  const workingCount = agents.filter((a) => a.state === 'working').length;
  const riskCount = agents.filter((a) => a.state === 'blocked' || a.state === 'error').length;

  const filteredAgents = useMemo(() => {
    switch (filter) {
      case 'working': return agents.filter((a) => a.state === 'working');
      case 'idle': return agents.filter((a) => a.state === 'idle' || a.state === 'completed');
      case 'risk': return agents.filter((a) => a.state === 'blocked' || a.state === 'error');
      default: return agents;
    }
  }, [agents, filter]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#07080f' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-violet-500/20 border-t-violet-500/70" />
          <p className="text-[13px] text-slate-600">Loading agent swarm…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
              <Bot className="h-3.5 w-3.5 text-violet-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-400">Digital Workforce</span>
            </div>
            <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
              AI <span className="font-semibold" style={{ color: '#a78bfa' }}>Agents Office</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">Autonomous digital workers with live status, task history and real-time execution.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Total agents', value: agents.length, color: '#a78bfa' },
              { label: 'Live now', value: workingCount, color: '#22c55e' },
              { label: 'Risk', value: riskCount, color: riskCount > 0 ? '#ef4444' : '#64748b' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl px-4 py-3" style={{ background: 'rgba(13,14,22,0.8)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-3xl font-light tracking-[-0.04em] metric-value" style={{ color: s.color }}>{s.value}</p>
                <p className="mt-0.5 text-[10px] text-slate-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2.5">
          {FILTER_OPTIONS.map((f) => {
            const active = filter === f.id;
            return (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)}
                className="rounded-xl px-4 py-2 text-[12px] font-semibold transition-all"
                style={{
                  background: active ? 'rgba(167,139,250,0.12)' : 'rgba(255,255,255,0.04)',
                  border: active ? '1px solid rgba(167,139,250,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  color: active ? '#a78bfa' : '#64748b',
                }}
              >
                {f.label}
              </button>
            );
          })}
          <div className="ml-auto text-[11px] text-slate-700">{filteredAgents.length} agents</div>
        </div>

        {/* Grid */}
        {filteredAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl py-16" style={{ background: 'rgba(13,14,22,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Bot className="mb-3 h-10 w-10 text-slate-800" />
            <p className="text-[14px] font-medium text-slate-600">No agents match this filter</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredAgents.map((agent) => {
              const task = tasks.find((t) => t.id === agent.currentTaskId) ?? tasks.find((t) => t.assignedAgent === agent.id && t.status === 'in_progress');
              return (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  task={task ?? undefined}
                  onOpen={() => { selectAgent(agent.id, agent.zoneId); openPanel('agent'); }}
                  onAssign={() => openAssignModal(agent.apiId)}
                  onCancelStuck={agent.state === 'working' ? () => void handleCancelStuck(agent.apiId) : undefined}
                  cancelPending={cancelStuckFor === agent.apiId}
                />
              );
            })}
          </div>
        )}

        {/* Crew distribution */}
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">Crew Distribution</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(CREW_LABELS).map(([key, label]) => {
              const crewAgents = agents.filter((a) => getCrewLineForAgentType(a.backendAgentType) === key);
              const live = crewAgents.filter((a) => a.state === 'working').length;
              return (
                <div key={key} className="rounded-xl p-4" style={{ background: 'rgba(13,14,22,0.7)', border: live > 0 ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-semibold text-white/80">{label}</p>
                    {live > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        </span>
                        <span className="text-[10px] text-emerald-500">live</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-700">{crewAgents.length} agents · {live} active</p>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}

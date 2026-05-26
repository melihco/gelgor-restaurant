'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2,
  FileText, Radio, ShieldCheck, Sparkles, Zap, ChevronRight, Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { useNavigationStore } from '@/stores/navigation-store';
import { useInteractionStore } from '@/stores/interaction-store';
import IntelligencePanel from '@/components/dashboard/IntelligencePanel';
import { apiClient } from '@/lib/api-client';
import type { SuggestedActionDto } from '@/types';

interface ControlData {
  actions: SuggestedActionDto[];
  ads: unknown;
  analytics: unknown;
}

function useControlData() {
  return useQuery<ControlData>({
    queryKey: ['ai-control-center'],
    queryFn: async () => {
      const [a, b, c] = await Promise.allSettled([
        apiClient.getActions(),
        apiClient.getAdsCampaigns('LAST_30_DAYS'),
        apiClient.getAnalyticsDashboard('30daysAgo'),
      ]);
      return {
        actions: a.status === 'fulfilled' ? a.value : [],
        ads: b.status === 'fulfilled' ? b.value : null,
        analytics: c.status === 'fulfilled' ? c.value : null,
      };
    },
    staleTime: 45_000,
    refetchInterval: 90_000,
  });
}

/* ─── Primitives ───────────────────────────────────────────────────────── */

function LivePulse({ color = '#22c55e' }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function OsCard({ children, className, glow, onClick }: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn('relative overflow-hidden rounded-2xl transition-all duration-200', onClick && 'cursor-pointer hover:scale-[1.01]', className)}
      style={{
        background: 'rgba(13,14,22,0.7)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: glow ? `0 0 40px ${glow}18, inset 0 1px 0 rgba(255,255,255,0.05)` : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {children}
    </div>
  );
}

function MetricTile({ label, value, sub, icon: Icon, color, pulse, onClick }: {
  label: string; value: string | number; sub?: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>; color: string; pulse?: boolean; onClick?: () => void;
}) {
  return (
    <OsCard onClick={onClick} className="p-5" glow={color}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-4xl font-light tracking-[-0.04em] text-white metric-value" style={{ textShadow: `0 0 20px ${color}40` }}>
            {value}
          </p>
          {sub && <p className="mt-1 text-[11px] text-slate-600">{sub}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
          <Icon className="h-4 w-4" color={color} />
        </div>
      </div>
      {pulse && (
        <div className="mt-3 flex items-center gap-1.5">
          <LivePulse color={color} />
          <span className="text-[10px] text-slate-600">Live</span>
        </div>
      )}
    </OsCard>
  );
}

function AgentStatusRow({ name, role, status, task, color }: {
  name: string; role: string; status: string; task?: string; color: string;
}) {
  const isWorking = status === 'working';
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.03]">
      <div className="relative shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${color}cc, ${color}77)`, boxShadow: isWorking ? `0 0 12px ${color}44` : 'none' }}
        >
          {name[0]}
        </div>
        {isWorking && <span className="absolute -bottom-0.5 -right-0.5"><LivePulse color="#22c55e" /></span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-white/90">{name}</p>
        <p className="truncate text-[10px] text-slate-600">{isWorking && task ? task : role}</p>
      </div>
      <span
        className="shrink-0 rounded-md px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
        style={{
          background: isWorking ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)',
          color: isWorking ? '#22c55e' : '#64748b',
          border: `1px solid ${isWorking ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
        }}
      >
        {status}
      </span>
    </div>
  );
}

function ApprovalRow({ title, provider, type, onClick }: {
  title: string; provider: string; type: string; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.04]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <Zap className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-white/90">{title}</p>
        <p className="text-[10px] text-slate-600">{provider} · {type}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-700" />
    </button>
  );
}

function OutputRow({ title, kind, agent }: { title: string; kind: string; agent: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.03]">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <FileText className="h-3.5 w-3.5 text-indigo-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-white/90">{title}</p>
        <p className="text-[10px] text-slate-600">{agent} · {kind}</p>
      </div>
      <span className="shrink-0 rounded-md px-2 py-0.5 text-[9px] font-semibold text-indigo-400" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.18)' }}>
        new
      </span>
    </div>
  );
}

/* ─── Panel Header ─────────────────────────────────────────────────────── */

function PanelHeader({ icon: Icon, iconColor, title, sub, action, actionLabel, onAction }: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>; iconColor: string; title: string; sub?: string;
  action?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}28` }}>
          <Icon className="h-4 w-4" style={{ color: iconColor }} />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white/90">{title}</p>
          {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
        </div>
      </div>
      {onAction && (
        <button type="button" onClick={onAction} className="flex items-center gap-1 text-[11px] font-semibold transition" style={{ color: iconColor }}>
          {actionLabel ?? 'View all'} <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/* ─── Color map ─────────────────────────────────────────────────────────── */

const AGENT_COLORS: Record<string, string> = {
  manager: '#818cf8', writer: '#a78bfa', designer: '#f472b6',
  researcher: '#60a5fa', analyst: '#34d399', developer: '#818cf8',
};

/* ─── Main ──────────────────────────────────────────────────────────────── */

export default function AIDashboard() {
  const { data: snapshot, isLoading } = useDashboardSnapshot();
  const { data: control } = useControlData();
  const navigate = useNavigationStore((s) => s.navigate);
  const openAssignModal = useInteractionStore((s) => s.openAssignModal);

  const agents = snapshot?.agents ?? [];
  const tasks = snapshot?.tasks ?? [];
  const artifacts = snapshot?.artifacts ?? [];
  const actions = control?.actions ?? [];

  const workingAgents = agents.filter((a) => a.state === 'working');
  const blockedAgents = agents.filter((a) => a.state === 'blocked' || a.state === 'error');
  const pendingApprovals = actions.filter((a) => a.status === 'Pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed' || t.status === 'review').length;
  const pendingTotal = pendingApprovals.length + (snapshot?.pendingArtifacts.length ?? 0);
  const healthScore = Math.max(28, Math.min(98, 60 + agents.length * 2 - blockedAgents.length * 10 + workingAgents.length * 3 - pendingApprovals.length * 2));

  const briefAgent = agents.find((a) => a.backendAgentType === 'AiCeo') ?? agents[0];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#07080f' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}>
            <Sparkles className="h-6 w-6 text-white animate-pulse" />
          </div>
          <p className="text-[13px] text-slate-600">Loading executive dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: 'linear-gradient(180deg, #07080f 0%, #08090e 100%)' }}>
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(circle, #4f46e5, transparent)' }} />
        <div className="absolute top-20 right-1/4 h-80 w-80 rounded-full opacity-10 blur-3xl" style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
      </div>

      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

        {/* ── Hero Banner ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-6 sm:px-8 sm:py-7"
          style={{
            background: 'linear-gradient(135deg, rgba(79,70,229,0.12) 0%, rgba(124,58,237,0.08) 50%, rgba(13,14,22,0.8) 100%)',
            border: '1px solid rgba(99,102,241,0.2)',
            boxShadow: '0 0 60px rgba(79,70,229,0.08)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              maskImage: 'radial-gradient(ellipse at 50% 0%, black 0%, transparent 70%)',
            }}
          />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <LivePulse color="#818cf8" />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-300">AI Agency Operating System</span>
              </div>
              <h1 className="text-3xl font-light tracking-[-0.035em] text-white sm:text-4xl">
                Your autonomous agency is{' '}
                <span className="text-gradient-electric font-semibold">online.</span>
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-500">
                Agents are executing, campaigns are running, and creative production is in progress — all without manual intervention.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => briefAgent && openAssignModal(briefAgent.apiId)}
                disabled={!briefAgent}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}
              >
                <Zap className="h-4 w-4" /> Launch Brief
              </button>
              <button
                type="button"
                onClick={() => navigate('agents')}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-300 transition hover:text-white"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Eye className="h-4 w-4" /> View Agents
              </button>
            </div>
          </div>
        </div>

        {/* ── CEO Intelligence Panel ──────────────────────────────────── */}
        <IntelligencePanel />

        {/* ── Metrics ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="Active Agents" value={workingAgents.length} sub={`${agents.length} total deployed`} icon={Radio} color="#22c55e" pulse={workingAgents.length > 0} onClick={() => navigate('agents')} />
          <MetricTile label="Pending Approvals" value={pendingTotal} sub="Awaiting review" icon={Zap} color="#f59e0b" onClick={() => navigate('approvals')} />
          <MetricTile label="Tasks Completed" value={completedTasks} sub={`${artifacts.length} artifacts produced`} icon={CheckCircle2} color="#818cf8" onClick={() => navigate('outputs')} />
          <MetricTile label="System Health" value={`${healthScore}%`} sub={blockedAgents.length > 0 ? `${blockedAgents.length} agents need attention` : 'All systems nominal'} icon={ShieldCheck} color={healthScore >= 70 ? '#22c55e' : '#f59e0b'} />
        </div>

        {/* ── Main Grid ────────────────────────────────────────────────── */}
        <div className="grid gap-5 xl:grid-cols-[1fr_380px]">

          {/* LEFT */}
          <div className="space-y-5 min-w-0">

            {/* Agent Swarm */}
            <OsCard>
              <PanelHeader icon={Bot} iconColor="#a78bfa" title="Agent Swarm" sub="Real-time workforce status" actionLabel="View all" onAction={() => navigate('agents')} />
              <div className="px-3 py-3">
                {agents.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-slate-700">No agents deployed yet.</p>
                ) : (
                  <div className="space-y-0.5">
                    {agents.slice(0, 6).map((agent) => {
                      const color = AGENT_COLORS[agent.type] ?? '#818cf8';
                      const task = tasks.find((t) => t.id === agent.currentTaskId);
                      return <AgentStatusRow key={agent.id} name={agent.name} role={agent.roleLabel} status={agent.state} task={task?.title} color={color} />;
                    })}
                    {agents.length > 6 && (
                      <button type="button" onClick={() => navigate('agents')} className="w-full rounded-xl px-3 py-2 text-center text-[11px] text-slate-600 transition hover:text-slate-400">
                        +{agents.length - 6} more agents →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </OsCard>

            {/* Health + Stats */}
            <div className="grid gap-5 sm:grid-cols-2">
              <OsCard className="p-5" glow={healthScore >= 70 ? '#22c55e' : '#f59e0b'}>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">System Health</p>
                <div className="mt-4 flex items-end gap-4">
                  <div>
                    <p className="text-5xl font-light tracking-[-0.04em] text-white metric-value" style={{ textShadow: `0 0 30px ${healthScore >= 70 ? '#22c55e' : '#f59e0b'}40` }}>
                      {healthScore}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-600">/ 100</p>
                  </div>
                  <div className="flex-1 pb-1 space-y-1.5">
                    {[
                      { label: 'Agents', val: agents.length, color: '#818cf8' },
                      { label: 'Blocked', val: blockedAgents.length, color: blockedAgents.length > 0 ? '#ef4444' : '#22c55e' },
                      { label: 'Pending', val: pendingApprovals.length, color: pendingApprovals.length > 0 ? '#f59e0b' : '#22c55e' },
                    ].map((s) => (
                      <div key={s.label} className="flex justify-between text-[10px] text-slate-700">
                        <span>{s.label}</span>
                        <span style={{ color: s.color }}>{s.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${healthScore}%`, background: healthScore >= 70 ? 'linear-gradient(90deg, #22c55e, #34d399)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
                </div>
              </OsCard>

              <OsCard className="p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">Operations</p>
                <div className="mt-4 space-y-3">
                  {[
                    { label: 'Active workflows', value: workingAgents.length, color: '#22c55e' },
                    { label: 'In queue', value: tasks.filter((t) => t.status === 'pending').length, color: '#818cf8' },
                    { label: 'Completed', value: completedTasks, color: '#60a5fa' },
                    { label: 'AI outputs', value: artifacts.length, color: '#a78bfa' },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between">
                      <span className="text-[12px] text-slate-500">{stat.label}</span>
                      <span className="text-[14px] font-semibold metric-value" style={{ color: stat.color }}>{stat.value}</span>
                    </div>
                  ))}
                </div>
              </OsCard>
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-5 min-w-0">

            {/* Approvals */}
            <OsCard>
              <PanelHeader icon={Zap} iconColor="#f59e0b" title="Approval Queue" sub={pendingTotal > 0 ? `${pendingTotal} needs action` : 'All clear'} actionLabel="Review" onAction={() => navigate('approvals')} />
              <div className="px-3 py-3">
                {pendingTotal === 0 ? (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-700" />
                    <p className="text-[12px] text-slate-700">No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {pendingApprovals.slice(0, 4).map((action) => (
                      <ApprovalRow key={action.id} title={action.artifactTitle ?? action.actionType} provider={action.provider ?? '—'} type={action.actionType} onClick={() => navigate('approvals')} />
                    ))}
                    {pendingApprovals.length > 4 && (
                      <button type="button" onClick={() => navigate('approvals')} className="w-full rounded-xl px-3 py-2 text-center text-[11px] text-slate-600 transition hover:text-slate-400">
                        +{pendingApprovals.length - 4} more →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </OsCard>

            {/* Recent Outputs */}
            <OsCard>
              <PanelHeader icon={FileText} iconColor="#818cf8" title="Recent Artifacts" sub={`${artifacts.length} total produced`} onAction={() => navigate('outputs')} />
              <div className="px-3 py-3">
                {artifacts.length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-slate-700">No artifacts yet.</p>
                ) : (
                  <div className="space-y-0.5">
                    {artifacts.slice(0, 5).map((artifact) => {
                      const task = tasks.find((t) => t.id === artifact.taskId);
                      const agent = task ? agents.find((a) => a.id === task.assignedAgent) : undefined;
                      return <OutputRow key={artifact.id} title={artifact.title ?? 'Untitled artifact'} kind={artifact.artifactType ?? artifact.type ?? 'artifact'} agent={agent?.name ?? 'AI Agent'} />;
                    })}
                  </div>
                )}
              </div>
            </OsCard>

            {/* Mission Status */}
            <OsCard className="p-5" glow="#4f46e5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Mission Status</p>
              <div className="mt-3 space-y-2.5">
                {[
                  {
                    text: workingAgents.length > 0 ? `${workingAgents.length} agent${workingAgents.length > 1 ? 's are' : ' is'} actively executing` : 'No agents executing — queue is calm',
                    ok: workingAgents.length > 0,
                  },
                  {
                    text: pendingTotal > 0 ? `${pendingTotal} item${pendingTotal > 1 ? 's' : ''} need your approval` : 'No approvals blocking the system',
                    ok: pendingTotal === 0,
                  },
                  {
                    text: blockedAgents.length > 0 ? `${blockedAgents.length} agent${blockedAgents.length > 1 ? 's' : ''} in error — review needed` : 'All agents healthy',
                    ok: blockedAgents.length === 0,
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: item.ok ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)' }}>
                      {item.ok ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> : <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />}
                    </div>
                    <p className="text-[12px] leading-5 text-slate-500">{item.text}</p>
                  </div>
                ))}
              </div>
            </OsCard>
          </div>
        </div>

      </div>
    </div>
  );
}

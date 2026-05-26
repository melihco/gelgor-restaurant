'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
  Clock, RefreshCw, ServerCog, Terminal, Wifi, WifiOff, Zap, Bot,
  CircleDot, ArrowRight, RotateCcw,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/tailadmin/components/application/PageElements';
import type { OperationsSummary } from '@/types';
import { AgentRunDetailModal, ProviderJobDetailModal } from '@/components/pages/executions/ExecutionDetailModals';

type ExecutionJob = OperationsSummary['recentExecutionJobs'][number];
type AgentRun = OperationsSummary['recentAgentRuns'][number];

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const ACTION_LABELS: Record<string, string> = {
  log_analytics_report: 'Analytics Report Log',
  create_instagram_content_plan: 'Instagram Content Plan',
  schedule_instagram_posts: 'Schedule Instagram Posts',
  apply_budget_optimization: 'Budget Optimization',
  create_ad_creatives: 'Create Ad Creatives',
  log_review_analysis: 'Review Analysis Log',
  reply_to_google_review: 'Google Review Reply',
};

function fmt(ms: number) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function fmtTime(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtTimeShort(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function friendlyAction(raw: string) { return ACTION_LABELS[raw] ?? raw.replace(/_/g, ' '); }

function friendlyProvider(raw: string) {
  const m: Record<string, string> = {
    GoogleAds: 'Google Ads', google_ads: 'Google Ads',
    Instagram: 'Instagram', instagram: 'Instagram',
    GoogleBusiness: 'Google Business', google_business: 'Google Business',
    GoogleAnalytics: 'Analytics', google_analytics: 'Analytics',
  };
  return m[raw] ?? raw.replace(/_/g, ' ');
}

function isRealJob(job: ExecutionJob) {
  const m = (job.mode || '').toLowerCase();
  return !m.includes('mock') && !m.includes('dry');
}

/* Status → visual config */
type StatusCfg = { color: string; bg: string; border: string; label: string; pulse?: boolean };

function jobStatusCfg(status: string, success?: boolean): StatusCfg {
  if (success === false || status === 'Failed')
    return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.25)', label: 'Failed' };
  if (status === 'Completed' || status === 'Executed')
    return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', label: 'Done' };
  if (status === 'Running' || status === 'InProgress')
    return { color: '#22d3ee', bg: 'rgba(34,211,238,0.1)', border: 'rgba(34,211,238,0.25)', label: 'Live', pulse: true };
  if (status === 'Retrying' || status === 'Queued')
    return { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'Queued' };
  if (status === 'Cancelled')
    return { color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', label: 'Cancelled' };
  return { color: '#64748b', bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.15)', label: status };
}

function agentStatusCfg(status: string): StatusCfg {
  return jobStatusCfg(status, status !== 'Failed' ? undefined : false);
}

function modeConfig(mode?: string | null): { label: string; color: string; bg: string } {
  const m = (mode || '').toLowerCase();
  if (m.includes('live')) return { label: 'LIVE', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' };
  if (m.includes('dry')) return { label: 'DRY', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' };
  if (m.includes('mock')) return { label: 'MOCK', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' };
  return { label: '—', color: '#64748b', bg: 'rgba(100,116,139,0.08)' };
}

/* ─── Shared primitives ─────────────────────────────────────────────────── */

function LiveDot({ color = '#22c55e' }: { color?: string }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

function StatusBadge({ cfg }: { cfg: StatusCfg }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
    >
      {cfg.pulse && <LiveDot color={cfg.color} />}
      {cfg.label}
    </span>
  );
}

/* ─── Integration Job Row ───────────────────────────────────────────────── */

function JobRow({ job, onOpen }: { job: ExecutionJob; onOpen: () => void }) {
  const cfg = jobStatusCfg(job.status, job.success);
  const mode = modeConfig(job.mode);
  const isLive = cfg.pulse;
  const resultLine = job.providerStatus || job.providerError || job.errorMessage;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-stretch gap-0 text-left transition-all hover:bg-white/[0.02]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Status bar */}
      <div
        className="w-0.5 shrink-0 rounded-full transition-all group-hover:w-1"
        style={{ background: cfg.color, opacity: isLive ? 1 : 0.5 }}
      />

      <div className="flex-1 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-semibold text-white/90 truncate">{friendlyAction(job.actionType)}</p>
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: mode.bg, color: mode.color }}
              >
                {mode.label}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 flex-wrap">
              <span className="text-[11px] text-slate-600">{friendlyProvider(job.provider)}</span>
              <span className="h-1 w-1 rounded-full bg-slate-800" />
              <span className="text-[11px] text-slate-700 font-mono">{job.actionType}</span>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge cfg={cfg} />
            <span className="text-[10px] text-slate-700 tabular-nums">{fmt(job.durationMs)}</span>
          </div>
        </div>

        {/* Result / error */}
        {resultLine && (
          <div
            className="mt-2 rounded-lg px-2.5 py-1.5"
            style={{
              background: job.success === false ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${job.success === false ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.05)'}`,
            }}
          >
            <p className="text-[11px] leading-4 line-clamp-1" style={{ color: job.success === false ? '#fca5a5' : '#64748b' }}>
              {resultLine}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-800">{fmtTime(job.startedAt)}</span>
          <span className="text-[10px] text-slate-800 opacity-0 group-hover:opacity-100 transition flex items-center gap-1" style={{ color: '#22d3ee' }}>
            Detail & logs <ArrowRight className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─── Agent Run Row ─────────────────────────────────────────────────────── */

function RunRow({ run, onOpen }: { run: AgentRun; onOpen: () => void }) {
  const cfg = agentStatusCfg(run.status);
  const isLive = cfg.pulse;
  const isError = run.status === 'Failed' || !!run.errorMessage;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex w-full items-stretch gap-0 text-left transition-all hover:bg-white/[0.02]"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Status bar */}
      <div
        className="w-0.5 shrink-0 rounded-full transition-all group-hover:w-1"
        style={{ background: cfg.color, opacity: isLive ? 1 : 0.5 }}
      />

      <div className="flex-1 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                style={{ background: `linear-gradient(135deg, ${cfg.color}cc, ${cfg.color}66)` }}
              >
                {(run.agentName || 'A')[0]}
              </div>
              <p className="text-[13px] font-semibold text-white/90 truncate">{run.agentName}</p>
              {isLive && <LiveDot color={cfg.color} />}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 line-clamp-1 pl-8">{run.taskTitle || 'No task title'}</p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge cfg={cfg} />
            <div className="flex items-center gap-2 text-[10px] text-slate-700">
              <span className="tabular-nums">{fmt(run.durationMs)}</span>
              {run.tokensUsed != null && run.tokensUsed > 0 && (
                <>
                  <span className="h-0.5 w-0.5 rounded-full bg-slate-800" />
                  <span className="tabular-nums">{run.tokensUsed.toLocaleString()} tok</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Stage */}
        {run.stage && (
          <div className="mt-1.5 pl-8">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cfg.color }}>
              {run.stage}
            </span>
          </div>
        )}

        {/* Running progress bar */}
        {isLive && (
          <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full"
              style={{ width: '60%', background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)`, animation: 'agentWorkingBar 2s linear infinite' }}
            />
          </div>
        )}

        {/* Summary or error */}
        {run.summary && !isError && (
          <p className="mt-2 pl-8 text-[11px] text-slate-600 line-clamp-1">{run.summary}</p>
        )}
        {isError && run.errorMessage && (
          <div className="mt-2 rounded-lg px-2.5 py-1.5 pl-8" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-[11px] text-red-400 line-clamp-1">{run.errorMessage}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between pl-8">
          <span className="text-[10px] text-slate-800">{fmtTime(run.startedAt)}</span>
          <span className="text-[10px] opacity-0 group-hover:opacity-100 transition flex items-center gap-1" style={{ color: '#a78bfa' }}>
            Flow & logs <ArrowRight className="h-2.5 w-2.5" />
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─── Metric tile ───────────────────────────────────────────────────────── */

function MetricTile({ label, value, sub, icon: Icon, color, alert }: {
  label: string; value: string | number; sub?: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>; color: string; alert?: boolean;
}) {
  return (
    <div
      className="rounded-2xl p-5 transition"
      style={{
        background: alert ? `${color}08` : 'rgba(13,14,22,0.8)',
        border: `1px solid ${alert ? color + '30' : 'rgba(255,255,255,0.07)'}`,
        boxShadow: alert ? `0 0 20px ${color}15` : 'none',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p
            className="mt-2 text-4xl font-light tracking-[-0.04em] metric-value"
            style={{ color, textShadow: `0 0 20px ${color}40` }}
          >
            {value}
          </p>
          {sub && <p className="mt-1 text-[11px] text-slate-600">{sub}</p>}
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${color}15`, border: `1px solid ${color}25` }}
        >
          <Icon className="h-4 w-4" color={color} />
        </div>
      </div>
    </div>
  );
}

/* ─── Panel wrapper ─────────────────────────────────────────────────────── */

function Panel({ children, accent, title, sub, count, liveCount, emptyTitle, emptyDesc, isEmpty }: {
  children: React.ReactNode;
  accent: string;
  title: string;
  sub: string;
  count: number;
  liveCount?: number;
  emptyTitle: string;
  emptyDesc: string;
  isEmpty: boolean;
}) {
  return (
    <div
      className="flex min-h-0 flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(11,12,18,0.9)',
        border: `1px solid rgba(255,255,255,0.07)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3.5 shrink-0"
        style={{ borderBottom: `1px solid rgba(255,255,255,0.06)`, background: `${accent}06` }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
          />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-white/90">{title}</p>
            <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {liveCount != null && liveCount > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-md px-2 py-0.5"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <LiveDot />
              <span className="text-[10px] font-semibold text-emerald-400">{liveCount} live</span>
            </div>
          )}
          <span
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: `${accent}14`, color: accent }}
          >
            {count}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-16 px-5">
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ background: `${accent}10`, border: `1px solid ${accent}20` }}
            >
              <CircleDot className="h-5 w-5" color={accent} />
            </div>
            <p className="text-[13px] font-medium text-slate-600">{emptyTitle}</p>
            <p className="mt-1 text-center text-[12px] text-slate-800">{emptyDesc}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */

export default function ExecutionsPage() {
  const queryClient = useQueryClient();
  const [failuresOpen, setFailuresOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const [selectedJob, setSelectedJob] = useState<ExecutionJob | null>(null);
  const [reconcileHint, setReconcileHint] = useState<string | null>(null);

  const reconcileMutation = useMutation({
    mutationFn: () => apiClient.reconcileStaleAgentRuns(10),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['operations-summary'] });
      const ok = res.results.filter((r) => r.cancelled).length;
      setReconcileHint(
        res.count === 0
          ? 'No InProgress records older than 10 minutes.'
          : `${res.count} records processed; ${ok} cancelled.`,
      );
    },
    onError: () => setReconcileHint('Operation failed — check session, permissions or API connection.'),
  });

  useEffect(() => {
    if (!selectedRun && !selectedJob) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelectedRun(null); setSelectedJob(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedRun, selectedJob]);

  const { data, isLoading, error, dataUpdatedAt, isFetching } = useQuery({
    queryKey: ['operations-summary'],
    queryFn: () => apiClient.getOperationsSummary(),
    refetchInterval: (query) => {
      const summary = query.state.data as OperationsSummary | undefined;
      const crewActive = summary?.recentAgentRuns?.some(
        (r) => r.status === 'InProgress' || r.status === 'Running',
      );
      return crewActive ? 5_000 : 15_000;
    },
  });

  const health = data?.health;
  const jobsRaw = data?.recentExecutionJobs ?? [];
  const jobs = jobsRaw.filter(isRealJob);
  const runs = data?.recentAgentRuns ?? [];
  const failures = data?.failures ?? [];
  const liveRuns = runs.filter((r) => r.status === 'Running' || r.status === 'InProgress').length;
  const liveJobs = jobs.filter((j) => j.status === 'Running' || j.status === 'InProgress').length;
  const failureRate = health?.providerFailureRate ?? 0;
  const isHealthy = failureRate <= 5 && failures.length === 0;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4" style={{ background: '#07080f' }}>
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', boxShadow: '0 0 30px rgba(34,211,238,0.1)' }}
        >
          <ServerCog className="h-7 w-7 text-cyan-400 animate-pulse" />
        </div>
        <p className="text-[13px] text-slate-600">Initializing execution center…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

        {/* ── HERO HEADER ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-5"
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.07) 0%, rgba(13,14,22,0.95) 60%)',
            border: '1px solid rgba(34,211,238,0.15)',
          }}
        >
          {/* Subtle grid */}
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'linear-gradient(rgba(34,211,238,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.1) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
              maskImage: 'radial-gradient(ellipse at 0% 0%, black 0%, transparent 60%)',
            }}
          />

          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.25)' }}
                >
                  <ServerCog className="h-4 w-4 text-cyan-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-500">
                  Execution Layer · Live Monitor
                </span>
              </div>
              <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
                Execution <span className="font-semibold" style={{ color: '#22d3ee' }}>Command Center</span>
              </h1>
              <p className="mt-1 max-w-lg text-[13px] text-slate-600">
                Every integration job and agent run, live. Real API calls to Instagram, Google Ads and Google Business — with full flow, log and error trace.
              </p>
            </div>

            {/* System status */}
            <div className="flex flex-col gap-2 shrink-0">
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  background: isHealthy ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${isHealthy ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                }}
              >
                {isHealthy
                  ? <Wifi className="h-4 w-4 text-emerald-400 shrink-0" />
                  : <WifiOff className="h-4 w-4 text-red-400 shrink-0" />}
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: isHealthy ? '#22c55e' : '#ef4444' }}>
                    {isHealthy ? 'All systems operational' : `${failures.length} critical failure${failures.length > 1 ? 's' : ''} detected`}
                  </p>
                  <p className="text-[10px] text-slate-700">
                    Failure rate: {failureRate}% · {isFetching ? 'syncing…' : `updated ${fmtTimeShort(new Date(dataUpdatedAt).toISOString())}`}
                  </p>
                </div>
              </div>

              {/* Reconcile */}
              <button
                type="button"
                disabled={reconcileMutation.isPending}
                onClick={() => { setReconcileHint(null); reconcileMutation.mutate(); }}
                className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-semibold transition hover:opacity-80 disabled:opacity-40"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}
              >
                {reconcileMutation.isPending
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Clearing stuck runs…</>
                  : <><RotateCcw className="h-3.5 w-3.5" /> Clear stuck runs (10m+)</>}
              </button>
              {reconcileHint && (
                <p className="text-[11px] text-slate-600 px-1">{reconcileHint}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── ERROR STATE ─────────────────────────────────────────────── */}
        {error && (
          <div
            className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-red-400">Could not load execution summary</p>
              <p className="text-[11px] text-red-600">Check session and API connection.</p>
            </div>
          </div>
        )}

        {/* ── METRICS ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile
            label="Agent Runs (24h)"
            value={health?.agentRuns24h ?? 0}
            sub={`${health?.failedAgentRuns24h ?? 0} failed`}
            icon={Bot}
            color="#a78bfa"
            alert={(health?.failedAgentRuns24h ?? 0) > 0}
          />
          <MetricTile
            label="Integration Jobs (24h)"
            value={health?.executionJobs24h ?? 0}
            sub={`${health?.failedExecutionJobs24h ?? 0} failed`}
            icon={ServerCog}
            color="#22d3ee"
            alert={(health?.failedExecutionJobs24h ?? 0) > 0}
          />
          <MetricTile
            label="Avg Job Duration"
            value={fmt(health?.avgExecutionDurationMs ?? 0)}
            sub="Provider API latency"
            icon={Clock}
            color="#60a5fa"
          />
          <MetricTile
            label="LLM Tokens (24h)"
            value={(health?.tokensUsed24h ?? 0).toLocaleString()}
            sub="Included in run guard"
            icon={Zap}
            color="#22c55e"
          />
        </div>

        {/* ── LIVE BANNER ─────────────────────────────────────────────── */}
        {(liveRuns > 0 || liveJobs > 0) && (
          <div
            className="flex items-center gap-4 rounded-xl px-5 py-3"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
          >
            <LiveDot />
            <p className="text-[13px] font-semibold text-emerald-400">
              {liveRuns > 0 && `${liveRuns} agent run${liveRuns > 1 ? 's' : ''} executing`}
              {liveRuns > 0 && liveJobs > 0 && ' · '}
              {liveJobs > 0 && `${liveJobs} integration job${liveJobs > 1 ? 's' : ''} in flight`}
            </p>
            <p className="text-[11px] text-emerald-700">Auto-refreshes every 5 seconds</p>
            {isFetching && <RefreshCw className="ml-auto h-3.5 w-3.5 text-emerald-700 animate-spin shrink-0" />}
          </div>
        )}

        {/* ── CRITICAL FAILURES ───────────────────────────────────────── */}
        {failures.length > 0 && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <button
              type="button"
              onClick={() => setFailuresOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              style={{ borderBottom: failuresOpen ? '1px solid rgba(239,68,68,0.15)' : 'none' }}
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-red-400">
                    {failures.length} Critical Failure{failures.length > 1 ? 's' : ''} — Action Required
                  </p>
                  <p className="text-[11px] text-red-600">Connection rejections, quota errors, permission or token budget issues</p>
                </div>
              </div>
              <ChevronDown
                className={cn('h-4 w-4 text-red-500 shrink-0 transition-transform', failuresOpen && 'rotate-180')}
              />
            </button>

            {failuresOpen && (
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {failures.map((f) => (
                  <div
                    key={`${f.source}-${f.id}`}
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg mt-0.5"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-red-300">{f.title}</p>
                        <p className="mt-0.5 text-[10px] uppercase tracking-wider text-red-500/70">
                          {f.source === 'agent_run' ? 'Agent Run' : 'Provider Job'} · {fmtTime(f.occurredAt)}
                        </p>
                        <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-red-400/80 scrollbar-thin">
                          {f.detail}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── MAIN GRID ────────────────────────────────────────────────── */}
        <div className="grid gap-5 lg:grid-cols-2" style={{ minHeight: '480px' }}>

          {/* INTEGRATION JOBS */}
          <Panel
            accent="#22d3ee"
            title="Integration Jobs"
            sub="Live API calls to external providers · Dry-run & mock hidden"
            count={jobs.length}
            liveCount={liveJobs}
            emptyTitle="No live integration jobs"
            emptyDesc={
              jobsRaw.length > 0
                ? "All recent records are dry-run or mock. Run a live action from Approvals."
                : "Approved live actions will appear here."
            }
            isEmpty={jobs.length === 0}
          >
            {/* Column headers */}
            <div
              className="grid px-4 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-700"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', gridTemplateColumns: '1fr auto' }}
            >
              <span>Action / Provider</span>
              <span>Status · Duration</span>
            </div>
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} onOpen={() => setSelectedJob(job)} />
            ))}
          </Panel>

          {/* AGENT RUNS */}
          <Panel
            accent="#a78bfa"
            title="Agent Runs"
            sub="Crew / LLM execution records · Click for full flow & error log"
            count={Math.min(runs.length, 20)}
            liveCount={liveRuns}
            emptyTitle="No agent runs yet"
            emptyDesc="Runs appear here when you assign tasks. Quota or token budget issues will block new runs before they start."
            isEmpty={runs.length === 0}
          >
            {/* Column headers */}
            <div
              className="grid px-4 py-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-700"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', gridTemplateColumns: '1fr auto' }}
            >
              <span>Agent / Task</span>
              <span>Status · Duration</span>
            </div>
            {runs.slice(0, 20).map((run) => (
              <RunRow key={run.id} run={run} onOpen={() => setSelectedRun(run)} />
            ))}
          </Panel>
        </div>

        {/* ── LEGEND + TIMESTAMP ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4">
            {[
              { label: 'Live', color: '#22d3ee' },
              { label: 'Done', color: '#22c55e' },
              { label: 'Failed', color: '#ef4444' },
              { label: 'Queued', color: '#f59e0b' },
              { label: 'Cancelled', color: '#64748b' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span className="text-[10px] text-slate-700">{s.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-bold text-emerald-400"
                style={{ background: 'rgba(34,197,94,0.1)' }}
              >
                LIVE
              </span>
              <span className="text-[10px] text-slate-700">= Real API call</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-bold text-amber-400"
                style={{ background: 'rgba(245,158,11,0.1)' }}
              >
                DRY
              </span>
              <span className="text-[10px] text-slate-700">= Simulated</span>
            </div>
          </div>

          {data?.generatedAt && (
            <p className="text-[10px] text-slate-800">
              Last sync: {fmtTime(data.generatedAt)}
            </p>
          )}
        </div>

      </div>

      {/* ── MODALS ──────────────────────────────────────────────────────── */}
      {selectedRun && (
        <AgentRunDetailModal
          run={runs.find((r) => r.id === selectedRun.id) ?? selectedRun}
          onClose={() => setSelectedRun(null)}
        />
      )}
      {selectedJob && (
        <ProviderJobDetailModal
          job={selectedJob}
          friendlyAction={friendlyAction(selectedJob.actionType)}
          friendlyProv={friendlyProvider(selectedJob.provider)}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  );
}

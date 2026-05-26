'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, Layers, Play,
  Search as SearchIcon, ShieldAlert, Zap, X, ChevronRight,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { SuggestedActionDto } from '@/types';
import {
  ArtifactPreviewModal,
  PremiumArtifactCard,
  signalFromAction,
  type ArtifactSignal,
} from '@/components/artifacts/artifact-preview';
import { cn } from '@/lib/utils';

type FilterKey = 'all' | 'needs_approval' | 'approved' | 'executed' | 'rejected';

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'needs_approval', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'executed', label: 'Executed' },
  { id: 'rejected', label: 'Rejected' },
];

function statusFilterMatch(action: SuggestedActionDto, filter: FilterKey): boolean {
  const map: Record<FilterKey, (s: string) => boolean> = {
    all: () => true,
    needs_approval: (s) => s === 'Pending',
    approved: (s) => s === 'Approved',
    executed: (s) => s === 'Executed',
    rejected: (s) => s === 'Rejected',
  };
  return map[filter](action.status);
}

function MetricTile({ label, value, icon: Icon, color, sub }: {
  label: string; value: number; icon: React.FC<React.SVGProps<SVGSVGElement>>; color: string; sub?: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: 'rgba(13,14,22,0.8)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: `0 0 30px ${color}10` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className="mt-2 text-4xl font-light tracking-[-0.04em] metric-value" style={{ color, textShadow: `0 0 20px ${color}40` }}>{value}</p>
          {sub && <p className="mt-1 text-[11px] text-slate-600">{sub}</p>}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}18`, border: `1px solid ${color}28` }}>
          <Icon className="h-4 w-4" color={color} />
        </div>
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<'dry-run' | 'live'>('dry-run');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  const { data: actions = [], isLoading } = useQuery({
    queryKey: ['suggested-actions'],
    queryFn: () => apiClient.getActions(),
    refetchInterval: 20_000,
  });
  const { data: security } = useQuery({
    queryKey: ['current-user-security'],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    staleTime: 60_000,
  });

  const canApprove = security?.permissions?.includes('actions.approve') ?? false;
  const canExecuteLive = security?.permissions?.includes('provider.execute.live') ?? false;

  const signals = useMemo<Array<ArtifactSignal & { sourceAction: SuggestedActionDto }>>(() => {
    return actions
      .filter((a) => statusFilterMatch(a, filter))
      .filter((a) => {
        if (!search.trim()) return true;
        const blob = `${a.artifactTitle ?? ''} ${a.actionType} ${a.provider}`.toLowerCase();
        return blob.includes(search.toLowerCase());
      })
      .map((a) => ({ ...signalFromAction(a), sourceAction: a }));
  }, [actions, filter, search]);

  const pending = actions.filter((a) => a.status === 'Pending');
  const approved = actions.filter((a) => a.status === 'Approved');
  const executed = actions.filter((a) => a.status === 'Executed');
  const highRisk = pending.filter((a) => {
    const sig = signalFromAction(a);
    return sig.risk === 'high' || sig.risk === 'critical';
  }).length;

  const selected = selectedId ? signals.find((s) => s.id === selectedId) ?? null : null;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['suggested-actions'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
      queryClient.invalidateQueries({ queryKey: ['ai-control-center'] }),
    ]);
  };

  const approveMutation = useMutation({ mutationFn: (id: string) => apiClient.approveAction(id), onSuccess: invalidate });
  const rejectMutation = useMutation({ mutationFn: (id: string) => apiClient.rejectAction(id, 'Rejected from command center'), onSuccess: invalidate });
  const executeMutation = useMutation({ mutationFn: (id: string) => apiClient.executeAction(id, mode), onSuccess: invalidate });
  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => { for (const id of ids) await apiClient.approveAction(id); },
    onSuccess: async () => { setBulkSelected(new Set()); await invalidate(); },
  });

  const toggleBulk = (id: string) => {
    setBulkSelected((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const bulkSelectAll = () => {
    setBulkSelected(new Set(signals.filter((s) => s.status === 'needs_approval').map((s) => s.id!).filter(Boolean)));
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#07080f' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-amber-500/20 border-t-amber-500/70" />
          <p className="text-[13px] text-slate-600">Loading approval center…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">Human Control Layer</span>
            </div>
            <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
              Approval <span className="font-semibold" style={{ color: '#f59e0b' }}>Control Center</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">
              Every AI-generated action requires your sign-off before touching the outside world.
            </p>
          </div>

          {/* Execution mode */}
          <div className="flex items-center gap-2.5">
            <p className="text-[11px] text-slate-700">Execution mode:</p>
            {(['dry-run', 'live'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="rounded-xl px-3 py-1.5 text-[12px] font-semibold transition-all"
                style={{
                  background: mode === m ? (m === 'live' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)') : 'rgba(255,255,255,0.04)',
                  border: mode === m ? (m === 'live' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(245,158,11,0.3)') : '1px solid rgba(255,255,255,0.07)',
                  color: mode === m ? (m === 'live' ? '#22c55e' : '#f59e0b') : '#64748b',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* ── Metrics ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="Pending" value={pending.length} icon={AlertTriangle} color={pending.length > 0 ? '#f59e0b' : '#22c55e'} sub="Awaiting your review" />
          <MetricTile label="High Risk" value={highRisk} icon={ShieldAlert} color={highRisk > 0 ? '#ef4444' : '#22c55e'} sub="Live-sensitive actions" />
          <MetricTile label="Approved" value={approved.length} icon={CheckCircle2} color="#22d3ee" sub="Ready to execute" />
          <MetricTile label="Executed" value={executed.length} icon={Play} color="#22c55e" sub="Completed jobs" />
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────────── */}
        <div
          className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: 'rgba(13,14,22,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search artifacts…"
              className="h-8 w-full rounded-xl pl-8 pr-3 text-[12px] text-white/90 placeholder-slate-700 focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all"
                style={{
                  background: filter === f.id ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                  border: filter === f.id ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.07)',
                  color: filter === f.id ? '#f59e0b' : '#64748b',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Bulk actions */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-slate-700">{bulkSelected.size} selected</span>
            <button
              type="button"
              onClick={bulkSelectAll}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:text-slate-300"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              Select all pending
            </button>
            <button
              type="button"
              disabled={!canApprove || bulkSelected.size === 0 || bulkApproveMutation.isPending}
              onClick={() => bulkApproveMutation.mutate(Array.from(bulkSelected))}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition hover:opacity-90 disabled:opacity-40"
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {bulkApproveMutation.isPending ? 'Approving…' : 'Bulk approve'}
            </button>
            {bulkSelected.size > 0 && (
              <button
                type="button"
                onClick={() => setBulkSelected(new Set())}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:text-slate-400"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Artifact Grid ────────────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">AI Artifacts</p>
            <span className="text-[10px] text-slate-800">({signals.length})</span>
          </div>

          {signals.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-2xl py-16"
              style={{ background: 'rgba(13,14,22,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <CheckCircle2 className="mb-3 h-10 w-10 text-slate-800" />
              <p className="text-[14px] font-medium text-slate-600">Approval desk is clear</p>
              <p className="mt-1 text-[12px] text-slate-800">AI recommendations will appear here as actionable artifacts.</p>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
              {signals.map((signal) => (
                <div key={signal.id ?? signal.title} className="relative">
                  <input
                    type="checkbox"
                    className="absolute left-4 top-4 z-10 h-4 w-4 cursor-pointer accent-emerald-400"
                    checked={signal.id ? bulkSelected.has(signal.id) : false}
                    onChange={() => signal.id && toggleBulk(signal.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <PremiumArtifactCard
                    signal={signal}
                    selected={selectedId === signal.id}
                    actions={{
                      onOpen: () => setSelectedId(signal.id ?? null),
                      onApprove: signal.status === 'needs_approval' ? () => approveMutation.mutate(signal.id!) : undefined,
                      onReject: signal.status === 'needs_approval' ? () => rejectMutation.mutate(signal.id!) : undefined,
                      onExecute: signal.status === 'approved' ? () => executeMutation.mutate(signal.id!) : undefined,
                      approveDisabled: !canApprove,
                      executeDisabled: mode === 'live' && !canExecuteLive,
                      approveBusy: approveMutation.isPending && approveMutation.variables === signal.id,
                      rejectBusy: rejectMutation.isPending && rejectMutation.variables === signal.id,
                      executeBusy: executeMutation.isPending && executeMutation.variables === signal.id,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Preview modal */}
      <ArtifactPreviewModal
        signal={selected ?? null}
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        actions={selected ? {
          onApprove: selected.status === 'needs_approval' ? () => approveMutation.mutate(selected.id!) : undefined,
          onReject: selected.status === 'needs_approval' ? () => rejectMutation.mutate(selected.id!) : undefined,
          onExecute: selected.status === 'approved' ? () => executeMutation.mutate(selected.id!) : undefined,
          approveDisabled: !canApprove,
          executeDisabled: mode === 'live' && !canExecuteLive,
          approveBusy: approveMutation.isPending,
          rejectBusy: rejectMutation.isPending,
          executeBusy: executeMutation.isPending,
        } : undefined}
      />
    </div>
  );
}

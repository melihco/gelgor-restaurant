'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Filter,
  Layers3,
  Loader2,
  RefreshCw,
  Search as SearchIcon,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  EmptyState,
  StatusPill,
} from '@/tailadmin/components/application/PageElements';
import {
  ArtifactPreviewModal,
  PremiumArtifactCard,
  signalFromArtifact,
  type ArtifactSignal,
} from '@/components/artifacts/artifact-preview';
import type { Agent, OutputArtifact, TaskItem } from '@/types';

type FilterKey = 'all' | 'needs_approval' | 'approved' | 'rejected';
type GroupKey = 'agent' | 'kind' | 'date';
type CanvaExportRetryState = {
  status: 'running' | 'success' | 'error';
  exportUrl?: string;
  permanentPreviewUrl?: string;
  jobStatus?: string;
  error?: string;
};

const FILTERS: Array<{ id: FilterKey; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'needs_approval', label: 'Needs review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const GROUPS: Array<{ id: GroupKey; label: string }> = [
  { id: 'agent', label: 'By agent' },
  { id: 'kind', label: 'By type' },
  { id: 'date', label: 'By day' },
];

const KIND_LABELS: Record<string, string> = {
  instagram_post: 'Instagram post',
  instagram_story: 'Instagram story',
  instagram_reel: 'Instagram reel',
  instagram_plan: 'Content plan',
  ad_campaign: 'Ads campaign',
  ad_creative: 'Ad creative',
  budget_optimization: 'Budget plan',
  review_reply: 'Review reply',
  review_analysis: 'Review insights',
  analytics_report: 'Analytics report',
  strategy: 'AI strategy',
  generic: 'AI artifact',
};

function formatDay(value?: string): string {
  if (!value) return 'Unknown date';
  try {
    return new Date(value).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return 'Unknown date';
  }
}

export default function OutputsPage() {
  const queryClient = useQueryClient();
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const officeId = useWorkspaceStore((s) => s.officeId);
  const { data } = useDashboardSnapshot();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [group, setGroup] = useState<GroupKey>('agent');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvaExportRetries, setCanvaExportRetries] = useState<Record<string, CanvaExportRetryState>>({});
  /** Gruplar (ajan / tür / gün) arasında sekme; null = ilk gruba düş. */
  const [activeGroupTabKey, setActiveGroupTabKey] = useState<string | null>(null);

  const artifacts = data?.artifacts ?? [];
  const tasks = data?.tasks ?? [];
  const agents = data?.agents ?? [];

  const enriched = useMemo(() => {
    return artifacts.map((artifact) => {
      const task = tasks.find((t) => t.id === artifact.taskId);
      const agent = agents.find((a) => a.id === task?.assignedAgent);
      const signal = signalFromArtifact({ ...artifact, agentName: agent?.name });
      return { artifact, task, agent, signal };
    });
  }, [artifacts, tasks, agents]);

  const filtered = useMemo(() => {
    return enriched.filter(({ signal }) => {
      const matchFilter =
        filter === 'all'
          ? true
          : filter === 'needs_approval'
            ? signal.status === 'needs_approval'
            : filter === 'approved'
              ? signal.status === 'approved' || signal.status === 'executed'
              : signal.status === 'rejected';
      if (!matchFilter) return false;
      if (!search.trim()) return true;
      const blob = `${signal.title} ${signal.summary ?? ''} ${signal.agentSource ?? ''}`.toLowerCase();
      return blob.includes(search.toLowerCase());
    });
  }, [enriched, filter, search]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: ArtifactSignal[] }>();
    for (const { signal, agent } of filtered) {
      let key = 'AI artifact';
      let label = 'AI artifact';
      if (group === 'agent') {
        key = agent?.id ?? 'unassigned';
        label = agent?.name ?? 'Unassigned agent';
      } else if (group === 'kind') {
        key = signal.kind;
        label = KIND_LABELS[signal.kind] ?? signal.kind;
      } else if (group === 'date') {
        const day = formatDay(signal.timestamp);
        key = day;
        label = day;
      }
      const current = map.get(key) ?? { label, items: [] };
      current.items.push(signal);
      map.set(key, current);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].items.length - a[1].items.length);
  }, [filtered, group]);

  const effectiveGroupTabKey = useMemo(() => {
    if (groups.length === 0) return null;
    if (activeGroupTabKey && groups.some(([k]) => k === activeGroupTabKey)) return activeGroupTabKey;
    return groups[0]![0];
  }, [groups, activeGroupTabKey]);

  useEffect(() => {
    setActiveGroupTabKey(null);
  }, [filter, search, group]);

  const activeGroup = useMemo(
    () => groups.find(([k]) => k === effectiveGroupTabKey) ?? null,
    [groups, effectiveGroupTabKey],
  );

  const total = artifacts.length;
  const approved = enriched.filter(({ signal }) => signal.status === 'approved' || signal.status === 'executed').length;
  const pending = enriched.filter(({ signal }) => signal.status === 'needs_approval').length;
  const rejected = enriched.filter(({ signal }) => signal.status === 'rejected').length;

  const selectedEntry = filtered.find(({ signal }) => signal.id === selectedId) ?? null;
  const selected = selectedEntry?.signal ?? null;

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveArtifact(id, 'Approved from outputs'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => apiClient.rejectArtifact(id, 'Rejected from outputs'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
  });

  async function retryCanvaExport(signal: ArtifactSignal) {
    const designId = signal.canvaDesign?.designId;
    if (!signal.id || !designId) return;

    setCanvaExportRetries((current) => ({
      ...current,
      [signal.id!]: { status: 'running' },
    }));

    try {
      const response = await fetch('/api/canva/export-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          officeId,
          rendererProvider: signal.canvaDesign?.rendererProvider ?? 'canva',
          designId,
          title: signal.title,
          format: 'png',
        }),
      });
      const result = await response.json() as {
        job?: { id?: string; status?: string };
        exportUrl?: string;
        permanentPreviewUrl?: string;
        error?: string;
      };
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error ?? 'Canva export retry failed.');
      }
      setCanvaExportRetries((current) => ({
        ...current,
        [signal.id!]: {
          status: result.permanentPreviewUrl || result.exportUrl ? 'success' : 'running',
          exportUrl: result.exportUrl,
          permanentPreviewUrl: result.permanentPreviewUrl,
          jobStatus: result.job?.status,
        },
      }));
    } catch (error) {
      setCanvaExportRetries((current) => ({
        ...current,
        [signal.id!]: {
          status: 'error',
          error: error instanceof Error ? error.message : 'Canva export retry failed.',
        },
      }));
    }
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <Layers3 className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-400">Artifact Production Center</span>
          </div>
          <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
            AI <span className="font-semibold" style={{ color: '#818cf8' }}>Artifact Center</span>
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">
            Every AI-generated output — posts, reports, campaigns, replies — archived as actionable artifacts.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGroup(g.id)}
              className="rounded-xl px-3 py-2 text-[12px] font-semibold transition-all"
              style={{
                background: group === g.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                border: group === g.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                color: group === g.id ? '#818cf8' : '#64748b',
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Metrics ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total Outputs', value: total, color: '#818cf8', icon: FileText, sub: 'generated by agents' },
          { label: 'Approved', value: approved, color: '#22c55e', icon: CheckCircle2, sub: 'ready to publish' },
          { label: 'Needs Review', value: pending, color: pending > 0 ? '#f59e0b' : '#22c55e', icon: Clock, sub: 'awaiting attention' },
          { label: 'Rejected', value: rejected, color: rejected > 0 ? '#ef4444' : '#64748b', icon: Filter, sub: 'not used' },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl p-5" style={{ background: 'rgba(13,14,22,0.8)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: `0 0 30px ${m.color}10` }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{m.label}</p>
                <p className="mt-2 text-4xl font-light tracking-[-0.04em] metric-value" style={{ color: m.color, textShadow: `0 0 20px ${m.color}40` }}>{m.value}</p>
                <p className="mt-1 text-[11px] text-slate-600">{m.sub}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${m.color}18`, border: `1px solid ${m.color}28` }}>
                <m.icon className="h-4 w-4" style={{ color: m.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" style={{ background: 'rgba(13,14,22,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
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
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all"
              style={{
                background: filter === f.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                border: filter === f.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                color: filter === f.id ? '#818cf8' : '#64748b',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-slate-700">{filtered.length} artifacts</span>
      </div>

      {/* ── Gallery ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(13,14,22,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Layers3 className="mb-3 h-10 w-10 text-slate-800" />
            <p className="text-[14px] font-medium text-slate-600">No artifacts in this view</p>
            <p className="mt-1 text-[12px] text-slate-800">Generated artifacts will appear here as actionable cards.</p>
          </div>
        ) : (
          <div>
            {/* Group tabs */}
            <div className="flex gap-0 overflow-x-auto scrollbar-thin" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {groups.map(([key, info]) => {
                const isActive = key === effectiveGroupTabKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveGroupTabKey(key)}
                    className="min-w-[120px] max-w-[220px] shrink-0 px-4 py-3 text-left transition"
                    style={{
                      background: isActive ? 'rgba(99,102,241,0.06)' : 'transparent',
                      borderBottom: isActive ? '2px solid #818cf8' : '2px solid transparent',
                    }}
                  >
                    <span className="block truncate text-[13px] font-semibold" style={{ color: isActive ? '#818cf8' : '#475569' }}>
                      {info.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] font-medium text-slate-700 tabular-nums">
                      {info.items.length} outputs
                    </span>
                  </button>
                );
              })}
            </div>

            {activeGroup ? (
              <div className="px-5 pb-6 pt-5">
                <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                  {activeGroup[1].items.map((signal) => (
                    <PremiumArtifactCard
                      key={signal.id ?? signal.title}
                      signal={signal}
                      selected={selectedId === signal.id}
                      actions={{
                        onOpen: () => setSelectedId(signal.id ?? null),
                        onApprove: signal.status === 'needs_approval' ? () => approveMutation.mutate(signal.id!) : undefined,
                        onReject: signal.status === 'needs_approval' ? () => rejectMutation.mutate(signal.id!) : undefined,
                        approveBusy: approveMutation.isPending,
                        rejectBusy: rejectMutation.isPending,
                      }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <ArtifactPreviewModal
        signal={selected}
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        actions={selected ? {
          onApprove: selected.status === 'needs_approval' ? () => approveMutation.mutate(selected.id!) : undefined,
          onReject: selected.status === 'needs_approval' ? () => rejectMutation.mutate(selected.id!) : undefined,
          approveBusy: approveMutation.isPending,
          rejectBusy: rejectMutation.isPending,
        } : undefined}
        extraSidebar={selected && selectedEntry ? (
          <OutputOperationsPanel
            artifact={selectedEntry.artifact}
            task={selectedEntry.task}
            agent={selectedEntry.agent}
            signal={selected}
            retryState={selected.id ? canvaExportRetries[selected.id] : undefined}
            onRetryExport={selected.canvaDesign?.designId ? () => retryCanvaExport(selected) : undefined}
          />
        ) : undefined}
      />

      </div>
    </div>
  );
}

function OutputOperationsPanel({
  artifact,
  task,
  agent,
  signal,
  retryState,
  onRetryExport,
}: {
  artifact: OutputArtifact;
  task?: TaskItem;
  agent?: Agent;
  signal: ArtifactSignal;
  retryState?: CanvaExportRetryState;
  onRetryExport?: () => void;
}) {
  const metadata = artifact.metadata ?? {};
  const lineage = objectValue(metadata.lineage) ?? objectValue(signal.canvaDesign?.lineage);
  const rendererProvider = stringValue(metadata.rendererProvider) ?? signal.canvaDesign?.rendererProvider ?? stringValue(lineage?.rendererProvider) ?? 'canva';
  const selectedBy = stringValue(metadata.selectedBy) ?? stringValue(lineage?.selectedBy) ?? signal.canvaDesign?.selectedBy;
  const riskTier = stringValue(metadata.canvaRiskTier) ?? signal.canvaDesign?.riskTier;
  const eligibility = stringValue(metadata.canvaEligibility) ?? signal.canvaDesign?.eligibility;
  const approvalRequired = Boolean(metadata.canvaApprovalRequired ?? signal.canvaDesign?.approvalRequired);
  const exportUrl = retryState?.exportUrl ?? stringValue(metadata.canvaExportUrl) ?? signal.canvaDesign?.exportUrl;
  const permanentPreviewUrl = retryState?.permanentPreviewUrl ?? stringValue(metadata.permanentPreviewUrl) ?? signal.canvaDesign?.permanentPreviewUrl;
  const exportStatus = retryState?.jobStatus ?? stringValue(metadata.canvaExportStatus) ?? signal.canvaDesign?.exportStatus;
  const warnings = stringArray(metadata.canvaPolicyWarnings);
  const riskSignals = stringArray(metadata.canvaRiskSignals);
  const requiredAssets = stringArray(metadata.canvaRequiredAssetIntents);
  const missingAssets = stringArray(metadata.canvaMissingAssetIntents);
  const assetIds = objectValue(metadata.canvaAssetIds);
  const assetIdEntries = assetIds
    ? Object.entries(assetIds).filter(([, value]) => typeof value === 'string' && value.length > 0)
    : [];

  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(13,14,22,0.8)', border: '1px solid rgba(99,102,241,0.15)' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-white/90">Render Operation</p>
          <p className="text-[11px] text-slate-600">Canva render, export, lineage & approval traces</p>
        </div>
        {signal.canvaDesign?.designId ? <StatusPill label="canva" tone="indigo" /> : null}
      </div>

      <div className="grid gap-2 text-xs">
        <InfoRow label="Lifecycle" value={artifact.lifecycleStatus ?? 'review'} />
        <InfoRow label="Renderer" value={rendererProvider} />
        <InfoRow label="Render job" value={signal.canvaDesign?.jobId ? `${signal.canvaDesign.jobId.slice(0, 12)}${signal.canvaDesign.status ? ` · ${signal.canvaDesign.status}` : ''}` : 'Yok'} />
        <InfoRow label="Template" value={signal.canvaDesign?.templateTitle ?? stringValue(metadata.canvaTemplateTitle) ?? 'Yok'} />
        <InfoRow label="Template ID" value={signal.canvaDesign?.templateId ?? stringValue(metadata.canvaTemplateId) ?? 'Yok'} />
        <InfoRow label="Seçim" value={selectedBy ? selectedBy.replace(/_/g, ' ') : 'Bilinmiyor'} />
        <InfoRow label="Kaynak" value={sourceLabel(lineage, task, agent)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {eligibility && <StatusPill label={`eligibility: ${eligibility.replace(/_/g, ' ')}`} tone={eligibility === 'blocked' ? 'rose' : eligibility === 'eligible' ? 'emerald' : 'amber'} />}
        {riskTier && <StatusPill label={`risk: ${riskTier.replace(/_/g, ' ')}`} tone={riskTier === 'high' || riskTier === 'blocked' ? 'rose' : riskTier === 'medium' ? 'amber' : 'emerald'} />}
        {approvalRequired && <StatusPill label="approval required" tone="amber" icon={ShieldAlert} />}
      </div>

      {(signal.canvaDesign?.editUrl || permanentPreviewUrl || exportUrl) && (
        <div className="mt-4 grid gap-2">
          {signal.canvaDesign?.editUrl && (
            <a href={signal.canvaDesign.editUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-600">
              Canva edit linkini aç
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {(permanentPreviewUrl || exportUrl) && (
            <a href={permanentPreviewUrl ?? exportUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-xs font-semibold text-success-700 transition hover:bg-success-100 dark:border-success-500/20 dark:bg-success-500/15 dark:text-success-400">
              Export preview aç
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-white/85">Export durumu</p>
            <p className="mt-1 text-[11px] leading-5 text-white/55">
              {permanentPreviewUrl ? 'Kalıcı preview hazır.' : exportStatus ? `Son export: ${exportStatus}` : 'Henüz export preview kaydı yok.'}
            </p>
          </div>
          {onRetryExport && (
            <button
              type="button"
              onClick={onRetryExport}
              disabled={retryState?.status === 'running'}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:bg-white/[0.09] disabled:opacity-50"
            >
              {retryState?.status === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Retry export
            </button>
          )}
        </div>
        {retryState?.status === 'error' && (
          <p className="mt-2 rounded-lg border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-5 text-rose-200">
            {retryState.error}
          </p>
        )}
      </div>

      {(warnings.length > 0 || riskSignals.length > 0 || missingAssets.length > 0) && (
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/[0.08] p-3 text-[11px] leading-5 text-amber-100/80">
          <div className="mb-1 flex items-center gap-2 font-semibold text-amber-100">
            <AlertTriangle className="h-3.5 w-3.5" />
            Operasyon uyarıları
          </div>
          {[...missingAssets.map((item) => `Eksik asset: ${item}`), ...warnings, ...riskSignals.map((item) => `Risk sinyali: ${item}`)].slice(0, 6).map((item) => (
            <p key={item}>- {item}</p>
          ))}
        </div>
      )}

      {(requiredAssets.length > 0 || assetIdEntries.length > 0) && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-xs font-semibold text-white/85">Asset izleri</p>
          {requiredAssets.length > 0 && (
            <p className="mt-1 text-[11px] leading-5 text-white/55">Required intents: {requiredAssets.join(', ')}</p>
          )}
          {assetIdEntries.length > 0 && (
            <div className="mt-2 grid gap-1">
              {assetIdEntries.slice(0, 6).map(([key, value]) => (
                <p key={key} className="truncate font-mono text-[10px] text-white/45">{key}: {String(value)}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-xs font-semibold text-white/85">Approval history</p>
        <p className="mt-1 text-[11px] leading-5 text-white/55">
          Status: {artifact.status.replace(/_/g, ' ')}
          {artifact.reviewedAt ? ` · reviewed: ${formatDay(artifact.reviewedAt)}` : ''}
          {artifact.reviewedBy ? ` · by: ${artifact.reviewedBy}` : ''}
        </p>
        {artifact.reviewDecision?.comments && (
          <p className="mt-2 rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-[11px] leading-5 text-white/55">
            {artifact.reviewDecision.comments}
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <p className="text-[9px] uppercase tracking-[0.08em] text-white/40">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-white/72">{value}</p>
    </div>
  );
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function sourceLabel(lineage: Record<string, unknown> | undefined, task?: TaskItem, agent?: Agent) {
  const parentTitle = stringValue(lineage?.parentTitle);
  const source = stringValue(lineage?.source);
  if (parentTitle) return parentTitle;
  if (task?.title) return task.title;
  if (agent?.name) return agent.name;
  return source ? source.replace(/_/g, ' ') : 'Bilinmiyor';
}

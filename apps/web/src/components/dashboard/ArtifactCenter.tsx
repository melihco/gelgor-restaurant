'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Filter as FilterIcon,
  Layers,
  RefreshCcw,
  Search as SearchIcon,
  Smartphone,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompanyProfile } from '@/types';

import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { apiClient } from '@/lib/api-client';
import { getRuntimeAgentProfile } from '@/lib/agent-runtime';
import { useInteractionStore } from '@/stores/interaction-store';
import type { OutputArtifact } from '@/types';
import {
  ArtifactKindBadge,
  ArtifactPreview,
  ConfidenceBadge,
  WorkEvidenceTimeline,
  signalFromArtifact,
  statusLabel,
  statusTone,
  type ArtifactKind,
  type ArtifactSignal,
  type ArtifactTimelineStep,
} from '@/components/artifacts/artifact-preview';
import { GlassPanel, RiskBadge, SectionHeader, StatusPill } from '@/tailadmin/components/application/PageElements';

type ArtifactStatusFilter = 'all' | OutputArtifact['status'];

type EnrichedArtifact = OutputArtifact & {
  agentId?: string;
  agentName?: string;
  backendAgentType?: string;
  taskTitle?: string;
};

const STATUS_FILTERS: Array<{ id: ArtifactStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending_review', label: 'Needs review' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];

const KIND_FILTERS: Array<{ id: ArtifactKind | 'all'; label: string }> = [
  { id: 'all', label: 'Every type' },
  { id: 'instagram_post', label: 'Instagram posts' },
  { id: 'instagram_story', label: 'Stories' },
  { id: 'instagram_reel', label: 'Reels' },
  { id: 'instagram_plan', label: 'Content plans' },
  { id: 'ad_campaign', label: 'Ads campaigns' },
  { id: 'budget_optimization', label: 'Budget plans' },
  { id: 'review_reply', label: 'Review replies' },
  { id: 'analytics_report', label: 'Reports' },
];

function formatTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function inferTemplateId(artifact: EnrichedArtifact): string | null {
  if (!artifact.backendAgentType) return null;
  const profile = getRuntimeAgentProfile(artifact.backendAgentType);
  if (!profile.taskTemplates.length) return null;

  const title = artifact.title.toLowerCase();
  const match = profile.taskTemplates.find((template) => {
    const label = template.label.toLowerCase();
    const normalizedTaskType = template.taskType.split('_').join(' ').toLowerCase();
    return title.includes(label) || title.includes(normalizedTaskType);
  });
  return match?.id ?? profile.taskTemplates[0]?.id ?? null;
}

function lifecycleLabel(value?: OutputArtifact['lifecycleStatus']) {
  return (value ?? 'review').replace(/_/g, ' ');
}

export default function ArtifactCenter() {
  const queryClient = useQueryClient();
  const {
    showArtifactCenter,
    selectedArtifactId,
    closeArtifactCenter,
    selectArtifact,
    openAssignModal,
  } = useInteractionStore();
  const { data } = useDashboardSnapshot();

  const [statusFilter, setStatusFilter] = useState<ArtifactStatusFilter>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<ArtifactKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [igPreviewOpen, setIgPreviewOpen] = useState(false);

  const { data: companyProfile } = useQuery<CompanyProfile>({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 120_000,
  });

  const enriched = useMemo<Array<{ artifact: EnrichedArtifact; signal: ArtifactSignal }>>(() => {
    const tasks = data?.tasks ?? [];
    const agents = data?.agents ?? [];
    return (data?.artifacts ?? []).map((artifact) => {
      const task = tasks.find((item) => item.id === artifact.taskId);
      const agent = agents.find((item) => item.id === task?.assignedAgent);
      const enrichedItem: EnrichedArtifact = {
        ...artifact,
        agentId: agent?.id,
        agentName: agent?.name,
        backendAgentType: agent?.backendAgentType,
        taskTitle: task?.title,
      };
      const signal = signalFromArtifact({ ...enrichedItem, agentName: agent?.name });
      return { artifact: enrichedItem, signal };
    });
  }, [data?.artifacts, data?.tasks, data?.agents]);

  const agentCounts = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const { artifact } of enriched) {
      if (!artifact.agentId || !artifact.agentName) continue;
      const current = counts.get(artifact.agentId);
      counts.set(artifact.agentId, {
        name: artifact.agentName,
        count: (current?.count ?? 0) + 1,
      });
    }
    return Array.from(counts.entries()).map(([id, value]) => ({ id, ...value }));
  }, [enriched]);

  const filtered = useMemo(() => {
    return enriched.filter(({ artifact, signal }) => {
      if (statusFilter !== 'all' && artifact.status !== statusFilter) return false;
      if (agentFilter !== 'all' && artifact.agentId !== agentFilter) return false;
      if (kindFilter !== 'all' && signal.kind !== kindFilter) return false;
      if (search.trim()) {
        const blob = `${signal.title} ${signal.summary ?? ''} ${signal.agentSource ?? ''} ${artifact.taskTitle ?? ''}`.toLowerCase();
        if (!blob.includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [enriched, statusFilter, agentFilter, kindFilter, search]);

  const selected =
    filtered.find(({ artifact }) => artifact.id === selectedArtifactId) ??
    enriched.find(({ artifact }) => artifact.id === selectedArtifactId) ??
    filtered[0] ?? null;

  useEffect(() => {
    if (!showArtifactCenter) return;
    if (!selectedArtifactId && filtered[0]) {
      selectArtifact(filtered[0].artifact.id);
    }
  }, [showArtifactCenter, selectedArtifactId, filtered, selectArtifact]);

  const approveMutation = useMutation({
    mutationFn: (artifactId: string) => apiClient.approveArtifact(artifactId, 'Artifact center approval'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (artifactId: string) => apiClient.rejectArtifact(artifactId, 'Artifact center rejection'),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    },
  });

  const workSteps: ArtifactTimelineStep[] = useMemo(() => {
    if (!selected) return [];
    const items: ArtifactTimelineStep[] = [];
    items.push({
      title: 'Agent generated artifact',
      description: selected.signal.agentSource ? `Source: ${selected.signal.agentSource}` : undefined,
      time: formatTime(selected.artifact.createdAt),
      tone: 'cyan',
      status: 'completed',
    });
    if (selected.signal.confidence !== undefined) {
      items.push({
        title: 'Quality check',
        description: `AI confidence ${selected.signal.confidence}% with risk band: ${selected.signal.risk ?? 'medium'}`,
        tone: 'violet',
        status: 'completed',
      });
    }
    if (selected.signal.status === 'needs_approval') {
      items.push({
        title: 'Awaiting human review',
        description: 'Artifact is on the approval desk before any provider call.',
        tone: 'amber',
        status: 'active',
      });
    }
    if (selected.signal.status === 'approved') {
      items.push({
        title: 'Approved by operator',
        description: 'Ready for live or dry-run execution.',
        tone: 'emerald',
        status: 'completed',
      });
    }
    if (selected.signal.status === 'executed') {
      items.push({
        title: 'Provider execution recorded',
        description: 'Outcome captured in the execution center.',
        tone: 'emerald',
        status: 'completed',
      });
    }
    const metadata = selected.artifact.metadata ?? {};
    if (metadata.canvaDesignId || metadata.canvaJobId) {
      items.push({
        title: 'Canva design generated',
        description: `Template: ${String(metadata.canvaTemplateTitle ?? metadata.canvaTemplateId ?? 'unknown')}`,
        tone: 'violet',
        status: selected.artifact.lifecycleStatus === 'generated' ? 'active' : 'completed',
      });
    }
    if (metadata.canvaExportUrl || metadata.permanentPreviewUrl) {
      items.push({
        title: 'Permanent preview exported',
        description: String(metadata.permanentPreviewUrl ?? metadata.canvaExportUrl),
        tone: 'emerald',
        status: 'completed',
      });
    }
    return items;
  }, [selected]);

  if (!showArtifactCenter) return null;

  async function handleCopy() {
    if (!selected) return;
    const text = selected.signal.summary ?? selected.signal.caption ?? selected.artifact.content ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function handleRerun(variant: boolean) {
    if (!selected?.artifact.agentId) return;
    const preferredTemplateId = inferTemplateId(selected.artifact);
    const reference = (selected.signal.summary ?? selected.signal.caption ?? selected.artifact.content ?? '').slice(0, 1200);
    const note = variant
      ? `Aynı iş için yeni bir varyant üret. Referans çıktı: ${selected.artifact.title}\n\nReferans içerik:\n${reference}`
      : `Aynı işi tekrar çalıştır. Referans çıktı: ${selected.artifact.title}\n\nBağlam:\n${reference}`;
    closeArtifactCenter();
    openAssignModal(selected.artifact.agentId, {
      preferredTemplateId,
      prefillNote: note,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/65 backdrop-blur-2xl"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeArtifactCenter();
      }}
    >
      <div className="flex h-full w-[min(1200px,96vw)] border-l border-white/10 bg-[#070912]/97">
        <aside className="flex w-[360px] shrink-0 flex-col border-r border-white/8">
          <div className="flex items-center justify-between px-5 py-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Artifact Center</p>
              <p className="mt-1 text-[15px] font-semibold text-white">Output library</p>
            </div>
            <button
              type="button"
              onClick={closeArtifactCenter}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/55 hover:bg-white/[0.05] hover:text-white"
              aria-label="Close artifact center"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 px-5 pb-4">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search artifacts"
                className="w-full rounded-2xl border border-white/8 bg-black/30 py-2 pl-8 pr-3 text-xs text-white placeholder:text-white/30 focus:border-cyan-300/30 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STATUS_FILTERS.map((filter) => {
                const on = statusFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStatusFilter(filter.id)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                      on ? 'border border-cyan-300/30 bg-cyan-400/[0.12] text-cyan-100' : 'border border-white/8 bg-white/[0.02] text-white/55'
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {KIND_FILTERS.map((kind) => {
                const on = kindFilter === kind.id;
                return (
                  <button
                    key={kind.id}
                    type="button"
                    onClick={() => setKindFilter(kind.id)}
                    className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                      on ? 'border border-violet-300/30 bg-violet-400/[0.12] text-violet-100' : 'border border-white/8 bg-white/[0.02] text-white/55'
                    }`}
                  >
                    {kind.label}
                  </button>
                );
              })}
            </div>

            {agentCounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setAgentFilter('all')}
                  className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                    agentFilter === 'all' ? 'border border-emerald-300/30 bg-emerald-400/[0.12] text-emerald-100' : 'border border-white/8 bg-white/[0.02] text-white/55'
                  }`}
                >
                  Every agent
                </button>
                {agentCounts.map((agent) => {
                  const on = agentFilter === agent.id;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setAgentFilter(agent.id)}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition ${
                        on ? 'border border-emerald-300/30 bg-emerald-400/[0.12] text-emerald-100' : 'border border-white/8 bg-white/[0.02] text-white/55'
                      }`}
                    >
                      {agent.name} · {agent.count}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-5 pb-2 text-[10px] uppercase tracking-[0.16em] text-white/35">
            <Layers className="h-3.5 w-3.5" />
            {filtered.length} result{filtered.length === 1 ? '' : 's'}
          </div>

          <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-3 pb-3">
            {filtered.map(({ artifact, signal }) => {
              const on = artifact.id === selected?.artifact.id;
              return (
                <div
                  key={artifact.id}
                  className={`group relative w-full rounded-xl transition ${
                    on ? 'border border-cyan-300/25 bg-cyan-400/[0.07]' : 'border border-white/6 bg-white/[0.015] hover:bg-white/[0.04]'
                  }`}
                >
                  {/* Main click area */}
                  <button
                    type="button"
                    onClick={() => selectArtifact(artifact.id)}
                    className="w-full text-left"
                  >
                    {/* Thumbnail image */}
                    {(signal.imageUrl || signal.videoUrl) && (
                      <div className="relative w-full overflow-hidden rounded-t-xl" style={{ height: 140 }}>
                        {signal.videoUrl ? (
                          <video src={signal.videoUrl} muted playsInline className="h-full w-full object-cover" />
                        ) : (
                          <img src={signal.imageUrl!} alt={signal.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-2 left-3">
                          <ArtifactKindBadge kind={signal.kind} />
                        </div>
                      </div>
                    )}
                    <div className="px-3.5 pt-2.5 pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-white leading-tight">{signal.title}</p>
                          <p className="mt-0.5 truncate text-[10px] text-white/40">{artifact.agentName ?? 'Unassigned'}{artifact.taskTitle ? ` · ${artifact.taskTitle}` : ''}</p>
                        </div>
                        <span className="text-[9px] text-white/30 shrink-0">{formatTime(artifact.createdAt)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        {!(signal.imageUrl || signal.videoUrl) && <ArtifactKindBadge kind={signal.kind} />}
                        <StatusPill label={statusLabel(signal.status ?? 'draft')} tone={statusTone(signal.status ?? 'draft')} />
                        <StatusPill label={lifecycleLabel(artifact.lifecycleStatus)} tone="indigo" />
                      </div>
                    </div>
                  </button>
                  {/* Preview button — always visible */}
                  <div className="px-3.5 pb-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectArtifact(artifact.id);
                        setIgPreviewOpen(true);
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[10px] font-semibold transition"
                      style={{
                        background: 'rgba(139,92,246,0.1)',
                        border: '1px solid rgba(139,92,246,0.2)',
                        color: '#a78bfa',
                      }}
                    >
                      <Smartphone className="h-3 w-3" />
                      Instagram Önizle
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-10 text-center text-[11px] text-white/40">No artifacts match these filters.</div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <header className="border-b border-white/8 px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ArtifactKindBadge kind={selected.signal.kind} />
                      <StatusPill label={statusLabel(selected.signal.status ?? 'draft')} tone={statusTone(selected.signal.status ?? 'draft')} />
                      <StatusPill label={lifecycleLabel(selected.artifact.lifecycleStatus)} tone="indigo" />
                      {selected.signal.risk && <RiskBadge risk={selected.signal.risk} />}
                      {selected.signal.confidence !== undefined && <ConfidenceBadge value={selected.signal.confidence} />}
                    </div>
                    <h2 className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-white">{selected.signal.title}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                      <span>{selected.artifact.agentName ?? 'Unassigned agent'}</span>
                      <span>·</span>
                      <span>{selected.artifact.taskTitle ?? 'No task linked'}</span>
                      <span>·</span>
                      <span>{formatTime(selected.artifact.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setIgPreviewOpen(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-300/30 bg-violet-400/[0.12] px-3 py-2 text-[11px] font-semibold text-violet-200 hover:bg-violet-400/[0.18] transition"
                  >
                    <Smartphone className="h-3.5 w-3.5" />
                    Instagram Önizle
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 hover:bg-white/[0.07]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRerun(false)}
                    disabled={!selected.artifact.agentId}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/70 hover:bg-white/[0.07] disabled:opacity-40"
                  >
                    <RefreshCcw className="h-3.5 w-3.5" />
                    Rerun
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRerun(true)}
                    disabled={!selected.artifact.agentId}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-300/25 bg-violet-400/[0.10] px-3 py-2 text-[11px] text-violet-100 hover:bg-violet-400/[0.14] disabled:opacity-40"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Generate variant
                  </button>
                  {selected.signal.status === 'needs_approval' && (
                    <>
                      <button
                        type="button"
                        onClick={() => approveMutation.mutate(selected.artifact.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/[0.10] px-3 py-2 text-[11px] text-emerald-100 hover:bg-emerald-400/[0.16]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectMutation.mutate(selected.artifact.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-300/25 bg-rose-400/[0.10] px-3 py-2 text-[11px] text-rose-100 hover:bg-rose-400/[0.16]"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </header>

              <div className="scrollbar-thin grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="scrollbar-thin overflow-y-auto bg-black/25 p-6">
                  <ArtifactPreview signal={selected.signal} />
                </div>
                <aside className="scrollbar-thin space-y-5 overflow-y-auto border-t border-white/8 p-6 lg:border-l lg:border-t-0">
                  {(selected.signal.businessImpact || selected.signal.usageContext) && (
                    <GlassPanel tone="cyan" padding="p-5">
                      <SectionHeader title="Why it matters" />
                      <div className="space-y-3 text-sm leading-6 text-white/70">
                        {selected.signal.businessImpact && (
                          <div className="flex gap-3"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><span>{selected.signal.businessImpact}</span></div>
                        )}
                        {selected.signal.usageContext && (
                          <div className="flex gap-3"><FilterIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><span>{selected.signal.usageContext}</span></div>
                        )}
                      </div>
                    </GlassPanel>
                  )}
                  {workSteps.length > 0 && (
                    <GlassPanel tone="indigo" padding="p-5">
                      <SectionHeader title="Work evidence" />
                      <WorkEvidenceTimeline steps={workSteps} />
                    </GlassPanel>
                  )}
                </aside>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[12px] text-white/40">
              Select an artifact to preview.
            </div>
          )}
        </section>
      </div>

      {/* Instagram Preview Modal */}
      {igPreviewOpen && selected && (
        <InstagramPreviewModal
          signal={selected.signal}
          onClose={() => setIgPreviewOpen(false)}
          brandName={companyProfile?.brandName}
          instagramHandle={companyProfile?.instagramHandle}
          logoUrl={companyProfile?.logoUrl}
        />
      )}
    </div>
  );
}

// ── Instagram Preview Modal ────────────────────────────────────────────────────

// ── SVG icons matching Instagram's exact design ──────────────────────────────
const IgHeart = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);
const IgComment = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IgShare = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);
const IgBookmark = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
  </svg>
);
const IgMore = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
  </svg>
);
const IgHome = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);
const IgSearch = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IgAdd = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);
const IgReels = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="2" y="2" width="20" height="20" rx="4"/><path d="M8 5l10 7-10 7V5z" fill="currentColor" stroke="none"/>
  </svg>
);
const IgProfile = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

function InstagramPreviewModal({
  signal, onClose, brandName, instagramHandle, logoUrl,
}: {
  signal: ArtifactSignal;
  onClose: () => void;
  brandName?: string;
  instagramHandle?: string;
  logoUrl?: string;
}) {
  const isStory = signal.kind === 'instagram_story';
  const isReel = signal.kind === 'instagram_reel';
  const imageUrl = signal.imageUrl ?? null;
  const videoUrl = signal.videoUrl ?? null;
  const caption = signal.caption ?? signal.summary ?? '';
  const hashtags = signal.hashtags ?? [];

  // Priority: signal.brand → instagramHandle prop → brandName → fallback
  const rawHandle = signal.brand?.handle || instagramHandle || brandName || 'yourbrand';
  const handle = rawHandle.replace('@', '').replace(/\s+/g, '').toLowerCase();
  const displayName = brandName || handle;
  const avatarUrl = signal.brand?.avatarUrl || logoUrl || null;

  const seed = handle.length + (caption.length % 100);
  const likes = 1247 + (seed * 37) % 8000;
  const comments = 38 + (seed * 3) % 200;

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const PHONE_W = isStory || isReel ? 340 : 390;

  // Reusable avatar circle with real logo if available
  const Avatar = ({ size = 32, ring = true }: { size?: number; ring?: boolean }) => (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: ring ? 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' : 'transparent',
      padding: ring ? 2 : 0,
    }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', padding: ring ? 1.5 : 0, overflow: 'hidden' }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={handle} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} referrerPolicy="no-referrer" />
        ) : (
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: size * 0.35, fontWeight: 700 }}>{handle[0]?.toUpperCase()}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)' }}
      onClick={onClose}
    >
      <div className="relative flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
          {[
            { label: 'Post', kind: 'instagram_post' as const },
            { label: 'Story', kind: 'instagram_story' as const },
            { label: 'Reel', kind: 'instagram_reel' as const },
          ].map((t) => (
            <button key={t.kind} type="button"
              className="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition"
              style={{
                background: signal.kind === t.kind ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: signal.kind === t.kind ? '#fff' : 'rgba(255,255,255,0.4)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Phone shell */}
        <div
          className="relative select-none overflow-hidden"
          style={{
            width: PHONE_W,
            borderRadius: 48,
            background: '#000',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 0 0 3px #1a1a1a, 0 40px 80px rgba(0,0,0,0.9)',
          }}
        >
          {/* Side buttons (decorative) */}
          <div style={{ position: 'absolute', left: -3, top: 120, width: 3, height: 32, background: '#2a2a2a', borderRadius: '2px 0 0 2px' }} />
          <div style={{ position: 'absolute', left: -3, top: 168, width: 3, height: 60, background: '#2a2a2a', borderRadius: '2px 0 0 2px' }} />
          <div style={{ position: 'absolute', left: -3, top: 240, width: 3, height: 60, background: '#2a2a2a', borderRadius: '2px 0 0 2px' }} />
          <div style={{ position: 'absolute', right: -3, top: 160, width: 3, height: 80, background: '#2a2a2a', borderRadius: '0 2px 2px 0' }} />

          {/* Status bar */}
          <div style={{ background: isStory || isReel ? '#000' : '#fff', paddingTop: 14, paddingBottom: 4, paddingLeft: 24, paddingRight: 24 }}
            className="flex items-center justify-between">
            <span style={{ fontSize: 15, fontWeight: 600, color: isStory || isReel ? '#fff' : '#000', fontFamily: '-apple-system,sans-serif' }}>{timeStr}</span>
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)' }}>
              {/* Dynamic island */}
              <div style={{ width: 120, height: 34, background: '#000', borderRadius: 20 }} />
            </div>
            <div className="flex items-center gap-1.5">
              {/* Signal */}
              <svg width="17" height="12" viewBox="0 0 17 12" fill={isStory || isReel ? '#fff' : '#000'}>
                <rect x="0" y="7" width="3" height="5" rx="1"/><rect x="4.5" y="5" width="3" height="7" rx="1"/>
                <rect x="9" y="2.5" width="3" height="9.5" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/>
              </svg>
              {/* Wifi */}
              <svg width="16" height="12" viewBox="0 0 16 12" fill={isStory || isReel ? '#fff' : '#000'}>
                <path d="M8 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8 6C5.8 6 3.8 6.8 2.3 8.2l1.4 1.4A5.96 5.96 0 0 1 8 8c1.6 0 3 .6 4.1 1.6l1.5-1.4A8 8 0 0 0 8 6zM8 2C4.6 2 1.5 3.3-.1 5.5l1.4 1.4C2.9 4.9 5.3 3.8 8 3.8s5.1 1.1 6.7 3.1l1.4-1.4C14.5 3.3 11.4 2 8 2z"/>
              </svg>
              {/* Battery */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <div style={{ width: 24, height: 12, border: `1.5px solid ${isStory || isReel ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)'}`, borderRadius: 3, padding: 2, display: 'flex' }}>
                  <div style={{ flex: 1, background: isStory || isReel ? '#fff' : '#000', borderRadius: 1.5 }} />
                </div>
                <div style={{ width: 1.5, height: 5, background: isStory || isReel ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', borderRadius: 1 }} />
              </div>
            </div>
          </div>

          {/* ────────── STORY / REEL ────────── */}
          {(isStory || isReel) && (
            <div style={{ background: '#000', position: 'relative' }}>
              {/* Story: progress bars */}
              {isStory && (
                <div style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 10, display: 'flex', gap: 3 }}>
                  <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.35)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 2 }} />
                  </div>
                  <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.35)', borderRadius: 2 }} />
                  <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.35)', borderRadius: 2 }} />
                </div>
              )}
              {/* Story header */}
              <div style={{ position: 'absolute', top: isStory ? 18 : 8, left: 0, right: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
                <Avatar size={32} ring />
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: '-apple-system,sans-serif', flex: 1 }}>{handle}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: '-apple-system,sans-serif' }}>1s</span>
                <span style={{ color: '#fff', fontSize: 20, opacity: 0.8 }}>···</span>
                <span style={{ color: '#fff', fontSize: 20, opacity: 0.8 }}>✕</span>
              </div>
              {/* Media */}
              <div style={{ width: '100%', aspectRatio: '9/16', overflow: 'hidden', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {videoUrl ? (
                  <video src={videoUrl} autoPlay muted loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : imageUrl ? (
                  <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#4F46E5,#7C3AED,#DB2777)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, padding: '0 24px', textAlign: 'center', fontFamily: '-apple-system,sans-serif' }}>{caption.slice(0, 80) || signal.title}</p>
                  </div>
                )}
                {/* Bottom gradient overlay */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }} />
                {/* Caption overlay */}
                {caption && (
                  <div style={{ position: 'absolute', bottom: 80, left: 16, right: 60, zIndex: 5 }}>
                    <p style={{ color: '#fff', fontSize: 13, lineHeight: 1.5, fontFamily: '-apple-system,sans-serif', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {caption.slice(0, 150)}
                    </p>
                  </div>
                )}
                {/* Right actions (Reel) */}
                {isReel && (
                  <div style={{ position: 'absolute', right: 12, bottom: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 5 }}>
                    {[{ Icon: IgHeart, label: likes.toLocaleString() }, { Icon: IgComment, label: String(comments) }, { Icon: IgShare, label: '' }].map(({ Icon, label }, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ color: '#fff' }}><Icon /></div>
                        {label && <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: '-apple-system,sans-serif' }}>{label}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Story reply bar */}
              <div style={{ background: '#000', padding: '12px 12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, border: '1px solid rgba(255,255,255,0.35)', borderRadius: 24, padding: '8px 16px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: '-apple-system,sans-serif' }}>Mesaj gönder…</span>
                </div>
                <div style={{ color: '#fff', fontSize: 22 }}>❤️</div>
                <div style={{ color: '#fff' }}><IgShare /></div>
              </div>
            </div>
          )}

          {/* ────────── FEED POST ────────── */}
          {!isStory && !isReel && (
            <div style={{ background: '#fff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
              {/* IG App Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px', borderBottom: '0.5px solid #dbdbdb' }}>
                <svg width="100" height="28" viewBox="0 0 120 36" fill="none">
                  <text x="0" y="28" fontFamily="'Billabong',cursive,sans-serif" fontSize="32" fill="#000">Instagram</text>
                </svg>
                <div style={{ display: 'flex', gap: 18 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                  </svg>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
              </div>

              {/* Stories row */}
              <div style={{ padding: '12px 0', borderBottom: '0.5px solid #dbdbdb', overflowX: 'hidden' }}>
                <div style={{ display: 'flex', gap: 12, paddingLeft: 14 }}>
                  {/* First story = current brand */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: 2 }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#fff', padding: 1.5, overflow: 'hidden' }}>
                        {avatarUrl ? (
                          <img src={avatarUrl} alt={handle} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg,#667eea,#764ba2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>{handle[0]?.toUpperCase()}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#262626', maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{handle}</span>
                  </div>
                  {/* Placeholder stories */}
                  {['story2', 'story3', 'story4'].map((s) => (
                    <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', padding: 2 }}>
                        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#e8e8e8' }} />
                      </div>
                      <span style={{ fontSize: 11, color: '#262626' }}>•••</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Post header */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 10 }}>
                <Avatar size={32} ring />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', lineHeight: 1.3 }}>{handle}</div>
                  <div style={{ fontSize: 11, color: '#8e8e8e' }}>{displayName !== handle ? displayName : 'Sponsored'}</div>
                </div>
                <div style={{ color: '#262626' }}><IgMore /></div>
              </div>

              {/* Post image — square 1:1 */}
              <div style={{ width: '100%', aspectRatio: '1/1', background: '#efefef', overflow: 'hidden' }}>
                {imageUrl ? (
                  <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} referrerPolicy="no-referrer" />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#f5f5f5,#e8e8e8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    </div>
                    <p style={{ color: '#aaa', fontSize: 12, textAlign: 'center', padding: '0 32px' }}>{signal.title}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ padding: '6px 12px 2px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ color: '#262626' }}><IgHeart /></div>
                <div style={{ color: '#262626' }}><IgComment /></div>
                <div style={{ color: '#262626' }}><IgShare /></div>
                <div style={{ marginLeft: 'auto', color: '#262626' }}><IgBookmark /></div>
              </div>

              {/* Likes */}
              <div style={{ padding: '0 12px 4px' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#262626' }}>{likes.toLocaleString()} beğenme</span>
              </div>

              {/* Caption */}
              <div style={{ padding: '0 12px 4px', fontSize: 14, color: '#262626', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600 }}>{handle}</span>
                {' '}
                <span>{caption.slice(0, 120)}{caption.length > 120 ? '… ' : ' '}</span>
                {hashtags.slice(0, 5).map((h, i) => (
                  <span key={`${h}-${i}`} style={{ color: '#00376b' }}>{h.startsWith('#') ? h : `#${h}`} </span>
                ))}
              </div>

              {/* Comments */}
              <div style={{ padding: '0 12px 4px' }}>
                <span style={{ fontSize: 14, color: '#8e8e8e' }}>Yorumların tümünü gör ({comments})</span>
              </div>
              <div style={{ padding: '0 12px 8px', fontSize: 11, color: '#c7c7c7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>1 SAAT ÖNCE</div>

              {/* Comment input */}
              <div style={{ borderTop: '0.5px solid #dbdbdb', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e0e0e0', flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: '#c7c7c7', flex: 1 }}>Yorum ekle…</span>
                <span style={{ fontSize: 20 }}>😊</span>
              </div>

              {/* IG Bottom nav */}
              <div style={{ borderTop: '0.5px solid #dbdbdb', padding: '10px 0 6px', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                {[IgHome, IgSearch, IgAdd, IgReels, IgProfile].map((Icon, i) => (
                  <div key={i} style={{ color: i === 0 ? '#000' : '#8e8e8e', padding: '4px 8px' }}>
                    <Icon />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Home indicator */}
          <div style={{ background: isStory || isReel ? '#000' : '#fff', paddingBottom: 8, paddingTop: 6, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 134, height: 5, borderRadius: 3, background: isStory || isReel ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)' }} />
          </div>
        </div>

        {/* Close + label */}
        <div className="flex items-center justify-between w-full px-1">
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>Önizleme amaçlıdır</p>
          <button type="button" onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white/60 hover:text-white transition"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <X className="h-3.5 w-3.5" /> Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

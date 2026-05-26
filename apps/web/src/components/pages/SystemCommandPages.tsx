'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { trPageTitle } from '@/lib/i18n/tr-shell';
import type { DashboardArtifact } from '@/lib/dashboard-mappers';
import {
  ArtifactKindBadge,
  signalFromArtifact,
  statusTone,
  type ArtifactSignal,
} from '@/components/artifacts/artifact-preview';
import { useNavigationStore } from '@/stores/navigation-store';
import { cn } from '@/lib/utils';
import {
  EmptyState,
  GlassPanel,
  LoadingSkeleton,
  MetricCard,
  ProviderStatusCard,
  ReadinessChecklist,
  SectionHeader,
  StatusPill,
} from '@/tailadmin/components/application/PageElements';

function formatArtifactDate(value?: string): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

const LIFECYCLE_LABEL_TR: Record<string, string> = {
  draft: 'Taslak',
  review: 'İncelemede',
  approved: 'Onaylı',
  generated: 'Üretildi',
  exported: 'Dışa aktarıldı',
  scheduled: 'Zamanlandı',
  published: 'Yayında',
  failed: 'Hata',
};

const REVIEW_STATUS_LABEL_TR: Record<string, string> = {
  pending_review: 'İnceleme bekliyor',
  approved: 'Onaylı',
  rejected: 'Reddedildi',
  archived: 'Arşiv',
};

function lifecycleTone(
  life?: string,
): 'emerald' | 'amber' | 'cyan' | 'rose' | 'neutral' {
  const v = (life ?? '').toLowerCase();
  if (v === 'approved' || v === 'exported' || v === 'published' || v === 'generated') return 'emerald';
  if (v === 'failed') return 'rose';
  if (v === 'scheduled') return 'cyan';
  return 'amber';
}

function buildReportCardDescription(signal: ArtifactSignal): string {
  const parts: string[] = [];
  if (signal.summary?.trim()) parts.push(signal.summary.trim());
  if (!signal.summary?.trim() && signal.caption?.trim()) {
    const firstLine = signal.caption.trim().split('\n')[0] ?? '';
    parts.push(firstLine.slice(0, 280));
  }
  if (signal.businessImpact?.trim()) parts.push(signal.businessImpact.trim());
  if (signal.review?.original && !signal.summary?.trim()) {
    const o = signal.review.original.trim();
    const clip = o.length > 200 ? `${o.slice(0, 200)}…` : o;
    parts.push(`${signal.review.reviewer}: ${clip}`);
  }
  const budget = signal.budgetChanges?.[0];
  if (budget) {
    parts.push(
      `Günlük bütçe ${budget.current} → ${budget.recommended}${budget.name ? ` · ${budget.name}` : ''}`,
    );
  }
  if (signal.metrics?.length) {
    parts.push(
      signal.metrics
        .slice(0, 2)
        .map((m) => `${m.label}: ${m.value}`)
        .join(' · '),
    );
  }
  const firstInsight = signal.insights?.[0]?.title;
  if (firstInsight) parts.push(firstInsight);
  const merged = parts.filter(Boolean).slice(0, 3).join('\n');
  if (merged) return merged;
  return 'Özet otomatik çıkarılamadı; teknik içeriği açarak ham veriye bakabilirsiniz.';
}

const PERMISSION_LABELS: Record<string, { label: string; detail: string }> = {
  'actions.approve': {
    label: 'Approve AI Actions',
    detail: 'Can approve AI-generated actions before execution.',
  },
  'actions.reject': {
    label: 'Reject AI Actions',
    detail: 'Can reject suggested actions that should not run.',
  },
  'provider.execute.dry_run': {
    label: 'Run Provider Dry Runs',
    detail: 'Can test provider actions without making live changes.',
  },
  'provider.execute.live': {
    label: 'Execute Live Provider Actions',
    detail: 'Can trigger approved actions against connected providers.',
  },
  'artifacts.review': {
    label: 'Review AI Outputs',
    detail: 'Can inspect generated artifacts and operational output.',
  },
  'integrations.manage': {
    label: 'Manage Integrations',
    detail: 'Can configure provider accounts and connection settings.',
  },
  'billing.manage': {
    label: 'Manage Billing',
    detail: 'Can manage plans, quotas and billing controls.',
  },
  'users.manage': {
    label: 'Manage Users',
    detail: 'Can invite, update and manage workspace users.',
  },
  'operations.view': {
    label: 'View Operations',
    detail: 'Can monitor agent runs, executions and system health.',
  },
};

function formatPermission(permission: string) {
  const known = PERMISSION_LABELS[permission];
  if (known) return known;

  return {
    label: permission
      .split('.')
      .map((part) => part.replace(/_/g, ' '))
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' / '),
    detail: 'Granted to current role.',
  };
}

export function SeoPage() {
  const { data } = useQuery({
    queryKey: ['analytics-dashboard', '30daysAgo'],
    queryFn: () => apiClient.getAnalyticsDashboard('30daysAgo'),
    staleTime: 60_000,
  });
  const queries = data?.search_queries ?? [];
  const pages = data?.pages ?? [];
  const opportunity = queries.filter((query: any) => Number(query.position) > 10 && Number(query.impressions) > 100).length;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
    <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <Search className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">Search Growth Intelligence</span>
          </div>
          <h1 className="text-3xl font-light tracking-[-0.035em] text-white">SEO <span className="font-semibold" style={{ color: '#34d399' }}>Intelligence</span></h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">Search Console signals translated into AI content opportunities and local SEO tasks.</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Tracked Queries" value={queries.length} helper="Search Console" icon={Search} tone="emerald" />
        <MetricCard label="Opportunities" value={opportunity} helper="high impression, low rank" icon={Sparkles} tone="amber" />
        <MetricCard label="Landing Pages" value={pages.length} helper="content surfaces" icon={FileText} tone="cyan" />
        <MetricCard label="AI Actions" value="Guarded" helper="approval-first" icon={ShieldCheck} tone="violet" />
      </div>
      <GlassPanel tone="emerald">
        <SectionHeader title="Query Opportunity Board" subtitle="Queries ready for AI content or optimization suggestions." count={queries.length} />
        <div className="grid gap-3 md:grid-cols-2">
          {queries.slice(0, 10).map((query: any) => (
            <div key={query.query} className="rounded-2xl border border-white/8 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{query.query}</p>
                  <p className="mt-1 text-xs text-white/38">{query.impressions} impressions · {query.clicks} clicks · CTR {query.ctr}%</p>
                </div>
                <StatusPill label={`#${query.position}`} tone={Number(query.position) <= 10 ? 'emerald' : 'amber'} />
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
    </div>
  );
}

export function ReadinessPage() {
  const { data: snapshot } = useDashboardSnapshot();
  const { data: integrations = [] } = useQuery({ queryKey: ['integrations'], queryFn: () => apiClient.getIntegrations() });
  const { data: operations } = useQuery({ queryKey: ['operations-summary'], queryFn: () => apiClient.getOperationsSummary(), staleTime: 30_000 });

  const connectedProviders = integrations.filter((item) => String(item.status) === 'Connected').length;
  const blockedAgents = snapshot?.agents.filter((agent) => agent.state === 'blocked' || agent.state === 'error').length ?? 0;
  const failureRate = operations?.health.providerFailureRate ?? 0;
  const hasCorrelation = Boolean(operations?.correlationId);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
    <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">Production Safety</span>
        </div>
        <h1 className="text-3xl font-light tracking-[-0.035em] text-white">Live Mode <span className="font-semibold" style={{ color: '#22c55e' }}>Readiness</span></h1>
        <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">Is the system ready to go from mock/dry-run to live? This page measures it.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Connected Providers" value={connectedProviders} helper={`${integrations.length} configured`} icon={CheckCircle2} tone="emerald" />
        <MetricCard label="Blocked Agents" value={blockedAgents} helper="must be zero for launch" icon={ShieldCheck} tone={blockedAgents > 0 ? 'rose' : 'emerald'} />
        <MetricCard label="Failure Rate" value={`${failureRate}%`} helper="provider jobs" icon={BarChart3} tone={failureRate > 5 ? 'rose' : 'emerald'} />
        <MetricCard label="Approval Guard" value="On" helper="human in loop" icon={Lock} tone="cyan" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <GlassPanel tone="emerald">
          <SectionHeader title="Readiness Checklist" subtitle="What must be true before the first customer live trial." />
          <ReadinessChecklist
            items={[
              { label: 'Mock mode intentionally configured', complete: true, detail: 'SMART_AGENCY_MOCK and ActionExecution mode must be reviewed before pilot.' },
              { label: 'Provider accounts connected', complete: connectedProviders > 0, detail: 'OAuth/manual tokens must be active and mapped to agents.' },
              { label: 'No blocked agents', complete: blockedAgents === 0, detail: 'Blocked or failed agent states require operator resolution.' },
              { label: 'Provider failure rate acceptable', complete: failureRate <= 5, detail: 'Provider jobs should be stable before live writes.' },
              { label: 'Approvals required for live actions', complete: true, detail: 'Budget, publishing and review replies remain approval-first.' },
              { label: 'Operations correlation id active', complete: hasCorrelation, detail: 'Every readiness check should include a correlation id for debugging.' },
            ]}
          />
        </GlassPanel>
        <GlassPanel tone="violet" className="h-fit">
          <SectionHeader title="Provider Status" subtitle="Live readiness by account." count={integrations.length} />
          <div className="space-y-3">
            {integrations.map((item) => (
              <ProviderStatusCard
                key={item.id}
                name={item.displayName || item.provider}
                status={String(item.status)}
                tone={String(item.status) === 'Connected' ? 'emerald' : 'amber'}
                detail={item.accountId || 'No account id shown'}
              />
            ))}
          </div>
        </GlassPanel>
      </div>
    </div>
    </div>
  );
}

export function ReportsPage() {
  const navigate = useNavigationStore((s) => s.navigate);
  const { data, isLoading } = useDashboardSnapshot();
  const agents = data?.agents ?? [];
  const tasks = data?.tasks ?? [];
  const artifacts = data?.artifacts ?? [];
  const reports = artifacts.filter((artifact) => artifact.type.toLowerCase().includes('report'));
  const reportReady = artifacts.filter(
    (artifact) =>
      artifact.status === 'approved' ||
      artifact.lifecycleStatus === 'exported' ||
      artifact.lifecycleStatus === 'published',
  );
  const canvaAssets = artifacts.filter(
    (artifact) => artifact.metadata?.provider === 'canva' || artifact.metadata?.canvaDesignId,
  );

  const tr = trPageTitle('reports');

  const sortedCards = useMemo(() => {
    const enriched = artifacts.map((artifact) => {
      const task = tasks.find((t) => t.id === artifact.taskId);
      const agent = agents.find((a) => a.id === task?.assignedAgent);
      const signal = signalFromArtifact({
        ...artifact,
        agentName: agent?.name,
      });
      return { artifact, signal };
    });

    const rank = (s: ArtifactSignal['status']) => {
      if (s === 'approved' || s === 'executed') return 2;
      if (s === 'needs_approval') return 0;
      return 1;
    };

    return [...enriched].sort((a, b) => {
      const d = rank(b.signal.status ?? 'draft') - rank(a.signal.status ?? 'draft');
      if (d !== 0) return d;
      return new Date(b.artifact.createdAt).getTime() - new Date(a.artifact.createdAt).getTime();
    });
  }, [artifacts, tasks, agents]);

  if (isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: '#07080f' }}>
        <p className="text-[13px] text-slate-600">Loading customer reports…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
    <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <FileText className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-400">Customer Intelligence</span>
          </div>
          <h1 className="text-3xl font-light tracking-[-0.035em] text-white">{tr.title}</h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">{tr.subtitle}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate('outputs')}
            className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-indigo-300 transition hover:text-white"
            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            Artifact Center
          </button>
          <button type="button" onClick={() => window.print()}
            className="rounded-xl px-4 py-2.5 text-[13px] font-semibold text-slate-400 transition hover:text-white"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Print / PDF
          </button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Reports" value={reports.length} helper="Report-type artifacts" icon={FileText} tone="indigo" />
        <MetricCard label="Total Outputs" value={artifacts.length} helper="All produced assets" icon={BrainCircuit} tone="violet" />
        <MetricCard label="Ready" value={reportReady.length} helper="Approved or exported" icon={CheckCircle2} tone="emerald" />
        <MetricCard label="Canva Assets" value={canvaAssets.length} helper="Design-linked" icon={Sparkles} tone="cyan" />
      </div>
      <GlassPanel tone="indigo">
        <SectionHeader
          title="Report & Output Cards"
          subtitle="JSON hidden by default — readable summary at top, expandable technical view below."
          count={artifacts.length}
        />
        {artifacts.length === 0 ? (
          <EmptyState title="No outputs yet" description="Agent task completions will appear here. Run a task from the AI Agents Office first." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedCards.slice(0, 24).map(({ artifact, signal }) => (
              <ReportArtifactCard key={artifact.id} artifact={artifact} signal={signal} />
            ))}
          </div>
        )}
        {artifacts.length > 24 && (
          <p className="mt-4 text-center text-xs text-white/45">Showing first 24 records. Open Artifact Center for the full list.</p>
        )}
      </GlassPanel>
    </div>
    </div>
  );
}

function ReportArtifactCard({
  artifact,
  signal,
}: {
  artifact: DashboardArtifact;
  signal: ArtifactSignal;
}) {
  const life = artifact.lifecycleStatus ?? 'review';
  const review = artifact.status;
  const description = buildReportCardDescription(signal);
  const rawJson =
    typeof artifact.content === 'string'
      ? artifact.content
      : JSON.stringify(signal.rawPayload ?? {}, null, 2);

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-black/25 p-4 shadow-sm transition',
        'hover:border-indigo-400/25 hover:from-white/[0.08]',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <ArtifactKindBadge kind={signal.kind} />
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusPill
            label={LIFECYCLE_LABEL_TR[life] ?? life}
            tone={lifecycleTone(life)}
            icon={Sparkles}
          />
          <StatusPill
            label={REVIEW_STATUS_LABEL_TR[review] ?? review}
            tone={statusTone(signal.status ?? 'draft')}
            icon={review === 'approved' ? CheckCircle2 : FileText}
          />
        </div>
      </div>

      <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-white">{signal.title}</h3>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/40">
        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-medium uppercase tracking-wide text-white/50">
          {artifact.type}
        </span>
        {signal.agentSource ? (
          <span className="text-white/55">{signal.agentSource}</span>
        ) : null}
        <span className="inline-flex items-center gap-1 text-white/45">
          <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
          {formatArtifactDate(artifact.createdAt)}
        </span>
      </div>

      <p className="mt-3 whitespace-pre-line line-clamp-4 text-sm leading-relaxed text-white/75">
        {description}
      </p>

      {signal.usageContext ? (
        <p className="mt-2 text-[11px] font-medium text-indigo-200/90">{signal.usageContext}</p>
      ) : null}

      <details className="mt-auto pt-3">
        <summary className="cursor-pointer text-[11px] font-medium text-white/40 transition hover:text-white/60">
          Teknik içerik (ham JSON)
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 text-[10px] leading-relaxed text-emerald-100/70">
          {rawJson.length > 6000 ? `${rawJson.slice(0, 6000)}\n…` : rawJson}
        </pre>
      </details>
    </article>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('User');
  const { data: security } = useQuery({
    queryKey: ['current-user-security'],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    staleTime: 60_000,
  });
  const canManageUsers = security?.permissions?.includes('users.manage') === true;
  const { data: users = [] } = useQuery({
    queryKey: ['tenant-users'],
    queryFn: () => apiClient.getUsers(),
    enabled: canManageUsers,
    staleTime: 30_000,
  });
  const inviteMutation = useMutation({
    mutationFn: () => apiClient.inviteUser({ email: inviteEmail, displayName: inviteName, role: inviteRole }),
    onSuccess: async () => {
      setInviteEmail('');
      setInviteName('');
      await queryClient.invalidateQueries({ queryKey: ['tenant-users'] });
    },
  });
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => apiClient.updateUserRole(id, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-users'] }),
  });
  const activeMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.updateUserActive(id, isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenant-users'] }),
  });
  const inviteError = inviteMutation.error ? toUserFriendlyApiError(inviteMutation.error, 'Kullanıcı davet edilemedi.') : null;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
    <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)' }}>
          <Settings className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Enterprise Controls</span>
        </div>
        <h1 className="text-3xl font-light tracking-[-0.035em] text-white">Settings <span className="font-semibold text-slate-300">& Security</span></h1>
        <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">Role, permissions, tenant context and live execution controls in one compact panel.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Role" value={security?.role ?? 'Operator'} helper={security?.email} icon={Lock} tone="neutral" />
        <MetricCard label="Permissions" value={security?.permissions?.length ?? 0} helper="current user" icon={ShieldCheck} tone="cyan" />
        <MetricCard label="Demo Fallback" value={security?.isDemoFallback ? 'Yes' : 'No'} helper="auth state" icon={Sparkles} tone={security?.isDemoFallback ? 'amber' : 'emerald'} />
        <MetricCard label="Tenant" value="Active" helper={security?.tenantId} icon={BrainCircuit} tone="violet" />
      </div>
      <GlassPanel tone="neutral">
        <SectionHeader title="Permission Model" subtitle="Live actions should be explicit and auditable." />
        <div className="grid gap-4 md:grid-cols-2">
          {(security?.permissions ?? []).map((permission) => {
            const formatted = formatPermission(permission);
            return (
              <div key={permission} className="min-h-[86px] rounded-2xl border border-white/8 bg-black/20 p-5">
                <p className="break-words pl-1 text-sm font-semibold leading-5 text-white">{formatted.label}</p>
                <p className="mt-2 pl-1 text-xs leading-5 text-white/38">{formatted.detail}</p>
              </div>
            );
          })}
        </div>
      </GlassPanel>
      <GlassPanel tone="neutral">
        <SectionHeader title="User Invite & Role Admin" subtitle="Manage workspace users with basic RBAC roles." />
        {!canManageUsers ? (
          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4 text-sm text-amber-100/70">
            This panel requires the `users.manage` permission.
          </div>
        ) : (
          <div className="space-y-5">
            <form
              className="grid gap-3 lg:grid-cols-[1fr_1fr_160px_150px]"
              onSubmit={(event) => {
                event.preventDefault();
                inviteMutation.mutate();
              }}
            >
              <SecurityInput value={inviteEmail} onChange={setInviteEmail} placeholder="email@company.com" type="email" />
              <SecurityInput value={inviteName} onChange={setInviteName} placeholder="Display name" />
              <RoleSelect value={inviteRole} onChange={setInviteRole} />
              <button
                type="submit"
                disabled={inviteMutation.isPending || !inviteEmail}
                className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </button>
            </form>
            {inviteError && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                <p className="font-semibold">{inviteError.title}</p>
                <p className="mt-1 text-xs leading-5 text-rose-100/70">{inviteError.detail}</p>
                {inviteError.hint && <p className="mt-2 text-xs text-rose-100/60">Suggestion: {inviteError.hint}</p>}
              </div>
            )}
            <div className="grid gap-3">
              {users.map((user) => (
                <div key={user.id} className="grid gap-3 rounded-2xl border border-white/8 bg-black/20 p-4 lg:grid-cols-[1fr_160px_120px] lg:items-center">
                  <div>
                    <p className="text-sm font-semibold text-white">{user.displayName || user.email}</p>
                    <p className="mt-1 text-xs text-white/38">{user.email} · {user.inviteAcceptedAt ? 'accepted' : user.invitedAt ? 'invited' : 'active'}</p>
                  </div>
                  <RoleSelect value={user.role} onChange={(role) => roleMutation.mutate({ id: user.id, role })} />
                  <button
                    type="button"
                    onClick={() => activeMutation.mutate({ id: user.id, isActive: !user.isActive })}
                    disabled={user.id === security?.userId}
                    className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${user.isActive ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-zinc-500/20 bg-zinc-500/10 text-zinc-300'} disabled:opacity-40`}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
    </div>
  );
}

function SecurityInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-indigo-400/50"
    />
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400/50"
    >
      {['Owner', 'Admin', 'Manager', 'Reviewer', 'Operator', 'Analyst', 'Viewer', 'User'].map((role) => (
        <option key={role} value={role}>{role}</option>
      ))}
    </select>
  );
}

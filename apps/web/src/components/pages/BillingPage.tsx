'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, Bot, Check, CreditCard, Shield, Sparkles, Zap, TrendingUp } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { PackageDefinition, UsageQuotaMetric } from '@/types';
import {
  GlassPanel,
  ProviderStatusCard,
  QuotaMeter,
  SectionHeader,
  StatusPill,
} from '@/tailadmin/components/application/PageElements';

function safeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
  }
  return [];
}

function quotaValue(metric?: UsageQuotaMetric) {
  if (!metric) return { used: 0, limit: 0 };
  return { used: metric.used ?? 0, limit: metric.isUnlimited ? Math.max(metric.used ?? 0, 100) : metric.limit ?? 0 };
}

function MetricTile({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: React.FC<React.SVGProps<SVGSVGElement>>; color: string;
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(13,14,22,0.8)', border: `1px solid rgba(255,255,255,0.07)`, boxShadow: `0 0 30px ${color}10` }}>
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

function PackageCard({ pkg, active, onSelect }: { pkg: PackageDefinition; active: boolean; onSelect: () => void }) {
  const features = safeArray(pkg.features);
  const agents = safeArray(pkg.includedAgentTypes);
  return (
    <div
      className="relative flex min-h-[400px] flex-col rounded-2xl p-5 transition hover:scale-[1.01]"
      style={{
        background: active ? 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(99,102,241,0.06))' : 'rgba(13,14,22,0.8)',
        border: active ? '1px solid rgba(34,211,238,0.25)' : '1px solid rgba(255,255,255,0.07)',
        boxShadow: active ? '0 0 30px rgba(34,211,238,0.08)' : 'none',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[16px] font-semibold tracking-tight text-white/90">{pkg.name}</p>
          <p className="mt-1 text-[12px] leading-5 text-slate-600">{pkg.description}</p>
        </div>
        {active && (
          <span className="shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            Active
          </span>
        )}
      </div>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-4xl font-light tracking-[-0.04em] text-white metric-value">{pkg.monthlyPrice?.toLocaleString('tr-TR') ?? '—'}₺</span>
        <span className="text-[12px] text-slate-600">/mo</span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-700">{pkg.yearlyPrice?.toLocaleString('tr-TR') ?? '—'}₺ yearly</p>
      <div className="mt-5 flex-1 space-y-2">
        {features.slice(0, 6).map((f) => (
          <div key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-500" />
            <span className="text-[12px] text-slate-500">{f}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl px-3 py-2 text-[11px] text-slate-600" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {agents.length} agent line{agents.length !== 1 ? 's' : ''} included
      </div>
      <button
        type="button"
        disabled={active}
        onClick={onSelect}
        className="mt-4 w-full rounded-xl py-2.5 text-[13px] font-semibold transition hover:opacity-90 disabled:opacity-50"
        style={active ? { background: 'rgba(255,255,255,0.05)', color: '#64748b' } : { background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: '#22d3ee' }}
      >
        {active ? 'Current plan' : 'Select plan'}
      </button>
    </div>
  );
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { data: packages = [] } = useQuery({ queryKey: ['packages-all'], queryFn: () => apiClient.getPackages() });
  const { data: subscription } = useQuery({ queryKey: ['my-subscription'], queryFn: () => apiClient.getSubscription() });
  const { data: usage } = useQuery({ queryKey: ['usage-quota'], queryFn: () => apiClient.getUsageQuota(), refetchInterval: 20_000 });
  const { data: integrations = [] } = useQuery({ queryKey: ['integrations'], queryFn: () => apiClient.getIntegrations() });

  const selectPackage = useMutation({
    mutationFn: (packageId: string) => apiClient.selectPackage(packageId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['my-subscription'] }),
        queryClient.invalidateQueries({ queryKey: ['usage-quota'] }),
      ]);
    },
  });

  const activePackageId = subscription?.packageId;
  const activePackage = packages.find((p) => p.id === activePackageId);
  const agentRuns = quotaValue(usage?.agentRuns);
  const providerActions = quotaValue(usage?.providerActions);
  const liveActions = quotaValue(usage?.liveProviderActions);
  const tokens = quotaValue(usage?.tokens);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-400">Commercial OS</span>
            </div>
            <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
              Billing <span className="font-semibold" style={{ color: '#22c55e' }}>& Usage</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">Package limits, quota meters, token budgets and integration readiness in one panel.</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: 'rgba(13,14,22,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Current Plan</p>
            <p className="mt-2 text-2xl font-light text-white">{activePackage?.name ?? 'No plan selected'}</p>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="Agent Runs" value={agentRuns.used} sub={`limit ${agentRuns.limit}`} icon={Bot} color="#a78bfa" />
          <MetricTile label="Provider Actions" value={providerActions.used} sub={`limit ${providerActions.limit}`} icon={BarChart3} color="#22d3ee" />
          <MetricTile label="Live Actions" value={liveActions.used} sub={`limit ${liveActions.limit}`} icon={Shield} color={liveActions.used > 0 ? '#22c55e' : '#f59e0b'} />
          <MetricTile label="LLM Tokens" value={tokens.used} sub={`limit ${tokens.limit}`} icon={Zap} color="#22c55e" />
        </div>

        {/* Main Grid */}
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5 min-w-0">

            {/* Quota Meters */}
            <div className="rounded-2xl" style={{ background: 'rgba(13,14,22,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="border-b border-white/[0.05] px-5 py-4">
                <p className="text-[13px] font-semibold text-white/90">Usage Meters</p>
                <p className="text-[10px] text-slate-600">Quota pressure shown as operational gauges</p>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <QuotaMeter label="Agent run quota" used={agentRuns.used} limit={agentRuns.limit} tone="violet" />
                <QuotaMeter label="Provider action quota" used={providerActions.used} limit={providerActions.limit} tone="cyan" />
                <QuotaMeter label="Live provider quota" used={liveActions.used} limit={liveActions.limit} tone="amber" />
                <QuotaMeter label="Token budget" used={tokens.used} limit={tokens.limit} tone="emerald" />
              </div>
            </div>

            {/* Packages */}
            <div className="rounded-2xl" style={{ background: 'rgba(13,14,22,0.7)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="border-b border-white/[0.05] px-5 py-4">
                <p className="text-[13px] font-semibold text-white/90">Subscription Packages</p>
                <p className="text-[10px] text-slate-600">{packages.length} plans available</p>
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2 2xl:grid-cols-4">
                {packages.map((pkg) => (
                  <PackageCard key={pkg.id} pkg={pkg} active={pkg.id === activePackageId} onSelect={() => selectPackage.mutate(pkg.id)} />
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-5 min-w-0">

            {/* Integration Readiness */}
            <GlassPanel tone="violet" className="sticky top-4">
              <SectionHeader title="Integration Readiness" subtitle="Connected provider accounts" count={integrations.length} />
              <div className="space-y-3">
                {['GoogleBusiness', 'Instagram', 'GoogleAds', 'GoogleAnalytics'].map((provider) => {
                  const integration = integrations.find((i) => i.provider === provider);
                  const connected = ['Connected', 'Active'].includes(String(integration?.status ?? ''));
                  return (
                    <ProviderStatusCard
                      key={provider}
                      name={provider}
                      status={connected ? 'Connected' : 'Setup needed'}
                      tone={connected ? 'emerald' : 'amber'}
                      detail={integration?.displayName || 'Connect in Setup before live execution.'}
                    />
                  );
                })}
              </div>
            </GlassPanel>

            {/* Warning */}
            <div className="flex items-start gap-3 rounded-2xl px-4 py-4" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-[13px] font-semibold text-amber-300">Payment readiness note</p>
                <p className="mt-1 text-[12px] leading-5 text-amber-500/80">Usage enforcement is active. Agent runs, live actions and token budget can block new work before invoicing is connected.</p>
              </div>
            </div>

            {/* Value */}
            <div className="rounded-2xl px-4 py-4" style={{ background: 'rgba(13,14,22,0.7)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">Platform Value</p>
              <div className="space-y-2.5 text-[12px] leading-5 text-slate-600">
                <p><Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-cyan-600" />Agent labor, controlled provider execution and AI reporting are measurable usage units.</p>
                <p>Package limits make pilots easier — cap live actions while allowing AI output generation.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

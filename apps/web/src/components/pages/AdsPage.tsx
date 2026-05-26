'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3, DollarSign, MousePointer, RefreshCw, Sparkles, Target,
  TrendingUp, AlertTriangle, ChevronRight, Zap, ArrowUpRight, Eye,
  CheckCircle2, Loader2, ExternalLink,
} from 'lucide-react';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { apiClient } from '@/lib/api-client';
import type { SuggestedActionDto } from '@/types';

type DateRange = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS';

interface Campaign {
  campaign_id: string;
  name: string;
  type: string;
  status: string;
  budget_daily: number;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_cpc: number;
  conversions: number;
  cost: number;
  conversion_rate: number;
  roas: number;
}

interface AdsApiResponse {
  campaigns: Campaign[];
  total_cost: number;
  total_conversions: number;
  total_clicks: number;
  account_id: string;
  date_range: string;
}

const DATE_OPTIONS: Array<{ id: DateRange; label: string }> = [
  { id: 'LAST_7_DAYS', label: '7d' },
  { id: 'LAST_30_DAYS', label: '30d' },
  { id: 'LAST_90_DAYS', label: '90d' },
];

function isRisky(c: Campaign) { return c.cost > 0 && c.conversions === 0; }
function fmtCurrency(n: number) { return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`; }
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

function OsCard({ children, className, glow, onClick }: {
  children: React.ReactNode; className?: string; glow?: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl transition-all duration-200 ${onClick ? 'cursor-pointer hover:scale-[1.01]' : ''} ${className ?? ''}`}
      style={{ background: 'rgba(13,14,22,0.8)', border: `1px solid ${glow ? `${glow}20` : 'rgba(255,255,255,0.07)'}`, boxShadow: glow ? `0 0 30px ${glow}10` : 'none' }}
    >
      {children}
    </div>
  );
}

function MetricTile({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.FC<React.SVGProps<SVGSVGElement>>; color: string;
}) {
  return (
    <OsCard className="p-5" glow={color}>
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
    </OsCard>
  );
}

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const risky = isRisky(campaign);
  const isActive = campaign.status === 'ENABLED';
  const roasColor = campaign.roas >= 3 ? '#22c55e' : campaign.roas >= 1 ? '#f59e0b' : '#ef4444';

  return (
    <OsCard onClick={onClick} glow={risky ? '#ef4444' : undefined}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[14px] font-semibold text-white/90">{campaign.name}</p>
              {risky && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] text-slate-600">{campaign.type}</span>
              <span className="h-1 w-1 rounded-full bg-slate-800" />
              <span
                className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase"
                style={{
                  background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                  color: isActive ? '#22c55e' : '#64748b',
                  border: `1px solid ${isActive ? 'rgba(34,197,94,0.2)' : 'rgba(100,116,139,0.2)'}`,
                }}
              >
                {campaign.status}
              </span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-700" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: 'Spend', value: fmtCurrency(campaign.cost) },
            { label: 'CTR', value: fmtPct(campaign.ctr) },
            { label: 'Conv.', value: String(campaign.conversions) },
          ].map((s) => (
            <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <p className="text-[12px] font-semibold text-white/90">{s.value}</p>
              <p className="text-[9px] text-slate-700 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-600">ROAS</span>
          <span className="text-[14px] font-bold metric-value" style={{ color: roasColor }}>{campaign.roas.toFixed(2)}x</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]">
          <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, campaign.roas * 20)}%`, background: roasColor }} />
        </div>

        {risky && (
          <div className="mt-3 rounded-xl px-3 py-2" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-[11px] text-red-400">⚠ Spend without conversions — needs review</p>
          </div>
        )}
      </div>
    </OsCard>
  );
}

function CampaignDrawer({ campaign, onClose, onAiAnalysis, analysisPending }: {
  campaign: Campaign | null; onClose: () => void;
  onAiAnalysis: () => void; analysisPending: boolean;
}) {
  if (!campaign) return null;
  return (
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col shadow-2xl"
      style={{ background: 'rgba(10,11,18,0.98)', backdropFilter: 'blur(24px)', borderLeft: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <p className="text-[13px] font-semibold text-white/90 truncate max-w-xs">{campaign.name}</p>
          <p className="text-[10px] text-slate-600">{campaign.type} · {campaign.status}</p>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:text-white transition" style={{ background: 'rgba(255,255,255,0.05)' }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4 scrollbar-thin">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Daily Budget', value: fmtCurrency(campaign.budget_daily) },
            { label: 'Total Spend', value: fmtCurrency(campaign.cost) },
            { label: 'Impressions', value: campaign.impressions.toLocaleString() },
            { label: 'Clicks', value: campaign.clicks.toLocaleString() },
            { label: 'CTR', value: fmtPct(campaign.ctr) },
            { label: 'Avg CPC', value: fmtCurrency(campaign.avg_cpc) },
            { label: 'Conversions', value: String(campaign.conversions) },
            { label: 'Conv. Rate', value: fmtPct(campaign.conversion_rate) },
            { label: 'ROAS', value: `${campaign.roas.toFixed(2)}x` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-600">{s.label}</p>
              <p className="mt-1 text-[15px] font-semibold text-white/90 metric-value">{s.value}</p>
            </div>
          ))}
        </div>
        {isRisky(campaign) && (
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <p className="text-[12px] font-semibold text-red-400">⚠ No conversions detected</p>
            <p className="mt-1 text-[11px] text-red-500/70">This campaign has spend but zero conversions. Consider pausing or requesting AI analysis.</p>
          </div>
        )}
      </div>
      <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={onAiAnalysis}
          disabled={analysisPending}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}
        >
          {analysisPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {analysisPending ? 'AI analyzing…' : 'Request AI Analysis'}
        </button>
      </div>
    </div>
  );
}

// ── Budget optimization pending actions panel ─────────────────────────────────
function BudgetPendingPanel({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: actions = [] } = useQuery<SuggestedActionDto[]>({
    queryKey: ['actions', 'pending', 'budget'],
    queryFn: async () => {
      const all = await apiClient.getActions('pending');
      return all.filter((a) =>
        a.actionType?.toLowerCase().includes('budget') ||
        a.actionType?.toLowerCase().includes('ads_budget')
      );
    },
    staleTime: 30_000,
  });

  const applyMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveAction(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['actions'] });
      void queryClient.invalidateQueries({ queryKey: ['ads-campaigns'] });
    },
  });

  if (actions.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
      <div className="px-5 py-4 flex items-center gap-3"
        style={{ borderBottom: '1px solid rgba(16,185,129,0.12)' }}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'rgba(16,185,129,0.15)' }}>
          <Zap className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white/90">AI Bütçe Önerisi Bekliyor</p>
          <p className="text-[11px] text-emerald-600">{actions.length} optimizasyon onay bekliyor</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {actions.map((action) => {
          let payload: Record<string, unknown> = {};
          try { payload = JSON.parse(action.payload || '{}'); } catch { /* ignore */ }
          const summary = (payload.summary as string) || (payload.recommendation as string) || action.artifactTitle;
          const changes = Array.isArray(payload.campaign_changes) ? (payload.campaign_changes as Array<Record<string, unknown>>) : [];
          return (
            <div key={action.id} className="rounded-xl p-4"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(16,185,129,0.15)' }}>
              {summary && (
                <p className="text-[12px] text-slate-300 leading-relaxed mb-3">{summary.slice(0, 300)}</p>
              )}
              {changes.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {changes.slice(0, 4).map((c, i) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{String(c.campaign_name ?? c.name ?? `Kampanya ${i+1}`)}</span>
                      <span className="font-semibold text-emerald-400">
                        {c.new_budget != null ? `₺${String(c.new_budget)}/gün` : String(c.change ?? '')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => applyMutation.mutate(action.id)}
                disabled={applyMutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                {applyMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Uygulanıyor…</>
                  : <><CheckCircle2 className="h-4 w-4" /> Google Ads'e Uygula</>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pending ad creatives panel ────────────────────────────────────────────────
function AdCreativePendingPanel({ queryClient }: { queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: artifacts = [] } = useQuery({
    queryKey: ['artifacts', 'ad_copy', 'pending'],
    queryFn: async () => {
      const all = await apiClient.getArtifacts({ status: 'pending_review' });
      return all.filter((a) =>
        a.artifactType?.toLowerCase().includes('ad') ||
        a.artifactType === 'ad_copy' ||
        a.title?.toLowerCase().includes('ad creative') ||
        a.title?.toLowerCase().includes('reklam kreatif')
      );
    },
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveArtifact(id, 'approved_for_platform'),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  });

  if (artifacts.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)' }}>
      <div className="px-5 py-4 flex items-center gap-3"
        style={{ borderBottom: '1px solid rgba(251,191,36,0.12)' }}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: 'rgba(251,191,36,0.15)' }}>
          <Sparkles className="h-4 w-4 text-amber-400" />
        </div>
        <div>
          <p className="text-[13px] font-semibold text-white/90">AI Reklam Kreatifleri Onay Bekliyor</p>
          <p className="text-[11px] text-amber-600">{artifacts.length} kreatif inceleme bekliyor</p>
        </div>
      </div>
      <div className="p-4 space-y-3">
        {artifacts.slice(0, 3).map((artifact) => {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(artifact.content || '{}'); } catch { /* ignore */ }
          const meta = artifact.metadata ?? {};
          const headlines = ((parsed.headlines ?? meta.headlines ?? []) as string[]);
          const descriptions = ((parsed.descriptions ?? meta.descriptions ?? []) as string[]);
          const platform = ((parsed.platform ?? meta.platform ?? 'google_ads') as string);
          return (
            <div key={artifact.id} className="rounded-xl p-4 space-y-3"
              style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-[12px] font-semibold text-white/80">{artifact.title}</p>
              {headlines.length > 0 && (
                <div>
                  <p className="text-[9px] text-amber-600 uppercase tracking-[0.08em] mb-1">Headlines</p>
                  {headlines.slice(0, 2).map((h, i) => (
                    <p key={i} className="text-[11px] text-slate-400 leading-relaxed">"{h}"</p>
                  ))}
                </div>
              )}
              {descriptions.length > 0 && (
                <div>
                  <p className="text-[9px] text-amber-600 uppercase tracking-[0.08em] mb-1">Descriptions</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">"{descriptions[0]?.slice(0, 100)}"</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => approveMutation.mutate(artifact.id)}
                  disabled={approveMutation.isPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: platform.includes('meta') ? 'linear-gradient(135deg,#1877f2,#0a5dc2)' : 'linear-gradient(135deg,#4285f4,#1a73e8)' }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  {platform.includes('meta') ? 'Meta Ads\'e Gönder' : 'Google Ads\'e Gönder'}
                </button>
                <button
                  onClick={() => approveMutation.mutate(artifact.id)}
                  disabled={approveMutation.isPending}
                  className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Onayla
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdsPage() {
  const [dateRange, setDateRange] = useState<DateRange>('LAST_30_DAYS');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: dashboardData } = useDashboardSnapshot();
  const adsAgentId = dashboardData?.agents.find((a) => a.backendAgentType === 'GoogleAdsAnalyst')?.apiId ?? '';

  const { data, isLoading, refetch, isRefetching } = useQuery<AdsApiResponse>({
    queryKey: ['ads-campaigns', dateRange],
    queryFn: async () => {
      try { return await apiClient.getAdsCampaigns(dateRange); } catch { return { campaigns: [], total_cost: 0, total_conversions: 0, total_clicks: 0, account_id: '', date_range: dateRange }; }
    },
    staleTime: 60_000,
    retry: false,
  });

  const analysisMutation = useMutation({
    mutationFn: () => apiClient.executeAgent(adsAgentId, { taskType: 'analyze_ads', inputData: { dateRange } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }); },
  });

  const campaigns = data?.campaigns ?? [];
  const selected = campaigns.find((c) => c.campaign_id === selectedId) ?? null;
  const riskyCount = campaigns.filter(isRisky).length;
  const avgRoas = campaigns.length ? (campaigns.reduce((s, c) => s + c.roas, 0) / campaigns.length) : 0;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
      {selected && <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedId(null)} />}
      <CampaignDrawer campaign={selected} onClose={() => setSelectedId(null)} onAiAnalysis={() => analysisMutation.mutate()} analysisPending={analysisMutation.isPending} />

      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">
        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-400">Paid Acquisition</span>
            </div>
            <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
              Google <span className="font-semibold" style={{ color: '#fbbf24' }}>Ads Intelligence</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">Campaign performance, spend efficiency and AI-powered optimization across your ad portfolio.</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5">
              {DATE_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" onClick={() => setDateRange(opt.id)}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all"
                  style={{ background: dateRange === opt.id ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.04)', border: dateRange === opt.id ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(255,255,255,0.07)', color: dateRange === opt.id ? '#fbbf24' : '#64748b' }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => refetch()} disabled={isRefetching}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:text-slate-300 disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="Total Spend" value={fmtCurrency(data?.total_cost ?? 0)} sub={`${DATE_OPTIONS.find((o) => o.id === dateRange)?.label} period`} icon={DollarSign} color="#fbbf24" />
          <MetricTile label="Total Clicks" value={(data?.total_clicks ?? 0).toLocaleString()} sub={`Avg CTR ${campaigns.length ? fmtPct(campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length) : '—'}`} icon={MousePointer} color="#60a5fa" />
          <MetricTile label="Conversions" value={(data?.total_conversions ?? 0).toLocaleString()} sub={`${campaigns.length} campaigns tracked`} icon={Target} color="#22c55e" />
          <MetricTile label="Avg ROAS" value={`${avgRoas.toFixed(2)}x`} sub={riskyCount > 0 ? `${riskyCount} campaigns at risk` : 'All campaigns healthy'} icon={TrendingUp} color={avgRoas >= 2 ? '#22c55e' : '#f59e0b'} />
        </div>

        {/* Risk alert */}
        {riskyCount > 0 && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-[12px] text-red-400 font-medium">{riskyCount} campaign{riskyCount > 1 ? 's have' : ' has'} spend but zero conversions — review or request AI analysis</p>
            <button
              onClick={() => analysisMutation.mutate()}
              disabled={analysisMutation.isPending || !adsAgentId}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-40"
              style={{ border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <Zap className="h-3 w-3" /> AI Fix
            </button>
          </div>
        )}

        {/* Campaign Grid */}
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700">Campaign Portfolio <span className="text-slate-800">({campaigns.length})</span></p>
          {isLoading ? (
            <div className="flex h-40 items-center justify-center rounded-2xl" style={{ background: 'rgba(13,14,22,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[13px] text-slate-600">Loading campaigns…</p>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl py-16" style={{ background: 'rgba(13,14,22,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <BarChart3 className="mb-3 h-10 w-10 text-slate-800" />
              <p className="text-[14px] font-medium text-slate-600">No campaign data</p>
              <p className="mt-1 text-[12px] text-slate-800">Connect Google Ads in Setup to see your campaigns.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {campaigns.map((c) => <CampaignCard key={c.campaign_id} campaign={c} onClick={() => setSelectedId(c.campaign_id)} />)}
            </div>
          )}
        </div>

        {/* AI Analysis CTA */}
        <div className="flex items-center gap-4 rounded-2xl px-6 py-5" style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.1), rgba(124,58,237,0.07))', border: '1px solid rgba(99,102,241,0.18)' }}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <Sparkles className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white/90">AI Kampanya Analizi</p>
            <p className="text-[11px] text-slate-600">Ads Agent performansı analiz eder, israfı tespit eder ve bütçe optimizasyonu önerir.</p>
          </div>
          <button
            onClick={() => analysisMutation.mutate()}
            disabled={analysisMutation.isPending || !adsAgentId}
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 20px rgba(99,102,241,0.3)' }}
          >
            {analysisMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {analysisMutation.isPending ? 'Analiz ediliyor…' : 'AI Analiz Başlat'}
          </button>
        </div>

        {/* Pending budget optimizations */}
        <BudgetPendingPanel queryClient={queryClient} />

        {/* Pending ad creatives */}
        <AdCreativePendingPanel queryClient={queryClient} />
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity, BarChart3, Globe, MousePointer, RefreshCw,
  Search, Sparkles, Target, TrendingUp, Users, Zap, ArrowUpRight,
} from 'lucide-react';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { apiClient } from '@/lib/api-client';

type DateRange = '7daysAgo' | '30daysAgo' | '90daysAgo';

const DATE_OPTIONS: Array<{ id: DateRange; label: string }> = [
  { id: '7daysAgo', label: '7d' },
  { id: '30daysAgo', label: '30d' },
  { id: '90daysAgo', label: '90d' },
];

function fmtNum(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n); }
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

function OsCard({ children, className, glow }: { children: React.ReactNode; className?: string; glow?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${className ?? ''}`}
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

function PanelHeader({ icon: Icon, iconColor, title, sub }: {
  icon: React.FC<React.SVGProps<SVGSVGElement>>; iconColor: string; title: string; sub?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-white/[0.05] px-5 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}28` }}>
        <Icon className="h-4 w-4" color={iconColor} />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-white/90">{title}</p>
        {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
      </div>
    </div>
  );
}

export default function VisitorPage() {
  const [dateRange, setDateRange] = useState<DateRange>('30daysAgo');
  const queryClient = useQueryClient();
  const { data: dashboardData } = useDashboardSnapshot();
  const analyticsAgentId = dashboardData?.agents.find((a) => a.backendAgentType === 'GoogleAdsAnalyst')?.apiId ?? '';

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['analytics-dashboard', dateRange],
    queryFn: async () => {
      try { return await apiClient.getAnalyticsDashboard(dateRange); } catch { return null; }
    },
    staleTime: 60_000,
    retry: false,
  });

  const analysisMutation = useMutation({
    mutationFn: () => apiClient.executeAgent(analyticsAgentId, { taskType: 'analyze_traffic', inputData: { dateRange } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }); },
  });

  const overview = data?.overview ?? {};
  const sources = data?.acquisition_sources ?? [];
  const queries = data?.search_queries ?? [];
  const conversions = data?.conversion_events ?? [];
  const realtime = data?.realtime_active_users ?? 0;

  const users = Number(overview.total_users ?? 0);
  const sessions = Number(overview.total_sessions ?? 0);
  const pageviews = Number(overview.total_pageviews ?? 0);
  const bounceRate = Number(overview.bounce_rate ?? 0);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
      <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

        {/* Header */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
              <BarChart3 className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-400">Traffic Intelligence</span>
            </div>
            <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
              Analytics <span className="font-semibold" style={{ color: '#60a5fa' }}>Command</span>
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">GA4 traffic signals, acquisition sources, search queries and conversion events in one view.</p>
          </div>
          <div className="flex items-center gap-2.5">
            {DATE_OPTIONS.map((opt) => (
              <button key={opt.id} type="button" onClick={() => setDateRange(opt.id)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all"
                style={{ background: dateRange === opt.id ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)', border: dateRange === opt.id ? '1px solid rgba(96,165,250,0.3)' : '1px solid rgba(255,255,255,0.07)', color: dateRange === opt.id ? '#60a5fa' : '#64748b' }}
              >
                {opt.label}
              </button>
            ))}
            <button onClick={() => refetch()} disabled={isRefetching}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:text-slate-300 disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Realtime indicator */}
        {realtime > 0 && (
          <div className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5" style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.15)' }}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[12px] font-semibold text-emerald-400">{realtime} active users right now</span>
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="Users" value={fmtNum(users)} sub="unique visitors" icon={Users} color="#60a5fa" />
          <MetricTile label="Sessions" value={fmtNum(sessions)} sub={`${sessions > 0 ? (pageviews / sessions).toFixed(1) : '—'} pages/session`} icon={Activity} color="#a78bfa" />
          <MetricTile label="Pageviews" value={fmtNum(pageviews)} sub="total page loads" icon={Globe} color="#22d3ee" />
          <MetricTile label="Bounce Rate" value={fmtPct(bounceRate)} sub="single-page sessions" icon={TrendingUp} color={bounceRate < 0.5 ? '#22c55e' : '#f59e0b'} />
        </div>

        {/* Main grid */}
        <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5 min-w-0">

            {/* Acquisition Sources */}
            <OsCard>
              <PanelHeader icon={Globe} iconColor="#60a5fa" title="Acquisition Sources" sub="How users find you" />
              <div className="px-5 py-4">
                {isLoading ? (
                  <p className="py-4 text-center text-[13px] text-slate-700">Loading…</p>
                ) : sources.length === 0 ? (
                  <p className="py-4 text-center text-[13px] text-slate-700">No source data. Connect GA4 in Setup.</p>
                ) : (
                  <div className="space-y-2.5">
                    {(sources as any[]).slice(0, 8).map((src: any, i: number) => {
                      const maxSessions = Math.max(...(sources as any[]).map((s: any) => Number(s.sessions ?? 0)));
                      const pct = maxSessions > 0 ? (Number(src.sessions ?? 0) / maxSessions) * 100 : 0;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <p className="w-36 shrink-0 truncate text-[12px] text-slate-400">{src.source ?? '(direct)'} / {src.medium ?? 'none'}</p>
                          <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                            <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: '#60a5fa' }} />
                          </div>
                          <p className="w-16 shrink-0 text-right text-[12px] font-semibold text-white/90 metric-value">{(Number(src.sessions ?? 0)).toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </OsCard>

            {/* SEO Queries */}
            <OsCard>
              <PanelHeader icon={Search} iconColor="#34d399" title="Top Search Queries" sub="Google Search Console data" />
              <div className="px-5 py-4">
                {isLoading ? (
                  <p className="py-4 text-center text-[13px] text-slate-700">Loading…</p>
                ) : queries.length === 0 ? (
                  <p className="py-4 text-center text-[13px] text-slate-700">No query data. Connect Search Console in Setup.</p>
                ) : (
                  <div className="space-y-0.5">
                    {(queries as any[]).slice(0, 10).map((q: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/[0.03]">
                        <span className="w-5 shrink-0 text-[10px] text-slate-700 tabular-nums">{i + 1}</span>
                        <p className="min-w-0 flex-1 truncate text-[12px] text-slate-400">{q.query}</p>
                        <div className="flex shrink-0 items-center gap-3 text-[11px]">
                          <span className="text-slate-600">{Number(q.clicks ?? 0).toLocaleString()} clicks</span>
                          <span className="text-slate-700">pos {Number(q.position ?? 0).toFixed(1)}</span>
                          {Number(q.position ?? 0) > 10 && Number(q.impressions ?? 0) > 100 && (
                            <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold text-amber-400" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                              opportunity
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </OsCard>
          </div>

          {/* Right column */}
          <div className="space-y-5 min-w-0">

            {/* Conversions */}
            <OsCard>
              <PanelHeader icon={Target} iconColor="#22c55e" title="Conversion Events" sub="Goal completions" />
              <div className="px-5 py-4">
                {conversions.length === 0 ? (
                  <p className="py-4 text-center text-[13px] text-slate-700">No conversion data available.</p>
                ) : (
                  <div className="space-y-2.5">
                    {(conversions as any[]).slice(0, 8).map((ev: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-[12px] text-slate-400">{ev.event_name ?? ev.name}</p>
                        <span className="shrink-0 text-[14px] font-semibold text-white/90 metric-value" style={{ color: '#22c55e' }}>
                          {Number(ev.event_count ?? ev.count ?? 0).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </OsCard>

            {/* AI Analysis */}
            <div className="rounded-2xl px-5 py-5" style={{ background: 'linear-gradient(135deg, rgba(79,70,229,0.1), rgba(124,58,237,0.07))', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <Sparkles className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white/90">AI Analytics Report</p>
                  <p className="text-[10px] text-slate-600">Generate insights from this data</p>
                </div>
              </div>
              <p className="text-[12px] text-slate-600 mb-4">The Analytics Agent will summarize traffic trends, identify top opportunities and produce a written report artifact.</p>
              <button
                onClick={() => analysisMutation.mutate()}
                disabled={analysisMutation.isPending || !analyticsAgentId}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 20px rgba(99,102,241,0.25)' }}
              >
                {analysisMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {analysisMutation.isPending ? 'Analyzing…' : 'Generate AI Report'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  getAdminMissionCostEvents,
  getAdminMissionCostProduction,
  getAdminWorkspaceCostSummary,
} from '@/lib/platform-admin-cost-client';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';
import { CostMetric, formatScopeLabel, formatUsd } from '@/components/platform-admin/OverviewTab';

const SCOPE_ORDER = ['mission_graph', 'feed_slot', 'integration', 'gallery', 'other'];

export function CostTab({
  workspaceId,
  selectedMissionId,
  onSelectMission,
}: {
  workspaceId: string;
  selectedMissionId: string | null;
  onSelectMission: (id: string | null) => void;
}) {
  const [days, setDays] = useState(30);

  const workspaceQuery = useQuery({
    queryKey: ['admin-workspace-cost', workspaceId, days],
    queryFn: () => getAdminWorkspaceCostSummary(workspaceId, days),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const missionQuery = useQuery({
    queryKey: ['admin-mission-cost', workspaceId, selectedMissionId],
    queryFn: () => getAdminMissionCostProduction(workspaceId, selectedMissionId!),
    enabled: Boolean(workspaceId && selectedMissionId),
    staleTime: 30_000,
  });

  const eventsQuery = useQuery({
    queryKey: ['admin-mission-events', workspaceId, selectedMissionId],
    queryFn: () => getAdminMissionCostEvents(workspaceId, selectedMissionId!, { limit: 50 }),
    enabled: Boolean(workspaceId && selectedMissionId),
    staleTime: 30_000,
  });

  const ws = workspaceQuery.data;
  const mission = missionQuery.data;
  const rollup = mission?.rollup;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-500 dark:text-gray-400">Dönem</label>
        <select
          className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-sm text-gray-800 dark:text-white/90 outline-none"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>7 gün</option>
          <option value={30}>30 gün</option>
          <option value={90}>90 gün</option>
        </select>
        <span className="text-xs text-gray-500 dark:text-gray-400">Workspace: {workspaceId.slice(0, 8)}…</span>
      </div>

      {workspaceQuery.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Maliyet verisi yükleniyor…</p>}
      {workspaceQuery.isError && <p className="text-sm text-rose-300">Workspace maliyet özeti alınamadı.</p>}

      {ws && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CostMetric label="Dönem toplam" value={formatUsd(ws.period_total_usd)} />
            <CostMetric label="Ölçülmüş" value={formatUsd(ws.period_measured_usd)} hint="Token / provider metered" />
            <CostMetric label="Tahmini" value={formatUsd(ws.period_estimated_usd)} hint="Katalog fiyat" />
            <CostMetric label="Top mission" value={String(ws.top_missions?.length ?? 0)} hint="Bu dönemde maliyet kaydı olan" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AdminSurface>
              <AdminSectionTitle title="Scope kırılımı" subtitle="Faz bazında USD toplamı" />
              <div className="space-y-2">
                {SCOPE_ORDER.filter((s) => (ws.by_scope?.[s] ?? 0) > 0).map((scope) => (
                  <div key={scope} className="flex justify-between gap-4 text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{formatScopeLabel(scope)}</span>
                    <span className="font-semibold text-gray-800 dark:text-white/90">{formatUsd(ws.by_scope[scope] ?? 0)}</span>
                  </div>
                ))}
                {Object.keys(ws.by_scope ?? {}).length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Henüz cost_events kaydı yok. Yeni üretimler burada görünür.</p>
                )}
              </div>
            </AdminSurface>

            <AdminSurface>
              <AdminSectionTitle title="Günlük seri" subtitle={`Son ${days} gün`} />
              <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
                {(ws.daily_series ?? []).slice().reverse().map((d) => (
                  <div key={d.date} className="flex justify-between gap-2 border-b border-gray-100 dark:border-gray-800 py-1.5">
                    <span className="text-gray-500 dark:text-gray-400">{d.date}</span>
                    <span className="text-gray-700 dark:text-gray-200">
                      {formatUsd(d.total_usd)}
                      {d.measured_usd > 0 && (
                        <span className="ml-2 text-emerald-400/80">({formatUsd(d.measured_usd)} ölçülmüş)</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </AdminSurface>
          </div>

          <AdminSurface>
            <AdminSectionTitle title="Top missions" subtitle="Dönemde en yüksek maliyet" count={ws.top_missions?.length} />
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-white/[0.03] text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Mission ID</th>
                    <th className="px-4 py-3">Toplam</th>
                    <th className="px-4 py-3">Ölçülmüş</th>
                    <th className="px-4 py-3">Slot</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {(ws.top_missions ?? []).map((m) => (
                    <tr key={m.mission_id} className="border-t border-gray-200 dark:border-gray-800">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{m.mission_id.slice(0, 8)}…</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-white/90">{formatUsd(m.total_usd)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatUsd(m.measured_usd)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{m.slot_count}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{m.event_count}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="rounded-lg border border-amber-400/30 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-400/10"
                          onClick={() => onSelectMission(m.mission_id)}
                        >
                          Detay
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminSurface>
        </>
      )}

      {selectedMissionId && (
        <AdminSurface>
          <AdminSectionTitle
            title="Mission maliyet detayı"
            subtitle={selectedMissionId}
            action={(
              <button
                type="button"
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
                onClick={() => onSelectMission(null)}
              >
                Kapat
              </button>
            )}
          />

          {missionQuery.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Mission rollup yükleniyor…</p>}

          {rollup && (
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CostMetric label="Toplam" value={formatUsd(rollup.total_usd)} />
              <CostMetric label="Graph LLM" value={formatUsd(rollup.mission_graph_usd)} />
              <CostMetric label="Feed slot" value={formatUsd(rollup.feed_slot_usd)} />
              <CostMetric label="Ölçülmüş / tahmini" value={`${formatUsd(rollup.measured_usd)} / ${formatUsd(rollup.estimated_usd)}`} />
            </div>
          )}

          {(mission?.slots ?? []).length > 0 && (
            <div className="mb-6 overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-white/[0.03] text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Slot</th>
                    <th className="px-4 py-3">Pipeline</th>
                    <th className="px-4 py-3">Toplam</th>
                    <th className="px-4 py-3">Satır</th>
                    <th className="px-4 py-3">Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {mission!.slots.map((slot) => (
                    <tr key={slot.slot_key} className="border-t border-gray-200 dark:border-gray-800">
                      <td className="px-4 py-3 font-mono text-xs text-gray-800 dark:text-white/90">{slot.slot_key}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{slot.pipeline ?? '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-white/90">{formatUsd(slot.total_usd)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{slot.line_count}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                        {Object.entries(slot.by_category ?? {}).map(([k, v]) => `${k}: ${formatUsd(v)}`).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(eventsQuery.data?.events ?? []).length > 0 && (
            <>
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Son eventler ({eventsQuery.data?.total ?? 0})</h3>
              <div className="max-h-80 overflow-y-auto rounded-2xl border border-gray-200 dark:border-gray-800 text-xs">
                <table className="min-w-full text-left">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-white/[0.05] text-[10px] uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Zaman</th>
                      <th className="px-3 py-2">Scope</th>
                      <th className="px-3 py-2">Kategori</th>
                      <th className="px-3 py-2">USD</th>
                      <th className="px-3 py-2">Basis</th>
                      <th className="px-3 py-2">Slot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsQuery.data!.events.map((ev) => (
                      <tr key={ev.id} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{ev.recorded_at?.slice(0, 19) ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{ev.scope}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{ev.category}</td>
                        <td className="px-3 py-2 font-semibold text-gray-800 dark:text-white/90">{formatUsd(ev.amount_usd)}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{ev.pricing_basis}</td>
                        <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{ev.slot_key ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {selectedMissionId && !missionQuery.isLoading && !rollup && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Bu mission için henüz cost_events kaydı yok.</p>
          )}
        </AdminSurface>
      )}
    </div>
  );
}

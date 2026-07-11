'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MissionSummary } from '@/types';
import { AdminSectionTitle, AdminSurface } from '@/components/ui/admin-template';
import { MissionActionsPanel } from '@/components/platform-admin/MissionActionsPanel';

const STATUS_COLOR: Record<string, string> = {
  in_flight: 'text-blue-300 border-blue-400/30',
  completed: 'text-emerald-300 border-emerald-400/30',
  proposed: 'text-amber-300 border-amber-400/30',
  approved: 'text-violet-300 border-violet-400/30',
  rejected: 'text-rose-300 border-rose-400/30',
  cancelled: 'text-white/40 border-white/20',
};

export function MissionsTab({
  workspaceId,
  selectedMissionId,
  onSelectMission,
}: {
  workspaceId: string;
  selectedMissionId: string | null;
  onSelectMission: (id: string | null) => void;
}) {
  const missionsQuery = useQuery({
    queryKey: ['admin-missions', workspaceId],
    queryFn: () => apiClient.listMissionsForHub(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 20_000,
  });

  const missions = missionsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <AdminSurface>
        <AdminSectionTitle
          title="Mission listesi"
          subtitle="Hub görünümü — üretim ve maliyet drill-down için mission seçin"
          count={missions.length}
        />

        {missionsQuery.isLoading && <p className="text-sm text-white/50">Missionlar yükleniyor…</p>}

        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-4 py-3">Başlık</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">İlerleme</th>
                <th className="px-4 py-3">Öncelik</th>
                <th className="px-4 py-3">Oluşturulma</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {missions.map((m: MissionSummary) => (
                <tr
                  key={m.id}
                  className={`border-t border-white/10 ${selectedMissionId === m.id ? 'bg-amber-400/5' : ''}`}
                >
                  <td className="max-w-xs px-4 py-3">
                    <div className="font-medium text-white">{m.title}</div>
                    <div className="font-mono text-[10px] text-white/35">{m.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_COLOR[m.status] ?? 'text-white/60 border-white/20'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {m.completed_nodes}/{m.total_nodes} ({Math.round(m.completion_pct)}%)
                  </td>
                  <td className="px-4 py-3 text-white/60">{m.priority}</td>
                  <td className="px-4 py-3 text-xs text-white/45">{m.created_at?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/80 hover:bg-white/5"
                      onClick={() => onSelectMission(selectedMissionId === m.id ? null : m.id)}
                    >
                      {selectedMissionId === m.id ? 'Seçili' : 'Maliyet'}
                    </button>
                  </td>
                </tr>
              ))}
              {!missionsQuery.isLoading && missions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-white/40">Mission bulunamadı.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedMissionId && (
          <>
            <p className="mt-4 text-xs text-amber-200/80">
              Seçili mission — Maliyet sekmesinde slot/event detayı; aşağıda müdahale aksiyonları.
            </p>
            <MissionActionsPanel
              workspaceId={workspaceId}
              missionId={selectedMissionId}
              missionStatus={missions.find((m) => m.id === selectedMissionId)?.status ?? 'unknown'}
            />
          </>
        )}
      </AdminSurface>
    </div>
  );
}

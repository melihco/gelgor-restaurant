'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/lib/api-client';
import type { MissionSummary } from '@/types';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';
import { AdminStatusBadge } from '@/components/platform-admin/AdminStatusBadge';
import { MissionDetailPanel } from '@/components/platform-admin/MissionDetailPanel';

const STATUS_SECTIONS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'active', label: 'Aktif', statuses: ['in_flight', 'approved'] },
  { key: 'proposed', label: 'Önerilen', statuses: ['proposed'] },
  { key: 'done', label: 'Tamamlanan', statuses: ['completed'] },
  { key: 'other', label: 'Diğer', statuses: ['rejected', 'cancelled'] },
];

export function MissionsTab({
  workspaceId,
  selectedMissionId,
  onSelectMission,
  onOpenCost,
}: {
  workspaceId: string;
  selectedMissionId: string | null;
  onSelectMission: (id: string | null) => void;
  onOpenCost?: (missionId: string) => void;
}) {
  const missionsQuery = useQuery({
    queryKey: ['admin-missions', workspaceId],
    queryFn: () => apiClient.listMissionsForHub(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
    refetchInterval: 25_000,
  });

  const missions = missionsQuery.data ?? [];

  const selectedMission = useMemo(
    () => missions.find((m) => m.id === selectedMissionId) ?? null,
    [missions, selectedMissionId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, MissionSummary[]>();
    for (const sec of STATUS_SECTIONS) map.set(sec.key, []);
    for (const m of missions) {
      const sec = STATUS_SECTIONS.find((s) => s.statuses.includes(m.status)) ?? STATUS_SECTIONS[3]!;
      map.get(sec.key)!.push(m);
    }
    return STATUS_SECTIONS.map((s) => ({ ...s, items: map.get(s.key) ?? [] })).filter((g) => g.items.length > 0);
  }, [missions]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <AdminSurface padding="none" className="xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900/95">
          <AdminSectionTitle title="Mission listesi" subtitle="Canlı yenileme · gruplu görünüm" count={missions.length} />
        </div>

        {missionsQuery.isLoading && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Yükleniyor…</p>}

        {grouped.map((group) => (
          <div key={group.key} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">{group.label}</div>
            <ul>
              {group.items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelectMission(selectedMissionId === m.id ? null : m.id)}
                    className={`flex w-full flex-col gap-1 border-t border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.03] ${
                      selectedMissionId === m.id ? 'border-l-2 border-l-brand-500 bg-brand-50 dark:bg-brand-500/10' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium text-gray-800 dark:text-white/90">{m.title}</span>
                      <AdminStatusBadge status={m.status} />
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">
                      {m.completed_nodes}/{m.total_nodes} node · {Math.round(m.completion_pct)}%
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {!missionsQuery.isLoading && missions.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">Mission bulunamadı.</p>
        )}
      </AdminSurface>

      <div className="min-w-0">
        {selectedMission ? (
          <MissionDetailPanel
            workspaceId={workspaceId}
            mission={selectedMission}
            onOpenCost={onOpenCost ? () => onOpenCost(selectedMission.id) : undefined}
          />
        ) : (
          <AdminSurface>
            <div className="py-16 text-center">
              <p className="text-lg font-medium text-gray-700 dark:text-gray-200">Mission seçin</p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Soldan bir mission seçerek graph, slot checklist, factory jobs ve içerik kayıtlarını izleyin.
              </p>
            </div>
          </AdminSurface>
        )}
      </div>
    </div>
  );
}

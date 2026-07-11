'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { AdminSurface } from '@/components/platform-admin/admin-ui';
import { missionAction } from '@/lib/platform-admin-actions-client';

export function MissionActionsPanel({
  workspaceId,
  missionId,
  missionStatus,
}: {
  workspaceId: string;
  missionId: string;
  missionStatus: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    if (busy) return;
    setBusy(id);
    const r = await fn();
    setMsg(r.message);
    setBusy(null);
  }

  const btn = (id: string, label: string, action: () => Promise<{ ok: boolean; message: string }>) => (
    <button
      key={id}
      type="button"
      disabled={Boolean(busy)}
      onClick={() => void run(id, action)}
      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/[0.03] px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:bg-white/[0.05] disabled:opacity-40"
    >
      {busy === id ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : null}
      {label}
    </button>
  );

  return (
    <AdminSurface>
      <div className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Mission müdahaleleri</div>
      <p className="mb-3 font-mono text-[10px] text-gray-500 dark:text-gray-400">{missionId}</p>
      <div className="flex flex-wrap gap-2">
        {missionStatus === 'proposed' && btn('approve', 'Onayla', () => missionAction(workspaceId, missionId, 'approve'))}
        {missionStatus === 'proposed' && btn('reject', 'Reddet', () => missionAction(workspaceId, missionId, 'reject'))}
        {btn('kick', 'Feed üretimini başlat', async () => {
          try {
            const r = await apiClient.kickMissionFeedProduction(workspaceId, missionId);
            return { ok: true, message: r.message ?? 'Kick gönderildi.' };
          } catch (e) {
            return { ok: false, message: e instanceof Error ? e.message : 'Kick başarısız' };
          }
        })}
        {btn('reproduce', 'Feed yeniden üret', async () => {
          try {
            const r = await apiClient.reproduceMissionFeed(workspaceId, missionId);
            return { ok: true, message: r.message ?? 'Reproduce başlatıldı.' };
          } catch (e) {
            return { ok: false, message: e instanceof Error ? e.message : 'Reproduce başarısız' };
          }
        })}
        {btn('requeue', 'Factory requeue', async () => {
          try {
            const r = await apiClient.requeueMissionFactoryJobs(workspaceId, missionId);
            return { ok: true, message: `${r.requeued ?? 0} job requeue edildi.` };
          } catch (e) {
            return { ok: false, message: e instanceof Error ? e.message : 'Requeue başarısız' };
          }
        })}
        {btn('reset', 'Üretimi sıfırla', () => missionAction(workspaceId, missionId, 'reset-production', 'POST'))}
        {btn('restart', 'Yeniden başlat', () => missionAction(workspaceId, missionId, 'restart'))}
        {btn('cancel', 'İptal', () => missionAction(workspaceId, missionId, 'cancel'))}
      </div>
      {msg && <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">{msg}</p>}
    </AdminSurface>
  );
}

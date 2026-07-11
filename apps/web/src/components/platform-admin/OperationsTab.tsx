'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Play, RefreshCw, Zap } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';
import {
  fetchAdminQueueStats,
  triggerBrandAnalyze,
  triggerBrandGapCompletion,
  triggerBrandRulesScan,
  triggerMissionAutoPipeline,
  triggerMissionPropose,
} from '@/lib/platform-admin-actions-client';

function ActionButton({
  label,
  description,
  loading,
  onClick,
  tone = 'default',
}: {
  label: string;
  description: string;
  loading?: boolean;
  onClick: () => void;
  tone?: 'default' | 'danger' | 'primary';
}) {
  const tones = {
    default: 'border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]',
    primary: 'border-brand-200 bg-brand-50 hover:bg-brand-100/80 dark:border-brand-500/30 dark:bg-brand-500/10',
    danger: 'border-error-200 bg-error-50 hover:bg-error-100/80 dark:border-error-500/30 dark:bg-error-500/10',
  };
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`flex w-full flex-col items-start gap-1 rounded-xl border p-4 text-left transition disabled:opacity-50 ${tones[tone]}`}
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 text-brand-500" />}
        {label}
      </span>
      <span className="text-xs text-gray-500 dark:text-gray-400">{description}</span>
    </button>
  );
}

export function OperationsTab({ workspaceId }: { workspaceId: string }) {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const opsQuery = useQuery({
    queryKey: ['admin-operations-summary'],
    queryFn: () => apiClient.getOperationsSummary(),
    staleTime: 20_000,
  });

  const queueQuery = useQuery({
    queryKey: ['admin-queue-stats'],
    queryFn: () => fetchAdminQueueStats(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  async function run(id: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    if (busy) return;
    setBusy(id);
    const result = await fn();
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${result.message}`, ...prev].slice(0, 12));
    setBusy(null);
  }

  const health = opsQuery.data?.health;
  const queue = queueQuery.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Agent runs 24h" value={health?.agentRuns24h ?? '—'} />
        <Metric label="Failed jobs 24h" value={health?.failedExecutionJobs24h ?? '—'} />
        <Metric label="Queue waiting" value={String((queue as { counts?: { waiting?: number } })?.counts?.waiting ?? '—')} />
        <Metric label="Queue failed" value={String((queue as { counts?: { failed?: number } })?.counts?.failed ?? '—')} />
      </div>

      <AdminSurface>
        <AdminSectionTitle
          title="Manuel tetikleme"
          subtitle={`Workspace: ${workspaceId.slice(0, 8)}… — uzun işlemler arka planda sürebilir`}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <ActionButton
            label="Marka analizi (Apify)"
            description="Instagram, web, Google discovery yeniden çalıştır"
            loading={busy === 'analyze'}
            onClick={() => void run('analyze', () => triggerBrandAnalyze(workspaceId))}
            tone="primary"
          />
          <ActionButton
            label="Gap tamamlama"
            description="Eksik marka alanlarını AI + pipeline ile doldur"
            loading={busy === 'gaps'}
            onClick={() => void run('gaps', () => triggerBrandGapCompletion(workspaceId))}
          />
          <ActionButton
            label="Mission öner"
            description="Yeni mission proposal üret (BRS/GIS gate)"
            loading={busy === 'propose'}
            onClick={() => void run('propose', () => triggerMissionPropose(workspaceId))}
          />
          <ActionButton
            label="Otonom pipeline"
            description="Propose → approve → üretim zinciri (auto-trigger)"
            loading={busy === 'auto'}
            onClick={() => void run('auto', () => triggerMissionAutoPipeline(workspaceId))}
            tone="primary"
          />
          <ActionButton
            label="Brand rules scan"
            description="Öğrenilen kuralları promoter ile tara"
            loading={busy === 'rules'}
            onClick={() => void run('rules', () => triggerBrandRulesScan(workspaceId))}
          />
          <ActionButton
            label="Zombi agent reconcile"
            description="Takılı InProgress agent run kayıtlarını iptal et"
            loading={busy === 'reconcile'}
            onClick={() => void run('reconcile', async () => {
              try {
                const r = await apiClient.reconcileStaleAgentRuns(10);
                return { ok: true, message: `${r.count} kayıt reconcile edildi.` };
              } catch (e) {
                return { ok: false, message: e instanceof Error ? e.message : 'Reconcile başarısız' };
              }
            })}
            tone="danger"
          />
        </div>
      </AdminSurface>

      <AdminSurface>
        <AdminSectionTitle
          title="İşlem günlüğü"
          action={(
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={() => void queueQuery.refetch()}
            >
              <RefreshCw className="inline h-3.5 w-3.5" /> Kuyruk yenile
            </button>
          )}
        />
        {log.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Henüz tetikleme yok.</p>
        ) : (
          <ul className="space-y-2 font-mono text-xs text-gray-600 dark:text-gray-300">
            {log.map((line) => (
              <li key={line} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">{line}</li>
            ))}
          </ul>
        )}
      </AdminSurface>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
        <Zap className="h-4 w-4 text-brand-500" />
        {value}
      </div>
    </div>
  );
}

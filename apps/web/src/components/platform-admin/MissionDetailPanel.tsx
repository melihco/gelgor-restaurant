'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { useMissionProgress } from '@/app/mobile/_hooks/use-mission-progress';
import { useMissionFactoryJobs } from '@/app/mobile/_lib/use-mission-factory-jobs';
import { AdminProgressBar, AdminStatusBadge } from '@/components/platform-admin/AdminStatusBadge';
import { MissionActionsPanel } from '@/components/platform-admin/MissionActionsPanel';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';
import { apiClient } from '@/lib/api-client';
import {
  buildMissionSlotChecklist,
  extractFeedDirectorReportFromNodes,
  slotStatusLabel,
  SLOT_ROLE_LABEL_TR,
  type MissionSlotChecklistItem,
} from '@/lib/mission-slot-checklist';
import type { MissionSummary, MissionNodeProgress, OutputArtifact } from '@/types';
import { parseArtifactMetadata } from '@/lib/artifact-utils';

const NODE_STATUS_ORDER = ['running', 'failed', 'completed', 'pending', 'skipped'];

function sortNodes(nodes: MissionNodeProgress[]): MissionNodeProgress[] {
  return [...nodes].sort((a, b) => {
    const ai = NODE_STATUS_ORDER.indexOf(a.status);
    const bi = NODE_STATUS_ORDER.indexOf(b.status);
    if (ai !== bi) return ai - bi;
    return a.phase_index - b.phase_index;
  });
}

function NodeRow({ node }: { node: MissionNodeProgress }) {
  const [open, setOpen] = useState(false);
  const summary = (node.output_summary ?? '').trim();
  const hasOutput = Boolean(summary || node.output_payload);

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03]"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasOutput}
      >
        {hasOutput
          ? (open ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />)
          : <span className="w-4" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-gray-800 dark:text-white/90">{node.title || node.task_type}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">{node.agent_role} · {node.task_type}</div>
        </div>
        <AdminStatusBadge status={node.status} />
      </button>
      {open && hasOutput && (
        <div className="mx-3 mb-3 max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.03] p-3 font-mono text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
          {node.error_message && (
            <p className="mb-2 text-rose-300">{node.error_message}</p>
          )}
          <pre className="whitespace-pre-wrap break-words">{summary.slice(0, 4000) || JSON.stringify(node.output_payload, null, 2)?.slice(0, 4000)}</pre>
        </div>
      )}
    </div>
  );
}

function SlotRow({ item }: { item: MissionSlotChecklistItem }) {
  const roleLabel = SLOT_ROLE_LABEL_TR[item.role] ?? item.role;
  return (
    <tr className="border-t border-gray-200 dark:border-gray-800">
      <td className="px-3 py-2.5">
        <div className="text-sm text-gray-800 dark:text-white/90">{item.label || roleLabel}</div>
        <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400">{item.ideaIndex}::{item.role}</div>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">{item.pipeline}</td>
      <td className="px-3 py-2.5"><AdminStatusBadge status={item.status} label={slotStatusLabel(item.status)} /></td>
      <td className="max-w-[140px] truncate px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">{item.headline ?? '—'}</td>
      <td className="px-3 py-2.5 font-mono text-[10px] text-gray-500 dark:text-gray-400">
        {item.artifactId ? `${item.artifactId.slice(0, 8)}…` : '—'}
      </td>
      <td className="px-3 py-2.5">
        {item.artifactId && (
          <a
            href={`/?page=outputs`}
            className="text-[10px] text-amber-200/80 hover:text-amber-100"
            title="Artifact Center'da aç"
          >
            Görüntüle
          </a>
        )}
      </td>
    </tr>
  );
}

function ArtifactRow({ artifact }: { artifact: OutputArtifact }) {
  const meta = parseArtifactMetadata(artifact.metadata);
  const role = String(meta.production_role ?? meta.slot_role ?? '—');
  const ideaIdx = String(meta.idea_index ?? meta.planning_idea_index ?? '—');
  const preview = artifact.contentUrl?.trim();

  return (
    <tr className="border-t border-gray-200 dark:border-gray-800">
      <td className="px-3 py-2.5">
        <div className="max-w-[200px] truncate text-sm text-gray-800 dark:text-white/90">{artifact.title}</div>
        <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400">{artifact.id.slice(0, 8)}…</div>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300">{artifact.type}</td>
      <td className="px-3 py-2.5"><AdminStatusBadge status={artifact.status} /></td>
      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{ideaIdx}::{role}</td>
      <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{artifact.createdAt?.slice(0, 10) ?? '—'}</td>
      <td className="px-3 py-2.5">
        {preview && (
          <a href={preview} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-amber-200/80 hover:text-amber-100">
            <ExternalLink className="h-3 w-3" /> Medya
          </a>
        )}
      </td>
    </tr>
  );
}

export function MissionDetailPanel({
  workspaceId,
  mission,
  onOpenCost,
}: {
  workspaceId: string;
  mission: MissionSummary;
  onOpenCost?: () => void;
}) {
  const missionId = mission.id;
  const pollProgress = mission.status === 'in_flight' || mission.status === 'approved';
  const pollFeed = mission.status === 'completed';

  const progressQuery = useMissionProgress({
    workspaceId,
    missionId,
    missionStatus: mission.status,
    poll: pollProgress,
    pollFeedProduction: pollFeed,
  });

  const factoryQuery = useMissionFactoryJobs(workspaceId, missionId, true);

  const artifactsQuery = useQuery({
    queryKey: ['admin-mission-artifacts', workspaceId, missionId],
    queryFn: () => apiClient.getArtifacts({ missionId, limit: 80 }, workspaceId),
    enabled: Boolean(workspaceId && missionId),
    staleTime: 15_000,
    refetchInterval: pollProgress || pollFeed ? 20_000 : false,
  });

  const progress = progressQuery.data;
  const factory = factoryQuery.data;
  const artifacts = artifactsQuery.data ?? [];

  const checklist = useMemo(() => {
    const nodes = progress?.nodes ?? [];
    const fd = extractFeedDirectorReportFromNodes(nodes);
    return buildMissionSlotChecklist({
      missionId,
      missionType: mission.type,
      missionTitle: mission.title,
      assignments: fd?.production_assignments,
      artifacts,
      missionInFlight: mission.status === 'in_flight' || mission.status === 'approved',
      debugMode: true,
      factorySlots: factory?.slots,
    });
  }, [progress?.nodes, missionId, mission.type, mission.title, mission.status, artifacts, factory?.slots]);

  const completionPct = progress?.completion_pct ?? mission.completion_pct ?? 0;

  return (
    <div className="space-y-5">
      <AdminSurface>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-white/90">{mission.title}</h2>
            <p className="mt-1 font-mono text-[11px] text-gray-500 dark:text-gray-400">{missionId}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <AdminStatusBadge status={mission.status} />
              <AdminStatusBadge status={mission.priority} label={`öncelik: ${mission.priority}`} />
              <span className="rounded-full border border-gray-200 dark:border-gray-800 px-2.5 py-0.5 text-[11px] text-gray-500 dark:text-gray-400">{mission.type}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:bg-white/[0.03]"
              onClick={() => {
                void progressQuery.refetch();
                void artifactsQuery.refetch();
              }}
            >
              <RefreshCw className="inline h-3.5 w-3.5" /> Yenile
            </button>
            {onOpenCost && (
              <button
                type="button"
                className="rounded-lg border border-amber-400/30 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-400/10"
                onClick={onOpenCost}
              >
                Maliyet detayı
              </button>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Graph ilerleme</span>
            <span>{Math.round(completionPct)}% · {progress?.completed_nodes ?? mission.completed_nodes}/{progress?.total_nodes ?? mission.total_nodes} node</span>
          </div>
          <AdminProgressBar pct={completionPct} />
        </div>

        {factory && (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <MiniStat label="Factory faz" value={factory.phase ?? '—'} />
            <MiniStat label="Slot hazır" value={`${factory.ready}/${factory.total}`} />
            <MiniStat label="Aktif / kuyruk" value={`${factory.inFlight ?? factory.active}/${factory.queued ?? 0}`} />
            <MiniStat label="Başarısız" value={String(factory.failed)} />
          </div>
        )}

        {checklist.items.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>Slot kapsama: <strong className="text-gray-800 dark:text-white/90">{checklist.coveragePct}%</strong></span>
            <span>Hazır: <strong className="text-emerald-300">{checklist.readyTotal}</strong></span>
            <span>Render: <strong className="text-cyan-300">{checklist.renderingCount}</strong></span>
            <span>Hata: <strong className="text-rose-300">{checklist.failedCount}</strong></span>
          </div>
        )}
      </AdminSurface>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSurface padding="none">
          <div className="border-b border-gray-200 dark:border-gray-800 px-5 py-4">
            <AdminSectionTitle title="Üretim graph" subtitle="Mission node'ları — genişletilebilir çıktı" />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {progressQuery.isLoading && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Yükleniyor…</p>}
            {sortNodes(progress?.nodes ?? []).map((n) => (
              <NodeRow key={n.node_key} node={n} />
            ))}
            {!progressQuery.isLoading && !(progress?.nodes?.length) && (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Node verisi yok.</p>
            )}
          </div>
        </AdminSurface>

        <AdminSurface padding="none">
          <div className="border-b border-gray-200 dark:border-gray-800 px-5 py-4">
            <AdminSectionTitle title="Factory jobs" subtitle="Durable slot kuyruğu" />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-white/[0.03] text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Slot</th>
                  <th className="px-3 py-2">Pipeline</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Deneme</th>
                </tr>
              </thead>
              <tbody>
                {(factory?.slots ?? []).map((s) => (
                  <tr key={`${s.ideaIndex}-${s.slotRole}`} className="border-t border-gray-200 dark:border-gray-800">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700 dark:text-gray-200">{s.ideaIndex}::{s.slotRole}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{s.pipeline}</td>
                    <td className="px-3 py-2"><AdminStatusBadge status={s.status} /></td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{s.attempts}/{s.maxAttempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {factoryQuery.isLoading && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Yükleniyor…</p>}
            {!factoryQuery.isLoading && !(factory?.slots?.length) && (
              <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Factory job kaydı yok.</p>
            )}
          </div>
        </AdminSurface>
      </div>

      <AdminSurface padding="none">
        <div className="border-b border-gray-200 dark:border-gray-800 px-5 py-4">
          <AdminSectionTitle
            title="Slot / içerik checklist"
            subtitle="Feed Director atamaları ↔ artifact eşlemesi"
            count={checklist.items.length}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">Slot</th>
                <th className="px-3 py-2">Pipeline</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Headline</th>
                <th className="px-3 py-2">Artifact</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {checklist.items.map((item) => (
                <SlotRow key={`${item.ideaIndex}-${item.role}-${item.assignmentIndex}`} item={item} />
              ))}
            </tbody>
          </table>
          {checklist.items.length === 0 && (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Feed Director slot planı henüz yok veya mission graph tamamlanmadı.</p>
          )}
        </div>
      </AdminSurface>

      <AdminSurface padding="none">
        <div className="border-b border-gray-200 dark:border-gray-800 px-5 py-4">
          <AdminSectionTitle title="İçerik kayıtları" subtitle="Mission artifact listesi" count={artifacts.length} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2">Başlık</th>
                <th className="px-3 py-2">Tip</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Slot</th>
                <th className="px-3 py-2">Tarih</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {artifacts.map((a) => (
                <ArtifactRow key={a.id} artifact={a} />
              ))}
            </tbody>
          </table>
          {artifactsQuery.isLoading && <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Yükleniyor…</p>}
          {!artifactsQuery.isLoading && artifacts.length === 0 && (
            <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Bu mission için artifact yok.</p>
          )}
        </div>
      </AdminSurface>

      <MissionActionsPanel
        workspaceId={workspaceId}
        missionId={missionId}
        missionStatus={mission.status}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{value}</div>
    </div>
  );
}

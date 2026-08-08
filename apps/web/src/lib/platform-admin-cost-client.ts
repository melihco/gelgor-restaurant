/**
 * Browser-facing admin cost reads — proxied via Next BFF (session auth).
 */
import type {
  CostEventRecord,
  MissionProductionCostSummary,
  WorkspaceProductionCostSummary,
} from '@/lib/production-cost-types';
import { getRequestContextHeaders } from '@/lib/runtime-config';

export async function getAdminWorkspaceCostSummary(
  workspaceId: string,
  days = 30,
): Promise<WorkspaceProductionCostSummary | null> {
  try {
    const res = await fetch(
      `/api/admin/cost-ledger/${workspaceId}/summary?days=${days}`,
      { headers: getRequestContextHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    return res.json() as Promise<WorkspaceProductionCostSummary>;
  } catch {
    return null;
  }
}

export async function getAdminMissionCostProduction(
  workspaceId: string,
  missionId: string,
): Promise<MissionProductionCostSummary | null> {
  try {
    const res = await fetch(
      `/api/admin/cost-ledger/${workspaceId}/missions/${missionId}/production`,
      { headers: getRequestContextHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    return res.json() as Promise<MissionProductionCostSummary>;
  } catch {
    return null;
  }
}

export async function getAdminMissionCostEvents(
  workspaceId: string,
  missionId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ events: CostEventRecord[]; total: number } | null> {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  try {
    const res = await fetch(
      `/api/admin/cost-ledger/${workspaceId}/missions/${missionId}/events?limit=${limit}&offset=${offset}`,
      { headers: getRequestContextHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    const data = await res.json() as { events: CostEventRecord[]; total: number };
    return { events: data.events ?? [], total: data.total ?? 0 };
  } catch {
    return null;
  }
}

export type ProductionLineLiveSummary = {
  workspace_id: string;
  lookback_hours: number;
  live: {
    by_status: Record<string, number>;
    active_count: number;
    jobs: Array<{
      id: string;
      mission_id: string;
      idea_index?: number;
      slot_role?: string;
      slot_key?: string | null;
      format?: string;
      pipeline?: string;
      status: string;
      attempts?: number;
      last_error?: string | null;
      queue_wait_ms?: number | null;
      duration_ms?: number | null;
      started_at?: string | null;
      updated_at?: string | null;
    }>;
  };
  period: {
    terminal_by_status: Record<string, number>;
    success_rate: number | null;
    avg_duration_ms: number | null;
    p50_duration_ms: number | null;
    p90_duration_ms: number | null;
    avg_queue_wait_ms: number | null;
    p50_queue_wait_ms: number | null;
    cost_usd: number;
    cost_line_count: number;
  };
  recent_events: Array<{
    id: string;
    job_id: string;
    mission_id: string;
    event_type: string;
    status?: string | null;
    idea_index?: number | null;
    slot_role?: string | null;
    duration_ms?: number | null;
    queue_wait_ms?: number | null;
    error_message?: string | null;
    recorded_at?: string;
  }>;
};

export type MissionProductionLineSummary = {
  mission_id: string;
  workspace_id?: string;
  totals: {
    jobs: number;
    ready: number;
    active: number;
    failed: number;
    exhausted: number;
    success_rate: number | null;
  };
  timing: {
    avg_duration_ms: number | null;
    p50_duration_ms: number | null;
    p90_duration_ms: number | null;
    avg_queue_wait_ms: number | null;
    p50_queue_wait_ms: number | null;
  };
  cost: { total_usd: number; line_count: number; source: string };
  recent_events: ProductionLineLiveSummary['recent_events'];
};

function formatMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  return `${(sec / 60).toFixed(1)} dk`;
}

export { formatMs as formatProductionDuration };

export async function getAdminWorkspaceProductionLine(
  workspaceId: string,
  lookbackHours = 24,
): Promise<ProductionLineLiveSummary | null> {
  try {
    const res = await fetch(
      `/api/admin/production-telemetry/${workspaceId}/live?lookback_hours=${lookbackHours}`,
      { headers: getRequestContextHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    return res.json() as Promise<ProductionLineLiveSummary>;
  } catch {
    return null;
  }
}

export async function getAdminMissionProductionLine(
  workspaceId: string,
  missionId: string,
): Promise<MissionProductionLineSummary | null> {
  try {
    const res = await fetch(
      `/api/admin/production-telemetry/${workspaceId}/missions/${missionId}`,
      { headers: getRequestContextHeaders(), signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return null;
    return res.json() as Promise<MissionProductionLineSummary>;
  } catch {
    return null;
  }
}

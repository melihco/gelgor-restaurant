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

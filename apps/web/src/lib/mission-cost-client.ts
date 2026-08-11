/**
 * Browser client for tenant mission / workspace cost_events reads.
 */
import type {
  MissionProductionCostSummary,
  WorkspaceProductionCostSummary,
} from '@/lib/production-cost-types';
import { getTenantBffHeaders } from '@/lib/runtime-config';

export async function getWorkspaceMissionCostSummary(
  workspaceId: string,
  days = 30,
): Promise<WorkspaceProductionCostSummary | null> {
  try {
    const res = await fetch(
      `/api/cost-ledger/${workspaceId}/summary?days=${days}`,
      {
        headers: getTenantBffHeaders(workspaceId),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<WorkspaceProductionCostSummary>;
  } catch {
    return null;
  }
}

export async function getMissionProductionCost(
  workspaceId: string,
  missionId: string,
): Promise<MissionProductionCostSummary | null> {
  try {
    const res = await fetch(
      `/api/cost-ledger/${workspaceId}/missions/${missionId}/production`,
      {
        headers: getTenantBffHeaders(workspaceId),
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<MissionProductionCostSummary>;
  } catch {
    return null;
  }
}

/** Map missionId → total_usd from workspace summary top_missions. */
export function missionCostTotalsMap(
  summary: WorkspaceProductionCostSummary | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of summary?.top_missions ?? []) {
    if (row.mission_id && row.total_usd > 0) {
      map.set(row.mission_id, row.total_usd);
    }
  }
  return map;
}

/**
 * Record estimated API spend to Python workspace_usage_daily (internal only).
 */
const CREW_BACKEND = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export async function recordWorkspaceUsageCost(
  workspaceId: string,
  category: string,
  amountUsd: number,
  opts?: { artifactCount?: number; missionCount?: number },
): Promise<void> {
  if (!workspaceId || amountUsd <= 0) return;
  try {
    await fetch(`${CREW_BACKEND}/api/v1/usage-cost/${workspaceId}/record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      body: JSON.stringify({
        amount_usd: amountUsd,
        category,
        artifact_count: opts?.artifactCount ?? 0,
        mission_count: opts?.missionCount ?? 0,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* non-fatal */
  }
}

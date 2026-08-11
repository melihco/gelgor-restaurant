import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';

/** Tenant-scoped mission cost from cost_events rollups (fal / GPT / graph). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  const guard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (guard) return guard;

  return proxyToCrewBackend(
    `/api/v1/cost-ledger/${workspaceId}/missions/${missionId}/production`,
    { workspaceId, timeoutMs: 15_000 },
  );
}

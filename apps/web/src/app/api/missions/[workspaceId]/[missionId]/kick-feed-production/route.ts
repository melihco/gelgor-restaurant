import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    /* empty body */
  }

  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/${missionId}/kick-feed-production`,
    {
      method: 'PUT',
      workspaceId,
      timeoutMs: 90_000,
      body,
    },
  );
}

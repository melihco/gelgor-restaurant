import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  return proxyToCrewBackend(`/api/v1/missions/${workspaceId}/${missionId}`);
}

import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { workspaceId, missionId } = await params;
  return proxyToCrewBackend(
    `/api/v1/production-telemetry/${workspaceId}/missions/${missionId}`,
    { workspaceId, timeoutMs: 15_000 },
  );
}

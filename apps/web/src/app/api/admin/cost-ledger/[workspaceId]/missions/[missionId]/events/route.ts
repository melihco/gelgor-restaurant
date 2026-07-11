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
  const limit = req.nextUrl.searchParams.get('limit') ?? '100';
  const offset = req.nextUrl.searchParams.get('offset') ?? '0';
  const qs = new URLSearchParams({ limit, offset });
  return proxyToCrewBackend(
    `/api/v1/cost-ledger/${workspaceId}/missions/${missionId}/events?${qs}`,
    { workspaceId, timeoutMs: 15_000 },
  );
}

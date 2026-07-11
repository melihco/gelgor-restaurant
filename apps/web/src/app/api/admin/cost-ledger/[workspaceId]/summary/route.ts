import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

async function guard(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const denied = await guard(req);
  if (denied) return denied;

  const { workspaceId } = await params;
  const days = req.nextUrl.searchParams.get('days') ?? '30';
  return proxyToCrewBackend(
    `/api/v1/cost-ledger/${workspaceId}/workspace/summary?days=${days}`,
    { workspaceId, timeoutMs: 15_000 },
  );
}

import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { workspaceId } = await params;
  const lookback = req.nextUrl.searchParams.get('lookback_hours') || '24';
  return proxyToCrewBackend(
    `/api/v1/production-telemetry/${workspaceId}/live?lookback_hours=${lookback}`,
    { workspaceId, timeoutMs: 15_000 },
  );
}

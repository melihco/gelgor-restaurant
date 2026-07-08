import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const status = req.nextUrl.searchParams.get('status');
  const limit  = req.nextUrl.searchParams.get('limit');
  const hub    = req.nextUrl.searchParams.get('hub');
  const qs     = new URLSearchParams();
  if (status) qs.set('status', status);
  if (limit)  qs.set('limit', limit);
  if (hub)    qs.set('hub', hub);
  const query = qs.toString() ? `?${qs}` : '';
  // Hub list can wait behind a saturated Python event loop; allow extra headroom vs default 15s.
  return proxyToCrewBackend(`/api/v1/missions/${workspaceId}${query}`, {
    timeoutMs: 45_000,
  });
}

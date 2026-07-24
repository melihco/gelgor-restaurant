import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ sectorId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { sectorId } = await ctx.params;
  const view = req.nextUrl.searchParams.get('view');
  const safe = encodeURIComponent(sectorId);

  if (view === 'coverage') {
    return proxyToCrewBackend(`/api/v1/slot-catalog/sectors/${safe}/coverage`, {
      method: 'GET',
    });
  }
  if (view === 'slots') {
    const params = new URLSearchParams(req.nextUrl.searchParams);
    params.delete('view');
    const qs = params.toString() ? `?${params}` : '';
    return proxyToCrewBackend(`/api/v1/slot-catalog/sectors/${safe}/slots${qs}`, {
      method: 'GET',
    });
  }

  return proxyToCrewBackend(`/api/v1/slot-catalog/sectors/${safe}`, { method: 'GET' });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { sectorId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return proxyToCrewBackend(
    `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}`,
    { method: 'PATCH', body },
  );
}

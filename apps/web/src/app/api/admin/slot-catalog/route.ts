import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

/** Platform admin — global slot catalog (sectors + definitions). */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const sectorId = req.nextUrl.searchParams.get('sector_id');
  const view = req.nextUrl.searchParams.get('view');

  if (view === 'sectors') {
    return proxyToCrewBackend('/api/v1/slot-catalog/sectors', { method: 'GET' });
  }
  if (sectorId) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots`,
      { method: 'GET' },
    );
  }
  return proxyToCrewBackend('/api/v1/slot-catalog/slots', { method: 'GET' });
}

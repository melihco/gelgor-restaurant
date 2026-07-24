import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

/** Platform admin — canonical sectors list / create. */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const activeOnly = req.nextUrl.searchParams.get('active_only');
  const qs = activeOnly != null ? `?active_only=${encodeURIComponent(activeOnly)}` : '';
  return proxyToCrewBackend(`/api/v1/slot-catalog/sectors${qs}`, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  return proxyToCrewBackend('/api/v1/slot-catalog/sectors', {
    method: 'POST',
    body,
  });
}

import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

/** GET → Nexus GET /api/platform/audit-logs (DB-backed) */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  return proxyNexusJson(req, '/api/platform/audit-logs', {
    method: 'GET',
    headers: forwardOperatorHeaders(req),
    body: null,
  });
}

import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

/**
 * GET  → Nexus GET /api/platform/tenants (real registry)
 * POST → Nexus POST /api/platform/tenants (bootstrap alias)
 */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  return proxyNexusJson(req, '/api/platform/tenants', {
    method: 'GET',
    headers: forwardOperatorHeaders(req),
    body: null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.text();
  return proxyNexusJson(req, '/api/platform/tenants', {
    method: 'POST',
    headers: {
      ...forwardOperatorHeaders(req),
      'Content-Type': 'application/json',
    },
    body,
    search: '',
  });
}

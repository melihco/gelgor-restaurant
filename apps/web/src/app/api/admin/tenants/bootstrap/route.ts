import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Platform admin — create tenant + office + optional owner + Python mirror bootstrap.
 * Proxies Nexus POST /api/platform/tenants/bootstrap
 */
export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.text();
  return proxyNexusJson(req, '/api/platform/tenants/bootstrap', {
    method: 'POST',
    headers: {
      ...forwardOperatorHeaders(req),
      'Content-Type': 'application/json',
    },
    body,
    search: '',
  });
}

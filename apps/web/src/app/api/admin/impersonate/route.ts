import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

/**
 * POST → Nexus POST /api/platform/impersonate
 * Returns short-lived Bearer for the target brand tenant.
 */
export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.text();
  return proxyNexusJson(req, '/api/platform/impersonate', {
    method: 'POST',
    headers: {
      ...forwardOperatorHeaders(req),
      'Content-Type': 'application/json',
    },
    body,
    search: '',
  });
}

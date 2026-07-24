import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ tenantId: string }> };

/** PUT → Nexus PUT /api/platform/tenants/{id}/subscription */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId } = await ctx.params;
  const body = await req.text();
  return proxyNexusJson(req, `/api/platform/tenants/${tenantId}/subscription`, {
    method: 'PUT',
    headers: {
      ...forwardOperatorHeaders(req),
      'Content-Type': 'application/json',
    },
    body,
    search: '',
  });
}

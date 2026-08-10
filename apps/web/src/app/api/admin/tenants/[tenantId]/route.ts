import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ tenantId: string }> };

/** GET → Nexus GET /api/platform/tenants/{id} */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId } = await ctx.params;
  return proxyNexusJson(req, `/api/platform/tenants/${tenantId}`, {
    method: 'GET',
    headers: forwardOperatorHeaders(req),
    body: null,
    search: '',
  });
}

/** PATCH → Nexus PATCH /api/platform/tenants/{id} */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId } = await ctx.params;
  const body = await req.text();
  return proxyNexusJson(req, `/api/platform/tenants/${tenantId}`, {
    method: 'PATCH',
    headers: {
      ...forwardOperatorHeaders(req),
      'Content-Type': 'application/json',
    },
    body,
    search: '',
  });
}

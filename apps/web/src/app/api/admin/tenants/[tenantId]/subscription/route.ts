import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import {
  forwardOperatorHeaders,
  proxyNexusJson,
  targetTenantInternalHeaders,
} from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ tenantId: string }> };

/**
 * GET → Nexus GET /api/packages/subscription scoped to target tenant
 * (INTERNAL_API_KEY + X-Platform-Admin). Dedicated platform GET not yet on Nexus.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId } = await ctx.params;
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return Response.json({ error: 'invalid tenantId' }, { status: 400 });
  }

  return proxyNexusJson(req, '/api/packages/subscription', {
    method: 'GET',
    headers: targetTenantInternalHeaders(tenantId, {
      userId: req.headers.get('x-user-id')?.trim() || undefined,
    }),
    body: null,
    search: '',
  });
}

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

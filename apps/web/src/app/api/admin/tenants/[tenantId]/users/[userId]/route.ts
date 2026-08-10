import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ tenantId: string; userId: string }> };

/** PUT body: { role } or { is_active } — routes to Nexus role/active endpoints. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId, userId } = await ctx.params;
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action =
    typeof body?.action === 'string'
      ? body.action
      : body?.role != null
        ? 'role'
        : body?.is_active != null || body?.isActive != null
          ? 'active'
          : null;

  const headers = {
    ...forwardOperatorHeaders(req),
    'Content-Type': 'application/json',
  };

  if (action === 'role') {
    return proxyNexusJson(req, `/api/platform/tenants/${tenantId}/users/${userId}/role`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ role: body.role }),
      search: '',
    });
  }

  if (action === 'active') {
    const isActive = body.is_active ?? body.isActive;
    return proxyNexusJson(req, `/api/platform/tenants/${tenantId}/users/${userId}/active`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ isActive }),
      search: '',
    });
  }

  return Response.json(
    { error: 'Provide action=role|active, or body.role / body.is_active' },
    { status: 400 },
  );
}

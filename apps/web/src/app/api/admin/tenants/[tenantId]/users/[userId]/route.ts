import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';

export const runtime = 'nodejs';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

type Ctx = { params: Promise<{ tenantId: string; userId: string }> };

function forwardHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const authorization = req.headers.get('authorization');
  const tenant = req.headers.get('x-tenant-id');
  const user = req.headers.get('x-user-id');
  if (authorization) headers.Authorization = authorization;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  if (user) headers['X-User-Id'] = user;
  return headers;
}

/** PUT body: { role } or { is_active } — routes to Nexus role/active endpoints. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId, userId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action =
    typeof body?.action === 'string'
      ? body.action
      : body?.role != null
        ? 'role'
        : body?.is_active != null || body?.isActive != null
          ? 'active'
          : null;

  if (action === 'role') {
    const upstream = await fetch(
      `${NEXUS_API}/api/platform/tenants/${tenantId}/users/${userId}/role`,
      {
        method: 'PUT',
        headers: forwardHeaders(req),
        body: JSON.stringify({ role: body.role }),
        cache: 'no-store',
      },
    );
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  }

  if (action === 'active') {
    const isActive = body.is_active ?? body.isActive;
    const upstream = await fetch(
      `${NEXUS_API}/api/platform/tenants/${tenantId}/users/${userId}/active`,
      {
        method: 'PUT',
        headers: forwardHeaders(req),
        body: JSON.stringify({ isActive }),
        cache: 'no-store',
      },
    );
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
    });
  }

  return Response.json(
    { error: 'Provide action=role|active, or body.role / body.is_active' },
    { status: 400 },
  );
}

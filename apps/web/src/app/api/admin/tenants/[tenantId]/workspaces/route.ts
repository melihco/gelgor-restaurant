import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';

export const runtime = 'nodejs';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

type Ctx = { params: Promise<{ tenantId: string }> };

function forwardHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const authorization = req.headers.get('authorization');
  const tenant = req.headers.get('x-tenant-id');
  const user = req.headers.get('x-user-id');
  if (authorization) headers.Authorization = authorization;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  if (user) headers['X-User-Id'] = user;
  return headers;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId } = await ctx.params;
  const upstream = await fetch(
    `${NEXUS_API}/api/platform/tenants/${tenantId}/workspaces`,
    { headers: forwardHeaders(req), cache: 'no-store' },
  );
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const headers = { ...forwardHeaders(req), 'Content-Type': 'application/json' };
  const upstream = await fetch(
    `${NEXUS_API}/api/platform/tenants/${tenantId}/workspaces`,
    { method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store' },
  );
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

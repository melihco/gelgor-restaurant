import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

/**
 * Platform admin — create tenant + office + optional owner + Python mirror bootstrap.
 * Proxies Nexus POST /api/platform/tenants/bootstrap
 */
export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
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

  const upstream = await fetch(`${NEXUS_API}/api/platform/tenants/bootstrap`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

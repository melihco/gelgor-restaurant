import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';

export const runtime = 'nodejs';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

/** Platform admin — cross-tenant user search. */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const authorization = req.headers.get('authorization');
  const tenant = req.headers.get('x-tenant-id');
  const user = req.headers.get('x-user-id');
  if (authorization) headers.Authorization = authorization;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  if (user) headers['X-User-Id'] = user;

  const qs = req.nextUrl.searchParams.toString();
  const upstream = await fetch(
    `${NEXUS_API}/api/platform/users${qs ? `?${qs}` : ''}`,
    { headers, cache: 'no-store' },
  );
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
}

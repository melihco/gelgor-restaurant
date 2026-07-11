import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const access = await assertPlatformAdminAccess(req);
  if (access instanceof Response) return access;

  const workspaceId = req.nextUrl.searchParams.get('workspaceId')?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }
  const url = new URL(`/api/production-context/${workspaceId}/snapshot`, req.nextUrl.origin);
  const authorization = req.headers.get('authorization');
  const headers: HeadersInit = authorization ? { Authorization: authorization } : {};
  const upstream = await fetch(url, { headers, cache: 'no-store' });
  const data = await upstream.json().catch(() => ({ error: 'snapshot_unavailable' }));
  return NextResponse.json(data, { status: upstream.status });
}

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const workspaceId = req.nextUrl.searchParams.get('workspaceId')?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
  }
  const url = new URL(`/api/production-context/${workspaceId}/snapshot`, req.nextUrl.origin);
  const auth = req.headers.get('authorization');
  const headers: HeadersInit = auth ? { Authorization: auth } : {};
  const upstream = await fetch(url, { headers, cache: 'no-store' });
  const data = await upstream.json().catch(() => ({ error: 'snapshot_unavailable' }));
  return NextResponse.json(data, { status: upstream.status });
}

import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

function resolveWorkspaceId(request: NextRequest): string {
  return (
    request.nextUrl.searchParams.get('workspaceId')
    ?? request.headers.get('X-Tenant-Id')
    ?? request.headers.get('x-tenant-id')
    ?? ''
  ).trim();
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const workspaceId = resolveWorkspaceId(request);
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const upstream = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/social/meta/analytics/${workspaceId}`,
    { timeoutMs: 20_000, workspaceId },
  );

  if (!upstream.ok) {
    return NextResponse.json({
      connected: false,
      unavailable: true,
      error: upstream.error === 'upstream_error'
        ? 'Meta analytics service unavailable'
        : upstream.error ?? 'Meta analytics unavailable',
    });
  }

  return NextResponse.json(upstream.data ?? { connected: false });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const workspaceId = resolveWorkspaceId(request);
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const upstream = await fetchCrewBackendJson(
    `/api/v1/social/meta/disconnect/${workspaceId}`,
    { method: 'DELETE', timeoutMs: 15_000, workspaceId },
  );

  if (!upstream.ok) {
    return NextResponse.json(
      { error: upstream.error ?? 'disconnect failed' },
      { status: upstream.status || 503 },
    );
  }

  return NextResponse.json({ success: true });
}

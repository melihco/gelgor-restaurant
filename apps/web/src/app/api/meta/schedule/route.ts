import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

function resolveWorkspaceId(req: NextRequest): string | null {
  const ws = req.nextUrl.searchParams.get('workspaceId')?.trim();
  return ws || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const workspaceId = String(body?.workspaceId ?? '').trim();
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  const { workspaceId: _ws, ...payload } = body ?? {};

  const upstream = await fetchCrewBackendJson(
    `/api/v1/social/schedule/${workspaceId}`,
    { method: 'POST', body: payload, timeoutMs: 15_000, workspaceId },
  );

  if (!upstream.ok) {
    const detail = (upstream.data as { detail?: string } | null)?.detail;
    return NextResponse.json(
      { error: detail ?? upstream.error ?? 'Schedule failed' },
      { status: upstream.status || 503 },
    );
  }

  return NextResponse.json(upstream.data ?? {}, { status: 200 });
}

export async function GET(req: NextRequest) {
  const workspaceId = resolveWorkspaceId(req);
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const upstream = await fetchCrewBackendJson<unknown[]>(
    `/api/v1/social/schedule/${workspaceId}`,
    { timeoutMs: 15_000, workspaceId },
  );

  if (!upstream.ok) {
    return NextResponse.json([]);
  }

  return NextResponse.json(Array.isArray(upstream.data) ? upstream.data : []);
}

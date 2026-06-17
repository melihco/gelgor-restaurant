import { NextRequest, NextResponse } from 'next/server';
import { readBrandContextFromDb } from '@/lib/brand-context-db-fallback';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const proxied = await proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}`, {
    timeoutMs: 8_000,
  });
  if (proxied.status === 200) {
    return proxied;
  }
  const row = await readBrandContextFromDb(workspaceId);
  if (row) {
    return NextResponse.json(row, { status: 200 });
  }
  return proxied;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json();
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}`, {
    method: 'PATCH',
    body,
  });
}

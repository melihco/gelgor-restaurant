import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/gallery-analysis`, {
    method: 'GET',
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await request.json().catch(() => null);
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/gallery-analysis`, {
    body,
    timeoutMs: 10_000,
  });
}

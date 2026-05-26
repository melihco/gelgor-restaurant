import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 90; // CEO agent may take up to 60s on first run

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  // GET proxied as POST with no body — crew-proxy sends GET when body is undefined
  const res = await proxyToCrewBackend(
    `/api/v1/intelligence/${workspaceId}/recommendations`,
    { timeoutMs: 80_000 },
  );
  return res;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(
    `/api/v1/intelligence/${workspaceId}/recommendations/refresh`,
    { body: {}, timeoutMs: 80_000 },
  );
}

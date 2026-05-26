import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const days = req.nextUrl.searchParams.get('days') ?? '7';
  return proxyToCrewBackend(`/api/v1/usage-cost/${workspaceId}?days=${days}`, {
    workspaceId,
    timeoutMs: 10_000,
  });
}

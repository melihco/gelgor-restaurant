import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/analyze-competitors`, {
    method: 'POST',
    timeoutMs: 120_000,
  });
}

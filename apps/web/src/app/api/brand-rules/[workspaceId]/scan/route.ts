import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(
    `/api/v1/brand-rules/${workspaceId}/scan`,
    { body: {}, timeoutMs: 25_000 },
  );
}

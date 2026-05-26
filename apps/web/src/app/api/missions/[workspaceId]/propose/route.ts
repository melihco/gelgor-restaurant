import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 120; // StrategistAgent takes 30–90s

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/propose`,
    { body: {}, timeoutMs: 110_000 },
  );
}

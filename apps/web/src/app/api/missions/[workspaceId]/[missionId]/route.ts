import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  return proxyToCrewBackend(`/api/v1/missions/${workspaceId}/${missionId}`);
}

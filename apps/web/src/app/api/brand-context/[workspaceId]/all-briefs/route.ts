import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
export const runtime = 'nodejs';
export async function GET(_req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/all-briefs`, { method: 'GET' });
}

import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
export const runtime = 'nodejs';
export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const body = await req.json().catch(() => null);
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/set-language`, { body });
}

import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
export const runtime = 'nodejs';
export const maxDuration = 15;
export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const body = await req.json();
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/assign-template`, { body, timeoutMs: 10_000 });
}

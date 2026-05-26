import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/pinterest-inspiration`, { method: 'GET', timeoutMs: 10_000 });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/pinterest-inspiration`, { body: {}, timeoutMs: 115_000 });
}

import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { brsCache, basCache } from '@/lib/server-ttl-cache';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const synthesizeDna = body.synthesize_dna !== false;

  const res = await proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/confirm-constitution`, {
    body: {
      auto_confirmed: Boolean(body.auto_confirmed),
      synthesize_dna: synthesizeDna,
    },
    timeoutMs: synthesizeDna ? 120_000 : 30_000,
  });

  // Brand context changed — evict cached scores so next dashboard load is fresh.
  brsCache.delete(workspaceId);
  basCache.delete(workspaceId);

  return res;
}

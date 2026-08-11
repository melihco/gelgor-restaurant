import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';

/** Tenant-scoped workspace cost rollup (cost_events SSOT). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const guard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (guard) return guard;

  const days = req.nextUrl.searchParams.get('days') ?? '30';
  return proxyToCrewBackend(
    `/api/v1/cost-ledger/${workspaceId}/workspace/summary?days=${encodeURIComponent(days)}`,
    { workspaceId, timeoutMs: 15_000 },
  );
}

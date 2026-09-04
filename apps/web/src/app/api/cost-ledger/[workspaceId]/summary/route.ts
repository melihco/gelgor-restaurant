import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';

function emptyWorkspaceCostSummary(workspaceId: string, daysRaw: string) {
  const parsed = Number.parseInt(daysRaw, 10);
  const days = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 90)) : 30;
  return {
    workspace_id: workspaceId,
    days,
    period_total_usd: 0,
    period_measured_usd: 0,
    period_estimated_usd: 0,
    by_scope: {},
    daily_series: [],
    top_missions: [],
    degraded: true,
  };
}

/** Tenant-scoped workspace cost rollup (cost_events SSOT). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const guard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (guard) return guard;

  const days = req.nextUrl.searchParams.get('days') ?? '30';
  const proxied = await proxyToCrewBackend(
    `/api/v1/cost-ledger/${workspaceId}/workspace/summary?days=${encodeURIComponent(days)}`,
    { workspaceId, timeoutMs: 15_000 },
  );
  if (proxied.status < 500) return proxied;
  return NextResponse.json(emptyWorkspaceCostSummary(workspaceId, days), { status: 200 });
}

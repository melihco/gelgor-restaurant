/**
 * POST /api/brand-context/{workspaceId}/complete-gaps
 * GET  — preview gaps (proxies Python brand-gaps)
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  assertPathTenantMatchesRequest,
  buildTenantForwardHeaders,
} from '@/lib/tenant-production-guard';
import { runCompleteBrandGaps } from '@/lib/brand-complete-gaps';
import type { BrandGapItem } from '@/lib/brand-gap-analysis';

export const runtime = 'nodejs';
export const maxDuration = 360;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const denied = assertPathTenantMatchesRequest(req, workspaceId);
  if (denied) return denied;

  const res = await fetchCrewBackendJson<{ gaps?: BrandGapItem[]; gap_count?: number }>(
    `/api/v1/brand-context/${workspaceId}/brand-gaps`,
    {
      workspaceId,
      headers: buildTenantForwardHeaders(req),
      timeoutMs: 30_000,
    },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? 'brand_gaps_unavailable', gaps: [] },
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  return NextResponse.json({
    tenantId: workspaceId,
    gapCount: res.data?.gap_count ?? res.data?.gaps?.length ?? 0,
    gaps: res.data?.gaps ?? [],
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const denied = assertPathTenantMatchesRequest(req, workspaceId);
  if (denied) return denied;

  const forwardHeaders = buildTenantForwardHeaders(req);
  const result = await runCompleteBrandGaps(workspaceId, forwardHeaders);

  return NextResponse.json({
    tenantId: workspaceId,
    ...result,
  }, { status: result.ok ? 200 : 502 });
}

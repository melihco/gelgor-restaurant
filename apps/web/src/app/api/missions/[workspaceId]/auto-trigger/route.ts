/**
 * POST /api/missions/{workspaceId}/auto-trigger
 *
 * Lightweight endpoint called fire-and-forget from PlatformFeed on mount.
 * Checks whether a mission is already running/proposed; if not, proposes
 * new missions and auto-approves the first one so the full pipeline runs:
 *   propose → approve → task_graph_executor → content_ideation
 *   → _trigger_auto_produce → /api/auto-produce → Feed artifacts
 *
 * Designed to be called with no-cache / best-effort — errors never bubble
 * to the UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import {
  assertPathTenantMatchesRequest,
  buildTenantForwardHeaders,
  fetchBrandAlignmentGate,
} from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 120; // propose calls StrategistAgent (~60-90s)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  // 0. Autonomy gate (Sprint 10): only auto-trigger when the brand alignment
  //    score allows it (BAS = 100 → canAutoProduce). Foundation-first: a tenant
  //    with incomplete brand/gallery/context never auto-produces.
  const basRes = await fetchBrandAlignmentGate(req, workspaceId);
  if (!basRes || !basRes.canAutoProduce) {
    return NextResponse.json({
      skipped: true,
      reason: 'quality_gate',
      bas: basRes?.bas ?? null,
      detail: 'Otonom üretim için BAS=100 gerekli (canAutoProduce).',
    });
  }

  // 1. Check if there are already active/proposed missions — skip if so
  const listRes = await proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}?limit=20`,
  );
  if (!listRes.ok) {
    return NextResponse.json({ skipped: true, reason: 'list_failed' });
  }

  const missions: { status: string }[] = await listRes.json().catch(() => []);
  const hasActive = missions.some(
    m => m.status === 'in_flight' || m.status === 'approved',
  );
  const hasProposed = missions.some(m => m.status === 'proposed');

  // Count completed missions today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  if (hasActive) {
    return NextResponse.json({ skipped: true, reason: 'already_active' });
  }

  // 2. If there are proposed missions, approve the first one
  if (hasProposed) {
    const firstProposed = missions.find(m => m.status === 'proposed') as { id: string; status: string } | undefined;
    if (firstProposed) {
      await proxyToCrewBackend(
        `/api/v1/missions/${workspaceId}/${firstProposed.id}/approve`,
        { method: 'PUT', body: { approved_by: 'auto-feed' }, timeoutMs: 10_000 },
      ).catch(() => null);
      return NextResponse.json({ triggered: true, action: 'approved_existing', missionId: firstProposed.id });
    }
  }

  // 3. Propose new missions
  const proposeRes = await proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/propose`,
    { body: {}, timeoutMs: 110_000 },
  );

  if (!proposeRes.ok) {
    return NextResponse.json({ skipped: true, reason: 'propose_failed' });
  }

  // Propose returns { proposals_created, missions: [...] } — not a bare array.
  const proposeData = await proposeRes.json().catch(() => null) as
    | { missions?: { id: string }[] }
    | null;
  const proposals: { id: string }[] = proposeData?.missions ?? [];
  if (!proposals.length) {
    return NextResponse.json({ skipped: true, reason: 'no_proposals' });
  }

  // 4. Auto-approve the highest-priority (first) proposal
  const first = proposals[0]!;
  await proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/${first.id}/approve`,
    { method: 'PUT', body: { approved_by: 'auto-feed' }, timeoutMs: 10_000 },
  ).catch(() => null);

  return NextResponse.json({ triggered: true, action: 'proposed_and_approved', missionId: first.id });
}

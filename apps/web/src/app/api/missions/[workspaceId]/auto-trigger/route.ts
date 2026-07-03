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
import { buildDiversityDirective } from '@/lib/mission-diversity';
import {
  assertPathTenantMatchesRequest,
  fetchBrandAlignmentGate,
} from '@/lib/tenant-production-guard';

/** Fetch context signals for this workspace (best-effort, returns null on failure). */
async function fetchContextSignals(
  workspaceId: string,
  req: NextRequest,
): Promise<string | null> {
  try {
    const origin = req.nextUrl.origin;
    const res = await fetch(`${origin}/api/context-signals/${encodeURIComponent(workspaceId)}`, {
      headers: { cookie: req.headers.get('cookie') ?? '' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { promptBlock?: string | null };
    return data?.promptBlock?.trim() || null;
  } catch {
    return null;
  }
}

export const runtime = 'nodejs';
export const maxDuration = 120; // propose calls StrategistAgent (~60-90s)

type MissionListItem = { id: string; status: string; title?: string; type?: string; objective?: string; trigger_signal?: string };

function normalizeMissionList(data: unknown): MissionListItem[] {
  if (Array.isArray(data)) {
    return data
      .map((m) => {
        const row = m as Record<string, unknown>;
        const id = String(row.id ?? row.mission_id ?? '').trim();
        const status = String(row.status ?? '').trim();
        const title = String(row.title ?? '').trim() || undefined;
        const type = String(row.type ?? '').trim() || undefined;
        const objective = String(row.objective ?? '').trim() || undefined;
        const trigger_signal = String(row.trigger_signal ?? '').trim() || undefined;
        return id && status
          ? { id, status, title, type, objective, trigger_signal }
          : null;
      })
      .filter((m): m is MissionListItem => m !== null);
  }
  if (data && typeof data === 'object') {
    const wrapped = (data as { missions?: unknown }).missions;
    if (Array.isArray(wrapped)) return normalizeMissionList(wrapped);
  }
  return [];
}

function proposalMissionId(m: Record<string, unknown>): string | null {
  const id = String(m.id ?? m.mission_id ?? '').trim();
  return id || null;
}

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

  const missions = normalizeMissionList(await listRes.json().catch(() => null));
  const hasActive = missions.some(
    m => m.status === 'in_flight' || m.status === 'approved',
  );
  const hasProposed = missions.some(m => m.status === 'proposed');
  const completedCount = missions.filter(m => m.status === 'completed').length;

  if (hasActive) {
    return NextResponse.json({ skipped: true, reason: 'already_active' });
  }

  // Completed weekly cycle — do not auto-propose on every Feed mount (cost leak).
  if (completedCount > 0 && !hasProposed) {
    return NextResponse.json({
      skipped: true,
      reason: 'completed_missions_exist',
      completed_count: completedCount,
      detail: 'Tamamlanmış mission varken yeni öneri oluşturulmadı.',
    });
  }

  // 2. If there are proposed missions, approve the first one
  if (hasProposed) {
    const firstProposed = missions.find(m => m.status === 'proposed');
    if (firstProposed) {
      await proxyToCrewBackend(
        `/api/v1/missions/${workspaceId}/${firstProposed.id}/approve`,
        { method: 'PUT', body: { approved_by: 'auto-feed' }, timeoutMs: 10_000 },
      ).catch(() => null);
      return NextResponse.json({ triggered: true, action: 'approved_existing', missionId: firstProposed.id });
    }
  }

  // 3. Fetch context signals (trend, sector, season) before proposing.
  //    Best-effort — proposal proceeds even if context signals are unavailable.
  const contextSignals = await fetchContextSignals(workspaceId, req);

  // 3b. Build diversity directive from recent missions so auto-trigger proposals
  //     don't repeat themes (previously only injected via Mission Hub UI).
  const diversityBlock = buildDiversityDirective(
    missions.filter((m) => m.status !== 'rejected' && m.status !== 'cancelled'),
  );

  const proposeBlock = [contextSignals, diversityBlock].filter(Boolean).join('\n\n');

  // 4. Propose new missions — inject context signals + diversity directive
  const proposeRes = await proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/propose`,
    {
      body: proposeBlock ? { context_signals: proposeBlock } : {},
      timeoutMs: 110_000,
    },
  );

  if (!proposeRes.ok) {
    return NextResponse.json({ skipped: true, reason: 'propose_failed' });
  }

  // Propose returns { proposals_created, missions: [...] } — not a bare array.
  const proposeData = await proposeRes.json().catch(() => null) as
    | { missions?: Record<string, unknown>[] }
    | Record<string, unknown>[]
    | null;
  const rawProposals = Array.isArray(proposeData)
    ? proposeData
    : (proposeData?.missions ?? []);
  const proposals = rawProposals
    .map((m) => {
      const id = proposalMissionId(m);
      return id ? { id } : null;
    })
    .filter((m): m is { id: string } => m !== null);
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

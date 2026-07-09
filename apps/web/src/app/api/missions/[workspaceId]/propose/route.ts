import { NextRequest, NextResponse } from 'next/server';
import { BRS_PROPOSE_THRESHOLD } from '@/lib/brand-readiness';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import {
  assertPathTenantMatchesRequest,
  buildTenantForwardHeaders,
} from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 120; // StrategistAgent takes 30–90s

/**
 * Foundation quality gate: propose requires BRS >= 70 and GIS >= 70.
 * BRS threshold aligned with UI gate (brand-readiness.ts BRS_PROPOSE_THRESHOLD).
 * Constitution approval pushes BRS to 85+ (full autonomy path), but core brand
 * data (gallery, pillars, CTAs, theme) at 70+ is sufficient for proposal.
 */
const BRS_GATE = BRS_PROPOSE_THRESHOLD;
const GIS_GATE = 70;

async function proposalBlockedByQualityGate(
  origin: string,
  workspaceId: string,
  headers: HeadersInit,
): Promise<{ blocked: boolean; brs: number | null; gis: number | null }> {
  try {
    const [brsRes, gisRes] = await Promise.all([
      fetch(`${origin}/api/brand-readiness/${workspaceId}`, { headers })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${origin}/api/gallery-intelligence/${workspaceId}`, { headers })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const brs = typeof brsRes?.score === 'number' ? brsRes.score : null;
    const gis = typeof gisRes?.score === 'number' ? gisRes.score : null;
    const blocked = (brs != null && brs < BRS_GATE) || (gis != null && gis < GIS_GATE);
    return { blocked, brs, gis };
  } catch {
    // Gate evaluation failed — allow propose to proceed rather than hard-block.
    return { blocked: false, brs: null, gis: null };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  // Forward optional { context_signals } so the Strategist receives deterministic
  // context (season, full moon, holidays, sector triggers) at propose time.
  const body = await req.json().catch(() => ({}));
  const background = body && typeof body === 'object' && (body as { background?: unknown }).background === true;

  // Server-side quality gate — fetch readiness + gallery intelligence and block
  // proposing until the foundation is solid. Best-effort: if the gate checks
  // themselves fail to load, we do NOT hard-block (avoid false negatives).
  const origin = req.nextUrl.origin;
  const fwd = buildTenantForwardHeaders(req);
  if (background) {
    void (async () => {
      const gate = await proposalBlockedByQualityGate(origin, workspaceId, fwd);
      if (gate.blocked) {
        console.warn(
          `[missions/propose] background quality gate blocked workspace=${workspaceId} brs=${gate.brs ?? '—'} gis=${gate.gis ?? '—'}`,
        );
        return;
      }
      const proposeBody = { ...(body as Record<string, unknown>) };
      delete proposeBody.background;
      const res = await proxyToCrewBackend(
        `/api/v1/missions/${workspaceId}/propose`,
        { body: proposeBody, timeoutMs: 110_000 },
      ).catch((err) => {
        console.warn('[missions/propose] background propose failed:', err instanceof Error ? err.message : err);
        return null;
      });
      if (res && !res.ok) {
        console.warn(`[missions/propose] background propose returned ${res.status} workspace=${workspaceId}`);
      }
    })();

    return NextResponse.json({ queued: true, background: true }, { status: 202 });
  }

  const gate = await proposalBlockedByQualityGate(origin, workspaceId, fwd);
  if (gate.blocked) {
    return NextResponse.json(
      {
        error: 'quality_gate_blocked',
        detail:
          `Marka hazırlığı veya galeri zekâsı yetersiz. ` +
          `Marka Hazırlığı (BRS): ${gate.brs ?? '—'}/${BRS_GATE}, ` +
          `Galeri Zekâsı (GIS): ${gate.gis ?? '—'}/${GIS_GATE}. ` +
          `Önce eksikleri tamamlayın.`,
        brs: gate.brs,
        gis: gate.gis,
        gates: { brs: BRS_GATE, gis: GIS_GATE },
      },
      { status: 412 },
    );
  }

  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/propose`,
    { body: body ?? {}, timeoutMs: 110_000 },
  );
}

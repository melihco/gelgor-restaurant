import { NextRequest, NextResponse } from 'next/server';
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
const BRS_GATE = 70;
const GIS_GATE = 70;

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

  // Server-side quality gate — fetch readiness + gallery intelligence and block
  // proposing until the foundation is solid. Best-effort: if the gate checks
  // themselves fail to load, we do NOT hard-block (avoid false negatives).
  const origin = req.nextUrl.origin;
  const fwd = buildTenantForwardHeaders(req);
  try {
    const [brsRes, gisRes] = await Promise.all([
      fetch(`${origin}/api/brand-readiness/${workspaceId}`, { headers: fwd })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${origin}/api/gallery-intelligence/${workspaceId}`, { headers: fwd })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const brs = typeof brsRes?.score === 'number' ? brsRes.score : null;
    const gis = typeof gisRes?.score === 'number' ? gisRes.score : null;
    const brsFail = brs != null && brs < BRS_GATE;
    const gisFail = gis != null && gis < GIS_GATE;
    if (brsFail || gisFail) {
      return NextResponse.json(
        {
          error: 'quality_gate_blocked',
          detail:
            `Marka hazırlığı veya galeri zekâsı yetersiz. ` +
            `Marka Hazırlığı (BRS): ${brs ?? '—'}/${BRS_GATE}, ` +
            `Galeri Zekâsı (GIS): ${gis ?? '—'}/${GIS_GATE}. ` +
            `Önce eksikleri tamamlayın.`,
          brs,
          gis,
          gates: { brs: BRS_GATE, gis: GIS_GATE },
        },
        { status: 412 },
      );
    }
  } catch {
    // Gate evaluation failed — allow propose to proceed rather than hard-block.
  }

  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/propose`,
    { body: body ?? {}, timeoutMs: 110_000 },
  );
}

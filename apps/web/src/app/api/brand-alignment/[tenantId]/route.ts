/**
 * BFF route — Brand Alignment Score (BAS) aggregate (Sprint 8).
 *
 * GET /api/brand-alignment/{tenantId}
 *
 * Composes the standing foundation sub-scores into the single BAS the dashboard
 * shows. BAS gate = min(BRS, GIS, CCS); autonomy requires all standing scores at
 * 100. ICS (per idea) and PIS (per renderer payload) are runtime/per-artifact —
 * surfaced as informational here, measured live during production.
 *
 * See docs/foundation-sprint-program.md § "BAS = min(BRS, GIS, CCS, ICS, PIS)".
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { BRS_PROPOSE_THRESHOLD } from '@/lib/brand-readiness';
import {
  assertPathTenantMatchesRequest,
  buildTenantForwardHeaders,
} from '@/lib/tenant-production-guard';
import { basCache } from '@/lib/server-ttl-cache';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

// ICS: average idea-contract completeness from last 5 content_ideation nodes (Python).
// PIS: average artifact completeness (headline + caption + image) from last 20 artifacts (Nexus).
const NEXUS_API = serverConfig.nexus.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

async function computeIcs(tenantId: string): Promise<number | null> {
  try {
    const res = await fetchCrewBackendJson<{ ics: number }>(
      `/api/v1/brand-context/${tenantId}/ics-score`,
      { workspaceId: tenantId },
    );
    if (res.ok && typeof res.data?.ics === 'number') return res.data.ics;
    return null;
  } catch {
    return null;
  }
}

async function computePis(tenantId: string): Promise<number | null> {
  try {
    const res = await fetch(`${NEXUS_API}/api/artifacts?limit=20`, {
      headers: {
        'X-Tenant-Id': tenantId,
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const raw = await res.json();
    const arts: unknown[] = Array.isArray(raw) ? raw : (raw as { items?: unknown[] }).items ?? [];
    if (!arts.length) return null;

    let totalScore = 0;
    let count = 0;
    for (const art of arts.slice(0, 20)) {
      const a = art as Record<string, unknown>;
      const contentStr = typeof a.content === 'string' ? a.content : '{}';
      let c: Record<string, unknown> = {};
      try { c = JSON.parse(contentStr); } catch { c = {}; }
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      const present = [
        Boolean((c.headline as string) || (meta.headline as string)),
        Boolean((c.caption as string) || (meta.caption as string)),
        Boolean(a.contentUrl || c.imageUrl || c.videoUrl),
        Boolean((c.hashtags as unknown[])?.length || (meta.hashtags as unknown[])?.length),
        Boolean(c.kind || a.artifactType),
      ].filter(Boolean).length;
      totalScore += Math.round((present / 5) * 100);
      count++;
    }
    return count > 0 ? Math.round(totalScore / count) : null;
  } catch {
    return null;
  }
}

interface SubScore {
  id: 'BRS' | 'GIS' | 'CCS' | 'ICS' | 'PIS';
  label: string;
  score: number | null;
  /** 'standing' = always-measurable; 'runtime' = measured during production. */
  kind: 'standing' | 'runtime';
  /** UI deep-link target (mobile screen id or hint). */
  fix: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, tenantId);
  if (tenantGuard) return tenantGuard;

  const cached = basCache.get(tenantId);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=60' },
    });
  }

  const origin = req.nextUrl.origin;
  const fwd = { ...buildTenantForwardHeaders(req) };

  const [brs, gis, ccs, icsScore, pisScore] = await Promise.all([
    fetch(`${origin}/api/brand-readiness/${tenantId}`, { headers: fwd })
      .then((r) => r.json())
      .catch(() => null),
    fetch(`${origin}/api/gallery-intelligence/${tenantId}`, { headers: fwd })
      .then((r) => r.json())
      .catch(() => null),
    fetch(`${origin}/api/context-signals/${tenantId}`, { headers: fwd })
      .then((r) => r.json())
      .catch(() => null),
    computeIcs(tenantId),
    computePis(tenantId),
  ]);

  const brsScore = typeof brs?.score === 'number' ? brs.score : null;
  const gisScore = typeof gis?.score === 'number' ? gis.score : null;
  const ccsScore = typeof ccs?.coverageScore === 'number' ? ccs.coverageScore : null;

  const subScores: SubScore[] = [
    { id: 'BRS', label: 'Marka Hazırlığı', score: brsScore, kind: 'standing', fix: 'brand' },
    { id: 'GIS', label: 'Galeri Zekâsı', score: gisScore, kind: 'standing', fix: 'brand' },
    { id: 'CCS', label: 'Bağlam Kapsamı', score: ccsScore, kind: 'standing', fix: 'brand' },
    { id: 'ICS', label: 'Fikir Sözleşmesi', score: icsScore, kind: 'runtime', fix: 'missions' },
    { id: 'PIS', label: 'Prompt Bütünlüğü', score: pisScore, kind: 'runtime', fix: 'missions' },
  ];

  const standing = [brsScore, gisScore, ccsScore].filter(
    (s): s is number => typeof s === 'number',
  );
  // BAS core = min of standing scores (null = not yet measurable → 0 contribution).
  const allStandingPresent = standing.length === 3;
  const bas = allStandingPresent ? Math.min(...standing) : Math.min(...(standing.length ? standing : [0]));

  // Autonomy gate: every standing score must be 100 (ICS/PIS validated at runtime).
  const canAutoProduce = allStandingPresent && standing.every((s) => s === 100);
  const canProposeMissions = brsScore != null && gisScore != null
    && brsScore >= BRS_PROPOSE_THRESHOLD && gisScore >= 70;

  // Lowest standing sub-score drives the headline "what to fix".
  const weakest = subScores
    .filter((s) => s.kind === 'standing' && typeof s.score === 'number')
    .sort((a, b) => (a.score as number) - (b.score as number))[0] ?? null;

  const payload = {
    tenantId,
    bas,
    canProposeMissions,
    canAutoProduce,
    subScores,
    weakest: weakest ? { id: weakest.id, label: weakest.label, score: weakest.score, fix: weakest.fix } : null,
    sources: { brs: brs != null, gis: gis != null, ccs: ccs != null },
  };

  basCache.set(tenantId, payload);

  return NextResponse.json(payload, {
    status: 200,
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=60' },
  });
}

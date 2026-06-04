/**
 * BFF route — Context Signals (Sprint 5).
 *
 * GET /api/context-signals/{tenantId}?date=YYYY-MM-DD&lat=&lng=&horizon=
 *
 * Computes the active deterministic context signals (season, weekly rhythm,
 * holidays, full moon, golden hour, …) for a tenant. Brand business_type +
 * location are pulled from the Python brand context; lat/lng can be supplied as
 * query params (geocoding is out of scope for v1).
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import { buildActiveSignals } from '@/lib/context-signals';

export const runtime = 'nodejs';

interface BrandContextRaw {
  business_type?: string | null;
  business_name?: string | null;
  description?: string | null;
  location?: string | null;
}

function num(v: string | null): number | undefined {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, tenantId);
  if (tenantGuard) return tenantGuard;

  const sp = req.nextUrl.searchParams;

  const dateParam = sp.get('date');
  const date = dateParam ? new Date(`${dateParam}T12:00:00Z`) : new Date();
  const horizon = num(sp.get('horizon'));

  const ctxRes = await fetchCrewBackendJson<BrandContextRaw>(
    `/api/v1/brand-context/${tenantId}`,
    { workspaceId: tenantId },
  );
  const ctx = ctxRes.ok ? ctxRes.data ?? {} : {};

  const result = buildActiveSignals({
    date: Number.isNaN(date.getTime()) ? new Date() : date,
    region: 'TR',
    businessType: ctx.business_type ?? undefined,
    brandName: ctx.business_name ?? undefined,
    brandDescription: ctx.description ?? undefined,
    location: ctx.location ?? undefined,
    lat: num(sp.get('lat')),
    lng: num(sp.get('lng')),
    horizonDays: horizon,
  });

  return NextResponse.json({ tenantId, ...result }, { status: 200 });
}

/**
 * BFF route — Gallery analyze coverage job (Sprint 2, S2.1).
 *
 * POST /api/gallery-intelligence/{tenantId}/analyze-coverage
 *   body: { maxImages?: number, tier?: 'standard' | 'hero', forceReanalyze?: boolean }
 *
 * Finds usable reference photos that are not yet analyzed, runs the vision
 * analyzer on them (bounded batch), and persists the results so coverage trends
 * toward 100%. Idempotent: re-running only analyzes what's still missing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import { parseStringOrArray, filterUsablePhotos } from '@/lib/brand-readiness';
import { galleryUrlIdentityKey } from '@/lib/gallery-display-url';
import type { GalleryPhotoAnalysis } from '@/app/api/analyze-gallery/route';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface BrandContextRaw {
  reference_image_urls?: unknown;
  logo_url?: string | null;
}

function normalizeKey(url: string): string {
  return galleryUrlIdentityKey(url);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, tenantId);
  if (tenantGuard) return tenantGuard;

  const body = (await req.json().catch(() => ({}))) as {
    maxImages?: number;
    tier?: 'standard' | 'hero';
    forceReanalyze?: boolean;
  };

  const maxImages = Number.isFinite(body.maxImages)
    ? Math.max(1, Math.min(Number(body.maxImages), 100))
    : 30;
  const tier = body.tier === 'hero' ? 'hero' : 'standard';

  // 1. Load gallery + existing analysis.
  const [ctxRes, galleryRes] = await Promise.all([
    fetchCrewBackendJson<BrandContextRaw>(`/api/v1/brand-context/${tenantId}`, {
      workspaceId: tenantId,
    }),
    fetchCrewBackendJson<Record<string, Partial<GalleryPhotoAnalysis>>>(
      `/api/v1/brand-context/${tenantId}/gallery-analysis`,
      { workspaceId: tenantId },
    ),
  ]);

  if (!ctxRes.ok) {
    return NextResponse.json(
      { error: 'brand_context_unavailable', status: ctxRes.status },
      { status: ctxRes.status === 404 ? 404 : 502 },
    );
  }

  const ctx = ctxRes.data ?? {};
  const existing = (galleryRes.ok && galleryRes.data && typeof galleryRes.data === 'object'
    ? galleryRes.data
    : {}) as Record<string, Partial<GalleryPhotoAnalysis>>;
  const existingKeys = new Set(Object.keys(existing).map(normalizeKey));

  const usablePhotos = filterUsablePhotos(parseStringOrArray(ctx.reference_image_urls), ctx.logo_url);

  // 2. Determine missing URLs.
  const missing = body.forceReanalyze
    ? usablePhotos
    : usablePhotos.filter((u) => !existingKeys.has(normalizeKey(u)));

  if (missing.length === 0) {
    return NextResponse.json({
      tenantId,
      usable: usablePhotos.length,
      alreadyAnalyzed: existingKeys.size,
      newlyAnalyzed: 0,
      remaining: 0,
      complete: true,
    });
  }

  const batch = missing.slice(0, maxImages);

  // 3. Run the vision analyzer (same-origin local route).
  const origin = getNextjsInternalOrigin();
  const analyzeRes = await fetch(`${origin}/api/analyze-gallery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetUrls: batch,
      maxImages: batch.length,
      // When force-reanalyzing, omit cache so vision always re-runs (primary_subject etc.).
      existingAnalysis: body.forceReanalyze ? {} : existing,
      forceReanalyze: Boolean(body.forceReanalyze),
      tier,
    }),
    signal: AbortSignal.timeout(280_000),
  }).catch(() => null);

  if (!analyzeRes || !analyzeRes.ok) {
    return NextResponse.json(
      { error: 'analyze_failed', status: analyzeRes?.status ?? 503 },
      { status: 502 },
    );
  }

  const analyzeData = (await analyzeRes.json()) as {
    results: GalleryPhotoAnalysis[];
    errors?: { url: string; error: string }[];
    newlyAnalyzed?: number;
  };

  const fresh = (analyzeData.results ?? []).filter(
    (r) => !existingKeys.has(normalizeKey(r.url)) || body.forceReanalyze,
  );

  // 4. Persist fresh results back to Python (merge by URL).
  let saved = 0;
  if (fresh.length > 0) {
    const saveRes = await fetchCrewBackendJson<{ saved: number; total: number }>(
      `/api/v1/brand-context/${tenantId}/gallery-analysis`,
      { workspaceId: tenantId, method: 'POST', body: { results: fresh }, timeoutMs: 20_000 },
    );
    saved = saveRes.ok ? (saveRes.data?.saved ?? fresh.length) : 0;
  }

  const remaining = Math.max(0, missing.length - batch.length);

  return NextResponse.json({
    tenantId,
    usable: usablePhotos.length,
    alreadyAnalyzed: existingKeys.size,
    batchSize: batch.length,
    newlyAnalyzed: saved,
    errors: analyzeData.errors ?? [],
    remaining,
    complete: remaining === 0,
    tier,
  });
}

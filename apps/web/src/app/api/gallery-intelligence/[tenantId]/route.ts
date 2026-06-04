/**
 * BFF route — Gallery Intelligence Score (GIS).
 *
 * GET /api/gallery-intelligence/{tenantId}
 *
 * Composes brand-context (reference URLs + logo) with persisted gallery-analysis
 * and scores them via the pure `computeGalleryIntelligence` library.
 * See docs/foundation-sprint-program.md § Sprint 2 (GIS).
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import { parseStringOrArray, filterUsablePhotos } from '@/lib/brand-readiness';
import {
  computeGalleryIntelligence,
  computeAnalysisQuality,
  type AnalysisLike,
  type GalleryIntelligenceInputs,
} from '@/lib/gallery-intelligence';

export const runtime = 'nodejs';

interface BrandContextRaw {
  reference_image_urls?: unknown;
  logo_url?: string | null;
}

function normalizeKey(url: string): string {
  return url.split('?')[0] ?? url;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, tenantId);
  if (tenantGuard) return tenantGuard;

  const [ctxRes, galleryRes, matchRes] = await Promise.all([
    fetchCrewBackendJson<BrandContextRaw>(`/api/v1/brand-context/${tenantId}`, {
      workspaceId: tenantId,
    }),
    fetchCrewBackendJson<Record<string, AnalysisLike>>(
      `/api/v1/brand-context/${tenantId}/gallery-analysis`,
      { workspaceId: tenantId },
    ),
    fetchCrewBackendJson<{ scores?: number[] }>(
      `/api/v1/brand-context/${tenantId}/gallery-match-stats`,
      { workspaceId: tenantId },
    ),
  ]);

  if (!ctxRes.ok && ctxRes.status === 404) {
    return NextResponse.json(
      { error: 'brand_context_not_found', tenantId, score: 0, checks: [] },
      { status: 404 },
    );
  }

  const ctx = ctxRes.data ?? {};
  const galleryMap = galleryRes.ok && galleryRes.data && typeof galleryRes.data === 'object'
    ? galleryRes.data
    : {};

  const allUrls = parseStringOrArray(ctx.reference_image_urls);
  const usablePhotos = filterUsablePhotos(allUrls, ctx.logo_url);

  // Index analysis by normalized URL key for robust matching.
  const analysisByKey = new Map<string, AnalysisLike>();
  for (const [k, v] of Object.entries(galleryMap)) {
    if (v && typeof v === 'object') analysisByKey.set(normalizeKey(k), v as AnalysisLike);
  }

  const qualityScores: number[] = [];
  let analyzedPhotoCount = 0;
  let lastAnalyzedAt: string | null = null;

  for (const url of usablePhotos) {
    const entry = analysisByKey.get(normalizeKey(url));
    if (!entry || !entry.description) continue;
    analyzedPhotoCount += 1;
    // Use cached quality if present, else compute from fields (handles old entries).
    const q = typeof entry.qualityScore === 'number'
      ? entry.qualityScore
      : computeAnalysisQuality(entry);
    qualityScores.push(q);
    if (entry.analyzedAt) {
      if (!lastAnalyzedAt || Date.parse(entry.analyzedAt) > Date.parse(lastAnalyzedAt)) {
        lastAnalyzedAt = entry.analyzedAt;
      }
    }
  }

  const recentMatchScores = matchRes.ok && Array.isArray(matchRes.data?.scores)
    ? matchRes.data!.scores.filter((n): n is number => typeof n === 'number')
    : [];

  const inputs: GalleryIntelligenceInputs = {
    usablePhotoCount: usablePhotos.length,
    analyzedPhotoCount,
    qualityScores,
    lastAnalyzedAt,
    recentMatchScores,
  };

  const result = computeGalleryIntelligence(inputs);

  return NextResponse.json(
    {
      tenantId,
      ...result,
      inputs: { ...inputs, qualityScores: undefined },
      avgQuality: qualityScores.length
        ? Math.round(qualityScores.reduce((s, n) => s + n, 0) / qualityScores.length)
        : 0,
      sources: { brandContext: ctxRes.ok, galleryAnalysis: galleryRes.ok, matchStats: matchRes.ok },
    },
    { status: 200 },
  );
}

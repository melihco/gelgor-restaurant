/**
 * BFF route — Brand Readiness Score (BRS).
 *
 * GET /api/brand-readiness/{tenantId}
 *
 * Composes several Python brand-context endpoints into one stable contract for
 * the mobile + Hub UI, then scores them with the pure `computeBrandReadiness`
 * library. See docs/foundation-sprint-program.md § Sprint 1.
 *
 * Sub-requests (all best-effort — a failing one degrades that check, never the route):
 *   - GET /api/v1/brand-context/{id}                  → constitution, discovery, refs, pillars, ctas, logo
 *   - GET /api/v1/brand-context/{id}/gallery-analysis → { [url]: analysis }
 *   - GET /api/v1/brand-context/{id}/theme            → { theme, updated_at }
 *   - GET /api/v1/brand-context/{id}/all-briefs       → { brand_dna, ... }
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import {
  computeBrandReadiness,
  parseStringOrArray,
  filterUsablePhotos,
  type BrandReadinessInputs,
} from '@/lib/brand-readiness';
import { parseBrandTemplateLibraryFromTheme } from '@/lib/brand-template-library';

export const runtime = 'nodejs';

interface BrandContextRaw {
  reference_image_urls?: unknown;
  content_pillars?: unknown;
  default_ctas?: unknown;
  discovery_confidence?: number | null;
  brand_constitution_confirmed_at?: string | null;
  logo_url?: string | null;
}

function isNonEmptyObject(v: unknown): boolean {
  return Boolean(v) && typeof v === 'object' && Object.keys(v as object).length > 0;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, tenantId);
  if (tenantGuard) return tenantGuard;

  const [ctxRes, galleryRes, themeRes, briefsRes] = await Promise.all([
    fetchCrewBackendJson<BrandContextRaw>(`/api/v1/brand-context/${tenantId}`, {
      workspaceId: tenantId,
    }),
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${tenantId}/gallery-analysis`,
      { workspaceId: tenantId },
    ),
    fetchCrewBackendJson<{ theme?: unknown; updated_at?: string | null }>(
      `/api/v1/brand-context/${tenantId}/theme`,
      { workspaceId: tenantId },
    ),
    fetchCrewBackendJson<{ brand_dna?: unknown; visual_dna?: unknown }>(
      `/api/v1/brand-context/${tenantId}/all-briefs`,
      { workspaceId: tenantId },
    ),
  ]);

  // If the brand context itself does not exist, the tenant is unconfigured.
  if (!ctxRes.ok && ctxRes.status === 404) {
    return NextResponse.json(
      {
        error: 'brand_context_not_found',
        tenantId,
        score: 0,
        checks: [],
        canProposeMissions: false,
        canAutoProduce: false,
        missing: [],
      },
      { status: 404 },
    );
  }

  const ctx = ctxRes.data ?? {};
  const galleryMap = galleryRes.ok && galleryRes.data && typeof galleryRes.data === 'object'
    ? (galleryRes.data as Record<string, unknown>)
    : {};

  const allUrls = parseStringOrArray(ctx.reference_image_urls);
  const usablePhotos = filterUsablePhotos(allUrls, ctx.logo_url);
  const analyzedSet = new Set(Object.keys(galleryMap));
  const analyzedPhotoCount = usablePhotos.filter((u) => analyzedSet.has(u)).length;

  const themeData = themeRes.ok ? themeRes.data : null;
  const themeObj = themeData?.theme as Record<string, unknown> | undefined;
  const hasBrandTheme = Boolean(
    themeObj
      && isNonEmptyObject(themeObj)
      && (isNonEmptyObject(themeObj.palette) || isNonEmptyObject(themeObj.typography)),
  );
  const library = parseBrandTemplateLibraryFromTheme(themeObj);
  const hasTemplateLibrary = Boolean(library?.locked && library.slots.length === 5);

  const briefsData = briefsRes.ok ? briefsRes.data : null;
  // Accept visual_dna as equivalent brand-identity data when brand_dna is not yet synthesized.
  // visual_dna is the AI-analyzed visual identity output from brand discovery — contains
  // palette, typography, tone, and composition data that serves the same purpose.
  const hasBrandDna = isNonEmptyObject(briefsData?.brand_dna)
    || isNonEmptyObject(briefsData?.visual_dna)
    || (typeof briefsData?.visual_dna === 'string' && (briefsData.visual_dna as string).length > 50);

  const inputs: BrandReadinessInputs = {
    constitutionConfirmedAt: ctx.brand_constitution_confirmed_at ?? null,
    discoveryConfidence: Number(ctx.discovery_confidence ?? 0),
    usablePhotoCount: usablePhotos.length,
    analyzedPhotoCount,
    hasBrandDna,
    hasBrandTheme,
    hasTemplateLibrary,
    contentPillarCount: parseStringOrArray(ctx.content_pillars).length,
    defaultCtaCount: parseStringOrArray(ctx.default_ctas).length,
  };

  const result = computeBrandReadiness(inputs);

  return NextResponse.json(
    {
      tenantId,
      ...result,
      inputs,
      sources: {
        brandContext: ctxRes.ok,
        galleryAnalysis: galleryRes.ok,
        theme: themeRes.ok,
        briefs: briefsRes.ok,
      },
    },
    { status: 200 },
  );
}

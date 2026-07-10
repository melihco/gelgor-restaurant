/**
 * BFF route — Brand Readiness Score (BRS).
 *
 * GET /api/brand-readiness/{tenantId}
 */
import { NextRequest, NextResponse } from 'next/server';
import { readBrandContextFromDb } from '@/lib/brand-context-db-fallback';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import {
  computeBrandReadiness,
  computeProductionProfileReadiness,
  parseStringOrArray,
  filterUsablePhotos,
  type BrandReadinessInputs,
} from '@/lib/brand-readiness';
import { parseBrandTemplateLibraryFromTheme } from '@/lib/brand-template-library';
import { brsCache } from '@/lib/server-ttl-cache';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface BrandContextRaw {
  reference_image_urls?: unknown;
  content_pillars?: unknown;
  default_ctas?: unknown;
  discovery_confidence?: number | null;
  brand_constitution_confirmed_at?: string | null;
  logo_url?: string | null;
  gallery_analysis?: unknown;
  brand_dna?: unknown;
  brand_theme?: unknown;
  visual_dna?: unknown;
  business_type?: string | null;
  brand_service_profile?: unknown;
}

function isNonEmptyObject(v: unknown): boolean {
  return Boolean(v) && typeof v === 'object' && Object.keys(v as object).length > 0;
}

function parseJsonField(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function galleryMapFromContext(ctx: BrandContextRaw): Record<string, unknown> {
  const parsed = parseJsonField(ctx.gallery_analysis);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

function themeFromContext(ctx: BrandContextRaw): Record<string, unknown> | undefined {
  const parsed = parseJsonField(ctx.brand_theme);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return undefined;
}

function briefsFromContext(ctx: BrandContextRaw): {
  brand_dna?: unknown;
  visual_dna?: unknown;
} {
  return {
    brand_dna: parseJsonField(ctx.brand_dna) ?? ctx.brand_dna,
    visual_dna: parseJsonField(ctx.visual_dna) ?? ctx.visual_dna,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, tenantId);
  if (tenantGuard) return tenantGuard;

  // Serve from in-process cache when fresh — avoids 4 parallel backend calls per dashboard load.
  const cached = brsCache.get(tenantId);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'private, max-age=60' },
    });
  }

  const [ctxRes, galleryRes, themeRes, briefsRes] = await Promise.all([
    fetchCrewBackendJson<BrandContextRaw>(`/api/v1/brand-context/${tenantId}`, {
      workspaceId: tenantId,
      timeoutMs: 8_000,
    }),
    fetchCrewBackendJson<Record<string, unknown>>(
      `/api/v1/brand-context/${tenantId}/gallery-analysis`,
      { workspaceId: tenantId, timeoutMs: 8_000 },
    ),
    fetchCrewBackendJson<{ theme?: unknown }>(
      `/api/v1/brand-context/${tenantId}/theme`,
      { workspaceId: tenantId, timeoutMs: 8_000 },
    ),
    fetchCrewBackendJson<{ brand_dna?: unknown; visual_dna?: unknown }>(
      `/api/v1/brand-context/${tenantId}/all-briefs`,
      { workspaceId: tenantId, timeoutMs: 8_000 },
    ),
  ]);

  let ctx: BrandContextRaw = ctxRes.data ?? {};
  let fromDatabase = false;

  if (!ctxRes.ok || !ctxRes.data) {
    const dbRow = await readBrandContextFromDb(tenantId);
    if (dbRow) {
      ctx = dbRow as BrandContextRaw;
      fromDatabase = true;
    }
  }

  if (!ctxRes.ok && !fromDatabase && ctxRes.status === 404) {
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

  if (!fromDatabase && !ctxRes.ok && !isNonEmptyObject(ctx) && !ctx.reference_image_urls) {
    const dbRow = await readBrandContextFromDb(tenantId);
    if (dbRow) {
      ctx = dbRow as BrandContextRaw;
      fromDatabase = true;
    }
  }

  const galleryMap =
    galleryRes.ok && galleryRes.data && typeof galleryRes.data === 'object'
      ? (galleryRes.data as Record<string, unknown>)
      : galleryMapFromContext(ctx);

  const allUrls = parseStringOrArray(ctx.reference_image_urls);
  const usablePhotos = filterUsablePhotos(allUrls, ctx.logo_url);
  const analyzedSet = new Set(Object.keys(galleryMap));
  const analyzedPhotoCount = usablePhotos.filter((u) => analyzedSet.has(u)).length;

  const themeObj = (
    themeRes.ok && themeRes.data?.theme && typeof themeRes.data.theme === 'object'
      ? (themeRes.data.theme as Record<string, unknown>)
      : themeFromContext(ctx)
  );
  const hasBrandTheme = Boolean(
    themeObj
      && isNonEmptyObject(themeObj)
      && (isNonEmptyObject(themeObj.palette) || isNonEmptyObject(themeObj.typography)),
  );
  const library = parseBrandTemplateLibraryFromTheme(themeObj);
  const enabledTemplateSlots = library?.slots.filter((slot) => slot.enabled !== false) ?? [];
  const hasTemplateLibrary = Boolean(library?.locked && enabledTemplateSlots.length >= 5);

  const briefsData = briefsRes.ok && briefsRes.data
    ? briefsRes.data
    : briefsFromContext(ctx);
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

  const serviceProfile = parseJsonField(ctx.brand_service_profile);
  const productionProfile = computeProductionProfileReadiness({
    serviceProfile: serviceProfile && typeof serviceProfile === 'object' && !Array.isArray(serviceProfile)
      ? (serviceProfile as Record<string, unknown>)
      : null,
    businessType: ctx.business_type ?? null,
    visualDna: typeof briefsData?.visual_dna === 'string'
      ? briefsData.visual_dna
      : typeof ctx.visual_dna === 'string'
        ? ctx.visual_dna
        : null,
    brandTheme: themeObj,
  });

  const payload = {
    tenantId,
    ...result,
    productionProfile,
    inputs,
    sources: {
      brandContext: ctxRes.ok || fromDatabase,
      galleryAnalysis: galleryRes.ok || Boolean(ctx.gallery_analysis),
      theme: themeRes.ok || Boolean(ctx.brand_theme),
      briefs: briefsRes.ok || Boolean(ctx.brand_dna || ctx.visual_dna),
      fromDatabase,
    },
  };

  brsCache.set(tenantId, payload);

  return NextResponse.json(payload, {
    status: 200,
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'private, max-age=60' },
  });
}

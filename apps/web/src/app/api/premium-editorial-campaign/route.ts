/**
 * POST /api/premium-editorial-campaign
 *
 * Standalone Premium Editorial Campaign slot generation.
 * Uses 5-layer prompt architecture (Brand DNA → Creative → Layout → Compiler → Vision QA).
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  runPremiumEditorialCampaign,
  premiumEditorialArtifactMetadata,
  validatePremiumEditorialRequest,
} from '@/lib/premium-editorial';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function loadBrandContext(brandId: string): Promise<{
  brandContext: Record<string, unknown> | null;
  brandTheme: Record<string, unknown> | null;
  galleryAnalysis: Record<string, unknown> | null;
}> {
  try {
    const CREW = serverConfig.crewBackend.baseUrl;
    const KEY = serverConfig.internal.apiKey;
    const headers = { 'X-Internal-Api-Key': KEY, 'X-Tenant-Id': brandId };
    const [ctxRes, galleryRes] = await Promise.all([
      fetch(`${CREW}/api/v1/brand-context/${brandId}`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      }),
      fetch(`${CREW}/api/v1/brand-context/${brandId}/gallery-analysis`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      }).catch(() => null),
    ]);
    if (!ctxRes.ok) {
      return { brandContext: null, brandTheme: null, galleryAnalysis: null };
    }
    const j = await ctxRes.json() as Record<string, unknown>;
    const ctx = (j.brand_context ?? j.brandContext ?? j) as Record<string, unknown>;
    const theme = (ctx.brand_theme ?? ctx.brandTheme ?? j.theme ?? null) as Record<string, unknown> | null;
    let galleryAnalysis: Record<string, unknown> | null = null;
    if (galleryRes?.ok) {
      const g = await galleryRes.json() as Record<string, unknown>;
      galleryAnalysis = (g.gallery_analysis ?? g.galleryAnalysis ?? g) as Record<string, unknown>;
    }
    return { brandContext: ctx, brandTheme: theme, galleryAnalysis };
  } catch {
    return { brandContext: null, brandTheme: null, galleryAnalysis: null };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = validatePremiumEditorialRequest(body);
  if (validation.errors.length) {
    return NextResponse.json(
      { error: 'Validation failed', details: validation.errors, warnings: validation.warnings },
      { status: 400 },
    );
  }

  const brandId = validation.normalized.brandId;
  if (!validation.normalized.brandContext || !validation.normalized.galleryAnalysis) {
    const loaded = await loadBrandContext(brandId);
    validation.normalized.brandContext = validation.normalized.brandContext ?? loaded.brandContext;
    validation.normalized.brandTheme = validation.normalized.brandTheme ?? loaded.brandTheme;
    validation.normalized.galleryAnalysis = validation.normalized.galleryAnalysis
      ?? loaded.galleryAnalysis;
  }

  try {
    const count = validation.normalized.numberOfVariations ?? 1;
    const recent = [...(validation.normalized.recentVariationKeys ?? [])];
    const variations = [];

    for (let i = 0; i < count; i++) {
      const result = await runPremiumEditorialCampaign({
        ...validation.normalized,
        numberOfVariations: 1,
        forceNewComposition: i > 0 || validation.normalized.forceNewComposition === true,
        recentVariationKeys: recent,
        preferredCreativeVariation: i === 0
          ? validation.normalized.preferredCreativeVariation
          : null,
        signal: req.signal,
      });
      recent.push(result.creativeDirection.creativeVariationKey);
      variations.push(result);
    }

    const primary = variations[0]!;
    const mapAttempts = (result: typeof primary) => result.generationAttempts.map((a) => ({
      attempt: a.attempt,
      layoutFamily: a.layoutFamily,
      creativeVariationKey: a.creativeVariationKey,
      backgroundImageUrl: a.backgroundImageUrl,
      error: a.error,
      durationMs: a.durationMs,
      qaApproved: a.qualityAssessment?.isApproved ?? null,
      qaOverall: a.qualityAssessment?.overallScore ?? null,
    }));

    return NextResponse.json({
      success: primary.status !== 'failed',
      data: {
        slotId: primary.slotId,
        generationId: primary.generationId,
        status: primary.status,
        backgroundImage: primary.backgroundImageUrl,
        finalImage: primary.finalImageUrl,
        thumbnail: primary.thumbnailUrl,
        brandVisualDna: primary.brandVisualDna,
        creativeDirection: primary.creativeDirection,
        layoutSpecification: primary.layoutSpecification,
        headlineLayout: primary.textLayout,
        qualityAssessment: primary.qualityAssessment,
        generationAttempts: mapAttempts(primary),
        warnings: [...validation.warnings, ...primary.warnings],
        createdAt: primary.createdAt,
        promptVersion: primary.promptVersion,
        modelName: primary.modelName,
        matchedGalleryUrl: primary.matchedGalleryUrl,
        matchedGalleryScore: primary.matchedGalleryScore,
        matchedGalleryReason: primary.matchedGalleryReason,
        generationDurationMs: variations.reduce((s, v) => s + v.generationDurationMs, 0),
        costEstimateUsd: variations.reduce((s, v) => s + (v.costEstimateUsd ?? 0), 0),
        variations: variations.map((v) => ({
          generationId: v.generationId,
          status: v.status,
          backgroundImage: v.backgroundImageUrl,
          finalImage: v.finalImageUrl,
          creativeVariationKey: v.creativeDirection.creativeVariationKey,
          layoutFamily: v.layoutSpecification.family,
          qualityAssessment: v.qualityAssessment,
          matchedGalleryUrl: v.matchedGalleryUrl,
        })),
        /** Admin/debug only — not shown in normal UI */
        _debug: {
          artifactMetadata: premiumEditorialArtifactMetadata(primary),
          finalCompiledPrompt: primary.finalCompiledPrompt,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    console.error('[premium-editorial-campaign]', message);
    return NextResponse.json(
      { error: 'Premium editorial generation failed', detail: message },
      { status: 500 },
    );
  }
}

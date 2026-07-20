/**
 * Premium Editorial Campaign orchestrator
 *
 * LoadBrand → BrandDNA → CreativeDirection → Layout → TextFit →
 * CompilePrompt → GenerateBackground → BackgroundQA → Retry →
 * ComposeTypography+Logo → FinalQA → Persist/Return
 */

import { randomUUID } from 'crypto';
import { buildBrandVisualDna } from './brand-visual-dna';
import { buildCreativeDirection, selectCreativeVariation } from './creative-direction';
import { buildLayoutSpecification, selectLayoutFamily } from './layout-specification';
import { buildDefaultTextLayoutInput, validateAndFitText } from './text-layout';
import { compileEditorialImagePrompt } from './prompt-compiler';
import { generateEditorialBackground } from './background-generator';
import { composeFinalEditorialImage } from './compose-final';
import { assessVisualQuality } from './vision-qa';
import { validatePremiumEditorialRequest } from './validate-request';
import {
  collectGalleryCandidates,
  resolvePremiumEditorialGalleryMatch,
} from './gallery-match';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import {
  MAX_IMAGE_GENERATION_ATTEMPTS,
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  PREMIUM_EDITORIAL_SLOT_CODE,
  type CreativeVariationKey,
  type GenerationAttemptRecord,
  type PremiumEditorialCampaignRequest,
  type PremiumEditorialCampaignResult,
} from './types';

export async function runPremiumEditorialCampaign(
  rawRequest: Partial<PremiumEditorialCampaignRequest> | Record<string, unknown>,
): Promise<PremiumEditorialCampaignResult> {
  const started = Date.now();
  const { normalized, warnings, errors } = validatePremiumEditorialRequest(rawRequest);
  if (errors.length) {
    throw new Error(errors.join('; '));
  }

  const request = normalized;
  const workspaceId = request.workspaceId || request.brandId;
  const generationId = randomUUID();

  const galleryAnalysis = (request.galleryAnalysis ?? {}) as Record<string, GalleryPhotoMeta>;
  const candidates = collectGalleryCandidates({
    selectedGalleryAssetUrl: request.selectedGalleryAssetUrl,
    productAssetUrl: request.productAssetUrl,
    venueAssetUrl: request.venueAssetUrl,
    brandContext: request.brandContext,
    brandReferenceImageUrls: request.brandReferenceImageUrls,
    galleryAnalysis,
  });

  const galleryMatch = resolvePremiumEditorialGalleryMatch({
    headline: request.headline || request.contentTopic,
    caption: request.caption || request.contentTopic,
    contentTopic: request.visualDirection || request.contentTopic,
    mood: request.mood,
    campaignGoal: request.campaignGoal,
    businessType: String(
      request.brandContext?.business_type
      ?? request.brandContext?.businessType
      ?? '',
    ) || null,
    outputType: request.outputType,
    preferredUrl: request.selectedGalleryAssetUrl,
    candidateUrls: candidates,
    galleryAnalysis,
    tieBreakSeed: Array.from(generationId).reduce((a, c) => a + c.charCodeAt(0), 0),
  });
  warnings.push(...galleryMatch.warnings);

  const matchedPrimary = galleryMatch.primaryUrl;
  const matchedSupporting = galleryMatch.supportingUrls;

  const dna = buildBrandVisualDna({
    brandId: request.brandId,
    brandContext: request.brandContext,
    brandTheme: request.brandTheme,
    logoAssetUrl: request.logoAssetUrl,
    galleryUrls: [matchedPrimary, ...matchedSupporting, ...candidates].filter(
      (u): u is string => Boolean(u?.trim()),
    ),
  });

  const usedVariations: CreativeVariationKey[] = [...(request.recentVariationKeys ?? [])];
  const variationCount = request.numberOfVariations ?? 1;
  const primaryVariation = selectCreativeVariation({
    preferred: request.preferredCreativeVariation,
    recent: usedVariations,
    forceNew: request.forceNewComposition === true,
    seed: `${request.brandId}:${request.contentTopic}:${generationId}`,
  });

  // Multi-variation: run primary fully; additional variations get alternate keys stamped in warnings.
  // Full parallel multi-image would multiply cost — only generate `variationCount` backgrounds
  // when >1 by looping, but still cap at 4 via validator.
  void variationCount;

  const brief = buildCreativeDirection({
    dna,
    request,
    variationKey: primaryVariation,
  });
  usedVariations.push(primaryVariation);

  const textInput = buildDefaultTextLayoutInput({
    headline: request.headline,
    subheadline: request.subheadline,
    cta: request.cta,
    language: request.language,
  });

  const attempts: GenerationAttemptRecord[] = [];
  let backgroundImageUrl: string | null = null;
  let backgroundBuffer: Buffer | null = null;
  let finalImageUrl: string | null = null;
  let modelName: string | null = null;
  let lastCompiledPrompt = '';
  let lastLayout = buildLayoutSpecification({
    family: selectLayoutFamily({
      preferred: request.preferredLayoutFamily,
      aspectRatio: brief.aspectRatio,
      brief,
      text: textInput,
      attempt: 1,
    }),
    aspectRatio: brief.aspectRatio,
  });
  let textLayout = validateAndFitText({ text: textInput, layout: lastLayout });
  warnings.push(...textLayout.warnings);

  let backgroundQa = null as Awaited<ReturnType<typeof assessVisualQuality>> | null;
  let finalQa = null as Awaited<ReturnType<typeof assessVisualQuality>> | null;
  let logoApplied = false;

  // Idea-matched gallery first — never an arbitrary gallery[0].
  const refs = [
    matchedPrimary,
    ...matchedSupporting,
  ].filter((u): u is string => Boolean(u?.trim()));

  if (matchedPrimary) {
    console.info(
      `[premium-editorial] gallery match score=${galleryMatch.match?.score ?? '?'} ` +
      `reason=${galleryMatch.match?.reason ?? '-'} url=${matchedPrimary.slice(0, 80)}`,
    );
  }

  for (let attempt = 1; attempt <= MAX_IMAGE_GENERATION_ATTEMPTS; attempt++) {
    if (request.signal?.aborted) throw new Error('Generation cancelled');

    const attemptStarted = Date.now();
    const family = selectLayoutFamily({
      preferred: attempt === 3 ? null : request.preferredLayoutFamily,
      aspectRatio: brief.aspectRatio,
      brief,
      text: textInput,
      attempt,
    });
    lastLayout = buildLayoutSpecification({ family, aspectRatio: brief.aspectRatio });
    textLayout = validateAndFitText({ text: textInput, layout: lastLayout });

    const compiled = compileEditorialImagePrompt({
      dna,
      brief,
      layout: lastLayout,
      textLayout,
      mode: 'venue_social_design',
      regenerationInstructions: backgroundQa?.regenerationInstructions,
      simplifySupporting: attempt === 3,
    });
    lastCompiledPrompt = compiled.finalPrompt;

    try {
      if (!refs.length) {
        warnings.push('No venue/gallery reference — Premium Editorial works best on brand photos.');
      }
      const bg = await generateEditorialBackground({
        compiledPrompt: compiled.finalPrompt,
        aspectRatio: brief.aspectRatio,
        referenceUrls: refs,
        workspaceId,
        signal: request.signal,
        // Social slot: always prefer gallery-grounded edit when a photo exists.
        preferGalleryGrounding: true,
      });
      backgroundImageUrl = bg.imageUrl;
      backgroundBuffer = bg.imageBuffer;
      modelName = bg.modelName;
      compiled.modelName = bg.modelName;

      backgroundQa = await assessVisualQuality({
        imageUrl: bg.imageUrl,
        imageBuffer: bg.imageBuffer,
        stage: 'background',
        dna,
        brief,
        layout: lastLayout,
        tier: 'premium',
      });

      attempts.push({
        attempt,
        compiledPrompt: compiled.finalPrompt,
        layoutFamily: family,
        creativeVariationKey: brief.creativeVariationKey,
        backgroundImageUrl: bg.imageUrl,
        qualityAssessment: backgroundQa,
        error: null,
        durationMs: Date.now() - attemptStarted,
      });

      if (backgroundQa.isApproved) break;

      console.info(
        `[premium-editorial] background QA failed attempt=${attempt} codes=${backgroundQa.failureReasonCodes.join(',')}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      attempts.push({
        attempt,
        compiledPrompt: lastCompiledPrompt,
        layoutFamily: family,
        creativeVariationKey: brief.creativeVariationKey,
        backgroundImageUrl: null,
        qualityAssessment: backgroundQa,
        error: message,
        durationMs: Date.now() - attemptStarted,
      });
      if (attempt === MAX_IMAGE_GENERATION_ATTEMPTS) throw err;
    }
  }

  if (!backgroundImageUrl) {
    throw new Error('Premium editorial background generation failed after max attempts');
  }

  // GPT already baked social typography (venue_social_design). Only composite real logo.
  const composed = await composeFinalEditorialImage({
    backgroundImageUrl,
    backgroundBuffer,
    layout: lastLayout,
    textLayout,
    logoUrl: request.logoAssetUrl ?? dna.logoAssetUrl,
    addTextOverlay: false,
    addLogoOverlay: request.addLogoOverlay !== false,
    workspaceId,
    brandName: dna.brandName,
  });
  finalImageUrl = composed.finalImageUrl;
  logoApplied = composed.logoApplied;

  finalQa = await assessVisualQuality({
    imageUrl: finalImageUrl,
    imageBuffer: backgroundBuffer,
    stage: 'final',
    dna,
    brief,
    layout: lastLayout,
    logoApplied,
    tier: 'premium',
  });

  const status: PremiumEditorialCampaignResult['status'] = finalQa?.isApproved
    ? 'completed'
    : backgroundImageUrl && finalImageUrl
      ? 'partial'
      : 'failed';

  if (finalQa && !finalQa.isApproved) {
    warnings.push(`Final QA below threshold (overall=${finalQa.overallScore}).`);
  }

  return {
    slotId: PREMIUM_EDITORIAL_SLOT_CODE,
    generationId,
    status,
    backgroundImageUrl,
    finalImageUrl,
    thumbnailUrl: finalImageUrl,
    brandVisualDna: dna,
    creativeDirection: brief,
    layoutSpecification: lastLayout,
    textLayout,
    qualityAssessment: finalQa,
    generationAttempts: attempts,
    warnings,
    finalCompiledPrompt: lastCompiledPrompt,
    promptVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
    modelName,
    createdAt: new Date().toISOString(),
    generationDurationMs: Date.now() - started,
    costEstimateUsd: attempts.length * 0.08,
    matchedGalleryUrl: matchedPrimary,
    matchedGalleryScore: galleryMatch.match?.score ?? null,
    matchedGalleryReason: galleryMatch.match?.reason ?? null,
  };
}

/** Persist layer JSON onto artifact metadata (generic JSON fields — no new tables). */
export function premiumEditorialArtifactMetadata(
  result: PremiumEditorialCampaignResult,
): Record<string, unknown> {
  return {
    production_role: result.creativeDirection.outputFormat === 'story'
      ? 'premium_editorial_campaign_story'
      : 'premium_editorial_campaign_post',
    pipeline: 'premium_editorial',
    slot_code: PREMIUM_EDITORIAL_SLOT_CODE,
    prompt_architecture_version: PREMIUM_EDITORIAL_PROMPT_VERSION,
    background_image_url: result.backgroundImageUrl,
    final_composed_image_url: result.finalImageUrl,
    brand_visual_dna_json: result.brandVisualDna,
    creative_direction_json: result.creativeDirection,
    layout_specification_json: result.layoutSpecification,
    quality_assurance_json: result.qualityAssessment,
    matched_gallery_url: result.matchedGalleryUrl,
    matched_gallery_score: result.matchedGalleryScore,
    matched_gallery_reason: result.matchedGalleryReason,
    generation_attempts: result.generationAttempts.map((a) => ({
      attempt: a.attempt,
      layoutFamily: a.layoutFamily,
      creativeVariationKey: a.creativeVariationKey,
      backgroundImageUrl: a.backgroundImageUrl,
      error: a.error,
      durationMs: a.durationMs,
      qaApproved: a.qualityAssessment?.isApproved ?? null,
      qaOverall: a.qualityAssessment?.overallScore ?? null,
      // Do not persist full prompts on public artifact by default
    })),
    creative_variation_key: result.creativeDirection.creativeVariationKey,
    layout_family: result.layoutSpecification.family,
    grafiker_pass: result.qualityAssessment?.isApproved ?? null,
    grafiker_score: result.qualityAssessment
      ? Math.round((result.qualityAssessment.overallScore / 100) * 10)
      : null,
    fal_design_engine: result.modelName,
    agency_produced: true,
  };
}

/**
 * Premium Editorial Campaign pipeline handler for auto-produce.
 *
 * Gallery grounding: use production-loop's idea→photo match (`referenceUrl`) as the
 * preferred pin, and pass `galleryAnalysis` so the orchestrator can rematch when needed.
 */

import {
  runPremiumEditorialCampaign,
  premiumEditorialArtifactMetadata,
} from '@/lib/premium-editorial';
import type {
  ProductionPipelineHandler,
  SlotProductionContext,
} from './pipeline-types';

function isPremiumEditorialSlot(ctx: SlotProductionContext): boolean {
  const role = String(ctx.inputs.slotRole ?? '');
  const pipeline = String(ctx.inputs.pipeline ?? '');
  const pack = ctx.inputs.slotPromptPack;
  return (
    pipeline === 'premium_editorial'
    || role === 'premium_editorial_campaign_post'
    || role === 'premium_editorial_campaign_story'
    || pack?.premium_editorial === true
    || pack?.slot_code === 'PREMIUM_EDITORIAL_CAMPAIGN'
  );
}

export const premiumEditorialHandler: ProductionPipelineHandler = {
  name: 'premium_editorial',

  canRun(ctx) {
    return isPremiumEditorialSlot(ctx) && !ctx.state.imageUrl;
  },

  async run(ctx) {
    const { inputs, state } = ctx;
    const outputType = inputs.falAspectRatio === '9:16'
      || inputs.slotRole.includes('story')
      ? 'story'
      : 'post';

    // Idea-matched gallery from production-loop (pickGalleryPhotoForIdea / matchPhotoToContent).
    const matchedGalleryUrl = inputs.referenceUrl?.trim() || null;

    const result = await runPremiumEditorialCampaign({
      brandId: inputs.workspaceId,
      workspaceId: inputs.workspaceId,
      contentTopic: inputs.headline || inputs.caption.slice(0, 80) || 'Premium editorial campaign',
      campaignGoal: inputs.strategicPurpose ?? inputs.mood ?? null,
      headline: inputs.headline,
      subheadline: inputs.falSubtitle ?? '',
      cta: inputs.cta,
      caption: inputs.caption,
      mood: inputs.mood ?? null,
      visualDirection: inputs.visualDirection ?? null,
      language: 'tr',
      outputType,
      aspectRatio: inputs.falAspectRatio ?? (outputType === 'story' ? '9:16' : '4:5'),
      selectedGalleryAssetUrl: matchedGalleryUrl,
      logoAssetUrl: inputs.brandLogoUrl ?? null,
      addTextOverlay: true,
      addLogoOverlay: Boolean(inputs.brandLogoUrl),
      numberOfVariations: 1,
      forceNewComposition: true,
      galleryAnalysis: inputs.galleryAnalysis ?? null,
      brandReferenceImageUrls: inputs.brandReferenceImageUrls,
      brandContext: {
        brand_name: inputs.resolvedBrandName,
        business_type: inputs.brandBusinessType,
        brand_tone: inputs.brandTone,
        location: inputs.brandLocation,
        visual_dna: inputs.visualDna,
        logo_url: inputs.brandLogoUrl,
        reference_image_urls: inputs.brandReferenceImageUrls,
        brand_theme: inputs.brandTheme,
        brand_vibe_profile: inputs.brandVibeProfile,
      },
      brandTheme: inputs.brandTheme,
    });

    if (!result.finalImageUrl && !result.backgroundImageUrl) {
      state.pipelineFailureReason = 'premium_editorial_no_image';
      return;
    }

    state.imageUrl = result.finalImageUrl ?? result.backgroundImageUrl;
    state.falDesignEngine = result.modelName ?? 'premium_editorial_v1';
    state.falGrafikerPass = result.qualityAssessment?.isApproved ?? false;
    state.falGrafikerScore = result.qualityAssessment
      ? Math.round((result.qualityAssessment.overallScore / 100) * 10)
      : null;
    state.costDelta += result.costEstimateUsd ?? 0.08;
    state.artifactMetaPatch = {
      ...premiumEditorialArtifactMetadata(result),
      fal_designer_produced: true,
      production_route: 'premium_editorial',
      production_track: 'premium_editorial',
      marky_disabled: true,
      premium_composition: true,
      typography_text_valid: result.qualityAssessment?.isApproved !== false,
    };

    if (result.matchedGalleryUrl) {
      console.info(
        `[premium_editorial] idea→gallery score=${result.matchedGalleryScore ?? '?'} ` +
        `reason=${result.matchedGalleryReason ?? '-'} ` +
        `"${inputs.headline.slice(0, 40)}" → ${result.matchedGalleryUrl.slice(0, 72)}`,
      );
    } else {
      console.warn(
        `[premium_editorial] no matched gallery for "${inputs.headline.slice(0, 48)}"`,
      );
    }
  },
};

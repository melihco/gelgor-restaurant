/**
 * Premium Editorial Campaign pipeline handler for auto-produce.
 *
 * Gallery grounding: use production-loop's idea→photo match (`referenceUrl`) as the
 * preferred pin, and pass `galleryAnalysis` so the orchestrator can rematch when needed.
 */

import { resolveDesignProductionModeForRun } from '@/lib/design-production-mode';
import {
  runPremiumEditorialCampaign,
  premiumEditorialArtifactMetadata,
} from '@/lib/premium-editorial';
import {
  bindBrandTemplateForFalProduction,
  catalogTemplateWithholdReason,
  librarySlotShellMissingReason,
  templateLayoutReferenceUrl,
} from '@/lib/brand-design-template-production';
import { stampDesignedTypographyValid, validateFalCanvasText } from '@/lib/typography-text-validation';
import { resolveSlotPaintOverlay } from '@/lib/slot-production-bundle';
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

    const templateBinding = await bindBrandTemplateForFalProduction({
      workspaceId: inputs.workspaceId,
      slotRole: inputs.slotRole,
      librarySlotKey: inputs.librarySlotKey,
      format: outputType,
      caption: inputs.caption,
      headline: inputs.headline,
      subtitle: inputs.falSubtitle || inputs.cta,
      announcementType: inputs.announcementType,
      templateUseCase: inputs.templateUseCase,
      catalogSlotKey: inputs.catalogSlotKey,
      brandActiveSlots: inputs.brandActiveSlots,
      adHocBrief: Boolean(inputs.adHocBrief),
      missionReferenceUrl: matchedGalleryUrl,
      baseDirectives: [],
      brandColors: { primary: '#111111', accent: '#C9A227' },
      logoUrl: inputs.brandLogoUrl || undefined,
      brandVibe: null,
      designProductionMode: resolveDesignProductionModeForRun({
        brandTheme: inputs.brandTheme as Record<string, unknown> | null | undefined,
        adHocBrief: Boolean(inputs.adHocBrief),
      }),
    });
    const layoutUrl = templateLayoutReferenceUrl(templateBinding);
    const withhold = catalogTemplateWithholdReason(inputs.catalogSlotKey, templateBinding.matched, templateBinding)
      ?? librarySlotShellMissingReason(templateBinding.matched, layoutUrl);
    if (withhold) {
      state.pipelineFailureReason = withhold;
      console.warn(`[premium_editorial] withheld: ${state.pipelineFailureReason}`);
      return;
    }
    if (templateBinding.matched) {
      state.brandDesignTemplateId = templateBinding.matched.id;
      state.brandDesignTemplateType = templateBinding.matched.templateType;
      state.brandDesignTemplateName = templateBinding.matched.templateName;
      state.brandDesignTemplateMatchQuality = templateBinding.matched.matchQuality;
    }

    const paintChannel = outputType === 'story' ? 'story' : 'feed_post';
    const paintOverlay = resolveSlotPaintOverlay({
      headline: inputs.headline,
      subtitle: inputs.falSubtitle || inputs.cta,
      caption: inputs.caption,
      cta: inputs.cta,
      channel: paintChannel,
      brandName: inputs.resolvedBrandName,
      businessType: inputs.brandBusinessType,
      punchlineLockSource: inputs.punchlineLockSource,
      captionAwareHeadline: inputs.captionAwareHeadline,
      sampleHeadline: templateBinding.matched?.sampleHeadline,
      sampleSubtitle: templateBinding.matched?.sampleSubtitle,
      showSubline: templateBinding.matched?.showSubline !== false,
      typeBudget: templateBinding.matched?.typeBudget,
      photoUrl: matchedGalleryUrl,
      catalogSlotKey: inputs.catalogSlotKey,
    });
    const paintHeadline = paintOverlay.headline.trim() || inputs.headline;
    const paintSubtitle = paintOverlay.subtitle ?? '';
    if (paintHeadline !== inputs.headline) {
      console.log(
        `[premium_editorial] story/post type budget `
        + `"${inputs.headline.slice(0, 36)}" → "${paintHeadline.slice(0, 36)}"`,
      );
    }

    const result = await runPremiumEditorialCampaign({
      brandId: inputs.workspaceId,
      workspaceId: inputs.workspaceId,
      contentTopic: paintHeadline || inputs.caption.slice(0, 80) || 'Premium editorial campaign',
      campaignGoal: inputs.strategicPurpose ?? inputs.mood ?? null,
      headline: paintHeadline,
      subheadline: paintSubtitle,
      cta: inputs.cta,
      caption: inputs.caption,
      mood: inputs.mood ?? null,
      visualDirection: inputs.visualDirection ?? null,
      language: 'tr',
      outputType,
      aspectRatio: inputs.falAspectRatio ?? (outputType === 'story' ? '9:16' : '4:5'),
      selectedGalleryAssetUrl: matchedGalleryUrl,
      catalogSlotKey: inputs.catalogSlotKey,
      logoAssetUrl: inputs.brandLogoUrl ?? null,
      addTextOverlay: true,
      addLogoOverlay: Boolean(inputs.brandLogoUrl),
      numberOfVariations: 1,
      forceNewComposition: false,
      templateLayoutImageUrl: layoutUrl,
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
    const visionReviewed = result.qualityAssessment?.visionReviewed === true;
    state.falGrafikerReviewed = visionReviewed;
    state.falGrafikerPass = visionReviewed
      ? (result.qualityAssessment?.isApproved ?? false)
      : true;
    state.falGrafikerScore = visionReviewed && result.qualityAssessment
      ? Math.round((result.qualityAssessment.overallScore / 100) * 10)
      : null;
    if (visionReviewed && state.falGrafikerScore != null) {
      state.falGrafikerObservedScore = state.falGrafikerScore;
    }
    state.costDelta += result.costEstimateUsd ?? 0.08;
    const textCheck = state.imageUrl
      ? await validateFalCanvasText(state.imageUrl, {
        headline: paintHeadline,
        subtitle: paintSubtitle,
      })
      : { valid: false, reason: 'premium_editorial_no_image' };
    state.falTextValidated = textCheck.valid === true;
    const typeStamp = stampDesignedTypographyValid({
      overlayWasPainted: Boolean(state.imageUrl),
      textValidated: state.falTextValidated,
    });
    if (!state.falTextValidated) {
      state.pipelineFailureReason = textCheck.reason
        ? `görseldeki metin doğrulanamadı: ${textCheck.reason}`
        : 'görseldeki metin doğrulanamadı';
      state.imageUrl = null;
      console.warn(`[premium_editorial] withheld: ${state.pipelineFailureReason}`);
    }
    state.artifactMetaPatch = {
      ...premiumEditorialArtifactMetadata(result),
      fal_designer_produced: true,
      production_route: 'premium_editorial',
      production_track: 'premium_editorial',
      marky_disabled: true,
      premium_composition: true,
      ...typeStamp,
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

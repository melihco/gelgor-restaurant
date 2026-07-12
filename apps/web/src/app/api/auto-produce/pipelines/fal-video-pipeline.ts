/**
 * fal-video Pipeline — fal.ai designer track (fal_story / fal_reel).
 *
 * fal_story → grounded 9:16 story poster (GPT-image on gallery); no Kling motion.
 * fal_reel  → designed still + Kling locked-composition video.
 */

import {
  produceFalDesignedPostStill,
  produceFalDesignerVideo,
  resolveFalRequireGroundedGallery,
  resolveTypographyVibeFromContext,
} from '@/lib/fal-designer-production';
import { produceFalMissionVideo } from '@/lib/fal-video';
import { finalizeFalPrompt } from '@/lib/fal-prompt';
import { resolveFalBrandInput, resolveFalProductionBrandColors } from '@/lib/fal-brand-input';
import {
  bindBrandTemplateForFalProduction,
  resolveFalTemplateLockOptions,
  templateStyleReferenceUrls,
} from '@/lib/brand-design-template-production';
import { isPlayableVideoUrl } from '@/lib/fal-story-motion';
import { serverConfig } from '@/lib/server-config';
import type { ProductionPipelineHandler } from './pipeline-types';

export async function runFalStoryPosterProduction(input: {
  workspaceId: string;
  headline: string;
  caption: string;
  cta?: string;
  resolvedBrandName: string;
  brandBusinessType: string;
  brandLocation?: string;
  mood?: string;
  artDirection?: string;
  referenceUrl: string;
  styleRefs: string[];
  designVibe: ReturnType<typeof resolveTypographyVibeFromContext>;
  brandColors: { primary: string; accent: string };
  backgroundStyle: import('@/types/brand-theme').TypographyBackgroundStyle;
  lockOpts: ReturnType<typeof resolveFalTemplateLockOptions>;
  templateBinding: Awaited<ReturnType<typeof bindBrandTemplateForFalProduction>>;
  designBriefDirectives?: string[];
  visualDnaTone?: string;
  sceneHint?: string;
  designIntensityLevel?: import('@/lib/fal-design-intensity').FalDesignIntensityLevel;
  falLogoPlacement?: import('@/lib/fal-logo-placement').ResolvedFalLogoPlacement | null;
}): Promise<{
  imageUrl: string;
  grafikerScore: number | null;
  grafikerPass: boolean;
  typographyModel: string;
  resolvedHeadline?: string;
}> {
  const still = await produceFalDesignedPostStill({
    workspaceId: input.workspaceId,
    headline: input.headline,
    subtitle: input.cta || undefined,
    caption: input.caption,
    brandName: input.resolvedBrandName,
    brandColors: input.brandColors,
    vibe: input.designVibe,
    backgroundStyle: input.backgroundStyle,
    aspectRatio: '9:16',
    referencePhotoUrl: input.referenceUrl,
    logoUrl: input.templateBinding.logoUrl ?? undefined,
    location: input.brandLocation,
    brandReferenceImageUrls: input.styleRefs,
    sector: input.brandBusinessType,
    mood: input.mood,
    artDirection: input.artDirection,
    grafikerMaxRetries: input.lockOpts.grafikerMaxRetries,
    pipeline: 'fal_story',
    captionAwareHeadline: input.lockOpts.captionAwareHeadline,
    requireGroundedGallery: true,
    sceneHint: input.sceneHint,
    brandDirectives: [
      ...input.templateBinding.brandDirectives,
      ...(input.designBriefDirectives ?? []),
    ],
    visualDnaTone: input.visualDnaTone,
    designIntensityLevel: input.designIntensityLevel,
    occasion: input.templateBinding.occasion,
    logoPlacement: input.falLogoPlacement,
  });
  return {
    imageUrl: still.imageUrl,
    grafikerScore: still.grafikerScore,
    grafikerPass: still.grafikerPass,
    typographyModel: still.typographyModel,
    resolvedHeadline: still.resolvedHeadline,
  };
}

export const falVideoHandler: ProductionPipelineHandler = {
  name: 'fal_video',
  canRun: (ctx) => {
    if (!ctx.inputs.isFalMissionVideo) return false;
    if (ctx.inputs.hasRealBrandGallery) return true;
    return Boolean(ctx.inputs.referenceUrl);
  },
  run: async ({ inputs, state }) => {
    const referenceUrl = inputs.referenceUrl;
    if (inputs.hasRealBrandGallery && !referenceUrl) {
      state.pipelineFailureReason =
        'Brand gallery photo required — headline-matched venue photo missing for fal video slot';
      console.warn(
        `[auto-produce] [fal-track] withheld: no gallery ref for "${inputs.headline.slice(0, 40)}"`,
      );
      return;
    }
    if (!referenceUrl) return;

    if (!serverConfig.fal.configured) {
      console.warn(
        `[auto-produce] FAL_API_KEY missing — fal slot skipped: ${inputs.pipeline} "${inputs.headline.slice(0, 40)}"`,
      );
      return;
    }

    const falPipeline = inputs.pipeline === 'fal_reel' ? 'fal_reel' : 'fal_story';
    const intensityChannel = falPipeline === 'fal_reel' ? ('reel' as const) : ('story' as const);

    try {
      const falBrand = resolveFalBrandInput({
        brandTheme: inputs.brandTheme,
        templateLibrary: inputs.templateLibrary,
        librarySlotKey: inputs.librarySlotKey,
        tokens: inputs.brandTokens,
        sector: inputs.brandBusinessType,
        caption: inputs.caption,
        headline: inputs.headline,
        referencePhotoUrl: referenceUrl,
        sceneHint: inputs.sceneHint || undefined,
        format: intensityChannel,
        visualDna: inputs.visualDna,
        brandTone: inputs.brandTone,
        brandDescription: inputs.brandDescription,
        designBriefDirectives: inputs.designBriefDirectives,
        preferExplicitSceneHint: inputs.adHocBrief,
      });

      const templateBinding = await bindBrandTemplateForFalProduction({
        workspaceId: inputs.workspaceId,
        slotRole: inputs.slotRole,
        librarySlotKey: inputs.librarySlotKey,
        format: intensityChannel,
        caption: inputs.caption,
        headline: inputs.headline,
        announcementType: inputs.announcementType,
        templateUseCase: inputs.templateUseCase,
        catalogSlotKey: inputs.catalogSlotKey,
        brandActiveSlots: inputs.brandActiveSlots,
        adHocBrief: Boolean(inputs.adHocBrief),
        missionReferenceUrl: referenceUrl,
        baseDirectives: falBrand.promptDirectives,
        brandColors: falBrand.brandColors,
        logoUrl: inputs.brandLogoUrl || undefined,
        brandVibe: falBrand.vibe,
      });

      const designVibe =
        templateBinding.lockedVibe ??
        resolveTypographyVibeFromContext({
          caption: inputs.caption,
          headline: inputs.headline,
          sector: inputs.brandBusinessType,
          brandVibe: falBrand.vibe,
          lockPremiumVibe: /beach|club|hotel|resort|spa|fine_dining|restaurant/i.test(
            inputs.brandBusinessType ?? '',
          ),
        });

      const photoUrl = templateBinding.referencePhotoUrl ?? referenceUrl;
      const styleRefs = templateStyleReferenceUrls(templateBinding, inputs.brandReferenceImageUrls);
      const lockOpts = resolveFalTemplateLockOptions({
        binding: templateBinding,
        baseGrafikerMaxRetries: inputs.grafikerMaxRetries,
        adHocBrief: inputs.adHocBrief,
      });
      const brandColors = resolveFalProductionBrandColors(
        falBrand.brandColors,
        templateBinding.brandColors,
      );

      if (falPipeline === 'fal_story') {
        const poster = await runFalStoryPosterProduction({
          workspaceId: inputs.workspaceId,
          headline: inputs.headline,
          caption: inputs.caption,
          cta: inputs.cta,
          resolvedBrandName: inputs.resolvedBrandName,
          brandBusinessType: inputs.brandBusinessType,
          brandLocation: inputs.brandLocation,
          mood: inputs.mood,
          artDirection: inputs.artDirection,
          referenceUrl: photoUrl,
          styleRefs,
          designVibe,
          brandColors,
          backgroundStyle: inputs.falBackgroundStyleOverride ?? falBrand.backgroundStyle,
          lockOpts,
          templateBinding,
          designBriefDirectives: inputs.designBriefDirectives,
          visualDnaTone: falBrand.visualDnaTone,
          sceneHint: falBrand.sceneHint,
          designIntensityLevel: inputs.falDesignIntensityOverride ?? falBrand.designIntensityLevel,
          falLogoPlacement: inputs.falLogoPlacement,
        });
        state.videoUrl = null;
        state.imageUrl = poster.imageUrl;
        state.falGrafikerScore = poster.grafikerScore;
        state.falGrafikerPass = poster.grafikerPass;
        state.videoProduceMeta = { source: 'fal_video' };
        state.costDelta += 0.08;
        if (templateBinding.matched) {
          state.brandDesignTemplateId = templateBinding.matched.id;
          state.brandDesignTemplateType = templateBinding.matched.templateType;
          state.brandDesignTemplateName = templateBinding.matched.templateName;
        }
        console.log(
          `[auto-produce] [fal-track] fal_story poster: "${inputs.headline.slice(0, 40)}" ` +
          `template=${templateBinding.matched?.templateType ?? 'none'} ` +
          `model=${poster.typographyModel} grafiker=${poster.grafikerScore ?? '—'}/10`,
        );
        return;
      }

      const designer = await produceFalDesignerVideo({
        workspaceId: inputs.workspaceId,
        headline: inputs.headline,
        subtitle: inputs.cta || undefined,
        caption: inputs.caption,
        brandName: inputs.resolvedBrandName,
        brandColors,
        vibe: designVibe,
        backgroundStyle: inputs.falBackgroundStyleOverride ?? falBrand.backgroundStyle,
        referencePhotoUrl: photoUrl,
        logoUrl: templateBinding.logoUrl ?? inputs.brandLogoUrl ?? undefined,
        location: inputs.brandLocation,
        brandReferenceImageUrls: styleRefs,
        sector: inputs.brandBusinessType,
        mood: inputs.mood,
        artDirection: inputs.artDirection,
        grafikerMaxRetries: lockOpts.grafikerMaxRetries,
        pipeline: falPipeline,
        captionAwareHeadline: lockOpts.captionAwareHeadline,
        requireGroundedGallery: resolveFalRequireGroundedGallery({
          requireGroundedGallery: inputs.requireGroundedGallery || inputs.adHocBrief,
          referencePhotoUrl: photoUrl,
          sector: inputs.brandBusinessType,
          pipeline: falPipeline,
          hasRealBrandGallery: inputs.hasRealBrandGallery,
          captionDrivenGenerated: inputs.captionDrivenGenerated,
        }),
        sceneHint: falBrand.sceneHint,
        brandDirectives: [
          ...templateBinding.brandDirectives,
          ...(inputs.designBriefDirectives ?? []),
        ],
        visualDnaTone: falBrand.visualDnaTone,
        designerMotionCue: inputs.designerMotionCue,
        designIntensityLevel: inputs.falDesignIntensityOverride ?? falBrand.designIntensityLevel,
        occasion: templateBinding.occasion,
        logoPlacement: inputs.falLogoPlacement,
      });
      state.videoUrl = isPlayableVideoUrl(designer.videoUrl) ? designer.videoUrl : null;
      state.imageUrl = designer.imageUrl;
      state.falGrafikerScore = designer.grafikerScore;
      state.falGrafikerPass = designer.grafikerPass;
      state.videoProduceMeta = {
        source: designer.motionModel.includes('kling') ? 'kling' : 'fal_video',
      };
      state.costDelta += 0.18;
      if (templateBinding.matched) {
        state.brandDesignTemplateId = templateBinding.matched.id;
        state.brandDesignTemplateType = templateBinding.matched.templateType;
        state.brandDesignTemplateName = templateBinding.matched.templateName;
      }
      console.log(
        `[auto-produce] [fal-track] ${falPipeline}: "${inputs.headline.slice(0, 40)}" ` +
        `template=${templateBinding.matched?.templateType ?? 'none'} ` +
        `typo=${designer.typographyModel} motion=${designer.motionModel} ` +
        `grafiker=${designer.grafikerScore ?? '—'}/10 ` +
        `gallery=${photoUrl.split('/').pop()?.slice(0, 48) ?? 'none'}`,
      );
    } catch (falErr) {
      const falMsg = falErr instanceof Error ? falErr.message : String(falErr);
      console.warn('[auto-produce] [fal-track] designer failed:', falMsg);
      state.pipelineFailureReason = `fal_video_designer: ${falMsg}`.slice(0, 480);
      if (falPipeline === 'fal_story') {
        return;
      }
      try {
        const motionPrompt = finalizeFalPrompt(
          [
            inputs.headline,
            inputs.sceneHint,
            inputs.caption,
            inputs.mood ? `Mood: ${inputs.mood}` : '',
            inputs.resolvedBrandName ? `Brand: ${inputs.resolvedBrandName}` : '',
            inputs.brandBusinessType ? `Sector: ${inputs.brandBusinessType}` : '',
            'Keep the real venue photo recognizable — subtle premium motion only.',
          ].filter(Boolean).join('. '),
          { kind: 'video', label: 'fal-video-fallback' },
        );
        const fal = await produceFalMissionVideo({
          imageUrl: referenceUrl,
          headline: inputs.headline,
          caption: motionPrompt,
          mood: inputs.mood,
          brandBusinessType: inputs.brandBusinessType,
          pipeline: falPipeline,
          workspaceId: inputs.workspaceId,
        });
        state.videoUrl = isPlayableVideoUrl(fal.videoUrl) ? fal.videoUrl : null;
        state.imageUrl = referenceUrl;
        state.videoProduceMeta = {
          source: fal.reused
            ? 'fal_video'
            : fal.model.includes('kling')
              ? 'kling'
              : fal.model.includes('luma')
                ? 'luma'
                : 'fal_video',
          ...(fal.reused ? { i2vReused: true, reusedFromArtifactId: fal.reusedFromArtifactId } : {}),
        };
      } catch (rawErr) {
        const rawMsg = rawErr instanceof Error ? rawErr.message : String(rawErr);
        console.warn('[auto-produce] [fal-track] raw fallback failed:', rawMsg);
        state.pipelineFailureReason = `fal_video: ${rawMsg}`.slice(0, 480);
      }
    }
  },
};

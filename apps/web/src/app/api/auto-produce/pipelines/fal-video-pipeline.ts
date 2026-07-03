/**
 * fal-video Pipeline — fal.ai designer video track (fal_story / fal_reel).
 */

import {
  produceFalDesignerVideo,
  resolveTypographyVibeFromContext,
} from '@/lib/fal-designer-production';
import { produceFalMissionVideo } from '@/lib/fal-video';
import { resolveFalBrandInput } from '@/lib/fal-brand-input';
import {
  bindBrandTemplateForFalProduction,
  resolveFalTemplateLockOptions,
  templateStyleReferenceUrls,
} from '@/lib/brand-design-template-production';
import { isPlayableVideoUrl } from '@/lib/fal-story-motion';
import { serverConfig } from '@/lib/server-config';
import type { ProductionPipelineHandler } from './pipeline-types';

export const falVideoHandler: ProductionPipelineHandler = {
  name: 'fal_video',
  canRun: (ctx) => ctx.inputs.isFalMissionVideo && Boolean(ctx.inputs.referenceUrl),
  run: async ({ inputs, state }) => {
    const referenceUrl = inputs.referenceUrl;
    if (!referenceUrl) return;

    if (!serverConfig.fal.configured) {
      console.warn(
        `[auto-produce] FAL_API_KEY missing — fal slot skipped: ${inputs.pipeline} "${inputs.headline.slice(0, 40)}"`,
      );
      return;
    }

    try {
      const falPipeline = inputs.pipeline === 'fal_reel' ? 'fal_reel' : 'fal_story';
      const intensityChannel = falPipeline === 'fal_reel' ? ('reel' as const) : ('story' as const);
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
        adHocBrief: inputs.adHocBrief,
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
        });

      const photoUrl = templateBinding.referencePhotoUrl ?? referenceUrl;
      const styleRefs = templateStyleReferenceUrls(templateBinding, inputs.brandReferenceImageUrls);
      const lockOpts = resolveFalTemplateLockOptions({
        binding: templateBinding,
        baseGrafikerMaxRetries: inputs.grafikerMaxRetries,
        adHocBrief: inputs.adHocBrief,
      });

      const designer = await produceFalDesignerVideo({
        workspaceId: inputs.workspaceId,
        headline: inputs.headline,
        subtitle: inputs.cta || undefined,
        caption: inputs.caption,
        brandName: inputs.resolvedBrandName,
        brandColors: templateBinding.brandColors ?? falBrand.brandColors,
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
        requireGroundedGallery: inputs.adHocBrief,
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
      state.runwayProduceMeta = {
        source: designer.motionModel.includes('kling') ? 'kling' : 'fal_video',
      };
      state.costDelta += falPipeline === 'fal_reel' ? 0.18 : 0.14;
      if (templateBinding.matched) {
        state.brandDesignTemplateId = templateBinding.matched.id;
        state.brandDesignTemplateType = templateBinding.matched.templateType;
        state.brandDesignTemplateName = templateBinding.matched.templateName;
      }
      console.log(
        `[auto-produce] [fal-track] ${falPipeline}: "${inputs.headline.slice(0, 40)}" ` +
        `template=${templateBinding.matched?.templateType ?? 'none'} ` +
        `typo=${designer.typographyModel} motion=${designer.motionModel} ` +
        `grafiker=${designer.grafikerScore ?? '—'}/10`,
      );
    } catch (falErr) {
      console.warn(
        '[auto-produce] [fal-track] designer failed — raw I2V fallback:',
        falErr instanceof Error ? falErr.message : falErr,
      );
      try {
        const falPipeline = inputs.pipeline === 'fal_reel' ? 'fal_reel' : 'fal_story';
        const motionPrompt = [
          inputs.headline,
          inputs.sceneHint,
          inputs.caption,
          inputs.mood ? `Mood: ${inputs.mood}` : '',
          inputs.resolvedBrandName ? `Brand: ${inputs.resolvedBrandName}` : '',
          inputs.brandBusinessType ? `Sector: ${inputs.brandBusinessType}` : '',
          'Keep the real venue photo recognizable — subtle premium motion only.',
        ].filter(Boolean).join('. ').slice(0, 500);
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
        state.runwayProduceMeta = {
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
        console.warn('[auto-produce] [fal-track] raw fallback failed:', rawErr instanceof Error ? rawErr.message : rawErr);
      }
    }
  },
};

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
import { resolveFalBrandInput, resolveFalProductionBrandColors } from '@/lib/fal-brand-input';
import {
  bindBrandTemplateForFalProduction,
  dropConflictingLayoutDirectives,
  requiresLibraryTemplateReplica,
  resolveFalTemplateLockOptions,
  templateLayoutReferenceUrl,
  templateReplicaSpecFromBinding,
  templateStyleReferenceUrls,
} from '@/lib/brand-design-template-production';
import {
  generateStoryMotionPlateWithRetry,
  isPlayableVideoUrl,
} from '@/lib/fal-story-motion';
import {
  buildFalReelAgencyPack,
  mergeFalReelMotionCue,
} from '@/lib/fal-reel-agency-directives';
import { isRenderableDesignTemplateMatch } from '@/lib/brand-design-template-matcher';
import { serverConfig } from '@/lib/server-config';
import { renderLocalTypography, shouldUseLocalTypography } from '@/lib/local-typography-renderer';
import {
  buildReelRecipeMotionCue,
  resolveEffectiveReelMotionMode,
  resolveReelProductionRecipe,
  reelRecipeToJson,
} from '@/lib/reel-production-recipe';
import {
  buildReelCoverDiversityDirectives,
  getReelArchetype,
  resolveReelArchetypeForProduction,
} from '@/lib/reel-canva-archetypes';
import {
  assembleReelBeatMontage,
  pickReelBeatPhotoUrls,
  shouldRunReelBeatMontage,
} from '@/lib/reel-beat-montage';
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
  /**
   * Story posters stay fal_story + grounded-only.
   * Reel 9:16 still fallbacks must use fal_reel so Ideogram can recover when
   * gallery-grounded compose fails (otherwise reels exhaust with story error).
   */
  pipeline?: 'fal_story' | 'fal_reel';
}): Promise<{
  imageUrl: string;
  grafikerScore: number | null;
  grafikerPass: boolean;
  typographyModel: string;
  resolvedHeadline?: string;
}> {
  const pipeline = input.pipeline ?? 'fal_story';
  // Matched library template preview = layout law for the grounded compose.
  const templateLayoutImageUrl = templateLayoutReferenceUrl(input.templateBinding);
  const templateReplica = templateReplicaSpecFromBinding(input.templateBinding);
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
    pipeline,
    captionAwareHeadline: input.lockOpts.captionAwareHeadline,
    // Stories: grounded-only. Reels: try gallery first, allow Ideogram if grounded fails.
    requireGroundedGallery: pipeline === 'fal_story',
    sceneHint: input.sceneHint,
    brandDirectives: [
      ...input.templateBinding.brandDirectives,
      ...dropConflictingLayoutDirectives(
        input.designBriefDirectives ?? [],
        input.templateBinding.matched,
      ),
    ],
    visualDnaTone: input.visualDnaTone,
    designIntensityLevel: input.designIntensityLevel,
    occasion: input.templateBinding.occasion,
    logoPlacement: input.falLogoPlacement,
    templateLayoutImageUrl,
    templateReplica,
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
      postMood: inputs.mood,
    });

    // fal_reel only — agency pack from brand vibe + mission/calendar (not stories/posts).
    const reelAgencyPack = falPipeline === 'fal_reel'
      ? buildFalReelAgencyPack({
          brandName: inputs.resolvedBrandName,
          sector: inputs.brandBusinessType,
          brandTheme: inputs.brandTheme,
          brandVibeProfile: inputs.brandVibeProfile,
          brandTone: inputs.brandTone,
          visualStyle: inputs.visualStyle,
          visualDna: inputs.visualDna,
          headline: inputs.headline,
          caption: inputs.caption,
          mood: inputs.mood,
          visualDirection: inputs.visualDirection,
          strategicPurpose: inputs.strategicPurpose,
          announcementType: inputs.announcementType,
          slotRole: inputs.slotRole,
          catalogSlotKey: inputs.catalogSlotKey,
          reelArtDirection: inputs.reelArtDirection,
          reelSupportingSubjects: inputs.reelSupportingSubjects,
        })
      : null;
    const templateBinding = await bindBrandTemplateForFalProduction({
      workspaceId: inputs.workspaceId,
      slotRole: inputs.slotRole,
      librarySlotKey: inputs.librarySlotKey,
      format: intensityChannel,
      caption: inputs.caption,
      headline: inputs.headline,
      subtitle: inputs.cta,
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

    if (templateBinding.matched) {
      state.brandDesignTemplateId = templateBinding.matched.id;
      state.brandDesignTemplateType = templateBinding.matched.templateType;
      state.brandDesignTemplateName = templateBinding.matched.templateName;
      state.brandDesignTemplateMatchQuality = templateBinding.matched.matchQuality;
    }

    const reelRecipe = falPipeline === 'fal_reel'
      ? resolveReelProductionRecipe({
          sector: inputs.brandBusinessType,
          catalogSlotKey: inputs.catalogSlotKey,
          templateType: templateBinding.matched?.templateType,
          canvaArchetypeId: templateBinding.matched?.canvaArchetypeId,
          headline: inputs.headline,
          caption: inputs.caption,
          slotPromptPack: inputs.slotPromptPack ?? null,
          templateRecipe: templateBinding.matched?.reelRecipe ?? null,
          brandReelParams: reelAgencyPack?.motionParams ?? null,
          missionReelMotionSpec: inputs.reelMotionSpec ?? null,
        })
      : null;

    const reelArchetype = falPipeline === 'fal_reel'
      ? (getReelArchetype(reelRecipe?.reelArchetypeId)
        ?? resolveReelArchetypeForProduction({
          canvaArchetypeId: templateBinding.matched?.canvaArchetypeId ?? reelRecipe?.coverCanvaId,
          headline: inputs.headline,
          caption: inputs.caption,
          sector: inputs.brandBusinessType,
          catalogSlotKey: inputs.catalogSlotKey,
          templateType: templateBinding.matched?.templateType,
          reelJob: reelRecipe?.reelJob,
        }))
      : null;

    const reelCoverDirectives = reelArchetype
      ? buildReelCoverDiversityDirectives({
          reelArchetype,
          coverCanvaId: reelRecipe?.coverCanvaId ?? templateBinding.matched?.canvaArchetypeId,
        })
      : [];

    const reelMotionCue = falPipeline === 'fal_reel'
      ? mergeFalReelMotionCue(
          inputs.designerMotionCue,
          [
            reelAgencyPack?.motionCue,
            reelRecipe ? buildReelRecipeMotionCue(reelRecipe) : undefined,
            reelArchetype ? `archetype ${reelArchetype.id}: ${reelArchetype.motionRecipe}` : undefined,
          ].filter(Boolean).join(' · ') || undefined,
        )
      : inputs.designerMotionCue;

    // Catalog-pinned story/reel slots must clone the library template (same as posts).
    // Fail closed rather than inventing a generic Ideogram/Satori layout.
    const catalogPinned = Boolean(String(inputs.catalogSlotKey ?? '').trim());
    const libraryReplicaRequired = catalogPinned || requiresLibraryTemplateReplica(templateBinding.matched);
    if (catalogPinned && !requiresLibraryTemplateReplica(templateBinding.matched)) {
      state.pipelineFailureReason =
        `library_template_required: no renderable ${falPipeline === 'fal_reel' ? 'reel_cover' : 'story'} template for catalog_slot_key=${inputs.catalogSlotKey}`;
      console.warn(
        `[auto-produce] [fal-track] withheld ${falPipeline}: ${state.pipelineFailureReason}`,
      );
      return;
    }

    if (!serverConfig.fal.configured) {
      console.warn(
        `[auto-produce] FAL_API_KEY missing — fal slot skipped: ${inputs.pipeline} "${inputs.headline.slice(0, 40)}"`,
      );
      state.pipelineFailureReason = 'fal_api_key_missing';
      return;
    }

    try {
      if (falPipeline === 'fal_story') {
        // A real (hard/soft) library template match must render the actual
        // template design via GPT replica — Satori would collapse the layout.
        const templateIsRenderable = isRenderableDesignTemplateMatch(templateBinding.matched);
        // Satori only when there is NO library template at all. format_fallback
        // still has a brand template — prefer GPT poster over cream-card overlay.
        const noLibraryTemplate = !templateBinding.matched;
        if (
          noLibraryTemplate
          && !templateIsRenderable
          && shouldUseLocalTypography(inputs.slotRole, falPipeline, inputs.brandTheme)
        ) {
          const local = await renderLocalTypography({
            workspaceId: inputs.workspaceId,
            headline: inputs.headline,
            subtitle: inputs.cta || inputs.falSubtitle,
            brandName: inputs.resolvedBrandName,
            brandColors,
            vibe: designVibe,
            aspectRatio: '9:16',
            referencePhotoUrl: photoUrl,
            logoUrl: templateBinding.logoUrl ?? inputs.brandLogoUrl ?? undefined,
            sector: inputs.brandBusinessType,
            occasion: templateBinding.occasion,
            templateType: templateBinding.matched?.templateType,
            canvaArchetypeId: templateBinding.matched?.canvaArchetypeId,
            layoutPattern: templateBinding.matched?.layoutPattern,
            layoutFamilyHint: inputs.layoutFamilyHint,
            slotRole: inputs.slotRole,
            slotSeed:
              inputs.catalogSlotKey
              ?? templateBinding.matched?.id
              ?? templateBinding.matched?.templateName
              ?? inputs.slotRole,
          });
          if (local) {
            state.videoUrl = null;
            state.imageUrl = local.imageUrl;
            state.falGrafikerScore = local.grafikerScore;
            state.falGrafikerPass = local.grafikerPass;
            state.falDesignEngine = 'satori_local';
            state.videoProduceMeta = { source: 'fal_video' };
            state.costDelta += 0.002;
            console.log(
              `[auto-produce] [fal-track] fal_story local typography: "${inputs.headline.slice(0, 40)}" ` +
              `layout=${local.layoutFamily} template=${templateBinding.matched?.templateType ?? 'none'}`,
            );
            return;
          }
        }
        try {
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
          console.log(
            `[auto-produce] [fal-track] fal_story poster: "${inputs.headline.slice(0, 40)}" ` +
            `template=${templateBinding.matched?.templateType ?? 'none'} ` +
            `model=${poster.typographyModel} grafiker=${poster.grafikerScore ?? '—'}/10`,
          );
          return;
        } catch (posterErr) {
          // Safety net: template replica failed — a Satori overlay beats an
          // empty slot when local typography is enabled for this role.
          if (
            !templateIsRenderable
            || !shouldUseLocalTypography(inputs.slotRole, falPipeline, inputs.brandTheme)
          ) {
            throw posterErr;
          }
          console.warn(
            '[auto-produce] [fal-track] template poster failed — Satori safety net:',
            posterErr instanceof Error ? posterErr.message : String(posterErr),
          );
          const local = await renderLocalTypography({
            workspaceId: inputs.workspaceId,
            headline: inputs.headline,
            subtitle: inputs.cta || inputs.falSubtitle,
            brandName: inputs.resolvedBrandName,
            brandColors,
            vibe: designVibe,
            aspectRatio: '9:16',
            referencePhotoUrl: photoUrl,
            logoUrl: templateBinding.logoUrl ?? inputs.brandLogoUrl ?? undefined,
            sector: inputs.brandBusinessType,
            occasion: templateBinding.occasion,
            templateType: templateBinding.matched?.templateType,
            canvaArchetypeId: templateBinding.matched?.canvaArchetypeId,
            layoutPattern: templateBinding.matched?.layoutPattern,
            layoutFamilyHint: inputs.layoutFamilyHint,
            slotRole: inputs.slotRole,
            slotSeed:
              inputs.catalogSlotKey
              ?? templateBinding.matched?.id
              ?? templateBinding.matched?.templateName
              ?? inputs.slotRole,
          });
          if (!local) throw posterErr;
          state.videoUrl = null;
          state.imageUrl = local.imageUrl;
          state.falGrafikerScore = local.grafikerScore;
          state.falGrafikerPass = local.grafikerPass;
          state.falDesignEngine = 'satori_local';
          state.videoProduceMeta = { source: 'fal_video' };
          state.costDelta += 0.002;
          return;
        }
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
        requireGroundedGallery:
          libraryReplicaRequired
          || resolveFalRequireGroundedGallery({
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
          ...dropConflictingLayoutDirectives(
            inputs.designBriefDirectives ?? [],
            templateBinding.matched,
          ),
          ...(reelAgencyPack?.stillDirectives ?? []),
          ...reelCoverDirectives,
        ],
        visualDnaTone: falBrand.visualDnaTone,
        designerMotionCue: reelMotionCue,
        designIntensityLevel: inputs.falDesignIntensityOverride ?? falBrand.designIntensityLevel,
        occasion: templateBinding.occasion,
        logoPlacement: inputs.falLogoPlacement,
        templateLayoutImageUrl: templateLayoutReferenceUrl(templateBinding),
        templateReplica: templateReplicaSpecFromBinding(templateBinding),
        productionTier: inputs.productionTier,
        reelRecipe,
      });
      if (falPipeline === 'fal_reel' && (reelAgencyPack || reelRecipe)) {
        console.log(
          `[auto-produce] [fal-track] reel recipe: `
          + `arch=${reelRecipe?.reelArchetypeId ?? '—'} `
          + `cover=${reelRecipe?.coverCanvaId ?? '—'} `
          + `mode=${reelRecipe ? resolveEffectiveReelMotionMode(reelRecipe) : '—'} `
          + `job=${reelRecipe?.reelJob ?? '—'} `
          + `edit=${reelRecipe?.editStyle ?? '—'} `
          + `directives=${(reelAgencyPack?.stillDirectives.length ?? 0) + reelCoverDirectives.length}`,
        );
      }

      let finalVideoUrl = isPlayableVideoUrl(designer.videoUrl) ? designer.videoUrl : null;
      if (
        falPipeline === 'fal_reel'
        && reelRecipe
        && finalVideoUrl
        && shouldRunReelBeatMontage({
          recipe: reelRecipe,
          photoUrls: [
            photoUrl,
            ...(inputs.montagePhotoUrls ?? []),
          ].filter(Boolean) as string[],
          productionTier: inputs.productionTier,
        })
      ) {
        const beatPhotos = pickReelBeatPhotoUrls({
          primaryUrl: photoUrl,
          candidates: inputs.montagePhotoUrls ?? [],
          beatCount: reelRecipe.beatCount,
        });
        try {
          const montage = await assembleReelBeatMontage({
            photoUrls: beatPhotos,
            recipe: reelRecipe,
            sector: inputs.brandBusinessType,
            brandName: inputs.resolvedBrandName,
            mood: inputs.mood,
            designerMotionCue: reelMotionCue,
            workspaceId: inputs.workspaceId,
          });
          if (montage && isPlayableVideoUrl(montage.videoUrl)) {
            finalVideoUrl = montage.videoUrl;
            console.log(
              `[auto-produce] [fal-track] beat montage: ${montage.beatCount} beats `
              + `arch=${reelRecipe.reelArchetypeId} model=${montage.model}`,
            );
            if (inputs.brandLogoUrl && reelRecipe.logoPolicy === 'composite_only') {
              const { compositeOfficialLogoOnVideoUrl } = await import('@/lib/fal-logo-composite');
              const withLogo = await compositeOfficialLogoOnVideoUrl({
                videoUrl: finalVideoUrl,
                logoUrl: inputs.brandLogoUrl,
                placement: inputs.falLogoPlacement ?? null,
                channel: 'reel',
                workspaceId: inputs.workspaceId,
              });
              if (withLogo.logoApplied) finalVideoUrl = withLogo.videoUrl;
            }
          }
        } catch (montageErr) {
          console.warn(
            '[auto-produce] [fal-track] beat montage failed — keeping single clip:',
            montageErr instanceof Error ? montageErr.message : montageErr,
          );
        }
      }

      state.videoUrl = finalVideoUrl;
      // Reels: only keep the designed 9:16 still — never fall back to a raw gallery 4:5.
      state.imageUrl = designer.imageUrl
        || (falPipeline === 'fal_reel' ? null : (photoUrl || referenceUrl));
      if (falPipeline === 'fal_reel' && !state.videoUrl && state.imageUrl) {
        state.pipelineFailureReason = state.pipelineFailureReason
          ?? 'fal_reel_video_no_artifact_still_fallback';
      }
      state.falGrafikerScore = designer.grafikerScore;
      state.falGrafikerPass = designer.grafikerPass;
      state.videoProduceMeta = {
        source: designer.motionModel.includes('kling') ? 'kling' : 'fal_video',
        ...(reelAgencyPack?.motionParams
          ? {
              reelPace: reelAgencyPack.motionParams.reelPacing,
              cameraMotion: reelAgencyPack.motionParams.cameraMotion,
              strategy: reelAgencyPack.motionParams.strategy,
            }
          : {}),
        ...(reelRecipe
          ? {
              reelPace: reelRecipe.pace === 'auto' ? reelAgencyPack?.motionParams?.reelPacing : reelRecipe.pace,
              cameraMotion: reelRecipe.camera,
              strategy: reelRecipe.editStyle,
              reelRecipe: reelRecipeToJson(reelRecipe),
              motionMode: resolveEffectiveReelMotionMode(reelRecipe),
            }
          : {}),
      };
      state.costDelta += 0.18;
      if (templateBinding.matched) {
        state.brandDesignTemplateId = templateBinding.matched.id;
        state.brandDesignTemplateType = templateBinding.matched.templateType;
        state.brandDesignTemplateName = templateBinding.matched.templateName;
        state.brandDesignTemplateMatchQuality = templateBinding.matched.matchQuality;
      }
      console.log(
        `[auto-produce] [fal-track] ${falPipeline}: "${inputs.headline.slice(0, 40)}" ` +
        `template=${templateBinding.matched?.templateType ?? 'none'} ` +
        `typo=${designer.typographyModel} motion=${designer.motionModel} ` +
        `grafiker=${designer.grafikerScore ?? '—'}/10 ` +
        `gallery=${photoUrl.split('/').pop()?.slice(0, 48) ?? 'none'}` +
        (reelAgencyPack ? ` agencyDirectives=${reelAgencyPack.stillDirectives.length}` : ''),
      );
    } catch (falErr) {
      const falMsg = falErr instanceof Error ? falErr.message : String(falErr);
      console.warn('[auto-produce] [fal-track] designer failed:', falMsg);
      state.pipelineFailureReason = `fal_video_designer: ${falMsg}`.slice(0, 480);
      if (falPipeline === 'fal_story') {
        return;
      }
      // Reels MUST stay 9:16 — never I2V a raw 4:5 gallery photo into a "reel".
      // Use fal_reel still path (not fal_story) so Ideogram can recover if grounded fails.
      try {
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
          designBriefDirectives: [
            ...(inputs.designBriefDirectives ?? []),
            ...(reelAgencyPack?.stillDirectives ?? []),
          ],
          visualDnaTone: falBrand.visualDnaTone,
          sceneHint: falBrand.sceneHint,
          designIntensityLevel: inputs.falDesignIntensityOverride ?? falBrand.designIntensityLevel,
          falLogoPlacement: inputs.falLogoPlacement,
          pipeline: 'fal_reel',
        });
        state.imageUrl = poster.imageUrl;
        state.falGrafikerScore = poster.grafikerScore;
        state.falGrafikerPass = poster.grafikerPass;
        state.costDelta += 0.08;

        // Same locked I2V path as primary designer track — never pass headline into motion
        // (models rewrite letters into gibberish when copy is in the prompt).
        const fal = await generateStoryMotionPlateWithRetry({
          imageUrl: poster.imageUrl,
          style: 'social_reel_graphics',
          sector: inputs.brandBusinessType,
          brandName: inputs.resolvedBrandName,
          mood: inputs.mood,
          preserveExistingText: true,
          pipeline: 'fal_reel',
          designerMotionCue: reelMotionCue,
        });
        state.videoUrl = isPlayableVideoUrl(fal.videoUrl) ? fal.videoUrl : null;
        if (!state.videoUrl) {
          state.pipelineFailureReason = state.pipelineFailureReason
            ?? 'fal_reel_video_no_artifact_still_fallback';
        }
        state.videoProduceMeta = {
          source: fal.model.includes('kling')
            ? 'kling'
            : fal.model.includes('luma')
              ? 'luma'
              : 'fal_video',
        };
        console.log(
          `[auto-produce] [fal-track] fal_reel 9:16 fallback poster→locked-motion: "${inputs.headline.slice(0, 40)}"`,
        );
      } catch (rawErr) {
        const rawMsg = rawErr instanceof Error ? rawErr.message : String(rawErr);
        console.warn('[auto-produce] [fal-track] 9:16 reel fallback failed:', rawMsg);
        state.pipelineFailureReason = `fal_video: ${rawMsg}`.slice(0, 480);
        // Do not publish a raw gallery 4:5 still as a reel artifact.
        if (!state.imageUrl) {
          state.imageUrl = null;
        }
        state.videoUrl = null;
      }
    }
  },
};

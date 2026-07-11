/**
 * fal-only Pipeline — pure fal.ai production (no Remotion, no Runway).
 *
 * Reel slots (`fal_only_reel`) → designed video first:
 *   gallery photo + GPT-image grounded design card (headline + subtitle + brand)
 *   → Kling locked-composition animation.
 * Cinematic gallery-only animation is fallback when designer path fails.
 *
 * Post slot (`fal_only_post`) → designed still when no gallery; editorial photo when gallery exists.
 */

import type { TypographyVibe } from '@/types/brand-theme';
import {
  produceFalDesignedPostStill,
  produceFalDesignerVideo,
  resolveFalRequireGroundedGallery,
  resolveTypographyVibeFromContext,
} from '@/lib/fal-designer-production';
import { generateStoryMotionPlate, isPlayableVideoUrl } from '@/lib/fal-story-motion';
import { resolveFalBrandInput, resolveFalProductionBrandColors } from '@/lib/fal-brand-input';
import {
  bindBrandTemplateForFalProduction,
  resolveFalTemplateLockOptions,
  templateStyleReferenceUrls,
} from '@/lib/brand-design-template-production';
import { serverConfig } from '@/lib/server-config';
import type { ProductionPipelineHandler } from './pipeline-types';

export interface FalOnlyVideoMeta {
  source: 'kling' | 'luma' | 'fal_video';
}

export interface FalOnlySlotInput {
  pipeline: string;
  workspaceId: string;
  isFalOnlyPost: boolean;
  isFalOnlyVideo: boolean;
  existingImageUrl: string | null;
  existingVideoUrl: string | null;
  headline: string;
  caption: string;
  cta: string;
  brandName: string;
  brandColors: { primary: string; accent: string };
  /** Brand-configured typography vibe (brandTheme.typography_design.vibe), if any. */
  brandVibe: TypographyVibe | null;
  sector: string;
  location?: string;
  mood?: string;
  /** Brief-derived subject/scene the AI background should evoke. */
  sceneHint?: string;
  logoUrl?: string;
  grafikerMaxRetries?: number;
  /** Caption-matched gallery photo URL — used as photo_overlay background when available. */
  referencePhotoUrl?: string;
  brandReferenceImageUrls?: string[];
  /** Shared brand-system directives resolved from Brand Theme + Template Library. */
  brandDirectives?: string[];
  /** Visual DNA tone sentence — makes design feel brand-authentic, not sector-generic. */
  visualDnaTone?: string;
  /** Agent designer brief motion cue for Kling animation. */
  designerMotionCue?: string;
  /** fal.ai design intensity for the slot channel. */
  designIntensityLevel?: import('@/lib/fal-design-intensity').FalDesignIntensityLevel;
  backgroundStyle?: import('@/types/brand-theme').TypographyBackgroundStyle;
  brandTemplateBinding?: import('@/lib/brand-design-template-production').BrandTemplateFalBinding | null;
  logoPlacement?: import('@/lib/fal-logo-placement').ResolvedFalLogoPlacement | null;
}

export interface FalOnlySlotResult {
  imageUrl: string | null;
  videoUrl: string | null;
  falGrafikerScore: number | null;
  falGrafikerPass: boolean;
  falDesignEngine: string | null;
  videoProduceMeta: FalOnlyVideoMeta | null;
  /** Added to the running cost estimate. */
  costDelta: number;
  /** Set when production attempted but no usable URL (for factory last_error). */
  failureReason?: string;
}

/**
 * Produce a pure fal.ai slot. Returns `null` when nothing was produced
 * (no API key, slot already filled, or not a fal-only slot) so the caller
 * can leave its loop variables untouched.
 */
export async function produceFalOnlySlot(
  input: FalOnlySlotInput,
): Promise<FalOnlySlotResult | null> {
  const isFalOnly = input.isFalOnlyPost || input.isFalOnlyVideo;
  if (!isFalOnly) return null;

  if (!serverConfig.fal.configured) {
    console.warn(
      `[auto-produce] FAL_API_KEY missing — fal-only slot skipped: ${input.pipeline} "${input.headline.slice(0, 40)}"`,
    );
    return {
      imageUrl: null,
      videoUrl: null,
      falGrafikerScore: null,
      falGrafikerPass: false,
      falDesignEngine: null,
      videoProduceMeta: null,
      costDelta: 0,
      failureReason: 'fal_only: FAL_API_KEY not configured',
    };
  }

  // ── fal-only video (reel) — DESIGNED route first ───────────────────────────
  if (input.isFalOnlyVideo && !input.existingVideoUrl) {
    const falPipeline = input.pipeline === 'fal_only_story' ? 'fal_story' : 'fal_reel';
    const binding = input.brandTemplateBinding;
    const lockOpts = resolveFalTemplateLockOptions({
      binding,
      baseGrafikerMaxRetries: input.grafikerMaxRetries,
    });
    const designVibe =
      binding?.lockedVibe ??
      resolveTypographyVibeFromContext({
        caption: input.caption,
        headline: input.headline,
        sector: input.sector,
        brandVibe: input.brandVibe,
        lockPremiumVibe: /beach|club|hotel|resort|spa|fine_dining|restaurant/i.test(input.sector ?? ''),
      });
    const brandColors = resolveFalProductionBrandColors(
      input.brandColors,
      binding?.brandColors,
    );
    const photoUrl = binding?.referencePhotoUrl ?? input.referencePhotoUrl;
    const styleRefs = templateStyleReferenceUrls(
      binding ?? {
        matched: null,
        lockedVibe: null,
        referencePhotoUrl: photoUrl ?? null,
        styleReferenceUrl: null,
        brandDirectives: input.brandDirectives ?? [],
        brandColors: null,
        logoUrl: input.logoUrl,
        occasion: undefined,
      },
      input.brandReferenceImageUrls ?? [],
    );

    const groundedRequired = resolveFalRequireGroundedGallery({
      referencePhotoUrl: photoUrl,
      sector: input.sector,
      pipeline: falPipeline,
    });

    let designFailMsg = '';
    try {
      const designer = await produceFalDesignerVideo({
        workspaceId: input.workspaceId,
        headline: input.headline,
        subtitle: input.cta || undefined,
        caption: input.caption,
        brandName: input.brandName,
        brandColors,
        vibe: designVibe,
        backgroundStyle: input.backgroundStyle ?? (photoUrl ? 'photo_overlay' : 'gradient_mesh'),
        referencePhotoUrl: photoUrl,
        sceneHint: input.sceneHint || undefined,
        brandDirectives: binding?.brandDirectives ?? input.brandDirectives,
        visualDnaTone: input.visualDnaTone,
        logoUrl: binding?.logoUrl ?? input.logoUrl,
        location: input.location,
        brandReferenceImageUrls: styleRefs,
        sector: input.sector,
        mood: input.mood,
        grafikerMaxRetries: lockOpts.grafikerMaxRetries,
        pipeline: falPipeline,
        captionAwareHeadline: lockOpts.captionAwareHeadline,
        requireGroundedGallery: groundedRequired,
        designerMotionCue: input.designerMotionCue,
        designIntensityLevel: input.designIntensityLevel,
        occasion: binding?.occasion,
        logoPlacement: input.logoPlacement,
      });
      console.log(
        `[auto-produce] [fal-only] ${input.pipeline} designed video: "${designer.resolvedHeadline ?? input.headline.slice(0, 40)}" ` +
        `template=${binding?.matched?.templateType ?? 'none'} typo=${designer.typographyModel} motion=${designer.motionModel} grounded=${Boolean(photoUrl)}`,
      );
      return {
        imageUrl: designer.imageUrl,
        videoUrl: isPlayableVideoUrl(designer.videoUrl) ? designer.videoUrl : null,
        falGrafikerScore: designer.grafikerScore,
        falGrafikerPass: designer.grafikerPass,
        falDesignEngine: photoUrl ? 'fal_grounded_designer' : 'fal_ideogram_only',
        videoProduceMeta: {
          source: designer.motionModel.includes('kling') ? 'kling' : 'fal_video',
        },
        costDelta: falPipeline === 'fal_reel' ? 0.18 : 0.14,
      };
    } catch (designErr) {
      designFailMsg = designErr instanceof Error ? designErr.message : String(designErr);
      console.warn(
        '[auto-produce] [fal-only] designed video failed, trying cinematic fallback:',
        designFailMsg,
      );
    }

    // Fallback: animate gallery photo directly (no typography) when designer fails
    if (input.referencePhotoUrl) {
      try {
        const motion = await generateStoryMotionPlate({
          imageUrl: input.referencePhotoUrl,
          headline: input.headline,
          sector: input.sector,
          brandName: input.brandName,
          mood: input.mood,
          style: 'product_hero',
          timeoutMs: 150_000,
          preserveExistingText: false,
        });
        return {
          imageUrl: input.referencePhotoUrl,
          videoUrl: motion.videoUrl,
          falGrafikerScore: null,
          falGrafikerPass: true,
          falDesignEngine: 'fal_cinematic_motion',
          videoProduceMeta: {
            source: motion.model.includes('kling') ? 'kling' : 'luma',
          },
          costDelta: 0.14,
        };
      } catch (cinematicErr) {
        const cinematicMsg = cinematicErr instanceof Error ? cinematicErr.message : String(cinematicErr);
        console.warn('[auto-produce] [fal-only] cinematic fallback failed:', cinematicMsg);
        return {
          imageUrl: null,
          videoUrl: null,
          falGrafikerScore: null,
          falGrafikerPass: false,
          falDesignEngine: null,
          videoProduceMeta: null,
          costDelta: 0,
          failureReason: `fal_only_video: ${cinematicMsg}`.slice(0, 480),
        };
      }
    }
    return {
      imageUrl: null,
      videoUrl: null,
      falGrafikerScore: null,
      falGrafikerPass: false,
      falDesignEngine: null,
      videoProduceMeta: null,
      costDelta: 0,
      failureReason: `fal_only_video: ${designFailMsg || 'no gallery photo for cinematic fallback'}`.slice(0, 480),
    };
  }

  // ── fal-only post (still) — designed still when possible ───────────────────
  if (input.isFalOnlyPost && !input.existingImageUrl) {
    const binding = input.brandTemplateBinding;
    const lockOpts = resolveFalTemplateLockOptions({
      binding,
      baseGrafikerMaxRetries: input.grafikerMaxRetries,
    });
    try {
      const designVibe =
        binding?.lockedVibe ??
        resolveTypographyVibeFromContext({
          caption: input.caption,
          headline: input.headline,
          sector: input.sector,
          brandVibe: input.brandVibe,
          lockPremiumVibe: /beach|club|hotel|resort|spa|fine_dining|restaurant/i.test(input.sector ?? ''),
        });
      const brandColors = resolveFalProductionBrandColors(
      input.brandColors,
      binding?.brandColors,
    );
      const photoUrl = binding?.referencePhotoUrl ?? input.referencePhotoUrl;
      const styleRefs = templateStyleReferenceUrls(
        binding ?? {
          matched: null,
          lockedVibe: null,
          referencePhotoUrl: photoUrl ?? null,
          styleReferenceUrl: null,
          brandDirectives: input.brandDirectives ?? [],
          brandColors: null,
          logoUrl: input.logoUrl,
          occasion: undefined,
        },
        input.brandReferenceImageUrls ?? [],
      );
      const still = await produceFalDesignedPostStill({
        workspaceId: input.workspaceId,
        headline: input.headline,
        subtitle: input.cta || undefined,
        caption: input.caption,
        brandName: input.brandName,
        brandColors,
        vibe: designVibe,
        backgroundStyle: input.backgroundStyle ?? (photoUrl ? 'photo_overlay' : 'gradient_mesh'),
        aspectRatio: '4:5',
        referencePhotoUrl: photoUrl,
        sceneHint: input.sceneHint || undefined,
        brandDirectives: binding?.brandDirectives ?? input.brandDirectives,
        visualDnaTone: input.visualDnaTone,
        logoUrl: binding?.logoUrl ?? input.logoUrl,
        location: input.location,
        brandReferenceImageUrls: styleRefs,
        sector: input.sector,
        mood: input.mood,
        grafikerMaxRetries: lockOpts.grafikerMaxRetries,
        captionAwareHeadline: lockOpts.captionAwareHeadline,
        requireGroundedGallery: resolveFalRequireGroundedGallery({
          referencePhotoUrl: photoUrl,
          sector: input.sector,
        }),
        designIntensityLevel: input.designIntensityLevel,
        occasion: binding?.occasion,
      });
      console.log(
        `[auto-produce] [fal-only] post designed: "${still.resolvedHeadline ?? input.headline.slice(0, 40)}" ` +
        `template=${binding?.matched?.templateType ?? 'none'} vibe=${designVibe}`,
      );
      return {
        imageUrl: still.imageUrl,
        videoUrl: null,
        falGrafikerScore: still.grafikerScore,
        falGrafikerPass: still.grafikerPass,
        falDesignEngine: photoUrl ? 'fal_grounded_designer' : 'fal_ideogram_only',
        videoProduceMeta: null,
        costDelta: 0.05,
      };
    } catch (falOnlyErr) {
      const msg = falOnlyErr instanceof Error ? falOnlyErr.message : String(falOnlyErr);
      console.warn('[auto-produce] [fal-only] post failed:', msg);
      return {
        imageUrl: null,
        videoUrl: null,
        falGrafikerScore: null,
        falGrafikerPass: false,
        falDesignEngine: null,
        videoProduceMeta: null,
        costDelta: 0,
        failureReason: `fal_only_post: ${msg}`.slice(0, 480),
      };
    }
  }

  return null;
}

/**
 * Pipeline handler wrapper for the slot-loop dispatch (b2b). Resolves the fal
 * brand input, produces the pure fal.ai slot, and merges the result into the
 * shared slot state. Behavior is identical to the previous inline production-loop block.
 */
export const falOnlyHandler: ProductionPipelineHandler = {
  name: 'fal_only',
  canRun: (ctx) => ctx.inputs.isFalOnlyPost || ctx.inputs.isFalOnlyVideo,
  run: async ({ inputs, state }) => {
    const falBrand = resolveFalBrandInput({
      brandTheme: inputs.brandTheme,
      templateLibrary: inputs.templateLibrary,
      librarySlotKey: inputs.librarySlotKey,
      tokens: inputs.brandTokens,
      sector: inputs.brandBusinessType,
      caption: inputs.caption,
      headline: inputs.headline,
      referencePhotoUrl: inputs.referenceUrl || undefined,
      sceneHint: inputs.sceneHint || undefined,
      format: inputs.isFalOnlyPost ? 'post' : inputs.pipeline.includes('reel') ? 'reel' : 'story',
      visualDna: inputs.visualDna,
      brandTone: inputs.brandTone,
      brandDescription: inputs.brandDescription,
      designBriefDirectives: inputs.designBriefDirectives,
    });
    const templateBinding = await bindBrandTemplateForFalProduction({
      workspaceId: inputs.workspaceId,
      slotRole: inputs.slotRole,
      librarySlotKey: inputs.librarySlotKey,
      format: inputs.isFalOnlyPost ? 'post' : inputs.pipeline.includes('reel') ? 'reel' : 'story',
      caption: inputs.caption,
      adHocBrief: inputs.adHocBrief,
      missionReferenceUrl: inputs.referenceUrl,
      baseDirectives: falBrand.promptDirectives,
      brandColors: falBrand.brandColors,
      logoUrl: inputs.brandLogoUrl || undefined,
      brandVibe: falBrand.vibe,
    });
    const falOnly = await produceFalOnlySlot({
      pipeline: inputs.pipeline,
      workspaceId: inputs.workspaceId,
      isFalOnlyPost: inputs.isFalOnlyPost,
      isFalOnlyVideo: inputs.isFalOnlyVideo,
      existingImageUrl: state.imageUrl,
      existingVideoUrl: state.videoUrl,
      headline: inputs.headline,
      caption: inputs.caption,
      cta: inputs.cta,
      brandName: inputs.resolvedBrandName,
      brandColors: resolveFalProductionBrandColors(
        falBrand.brandColors,
        templateBinding.brandColors,
      ),
      brandVibe: falBrand.vibe,
      sector: inputs.brandBusinessType,
      location: inputs.brandLocation,
      mood: inputs.mood,
      sceneHint: falBrand.sceneHint,
      logoUrl: templateBinding.logoUrl ?? inputs.brandLogoUrl ?? undefined,
      grafikerMaxRetries: inputs.grafikerMaxRetries,
      referencePhotoUrl: templateBinding.referencePhotoUrl ?? inputs.referenceUrl ?? undefined,
      brandReferenceImageUrls: inputs.brandReferenceImageUrls,
      brandDirectives: [
        ...templateBinding.brandDirectives,
        ...(inputs.designBriefDirectives ?? []),
      ],
      visualDnaTone: falBrand.visualDnaTone,
      designerMotionCue: inputs.designerMotionCue,
      designIntensityLevel: inputs.falDesignIntensityOverride ?? falBrand.designIntensityLevel,
      backgroundStyle: inputs.falBackgroundStyleOverride ?? falBrand.backgroundStyle,
      brandTemplateBinding: templateBinding,
      logoPlacement: inputs.falLogoPlacement,
    });
    if (falOnly) {
      if (falOnly.imageUrl != null) state.imageUrl = falOnly.imageUrl;
      if (falOnly.videoUrl != null) state.videoUrl = falOnly.videoUrl;
      state.falGrafikerScore = falOnly.falGrafikerScore;
      state.falGrafikerPass = falOnly.falGrafikerPass;
      state.falDesignEngine = falOnly.falDesignEngine;
      if (falOnly.videoProduceMeta) state.videoProduceMeta = falOnly.videoProduceMeta;
      state.costDelta += falOnly.costDelta;
      if (falOnly.failureReason && !falOnly.imageUrl && !falOnly.videoUrl) {
        state.pipelineFailureReason = falOnly.failureReason;
      }
      if (templateBinding.matched) {
        state.brandDesignTemplateId = templateBinding.matched.id;
        state.brandDesignTemplateType = templateBinding.matched.templateType;
        state.brandDesignTemplateName = templateBinding.matched.templateName;
      }
    }
  },
};

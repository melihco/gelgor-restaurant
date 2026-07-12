/**
 * fal-designed-post Pipeline — Canva-like designed feed post (image track).
 *
 * Hybrid engine for the `fal_designed_post` slot:
 *   1. Primary: GPT-image-1 design grounded on the caption-matched gallery photo.
 *   2. Fallback: fal Ideogram V4 typography still (brief-aware via `sceneHint`).
 *
 * Extracted from production-loop.ts for testability + retry isolation (Faz-2.1).
 * Behavior is identical to the previous inline block.
 */

import type { TypographyVibe, TypographyBackgroundStyle } from '@/types/brand-theme';
import {
  buildDesignedPostDesignCardPrompt,
  buildDesignedVideoReelDesignCardPrompt,
  produceFalDesignedPostStill,
  resolveIdeogramBackgroundStyle,
  resolveTypographyVibeFromContext,
} from '@/lib/fal-designer-production';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { resolveFalBrandInput, resolveFalProductionBrandColors } from '@/lib/fal-brand-input';
import {
  bindBrandTemplateForFalProduction,
  pickTemplateReferenceUrls,
  resolveFalTemplateLockOptions,
  assertTemplateStyleReference,
  templateLockUsesGrafikerPass,
  templateStyleReferenceUrls,
} from '@/lib/brand-design-template-production';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { runGrafikerVisionReview } from '@/lib/grafiker-review-service';
import { areFalOverlayTextsRedundant, resolveFalOverlayCopy } from '@/lib/fal-caption-headline';
import { serverConfig } from '@/lib/server-config';
import { generateDesignedPostImage } from '../handlers/image-generators';
import { validateTypographyText } from '@/lib/typography-text-validation';
import type { ProductionPipelineHandler } from './pipeline-types';

export interface FalDesignedPostInput {
  isFalDesignPost: boolean;
  /** Already-produced image in the loop; the slot only runs when still empty. */
  existingImageUrl: string | null;
  workspaceId: string;
  /** Caption-matched gallery photo (base layer for the GPT-image design). */
  referenceUrl: string | null;
  /** Extra brand reference photos appended to the GPT-image edit. */
  brandReferenceImageUrls: string[];
  headline: string;
  caption: string;
  cta: string;
  brandName: string;
  brandColors: { primary: string; accent: string };
  brandVibe: TypographyVibe | null;
  /** brandTheme.typography_design.background_style — fal fallback only. */
  backgroundStyle?: TypographyBackgroundStyle;
  sector: string;
  location?: string;
  logoUrl?: string;
  mood?: string;
  /** Brief-derived subject/scene for the fal fallback background. */
  sceneHint?: string;
  grafikerMaxRetries?: number;
  /** Shared brand-system directives resolved from Brand Theme + Template Library. */
  brandDirectives?: string[];
  /** Visual DNA tone sentence — makes design feel brand-authentic, not sector-generic. */
  visualDnaTone?: string;
  /** fal.ai design intensity for feed posts. */
  designIntensityLevel?: import('@/lib/fal-design-intensity').FalDesignIntensityLevel;
  /** Ad-hoc New Brief — gallery-grounded design only. */
  requireGroundedGallery?: boolean;
  /** Onboarding brand template lock (layout + vibe + colors). */
  brandTemplateBinding?: import('@/lib/brand-design-template-production').BrandTemplateFalBinding | null;
  /** Calendar story cards use 9:16; feed posts default to 4:5. */
  aspectRatio?: '9:16' | '4:5' | '1:1';
  /** Designed subline / tagline (separate from CTA). */
  subtitle?: string;
  /** Template slot font personality for premium typography prompts. */
  fontPersonality?: string;
  headingFont?: string;
  bodyFont?: string;
  captionAwareHeadline?: boolean;
  logoPlacement?: import('@/lib/fal-logo-placement').ResolvedFalLogoPlacement | null;
}

export interface FalDesignedPostResult {
  imageUrl: string | null;
  falGrafikerScore: number | null;
  falGrafikerPass: boolean;
  falDesignEngine: string | null;
  /** Added to the running cost estimate. */
  costDelta: number;
  failureReason?: string;
}

async function reviewDesignedPostOutput(
  imageUrl: string,
  headline: string,
): Promise<{ score: number | null; pass: boolean }> {
  const buf = await fetchExternalImageBuffer(imageUrl, 25_000);
  if (!buf || buf.length < 100) return { score: null, pass: true };
  const review = await runGrafikerVisionReview(buf, headline.slice(0, 60), 'poster');
  if (!review) return { score: null, pass: true };
  const score = review.score ?? null;
  return {
    score,
    pass: templateLockUsesGrafikerPass(score, review.pass),
  };
}

/**
 * Produce a designed feed post. Returns `null` when the slot is not a designed-post
 * slot or already has an image, so the caller leaves its loop variables untouched.
 */
export async function produceFalDesignedPost(
  input: FalDesignedPostInput,
): Promise<FalDesignedPostResult | null> {
  if (!input.isFalDesignPost || input.existingImageUrl) return null;

  const aspectRatio = input.aspectRatio ?? '4:5';

  let imageUrl: string | null = input.existingImageUrl;
  let falGrafikerScore: number | null = null;
  let falGrafikerPass = true;
  let falDesignEngine: string | null = null;
  let costDelta = 0;

  try {
    const binding = input.brandTemplateBinding;
    const lockOpts = resolveFalTemplateLockOptions({
      binding,
      baseGrafikerMaxRetries: input.grafikerMaxRetries,
      adHocBrief: input.requireGroundedGallery,
      defaultCaptionAwareHeadline: input.captionAwareHeadline === true,
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
    const brandDirectives = binding?.brandDirectives ?? input.brandDirectives;
    const logoUrl = binding?.logoUrl ?? input.logoUrl;
    const referenceUrl =
      binding?.referencePhotoUrl ?? input.referenceUrl;
    const groundedGalleryRef = Boolean(
      referenceUrl && isUsableGalleryPhotoUrl(referenceUrl),
    );
    const referenceImageUrls = pickTemplateReferenceUrls({
      missionPhotoUrl: referenceUrl,
      matched: binding?.matched ?? null,
      brandReferenceImageUrls: input.brandReferenceImageUrls,
    });
    assertTemplateStyleReference(binding, referenceImageUrls);

    // Primary engine — GPT-image design grounded on the real gallery photo.
    if (referenceImageUrls.length > 0 && referenceImageUrls.every(isUsableGalleryPhotoUrl)) {
      const canvasChannel = aspectRatio === '9:16' ? 'reel' : 'feed_post';
      const overlayCopy = resolveFalOverlayCopy({
        headline: input.headline,
        cta: input.subtitle || input.cta,
        caption: input.caption,
        channel: canvasChannel,
        lockIdeationCopy: input.captionAwareHeadline !== true,
      });
      const canvasHeadline = overlayCopy.headline;
      const dedupedSubtitle = overlayCopy.subtitle;
      if (!canvasHeadline) {
        console.warn('[auto-produce] [fal-design] no valid overlay headline — skipping GPT designed post');
      } else {
      const designCardPrompt = (aspectRatio === '9:16'
        ? buildDesignedVideoReelDesignCardPrompt
        : buildDesignedPostDesignCardPrompt)({
        vibe: designVibe,
        headline: canvasHeadline,
        subtitle: dedupedSubtitle,
        caption: input.caption,
        sceneHint: input.sceneHint,
        brandColors,
        brandName: input.brandName,
        sector: input.sector,
        aspectRatio,
        brandDirectives,
        visualDnaTone: input.visualDnaTone,
        designIntensityLevel: input.designIntensityLevel,
        fontPersonality: input.fontPersonality,
        headingFont: input.headingFont,
        bodyFont: input.bodyFont,
        occasion: binding?.occasion,
        briefMood: input.mood,
        logoUrl,
        logoPlacement: input.logoPlacement,
      });
      const maxGptAttempts = binding?.matched ? 1 + lockOpts.grafikerMaxRetries : 1;
      for (let attempt = 0; attempt < maxGptAttempts; attempt += 1) {
        const designedUrl = await generateDesignedPostImage({
          workspaceId: input.workspaceId,
          designCardPrompt,
          designCardMode: aspectRatio === '9:16' ? 'reel' : 'post',
          headline: canvasHeadline,
          caption: input.caption,
          referenceImageUrls,
          brandName: input.brandName,
          format: aspectRatio === '9:16' ? 'story' : 'post',
          location: input.location,
          businessType: input.sector,
          logoUrl: logoUrl || undefined,
          logoPlacement: input.logoPlacement,
        });
        if (!designedUrl) break;
        const textOk = await validateTypographyText(designedUrl, canvasHeadline);
        if (!textOk) {
          console.warn(
            `[auto-produce] [fal-design] GPT designed post text validation failed attempt ${attempt + 1}/${maxGptAttempts}`,
          );
          if (binding?.matched) continue;
          break;
        }
        if (binding?.matched) {
          const grafiker = await reviewDesignedPostOutput(designedUrl, input.headline);
          falGrafikerScore = grafiker.score;
          falGrafikerPass = grafiker.pass;
          if (grafiker.pass || attempt >= maxGptAttempts - 1) {
            imageUrl = designedUrl;
            falDesignEngine = 'gpt_image_designed';
            costDelta += 0.04;
            break;
          }
          console.warn(
            `[auto-produce] [fal-design] template lock grafiker ${grafiker.score ?? '—'}/10 — retry ${attempt + 2}/${maxGptAttempts}`,
          );
          continue;
        }
        imageUrl = designedUrl;
        falDesignEngine = 'gpt_image_designed';
        costDelta += 0.04;
        break;
      }
      }
      if (!imageUrl && input.requireGroundedGallery) {
        throw new Error(
          'Brand gallery design failed — could not compose on the matched venue photo (OpenAI API/billing).',
        );
      }
    } else if (input.requireGroundedGallery) {
      throw new Error('Brand gallery photo required for New Brief designed post.');
    } else if (groundedGalleryRef && !imageUrl) {
      throw new Error(
        'Brand gallery design failed — could not compose on the caption-matched venue photo.',
      );
    }

    // Fallback engine — fal Ideogram V4 typography still (no photo needed).
    if (
      !input.requireGroundedGallery
      && !groundedGalleryRef
      && (!imageUrl || (referenceUrl && imageUrl === referenceUrl))
      && serverConfig.fal.configured
    ) {
      const still = await produceFalDesignedPostStill({
        workspaceId: input.workspaceId,
        headline: input.headline,
        subtitle: input.cta || undefined,
        caption: input.caption,
        brandName: input.brandName,
        brandColors,
        vibe: designVibe,
        backgroundStyle: resolveIdeogramBackgroundStyle(
          input.backgroundStyle,
          referenceUrl ?? undefined,
        ),
        aspectRatio,
        referencePhotoUrl: referenceUrl || undefined,
        sceneHint: input.sceneHint || undefined,
        brandDirectives,
        visualDnaTone: input.visualDnaTone,
        logoUrl,
        location: input.location,
        brandReferenceImageUrls: templateStyleReferenceUrls(
          binding ?? {
            matched: null,
            lockedVibe: null,
            referencePhotoUrl: referenceUrl,
            styleReferenceUrl: null,
            brandDirectives: brandDirectives ?? [],
            brandColors: null,
            logoUrl,
            occasion: undefined,
          },
          input.brandReferenceImageUrls,
        ),
        sector: input.sector,
        mood: input.mood,
        grafikerMaxRetries: lockOpts.grafikerMaxRetries,
        captionAwareHeadline: lockOpts.captionAwareHeadline,
        requireGroundedGallery: false,
        designIntensityLevel: input.designIntensityLevel,
      });
      imageUrl = still.imageUrl;
      falGrafikerScore = still.grafikerScore;
      falGrafikerPass = still.grafikerPass;
      falDesignEngine = 'fal_ideogram';
      costDelta += 0.05;
    }

    console.log(
      `[auto-produce] [fal-design] post engine=${falDesignEngine ?? 'none'} ` +
      `vibe=${designVibe} template=${binding?.matched?.templateType ?? 'none'} ` +
      `grafiker=${falGrafikerScore ?? '—'} "${input.headline.slice(0, 40)}"`,
    );
  } catch (designErr) {
    const msg = designErr instanceof Error ? designErr.message : String(designErr);
    console.warn('[auto-produce] [fal-design] designed post failed:', msg);
    return {
      imageUrl: null,
      falGrafikerScore: null,
      falGrafikerPass: false,
      falDesignEngine: null,
      costDelta: 0,
      failureReason: `fal_design: ${msg}`.slice(0, 480),
    };
  }

  return { imageUrl, falGrafikerScore, falGrafikerPass, falDesignEngine, costDelta };
}

/**
 * Pipeline handler wrapper for the slot-loop dispatch (b2b). Resolves the fal
 * brand input, produces the designed post, and merges the result into the shared
 * slot state. Behavior is identical to the previous inline production-loop block.
 */
export const falDesignHandler: ProductionPipelineHandler = {
  name: 'fal_design',
  canRun: (ctx) => ctx.inputs.isFalDesignPost && !ctx.state.imageUrl,
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
      format: inputs.falAspectRatio === '9:16' ? 'story' : 'post',
      visualDna: inputs.visualDna,
      brandTone: inputs.brandTone,
      brandDescription: inputs.brandDescription,
      designBriefDirectives: inputs.designBriefDirectives,
      postMood: inputs.mood,
      preferExplicitSceneHint: Boolean(inputs.requireGroundedGallery || inputs.adHocBrief),
    });

    const templateBinding = await bindBrandTemplateForFalProduction({
      workspaceId: inputs.workspaceId,
      slotRole: inputs.slotRole,
      librarySlotKey: inputs.librarySlotKey,
      format: inputs.falAspectRatio === '9:16' ? 'story' : 'post',
      caption: inputs.caption,
      headline: inputs.headline,
      announcementType: inputs.announcementType,
      templateUseCase: inputs.templateUseCase,
      catalogSlotKey: inputs.catalogSlotKey,
      brandActiveSlots: inputs.brandActiveSlots,
      adHocBrief: Boolean(inputs.adHocBrief),
      missionReferenceUrl: inputs.referenceUrl,
      baseDirectives: falBrand.promptDirectives,
      brandColors: falBrand.brandColors,
      logoUrl: inputs.brandLogoUrl || undefined,
      brandVibe: falBrand.vibe,
    });
    if (templateBinding.matched) {
      console.log(
        `[auto-produce] [fal-design] brand template "${templateBinding.matched.templateName}" (${templateBinding.matched.templateType})`,
      );
    }

    const designed = await produceFalDesignedPost({
      isFalDesignPost: inputs.isFalDesignPost,
      existingImageUrl: state.imageUrl,
      workspaceId: inputs.workspaceId,
      referenceUrl: templateBinding.referencePhotoUrl ?? inputs.referenceUrl,
      brandReferenceImageUrls: inputs.brandReferenceImageUrls,
      headline: inputs.headline,
      caption: inputs.caption,
      cta: inputs.cta,
      brandName: inputs.resolvedBrandName,
      brandColors: resolveFalProductionBrandColors(
        falBrand.brandColors,
        templateBinding.brandColors,
      ),
      brandVibe: falBrand.vibe,
      backgroundStyle: inputs.falBackgroundStyleOverride ?? falBrand.backgroundStyle,
      sector: inputs.brandBusinessType,
      location: inputs.brandLocation,
      logoUrl: templateBinding.logoUrl ?? inputs.brandLogoUrl ?? undefined,
      mood: inputs.mood,
      sceneHint: falBrand.sceneHint,
      grafikerMaxRetries: inputs.grafikerMaxRetries,
      brandDirectives: [
        ...templateBinding.brandDirectives,
        ...(inputs.designBriefDirectives ?? []),
      ],
      visualDnaTone: falBrand.visualDnaTone,
      requireGroundedGallery: Boolean(inputs.requireGroundedGallery || inputs.adHocBrief),
      designIntensityLevel: inputs.falDesignIntensityOverride ?? falBrand.designIntensityLevel,
      brandTemplateBinding: templateBinding,
      aspectRatio: inputs.falAspectRatio,
      captionAwareHeadline: inputs.captionAwareHeadline,
      subtitle: inputs.falSubtitle,
      fontPersonality: inputs.falFontPersonality,
      headingFont: inputs.falHeadingFont,
      bodyFont: inputs.falBodyFont,
      logoPlacement: inputs.falLogoPlacement,
    });
    if (designed) {
      if (designed.imageUrl != null) state.imageUrl = designed.imageUrl;
      state.falGrafikerScore = designed.falGrafikerScore;
      state.falGrafikerPass = designed.falGrafikerPass;
      state.falDesignEngine = designed.falDesignEngine;
      state.costDelta += designed.costDelta;
      if (designed.failureReason && !designed.imageUrl) {
        state.pipelineFailureReason = designed.failureReason;
      }
      if (templateBinding.matched) {
        state.brandDesignTemplateId = templateBinding.matched.id;
        state.brandDesignTemplateType = templateBinding.matched.templateType;
        state.brandDesignTemplateName = templateBinding.matched.templateName;
      }
    }
  },
};

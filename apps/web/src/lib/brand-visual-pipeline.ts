/**
 * Brand Hub AI Görsel Geliştirme → sıralı üretim hattı.
 * Hedef sıra: Scene Brief → gpt-image-2 (galeri) → Remotion / Runway.
 */
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import type { AiVisualProductionStandard } from '@/lib/ai-visual-production-standard';
import {
  contentKindToAiFormat,
  shouldAiEnhanceForOutput,
} from '@/lib/ai-visual-production-standard';
import type { ProductSceneBrief } from '@/lib/production-stack';
import { buildRunwayDirectorExtra } from '@/lib/production-stack';
import {
  buildAiEnhanceContextCaption,
  enhanceGalleryPhotosForIdea,
  type AiEnhanceLevel,
} from '@/lib/ai-gallery-enhance';
import type { BrandContextForVisual } from '@/lib/ai-visual-production-standard';
import { resolveVisualSubject } from '@/lib/ai-visual-production-standard';

/** Mission Hub brief + tenant learning — "Brief sahneyi yönetir" için. */
export function resolveMissionVisualBrief(
  creativeBrief?: string | null,
  tenantLearningBrief?: string | null,
): string {
  const parts = [creativeBrief?.trim(), tenantLearningBrief?.trim()].filter(
    (s): s is string => Boolean(s),
  );
  return parts.join('\n\n').slice(0, 2000);
}

export function buildAiVisualStandardMetadata(
  standard: AiVisualProductionStandard,
  level: AiEnhanceLevel,
): Record<string, unknown> {
  return {
    enabled: standard.enabled,
    level,
    visual_subject: standard.visualSubject,
    use_brand_identity: standard.useBrandIdentity,
    brief_drives_scene: standard.briefDrivesScene,
    embed_logo: standard.embedLogo,
    formats: [...standard.formats],
  };
}

export type VisualPipelineStep =
  | 'scene_brief'
  | 'gpt_image_enhance'
  | 'remotion_motion'
  | 'remotion_still'
  | 'runway_reel'
  | 'gallery_only';

export function resolveVisualPipelineSteps(
  standard: AiVisualProductionStandard,
  contentKind: string,
  assignment: ProductionAssignment,
  flags: {
    willRemotionStory?: boolean;
    willRemotionPost?: boolean;
    isReel?: boolean;
    designedPosterSync?: boolean;
    postBrandLayer?: boolean;
  },
): VisualPipelineStep[] {
  const steps: VisualPipelineStep[] = ['scene_brief'];

  if (shouldAiEnhanceForOutput(standard, contentKind, assignment)) {
    steps.push('gpt_image_enhance');
  }

  if (flags.isReel) {
    steps.push('runway_reel');
  } else if (flags.willRemotionStory) {
    steps.push('remotion_motion');
  } else if (flags.designedPosterSync || flags.willRemotionPost || flags.postBrandLayer) {
    steps.push('remotion_still');
  } else if (standard.enabled && contentKindToAiFormat(contentKind)) {
    steps.push('remotion_still');
  } else {
    steps.push('gallery_only');
  }

  return steps;
}

export interface GptImageEnhanceForIdeaInput {
  baseUrl: string;
  workspaceId: string;
  photoUrls: string[];
  brandName: string;
  businessType: string;
  level: AiEnhanceLevel;
  assignment: ProductionAssignment;
  contentKind: string;
  visualStandard: AiVisualProductionStandard;
  brandCtx: BrandContextForVisual;
  brandTheme?: Record<string, unknown> | null;
  sceneBrief?: ProductSceneBrief | null;
  caption: string;
  headline: string;
  strategicPurpose?: string;
  mood?: string;
  cta?: string;
  missionBrief?: string;
  productType?: string;
  logoUrl?: string;
  referenceImageUrls?: string[];
  maxPhotos?: number;
}

/** gpt-image-2 gallery enhance — Marka Detayı + Scene Brief ile. */
export async function runGptImageEnhanceForIdea(
  input: GptImageEnhanceForIdeaInput,
): Promise<{ photoUrls: string[]; applied: boolean }> {
  const originals = input.photoUrls.filter((u) => u?.trim());
  if (!originals.length) return { photoUrls: [], applied: false };
  if (!shouldAiEnhanceForOutput(input.visualStandard, input.contentKind, input.assignment)) {
    return { photoUrls: originals, applied: false };
  }

  const contextCaption = buildAiEnhanceContextCaption({
    caption: input.caption,
    headline: input.headline,
    strategicPurpose: input.strategicPurpose,
    mood: input.mood,
    missionBrief: input.missionBrief,
    cta: input.cta,
  });

  const directorSceneExtra = buildRunwayDirectorExtra(input.sceneBrief ?? null);

  const enhancedUrls = await enhanceGalleryPhotosForIdea({
    baseUrl: input.baseUrl,
    workspaceId: input.workspaceId,
    photoUrls: originals,
    brandName: input.brandName,
    businessType: input.businessType,
    level: input.level,
    contextCaption,
    headline: input.headline,
    missionBrief: input.missionBrief,
    logoUrl: input.logoUrl,
    referenceImageUrls: input.referenceImageUrls,
    productType: input.productType,
    maxPhotos: input.maxPhotos,
    visualStandard: input.visualStandard,
    brandCtx: input.brandCtx,
    brandTheme: input.brandTheme,
    caption: input.caption,
    strategicPurpose: input.strategicPurpose,
    mood: input.mood,
    cta: input.cta,
    directorSceneExtra: directorSceneExtra || undefined,
  });

  if (enhancedUrls.length) {
    return { photoUrls: enhancedUrls, applied: true };
  }
  return { photoUrls: originals, applied: false };
}

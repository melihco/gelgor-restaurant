/**
 * Runway reel director context — ties idea brief, caption, gallery match,
 * sector/product, and AI visual production settings into one generate-reel body.
 */

import type { ProductionIdea } from '@/types/production-idea';
import type { AiVisualProductionStandard, BrandContextForVisual } from '@/lib/ai-visual-production-standard';
import {
  buildBrandIdentityPromptBlock,
  buildPostScenePromptBlock,
  resolveVisualSubject,
} from '@/lib/ai-visual-production-standard';
import { buildRunwayDirectorExtra, type ProductSceneBrief } from '@/lib/production-stack';
import {
  buildReelPayload,
  type ReelPayload,
  type RendererBrandContext,
  type RendererGalleryMeta,
} from '@/lib/renderer-payload';
import {
  reelPacingDirectorHint,
  resolveEffectiveReelPace,
  resolveRunwayCameraMotionForFidelity,
} from '@/lib/runway-reel-fidelity';
import { normalizeSectorId } from '@/lib/sector-production-profile';
import { firstStr } from '@/lib/production-idea-parse';
import type { BrandReelProductionParams } from '@/lib/brand-reel-motion-profile';

export interface ReelDirectorExtras {
  cameraMotion?: string;
  sector?: string;
  businessType?: string;
  vibeProfile?: Record<string, unknown>;
  brandThemeGrading?: { look?: string; lut_directive?: string };
  aiVisualStandard?: AiVisualProductionStandard | null;
  brandContextForVisual?: BrandContextForVisual;
  sceneBrief?: ProductSceneBrief | null;
  reelMotionSpec?: Record<string, unknown>;
  /** Agent runway_prompt from video_production / feed art director */
  runwayPromptFromAgent?: string;
  strategicPurpose?: string;
  productType?: string;
  workspaceId?: string;
  /** Mission hero reel slot — enables Runway gen4.5 */
  isHeroReel?: boolean;
  /** Tenant reel defaults from brand_theme.motion_profile */
  brandReel?: BrandReelProductionParams;
}

/** English-safe slice for Runway director (identity + scene blocks stay server-side in GPT user msg). */
export function buildReelAgentVisualDirection(
  idea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  extras: ReelDirectorExtras,
): string {
  const parts: string[] = [];
  const vps = idea.visualProductionSpec;

  if (vps.imageEditPrompt?.trim()) {
    parts.push(vps.imageEditPrompt.trim().slice(0, 320));
  }
  if (extras.runwayPromptFromAgent?.trim()) {
    parts.push(extras.runwayPromptFromAgent.trim().slice(0, 320));
  }
  if (extras.sceneBrief) {
    const briefExtra = buildRunwayDirectorExtra(extras.sceneBrief);
    if (briefExtra) parts.push(briefExtra.slice(0, 320));
  }

  const rms = extras.reelMotionSpec;
  if (rms) {
    const pace = String(rms.pace ?? rms.audio_mood ?? '').trim();
    const trans = String(rms.transition_style ?? '').trim();
    if (pace) parts.push(`Motion pace: ${pace}`);
    if (trans) parts.push(`Transition: ${trans}`);
  }

  if (gallery.sceneMoment?.trim()) {
    parts.push(`Frame moment: ${gallery.sceneMoment.trim().slice(0, 280)}`);
  } else if (gallery.description?.trim()) {
    parts.push(`Gallery scene: ${gallery.description.trim().slice(0, 400)}`);
  }
  if (gallery.microMotions?.length) {
    parts.push(`Micro motion: ${gallery.microMotions.slice(0, 3).join(', ')}`);
  }
  if (gallery.photoMood?.trim()) {
    parts.push(`Photo mood: ${gallery.photoMood.trim()}`);
  }
  if (gallery.tags?.length) {
    parts.push(`Photo tags: ${gallery.tags.slice(0, 12).join(', ')}`);
  }
  if (gallery.usageContext?.trim()) {
    parts.push(`Usage: ${gallery.usageContext.trim().slice(0, 100)}`);
  }
  if (typeof gallery.matchScore === 'number' && gallery.matchScore >= 50) {
    parts.push(`Gallery match confidence: ${gallery.matchScore}%`);
  }

  const std = extras.aiVisualStandard;
  const bctx = extras.brandContextForVisual;
  if (std?.enabled && bctx) {
    if (std.useBrandIdentity) {
      const identity = buildBrandIdentityPromptBlock(
        bctx,
        brand.vibeProfile as Record<string, unknown> | null | undefined,
      );
      if (identity) parts.push(identity.slice(0, 450));
    }
    if (std.briefDrivesScene) {
      const scene = buildPostScenePromptBlock({
        caption: idea.caption,
        headline: idea.headline,
        strategicPurpose: extras.strategicPurpose,
        mood: extras.reelMotionSpec?.pace as string | undefined,
        missionBrief: brand.missionBrief,
        cta: idea.cta,
      });
      if (scene) parts.push(scene.slice(0, 450));
    }
    const subject = resolveVisualSubject(
      std.visualSubject,
      extras.businessType ?? extras.sector ?? bctx.business_type ?? '',
    );
    parts.push(`Visual subject focus: ${subject === 'product_hero' ? 'product hero, packshot, texture' : 'venue ambiance, atmosphere'}`);
  }

  if (extras.strategicPurpose?.trim()) {
    parts.push(`Strategic purpose: ${extras.strategicPurpose.trim().slice(0, 160)}`);
  }
  if (extras.productType?.trim()) {
    parts.push(`Product focus: ${extras.productType.trim().slice(0, 120)}`);
  }
  if (extras.sector?.trim()) {
    parts.push(`Sector: ${extras.sector.trim().slice(0, 80)}`);
    parts.push(reelPacingDirectorHint({
      sector: extras.sector,
      reelPace: String(extras.reelMotionSpec?.pace ?? '').trim() || undefined,
      brandReelPace: extras.brandReel?.reelPace,
    }));
  }

  return parts.join(' | ').slice(0, 900);
}

/** Rich concept string for Runway when AI director falls back to template path. */
export function buildReelConceptFromIdea(
  idea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  extras: ReelDirectorExtras,
): string {
  const vibeClause = brand.themeGrading
    ? `Visual style: ${brand.themeGrading.look ?? ''}. ${brand.themeGrading.lutDirective ?? ''}. ${brand.themeGrading.paletteDescription ?? ''}.`.trim()
    : '';

  const blocks = [
    idea.headline ? `Headline: ${idea.headline}` : '',
    idea.caption ? `Caption: ${idea.caption.slice(0, 400)}` : '',
    extras.strategicPurpose ? `Purpose: ${extras.strategicPurpose.slice(0, 200)}` : '',
    gallery.description ? `Matched photo: ${gallery.description.slice(0, 200)}` : '',
    gallery.tags?.length ? `Photo context: ${gallery.tags.slice(0, 8).join(', ')}` : '',
    idea.visualProductionSpec.imageEditPrompt
      ? `Visual direction: ${idea.visualProductionSpec.imageEditPrompt.slice(0, 220)}`
      : '',
    extras.runwayPromptFromAgent
      ? `Runway brief: ${extras.runwayPromptFromAgent.slice(0, 220)}`
      : '',
    vibeClause,
    brand.missionBrief ? `Mission: ${brand.missionBrief.slice(0, 300)}` : '',
    extras.sector ? `Sector: ${extras.sector}` : '',
    extras.productType ? `Product: ${extras.productType}` : '',
  ].filter(Boolean);

  return blocks.join('. ').trim() || idea.caption || idea.headline;
}

/** Map ProductionIdea + gallery → POST /api/generate-reel body. */
export function buildReelGenerateReelRequest(
  idea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  promptImageUrl: string,
  extras: ReelDirectorExtras = {},
): Record<string, unknown> {
  const vibeMotion = (extras.vibeProfile?.motion as Record<string, string> | undefined) ?? {};
  const sectorId = normalizeSectorId(extras.sector ?? extras.businessType);
  const reelPace = String(extras.reelMotionSpec?.pace ?? extras.reelMotionSpec?.audio_mood ?? '').trim();
  const cameraMotion = resolveRunwayCameraMotionForFidelity({
    agentCamera:
      extras.cameraMotion
      ?? String(extras.reelMotionSpec?.camera_movement ?? ''),
    brandCameraMotion: extras.brandReel?.cameraMotion,
    vibeCamera: vibeMotion.camera_movement,
    mood: extras.reelMotionSpec?.pace as string | undefined,
    reelPace: reelPace || undefined,
    brandReelPace: extras.brandReel?.reelPace,
    vibePace: vibeMotion.pace,
    sector: sectorId,
  });

  const agentVisualDirection = buildReelAgentVisualDirection(idea, brand, gallery, extras);
  const enrichedBrand: RendererBrandContext = {
    ...brand,
    businessType: extras.businessType ?? brand.businessType,
    vibeProfile: extras.vibeProfile ?? brand.vibeProfile,
    themeGrading: extras.brandThemeGrading
      ? {
          look: extras.brandThemeGrading.look,
          lutDirective: extras.brandThemeGrading.lut_directive,
          paletteDescription: brand.themeGrading?.paletteDescription,
        }
      : brand.themeGrading,
  };

  const reel: ReelPayload = buildReelPayload(idea, enrichedBrand, gallery, {
    cameraMotion,
    reelPace: reelPace || undefined,
    sector: sectorId,
  });
  reel.concept = buildReelConceptFromIdea(idea, enrichedBrand, gallery, extras);

  const body: Record<string, unknown> = {
    title: reel.title,
    caption: reel.caption,
    concept: reel.concept,
    platform: reel.platform,
    contentType: reel.contentType,
    visualStyle: reel.visualStyle,
    cameraMotion,
    brandTone: reel.brandTone,
    targetAudience: enrichedBrand.targetAudience ?? '',
    duration: reel.duration,
    ratio: reel.ratio,
    tags: reel.tags,
    promptImage: promptImageUrl,
    photoDescription: gallery.description,
    photoTags: gallery.tags,
    photoSceneMoment: gallery.sceneMoment,
    photoMicroMotions: gallery.microMotions,
    photoMood: gallery.photoMood,
    photoUsageContext: gallery.usageContext,
    photoPairingKeywords: gallery.pairingKeywords,
    agentVisualDirection: agentVisualDirection || undefined,
    vibeProfile: extras.vibeProfile
      ? {
          grading: (extras.vibeProfile.grading as Record<string, unknown>) ?? {},
          palette: (extras.vibeProfile.palette as Record<string, unknown>) ?? {},
          motion: (extras.vibeProfile.motion as Record<string, unknown>) ?? {},
          composition: (extras.vibeProfile.composition as Record<string, unknown>) ?? {},
        }
      : undefined,
    brandThemeGrading: extras.brandThemeGrading,
    sceneMetadata: {
      ...reel.sceneMetadata,
      businessType: extras.businessType ?? extras.sector,
      sector: sectorId,
      sector_id: sectorId,
      reel_pace: resolveEffectiveReelPace({
        reelPace,
        brandReelPace: extras.brandReel?.reelPace,
        vibePace: vibeMotion.pace,
        sector: sectorId,
      }),
      camera_motion: cameraMotion,
      productType: extras.productType,
      strategicPurpose: extras.strategicPurpose,
      missionBrief: brand.missionBrief,
      workspaceId: extras.workspaceId,
      agentVisualDirection: agentVisualDirection || reel.sceneMetadata.agentVisualDirection,
    },
    qualityTier: extras.isHeroReel ? 'hero' : 'standard',
  };

  return body;
}

/** Extract director extras from a raw CrewAI idea record + brand context. */
export function reelDirectorExtrasFromIdeaRecord(
  rec: Record<string, unknown>,
  opts: {
    sector?: string;
    businessType?: string;
    strategicPurpose?: string;
    sceneBrief?: ProductSceneBrief | null;
    aiVisualStandard?: AiVisualProductionStandard | null;
    brandContextForVisual?: BrandContextForVisual;
    vibeProfile?: Record<string, unknown>;
    brandThemeGrading?: { look?: string; lut_directive?: string };
    workspaceId?: string;
    cameraMotion?: string;
    isHeroReel?: boolean;
    brandReel?: BrandReelProductionParams;
  } = {},
): ReelDirectorExtras {
  const reelSpec = (rec.reel_motion_spec ?? rec.reelMotionSpec) as Record<string, unknown> | undefined;
  const vps = (rec.visual_production_spec ?? rec.visualProductionSpec) as Record<string, unknown> | undefined;
  const motionFromSpec = String(
    reelSpec?.camera_movement
    ?? (vps?.reel_motion_spec as Record<string, unknown> | undefined)?.camera_movement
    ?? '',
  ).trim();
  return {
    cameraMotion: opts.cameraMotion?.trim() || motionFromSpec || undefined,
    sector: opts.sector,
    businessType: opts.businessType,
    vibeProfile: opts.vibeProfile,
    brandThemeGrading: opts.brandThemeGrading,
    aiVisualStandard: opts.aiVisualStandard,
    brandContextForVisual: opts.brandContextForVisual,
    sceneBrief: opts.sceneBrief,
    reelMotionSpec: reelSpec,
    runwayPromptFromAgent: firstStr(rec, 'runway_prompt', 'runwayPrompt'),
    strategicPurpose:
      opts.strategicPurpose
      ?? firstStr(rec, 'strategic_purpose', 'strategicPurpose', 'purpose'),
    productType: firstStr(rec, 'product_type', 'productType', 'subject'),
    workspaceId: opts.workspaceId,
    isHeroReel: opts.isHeroReel,
    brandReel: opts.brandReel,
  };
}

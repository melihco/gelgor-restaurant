/**
 * Brand Hub "AI Fotoğraf İyileştirme" → auto-produce gallery revision.
 * Scene Director uses caption + headline + mission brief before GPT image-2 edit.
 */
import type { ProductionAssignment } from '@/lib/mission-production-manifest';
import { isPersistableEnhanceUrl, MAX_GALLERY_ENHANCE_PHOTOS } from '@/lib/gallery-photo-enhance-api';
import { persistEnhancedImageUrls } from '@/lib/persist-enhanced-images';
import type { AiVisualProductionStandard, BrandContextForVisual } from '@/lib/ai-visual-production-standard';
import {
  buildAdaptiveScenePromptBlock,
  buildBrandIdentityPromptBlock,
  buildPostScenePromptBlock,
  mergeEnhanceDirectorCaption,
  resolveAdaptiveSceneMode,
  resolveVisualSubject,
} from '@/lib/ai-visual-production-standard';
import { normalizeBrandThemeRecord } from '@/lib/brand-theme-normalize';
import {
  isOpenAiQuotaBlocked,
  isOpenAiQuotaOrBillingError,
  markOpenAiQuotaBlocked,
} from '@/lib/openai-error-utils';
import type { ProductSceneBrief } from '@/lib/production-stack';
import { sceneBriefForEnhanceApi } from '@/lib/production-stack';
import {
  buildVenueFingerprintPromptBlock,
  type VenueGalleryFingerprint,
} from '@/lib/venue-gallery-fingerprint';

export {
  resolveAiVisualProductionStandard,
  shouldAiEnhanceForOutput,
  buildBrandIdentityPromptBlock,
  buildPostScenePromptBlock,
} from '@/lib/ai-visual-production-standard';

export type AiEnhanceLevel = 'subtle' | 'moderate' | 'full';

const ENHANCE_PIPELINES = new Set([
  'gallery_photo',
  'story_still',
  'carousel_gallery',
  'runway_reel',
  'fal_reel',
  'remotion_story',
]);

export function isAiEnhanceEnabled(brandTheme: Record<string, unknown> | null | undefined): boolean {
  brandTheme = normalizeBrandThemeRecord(brandTheme);
  return Boolean(brandTheme?.ai_photo_enhance);
}

export function resolveAiEnhanceLevel(
  brandTheme: Record<string, unknown> | null | undefined,
): AiEnhanceLevel {
  brandTheme = normalizeBrandThemeRecord(brandTheme);
  const raw = String(brandTheme?.ai_photo_enhance_level ?? 'moderate');
  if (raw === 'subtle' || raw === 'full') return raw;
  return 'moderate';
}

/** Pipelines that use a matched gallery photo as the visual base. */
export function shouldAiEnhanceGalleryPipeline(assignment: ProductionAssignment): boolean {
  return ENHANCE_PIPELINES.has(assignment.pipeline);
}

/** Carousel / story / reel — pick and enhance multiple gallery photos. */
export function shouldUseMultiGalleryPhotos(
  assignment: ProductionAssignment,
  contentKind: string,
): boolean {
  if (assignment.pipeline === 'carousel_gallery') {
    return true;
  }
  if (assignment.pipeline === 'runway_reel') return true;
  if (contentKind === 'instagram_carousel') return true;
  return false;
}

export function multiGalleryPhotoCount(
  assignment: ProductionAssignment,
  contentKind: string,
): number {
  if (assignment.pipeline === 'carousel_gallery' || contentKind === 'instagram_carousel') {
    return 4;
  }
  if (assignment.pipeline === 'fal_story' || assignment.pipeline === 'remotion_story') {
    return 1;
  }
  if (assignment.slot_role === 'campaign_story_motion') {
    return 1;
  }
  return 3;
}

export function buildAiEnhanceContextCaption(input: {
  caption: string;
  headline: string;
  strategicPurpose?: string;
  mood?: string;
  missionBrief?: string;
  cta?: string;
}): string {
  const parts = [
    input.headline ? `Headline: ${input.headline.slice(0, 120)}` : '',
    input.caption ? `Caption: ${input.caption.slice(0, 400)}` : '',
    input.strategicPurpose ? `Purpose: ${input.strategicPurpose.slice(0, 200)}` : '',
    input.mood ? `Mood: ${input.mood.slice(0, 80)}` : '',
    input.cta ? `CTA: ${input.cta.slice(0, 80)}` : '',
    input.missionBrief ? `Mission brief: ${input.missionBrief.slice(0, 600)}` : '',
  ].filter(Boolean);
  return parts.join('\n') || input.caption || input.headline || 'Brand social content';
}

export async function enhanceGalleryPhotosForIdea(opts: {
  baseUrl: string;
  workspaceId: string;
  photoUrls: string[];
  brandName: string;
  businessType: string;
  level: AiEnhanceLevel;
  contextCaption: string;
  productType?: string;
  logoUrl?: string;
  referenceImageUrls?: string[];
  headline?: string;
  missionBrief?: string;
  maxPhotos?: number;
  visualStandard?: AiVisualProductionStandard;
  brandCtx?: BrandContextForVisual;
  brandTheme?: Record<string, unknown> | null;
  caption?: string;
  strategicPurpose?: string;
  mood?: string;
  cta?: string;
  /** Crew Scene Director / production-stack brief — appended to post scene block. */
  directorSceneExtra?: string;
  /** Mission-level brief — passed to enhance API to skip duplicate Crew scene-brief */
  sceneBrief?: ProductSceneBrief | null;
  missionId?: string;
  venueFingerprint?: VenueGalleryFingerprint | null;
}): Promise<string[]> {
  const urls = opts.photoUrls
    .filter((u) => typeof u === 'string' && u.trim().length > 0)
    .slice(0, opts.maxPhotos ?? MAX_GALLERY_ENHANCE_PHOTOS);
  if (!urls.length) return [];
  if (isOpenAiQuotaBlocked()) {
    console.warn('[ai-gallery-enhance] skipped — OpenAI quota cooldown active');
    return [];
  }

  const standard = opts.visualStandard;
  const identityBlock = standard?.useBrandIdentity && opts.brandCtx
    ? buildBrandIdentityPromptBlock(opts.brandCtx, opts.brandTheme)
    : '';
  const postScene = standard?.briefDrivesScene
    ? buildPostScenePromptBlock({
        caption: opts.caption ?? opts.contextCaption,
        headline: opts.headline ?? '',
        strategicPurpose: opts.strategicPurpose,
        mood: opts.mood,
        missionBrief: opts.missionBrief,
        cta: opts.cta,
      })
    : '';
  const venueFingerprintBlock = buildVenueFingerprintPromptBlock(opts.venueFingerprint);
  const adaptiveBlock = standard?.adaptiveScene
    ? buildAdaptiveScenePromptBlock({
        mode: resolveAdaptiveSceneMode(
          standard.adaptiveSceneMode,
          opts.businessType,
          opts.caption ?? opts.contextCaption,
        ),
        caption: opts.caption ?? opts.contextCaption,
        headline: opts.headline ?? '',
        businessType: opts.businessType,
        venueFingerprintBlock,
      })
    : '';
  const sceneBlock = [postScene, adaptiveBlock, venueFingerprintBlock, opts.directorSceneExtra?.trim()]
    .filter(Boolean)
    .join('\n\n');
  const directorCaption = standard
    ? mergeEnhanceDirectorCaption(standard, identityBlock, sceneBlock, opts.contextCaption)
    : opts.contextCaption;
  const visualSubject = standard
    ? resolveVisualSubject(standard.visualSubject, opts.businessType)
    : resolveVisualSubject('auto', opts.businessType);
  const embedLogo = standard ? standard.embedLogo && Boolean(opts.logoUrl) : Boolean(opts.logoUrl);

  const payload = {
    photoUrls: urls,
    photoUrl: urls[0],
    caption: directorCaption,
    headline: opts.headline ?? '',
    missionBrief: opts.missionBrief ?? '',
    brandName: opts.brandName,
    productType: opts.productType ?? '',
    level: opts.level,
    businessType: opts.businessType,
    workspaceId: opts.workspaceId,
    embedLogo,
    logoUrl: opts.logoUrl,
    referenceImageUrls: opts.referenceImageUrls ?? [],
    brandIdentityBlock: identityBlock || undefined,
    postSceneBlock: sceneBlock || undefined,
    venueFingerprintBlock: venueFingerprintBlock || undefined,
    visualSubject,
    useBrandIdentity: standard?.useBrandIdentity ?? true,
    briefDrivesScene: standard?.briefDrivesScene ?? true,
    adaptiveScene: standard?.adaptiveScene ?? false,
    adaptiveSceneMode: standard?.adaptiveScene
      ? resolveAdaptiveSceneMode(
          standard.adaptiveSceneMode,
          opts.businessType,
          opts.caption ?? opts.contextCaption,
        )
      : undefined,
    prebuiltSceneBrief: sceneBriefForEnhanceApi(opts.sceneBrief),
    missionId: opts.missionId,
  };

  const timeoutMs = urls.length > 1 ? 240_000 : 120_000;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${opts.baseUrl}/api/enhance-product-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const data = await res.json().catch(() => ({})) as {
        imageUrls?: string[];
        imageUrl?: string;
        code?: string;
        error?: string;
      };

      if (!res.ok) {
        const code = String(data.code ?? '');
        const errText = data.error ?? '';
        console.warn(
          `[ai-gallery-enhance] enhance HTTP ${res.status} attempt ${attempt + 1}:`,
          errText.slice(0, 200),
        );
        if (
          code === 'openai_quota_exceeded'
          || code === 'billing_hard_limit'
          || /billing_hard_limit|quota/i.test(errText)
        ) {
          markOpenAiQuotaBlocked();
          break;
        }
        if (res.status >= 500 && attempt === 0) continue;
        break;
      }

      const list = Array.isArray(data.imageUrls) ? data.imageUrls : [];
      const merged = list.length ? list : (data.imageUrl ? [data.imageUrl] : []);
      let persistable = merged.filter((u) => isPersistableEnhanceUrl(u));
      if (!persistable.length && merged.some((u) => u.startsWith('data:image/'))) {
        persistable = await persistEnhancedImageUrls(merged, opts.workspaceId);
      }
      if (persistable.length) return persistable;
    } catch (err) {
      console.warn(
        `[ai-gallery-enhance] enhance failed attempt ${attempt + 1}:`,
        err instanceof Error ? err.message : err,
      );
      if (isOpenAiQuotaOrBillingError(err)) {
        markOpenAiQuotaBlocked();
        break;
      }
      if (attempt === 0) continue;
    }
  }
  return [];
}

/** @deprecated Use enhanceGalleryPhotosForIdea — single photo wrapper */
export async function enhanceGalleryPhotoForIdea(opts: {
  baseUrl: string;
  workspaceId: string;
  photoUrl: string;
  brandName: string;
  businessType: string;
  level: AiEnhanceLevel;
  contextCaption: string;
  productType?: string;
  logoUrl?: string;
  referenceImageUrls?: string[];
  headline?: string;
  missionBrief?: string;
}): Promise<string | null> {
  const urls = await enhanceGalleryPhotosForIdea({
    ...opts,
    photoUrls: [opts.photoUrl],
    maxPhotos: 1,
  });
  return urls[0] ?? null;
}

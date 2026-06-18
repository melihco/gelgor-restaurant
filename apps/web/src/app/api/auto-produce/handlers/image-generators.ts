import { shouldPreserveVenuePhotos, shouldUpscaleSmallGalleryPhoto } from '@/lib/venue-photo-policy';
import {
  pickScoredCarouselSlides,
  type GalleryPhotoMeta,
  type MatchPhotoInput,
} from '@/lib/gallery-photo-matcher';
import { MIN_ACCEPT_SCORE } from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import {
  buildEventCardPayload,
  gatePromptIntegrity,
  PIS_PRODUCTION_MIN_SCORE,
  type RendererBrandContext,
  type RendererGalleryMeta,
} from '@/lib/renderer-payload';
import { renderRemotionBrandStill, renderRemotionBrandStillResult } from '@/lib/remotion-brand-kit';
import {
  buildMultiReelPhotoInputs,
  callGenerateMultiReel,
  maxPhotosForStrategy,
  resolveRunwayReelStrategy,
  type MultiReelPhotoInput,
  type RunwayReelStrategy,
} from '@/lib/reel-multi-production';
import { normalizeCameraMotion, type UnifiedCameraMotion } from '@/lib/camera-motion';
import {
  resolveEffectiveReelPace,
  resolveRunwayCameraMotionForFidelity,
} from '@/lib/runway-reel-fidelity';
import { getSectorReelPacing, normalizeSectorId } from '@/lib/sector-production-profile';
import type { BrandMotionProfile } from '@/lib/brand-motion-profile';
import { resolveBrandReelProductionParams } from '@/lib/brand-reel-motion-profile';
import {
  buildReelGenerateReelRequest,
  reelDirectorExtrasFromIdeaRecord,
} from '@/lib/reel-director-context';
import { productionIdeaToRecord } from '@/lib/production-idea-parse';
import type { ProductionIdea } from '@/types/production-idea';
import type { AiVisualProductionStandard, BrandContextForVisual } from '@/lib/ai-visual-production-standard';
import type { ProductSceneBrief } from '@/lib/production-stack';
import { galleryMetaToRendererGallery } from '@/lib/runway-scene-from-gallery';
import type { MissionVisualDesignCard } from '@/lib/mission-visual-design-cards';
import { scoreReelHook } from '@/lib/reel-hook-score';

export async function generateVibeImage(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  contentType: string;
  brandName: string;
  location?: string;
  businessType?: string;
  referenceImageUrl?: string;
  agentImageEditPrompt?: string;
  lutDirective?: string;
  antiPatterns?: string[];
  brandTone?: string;
  brandDescription?: string;
  targetAudience?: string;
  visualStyle?: string;
  visualDna?: string;
  vibeProfile?: Record<string, unknown> | null;
  logoUrl?: string;
  referenceImageUrls?: string[];
  captionDrivenMode?: boolean;
}): Promise<string | null> {
  if (shouldPreserveVenuePhotos() && opts.referenceImageUrl) {
    try {
      const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
      const proxyUrl = `${baseUrl}/api/media-proxy?url=${encodeURIComponent(opts.referenceImageUrl)}`;
      const probeRes = await fetch(proxyUrl, { signal: AbortSignal.timeout(8_000) });
      if (probeRes.ok) {
        const sharpModule = await import('sharp');
        const buf = Buffer.from(await probeRes.arrayBuffer());
        const meta = await sharpModule.default(buf).metadata();
        const w = meta.width ?? 1080;
        if (!shouldUpscaleSmallGalleryPhoto(w)) {
          return opts.referenceImageUrl;
        }
        console.log(`[auto-produce] small gallery photo ${w}px → AI upscale`);
      } else {
        return opts.referenceImageUrl;
      }
    } catch {
      return opts.referenceImageUrl;
    }
  }
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const enhancePrompt = opts.agentImageEditPrompt
      || [
          'Apply agency-grade color grading to this brand photo.',
          'PRESERVE: every architectural element, person, object, and composition stays exactly in place.',
          'DO NOT move, add, or remove anything from the scene.',
          'APPLY: brand palette colors in lighting, ambient tone, and color grade.',
          opts.lutDirective ? `Grading look: ${opts.lutDirective}.` : 'Warm editorial grading, premium feel.',
          opts.antiPatterns?.length ? `NEVER: ${opts.antiPatterns.slice(0, 3).join('; ')}.` : '',
        ].filter(Boolean).join(' ');

    const body: Record<string, unknown> = {
      title:        opts.headline,
      caption:      opts.caption,
      contentType:  opts.contentType,
      brandName:    opts.brandName,
      location:     opts.location,
      industry:     opts.businessType,
      description:  opts.brandDescription,
      brandTone:    opts.brandTone,
      targetAudience: opts.targetAudience,
      visualStyle:  opts.visualStyle,
      visualDna:    opts.visualDna,
      workspaceId:  opts.workspaceId,
      logoUrl:      opts.logoUrl,
      referenceImageUrls: opts.referenceImageUrls?.length
        ? opts.referenceImageUrls
        : opts.referenceImageUrl ? [opts.referenceImageUrl] : undefined,
      brandVibeProfile: opts.vibeProfile ?? undefined,
      enhanceMode:    Boolean(opts.referenceImageUrl) && !opts.captionDrivenMode,
      enhanceContext: opts.referenceImageUrl && !opts.captionDrivenMode ? enhancePrompt : undefined,
      captionDrivenMode: opts.captionDrivenMode === true,
      ...(opts.antiPatterns?.length && !opts.vibeProfile ? {
        brandVibeProfile: { anti_patterns: opts.antiPatterns } as Record<string, unknown>,
      } : {}),
    };
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] vibe image gen failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json();
    return (data.imageUrl as string) ?? null;
  } catch (err) {
    console.warn('[auto-produce] vibe image gen error', err);
    return null;
  }
}

export async function generateDesignedImageFromMissionCard(opts: {
  workspaceId: string;
  card: MissionVisualDesignCard;
  headline: string;
  caption: string;
  referenceImageUrl: string;
  contentType: 'post' | 'story';
  brandName: string;
  location?: string;
  businessType?: string;
  logoUrl?: string;
  extraReferenceImageUrls?: string[];
}): Promise<string | null> {
  const prompt = String(opts.card.image_generation_prompt ?? '').trim();
  if (!prompt || !isUsableGalleryPhotoUrl(opts.referenceImageUrl)) return null;
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const referenceImageUrls = [
      opts.referenceImageUrl,
      ...(opts.extraReferenceImageUrls ?? []).filter((url) => url && url !== opts.referenceImageUrl),
    ].slice(0, 2);
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: String(opts.card.headline ?? opts.card.concept_title ?? opts.headline).slice(0, 60),
        caption: opts.caption,
        contentType: opts.contentType,
        brandName: opts.brandName,
        location: opts.location,
        industry: opts.businessType,
        referenceImageUrls,
        designCardPrompt: prompt,
        backgroundIntent: opts.card.background_intent,
        overlayColor: opts.card.overlay_color,
        logoUrl: opts.logoUrl,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] mission visual design card render failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json().catch(() => ({})) as { imageUrl?: string };
    return typeof data.imageUrl === 'string' ? data.imageUrl : null;
  } catch (err) {
    console.warn('[auto-produce] mission visual design card render error', err);
    return null;
  }
}

export async function generateEventOverlayImage(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  referenceImageUrl: string;
  brandName: string;
  location?: string;
  businessType?: string;
  vibeProfile?: Record<string, unknown> | null;
  contentTypeFmt: 'post' | 'story';
  eventDetails?: {
    artistName?: string;
    date?: string;
    time?: string;
    venueArea?: string;
    tagline?: string;
    ctaText?: string;
  };
}): Promise<string | null> {
  if (!isUsableGalleryPhotoUrl(opts.referenceImageUrl)) return null;
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: opts.headline,
        caption: opts.caption,
        contentType: opts.contentTypeFmt,
        brandName: opts.brandName,
        location: opts.location,
        industry: opts.businessType,
        workspaceId: opts.workspaceId,
        referenceImageUrls: [opts.referenceImageUrl],
        eventOverlayMode: true,
        brandVibeProfile: opts.vibeProfile ?? undefined,
        eventDetails: opts.eventDetails
          ? {
              artistName: opts.eventDetails.artistName,
              date: opts.eventDetails.date,
              time: opts.eventDetails.time,
              venueArea: opts.eventDetails.venueArea,
              tagline: opts.eventDetails.tagline,
            }
          : undefined,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] event overlay failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json() as { imageUrl?: string };
    return data.imageUrl ?? null;
  } catch (err) {
    console.warn('[auto-produce] event overlay error', err);
    return null;
  }
}

export async function generateMarkyLayerCard(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  vibeProfile?: Record<string, unknown>;
  referenceImageUrl: string;
  contentTypeFmt: 'post' | 'story';
  templateUseCase?: string;
  strategicPurpose?: string;
  ideaIndex?: number;
  brandTheme?: Record<string, unknown> | null;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  usedTemplateIds?: string[];
  baseUrl?: string;
  eventDetails?: {
    artistName?: string;
    date?: string;
    time?: string;
    venueArea?: string;
    tagline?: string;
    ctaText?: string;
  };
}): Promise<string | null> {
  const ev = opts.eventDetails ?? {};
  const displayHeadline = ev.artistName
    ? [ev.artistName, ev.date].filter(Boolean).join(' · ')
    : opts.headline;
  const subtitle = ev.tagline ?? opts.caption;

  return renderRemotionBrandStill({
    workspaceId: opts.workspaceId,
    photoUrl: opts.referenceImageUrl,
    headline: displayHeadline.trim() || opts.headline,
    caption: subtitle,
    brandName: opts.brandName,
    location: opts.location,
    sector: opts.businessType,
    mood: opts.mood,
    templateUseCase: opts.templateUseCase,
    contentType: opts.contentTypeFmt,
    ideaIndex: opts.ideaIndex ?? 0,
    brandTheme: opts.brandTheme,
    logoUrl: opts.logoUrl,
    primaryColor: opts.primaryColor,
    accentColor: opts.accentColor,
    usedTemplateIds: opts.usedTemplateIds,
    eventDate: ev.date,
    eventTime: ev.time,
    cta: ev.ctaText,
    baseUrl: opts.baseUrl,
  });
}

export async function generateVibeCarousel(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  candidateUrls: string[];
  excludeUrls: string[];
  count: number;
}): Promise<{ enhancedUrls: string[]; galleryUrls: string[] }> {
  const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

  const localUsed = [...opts.excludeUrls];
  const candidates = opts.candidateUrls.filter(
    (u) => !localUsed.some((ex) => normalizeGalleryUrl(ex) === normalizeGalleryUrl(u))
      && !u.toLowerCase().includes('logo') && !u.toLowerCase().includes('icon'),
  );

  const matchInput: MatchPhotoInput = {
    caption: opts.caption,
    headline: opts.headline,
    mood: opts.mood ?? '',
    contentType: 'carousel',
    businessType: opts.businessType,
  };

  const scored = pickScoredCarouselSlides(
    matchInput,
    candidates,
    opts.galleryAnalysis,
    localUsed,
    opts.count,
    MIN_ACCEPT_SCORE,
  );
  const picked = scored.map((r) => r.url);

  if (!picked.length) return { enhancedUrls: [], galleryUrls: [] };

  if (shouldPreserveVenuePhotos()) {
    return { enhancedUrls: picked.slice(0, opts.count), galleryUrls: picked.slice(0, opts.count) };
  }

  const enhanced = (await Promise.all(
    picked.slice(0, opts.count).map(async (refUrl, idx) => {
      if (idx > 0) return refUrl;
      try {
        const body: Record<string, unknown> = {
          title:           opts.headline,
          caption:         opts.caption,
          contentType:     'post',
          brandName:       opts.brandName,
          location:        opts.location,
          businessType:    opts.businessType,
          workspaceId:     opts.workspaceId,
          referenceImageUrls: [refUrl],
          enhanceMode:     true,
          enhanceContext:  'Apply subtle color grading only. Preserve the venue photo exactly — do not replace the scene.',
        };
        const res = await fetch(`${baseUrl}/api/generate-instagram-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) return refUrl;
        const data = await res.json();
        return (data.imageUrl as string) ?? refUrl;
      } catch {
        return refUrl;
      }
    }))
  ).filter(Boolean) as string[];

  return { enhancedUrls: enhanced, galleryUrls: picked.slice(0, opts.count) };
}

export async function renderEventCardFromPayload(
  prodIdea: ProductionIdea,
  brand: RendererBrandContext,
  gallery: RendererGalleryMeta,
  opts: { workspaceId: string; vibeProfile?: Record<string, unknown> },
): Promise<string | null> {
  const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
  const payload = buildEventCardPayload(prodIdea, brand, gallery, { workspaceId: opts.workspaceId });
  if (!isUsableGalleryPhotoUrl(payload.photoUrl)) return null;
  try {
    const res = await fetch(`${baseUrl}/api/generate-event-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        photoUrl: payload.photoUrl,
        contentType: payload.contentType,
        templateId: payload.templateId,
        brandName: payload.brandName,
        location: payload.location,
        workspaceId: payload.workspaceId,
        eventName: payload.eventName,
        tagline: payload.tagline,
        date: payload.date,
        enhancePhoto: payload.enhancePhoto,
        vibeProfile: opts.vibeProfile,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] event-card failed', res.status, err.slice(0, 120));
      return null;
    }
    const data = await res.json() as { imageUrl?: string };
    const url = data.imageUrl;
    if (url) console.log('[auto-produce] event-card (buildEventCardPayload):', prodIdea.headline.slice(0, 40));
    return url ?? null;
  } catch (err) {
    console.warn('[auto-produce] event-card error', err);
    return null;
  }
}

export type RunwayReelProduceResult = {
  videoUrl: string;
  cameraMotion: UnifiedCameraMotion;
  reelPace: string;
  sectorId: string;
  hookScore: number;
  strategy: RunwayReelStrategy;
};

export async function generateRunwayReel(opts: {
  workspaceId: string;
  headline: string;
  caption: string;
  brandName: string;
  location?: string;
  businessType?: string;
  mood?: string;
  /** reel_motion_spec.pace from ideation */
  reelPace?: string;
  cameraMotion?: string;
  agentImageEditPrompt?: string;
  referenceImageUrl?: string;
  additionalPhotoUrls?: string[];
  vibeProfile?: Record<string, unknown>;
  photoDescription?: string;
  photoSceneMoment?: string;
  photoMicroMotions?: string[];
  photoMood?: string;
  photoUsageContext?: string;
  photoPairingKeywords?: string[];
  photoTags?: string[];
  brandThemeGrading?: { look?: string; lut_directive?: string };
  transitionStyle?: string;
  treatment?: string;
  templateUseCase?: string;
  photos?: MultiReelPhotoInput[];
  strategy?: RunwayReelStrategy;
  galleryMeta?: Record<string, { description?: string; contentTags?: string[]; tags?: string[] }>;
  productionIdea?: ProductionIdea;
  tenantLearningBrief?: string;
  sceneBrief?: ProductSceneBrief | null;
  aiVisualStandard?: AiVisualProductionStandard;
  brandContextForVisual?: BrandContextForVisual;
  strategicPurpose?: string;
  productType?: string;
  isHeroReel?: boolean;
  motionProfile?: BrandMotionProfile;
}): Promise<RunwayReelProduceResult | null> {
  try {
    const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
    const sectorId = normalizeSectorId(opts.businessType);
    const brandReel = opts.motionProfile
      ? resolveBrandReelProductionParams(opts.motionProfile, sectorId)
      : null;
    const sectorReelPacing = brandReel?.reelPacing ?? getSectorReelPacing(sectorId);
    const effectiveReelPace = resolveEffectiveReelPace({
      reelPace: opts.reelPace ?? opts.mood,
      brandReelPace: brandReel?.reelPace,
      sector: sectorId,
    });

    const photoInputs: MultiReelPhotoInput[] = opts.photos?.length
      ? opts.photos
      : buildMultiReelPhotoInputs(
          [opts.referenceImageUrl, ...(opts.additionalPhotoUrls ?? [])].filter(
            (u): u is string => typeof u === 'string' && u.length > 0,
          ),
          opts.galleryMeta ?? {},
          normalizeGalleryUrl,
        );

    const runwayStrategy = opts.strategy ?? resolveRunwayReelStrategy({
      photoCount: photoInputs.length,
      transitionStyle: opts.transitionStyle,
      treatment: opts.treatment,
      templateUseCase: opts.templateUseCase,
      mood: opts.mood,
      contentType: 'reel',
      reelPacing: sectorReelPacing,
      strategyOverride: brandReel?.strategy,
    });

    const vibeEarly = opts.vibeProfile ?? {};
    const vibeMotionEarly = (vibeEarly.motion as Record<string, string> | undefined) ?? {};
    const cameraMotion = resolveRunwayCameraMotionForFidelity({
      agentCamera: opts.cameraMotion,
      brandCameraMotion: brandReel?.cameraMotion,
      vibeCamera: vibeMotionEarly.camera_movement,
      mood: opts.mood,
      reelPace: opts.reelPace ?? opts.mood,
      brandReelPace: brandReel?.reelPace,
      vibePace: vibeMotionEarly.pace,
      sector: sectorId,
    });
    const hookScore = scoreReelHook({
      headline: opts.headline,
      caption: opts.caption,
      photoDescription: opts.photoDescription,
      photoSceneMoment: opts.photoSceneMoment,
      photoTags: opts.photoTags,
      agentVisualDirection: opts.agentImageEditPrompt,
      cameraMotion,
      mood: opts.mood,
    });
    if (!hookScore.pass) {
      console.warn(
        `[auto-produce] Runway hook gate skip (${hookScore.score}/100): ${hookScore.reasons.join(', ') || 'weak opener'}`,
      );
      return null;
    }

    if (runwayStrategy !== 'single' && photoInputs.length >= 2) {
      const montageStrategy: 'sequential' | 'multi_ref' =
        runwayStrategy === 'multi_ref' ? 'multi_ref' : 'sequential';
      const limit = maxPhotosForStrategy(runwayStrategy);
      console.log(`[auto-produce] Multi-reel ${montageStrategy}: ${Math.min(photoInputs.length, limit)} photos`);
      const multi = await callGenerateMultiReel(baseUrl, {
        workspaceId: opts.workspaceId,
        photos: photoInputs.slice(0, limit),
        headline: opts.headline || `${opts.brandName} Reel`,
        caption: opts.caption.slice(0, 300),
        brandName: opts.brandName,
        brandLocation: opts.location,
        vibeProfile: opts.vibeProfile,
        brandThemeGrading: opts.brandThemeGrading,
        strategy: montageStrategy,
        ratio: '720:1280',
        duration: 5,
        agentVisualDirection: opts.agentImageEditPrompt?.slice(0, 400),
        cameraMotion,
        businessType: opts.businessType,
        productType: opts.productType,
        strategicPurpose: opts.strategicPurpose,
        missionBrief: opts.tenantLearningBrief,
      });
      if (multi.videoUrl) {
        console.log(`[auto-produce] Multi-reel produced (${multi.strategy}):`, multi.videoUrl.slice(0, 80));
        return {
          videoUrl: multi.videoUrl,
          cameraMotion,
          reelPace: effectiveReelPace,
          sectorId,
          hookScore: hookScore.score,
          strategy: runwayStrategy,
        };
      }
      console.warn('[auto-produce] Multi-reel failed, falling back to single:', multi.error?.slice(0, 120));
    }

    const vibe = opts.vibeProfile ?? {};
    const grading = (vibe.grading as Record<string, string> | undefined) ?? {};
    const composition = (vibe.composition as Record<string, string> | undefined) ?? {};
    const sourceAccounts: string[] = Array.isArray(vibe.source_accounts) ? vibe.source_accounts : [];

    const vibeCinema = [
      grading.look ? `${grading.look} color grade` : 'golden hour color grade',
      grading.lut_directive ? grading.lut_directive : '',
      composition.framing_rules ? composition.framing_rules : 'subject in lower-third, expansive sky or sea',
    ].filter(Boolean).join(', ');

    const antiPatterns: string[] = Array.isArray(vibe.anti_patterns) ? vibe.anti_patterns : [];

    const concept = [
      `${opts.brandName || 'Brand'} — ${opts.headline}`,
      opts.location ? `Location: ${opts.location}` : '',
      opts.mood ? `Mood: ${opts.mood}` : '',
      opts.agentImageEditPrompt ? `Visual direction: ${opts.agentImageEditPrompt.slice(0, 200)}` : '',
      `Cinematic style: ${vibeCinema}`,
      sourceAccounts.length ? `Aesthetic reference: ${sourceAccounts.map(a => '@' + a).join(', ')} quality` : '',
      antiPatterns.length ? `Avoid: ${antiPatterns.join(', ')}` : '',
    ].filter(Boolean).join('. ');

    let body: Record<string, unknown>;

    if (opts.productionIdea && runwayStrategy === 'single') {
      const brandCtx: RendererBrandContext = {
        brandName: opts.brandName,
        location: opts.location,
        businessType: opts.businessType,
        vibeProfile: opts.vibeProfile,
        themeGrading: opts.brandThemeGrading
          ? {
              look: opts.brandThemeGrading.look,
              lutDirective: opts.brandThemeGrading.lut_directive,
            }
          : undefined,
        visualStyle: grading.look || '',
        brandTone: opts.businessType || 'lifestyle',
        missionBrief: opts.tenantLearningBrief,
      };
      const gallery: RendererGalleryMeta = {
        photoUrl: opts.referenceImageUrl ?? null,
        description: opts.photoDescription,
        tags: opts.photoTags,
        sceneMoment: opts.photoSceneMoment,
        microMotions: opts.photoMicroMotions,
        photoMood: opts.photoMood,
        usageContext: opts.photoUsageContext,
        pairingKeywords: opts.photoPairingKeywords,
      };
      const directorExtras = reelDirectorExtrasFromIdeaRecord(
        productionIdeaToRecord(opts.productionIdea),
        {
          sector: sectorId,
          businessType: opts.businessType,
          cameraMotion: opts.cameraMotion,
          sceneBrief: opts.sceneBrief,
          aiVisualStandard: opts.aiVisualStandard,
          brandContextForVisual: opts.brandContextForVisual,
          vibeProfile: opts.vibeProfile,
          brandThemeGrading: opts.brandThemeGrading,
          workspaceId: opts.workspaceId,
          strategicPurpose: opts.strategicPurpose,
          isHeroReel: opts.isHeroReel,
          brandReel: brandReel ?? undefined,
        },
      );
      if (opts.agentImageEditPrompt) {
        directorExtras.runwayPromptFromAgent = [
          directorExtras.runwayPromptFromAgent,
          opts.agentImageEditPrompt,
        ].filter(Boolean).join(' — ');
      }
      body = buildReelGenerateReelRequest(
        opts.productionIdea,
        brandCtx,
        gallery,
        opts.referenceImageUrl ?? '',
        directorExtras,
      );
      // Attach multi-photo refs
      const allPhotoUrlsForBody = [
        opts.referenceImageUrl,
        ...(opts.additionalPhotoUrls ?? []),
      ].filter((u): u is string => typeof u === 'string' && isUsableGalleryPhotoUrl(u));
      if (allPhotoUrlsForBody.length >= 2) {
        body.promptImages = allPhotoUrlsForBody.slice(0, 4);
      } else if (typeof body.promptImage !== 'string' && opts.referenceImageUrl) {
        body.promptImage = opts.referenceImageUrl;
      }
      const pis = gatePromptIntegrity('runway', body, PIS_PRODUCTION_MIN_SCORE);
      if (!pis.pass) {
        console.warn(
          `[auto-produce] Runway PIS skip (${pis.score}%): ${pis.missing.join(', ')}`,
        );
        return null;
      }
      console.log(`[auto-produce] Runway body via buildReelPayload (PIS ${pis.score}%)`);
    } else {
      const palette = (vibe.palette as Record<string, string> | undefined) ?? {};
      const paletteDesc = palette.palette_description ?? '';
      const derivedVisualStyle = grading.look || paletteDesc || 'warm';
      const derivedBrandTone = paletteDesc || (opts.businessType || 'lifestyle');

      body = {
        title: opts.headline || `${opts.brandName} Reel`,
        caption: opts.caption,
        concept,
        platform: 'instagram',
        contentType: 'reel',
        visualStyle: derivedVisualStyle,
        cameraMotion,
        brandTone: derivedBrandTone,
        duration: 5,
        ratio: '720:1280',
        sceneMetadata: {
          brandName: opts.brandName,
          location: opts.location,
          businessType: opts.businessType,
          workspaceId: opts.workspaceId,
          ...(opts.agentImageEditPrompt
            ? { agentVisualDirection: opts.agentImageEditPrompt.slice(0, 400) }
            : {}),
        },
        photoDescription: opts.photoDescription,
        photoTags: opts.photoTags,
        vibeProfile: opts.vibeProfile
          ? {
              grading: (opts.vibeProfile.grading as Record<string, unknown>) ?? {},
              palette: (opts.vibeProfile.palette as Record<string, unknown>) ?? {},
              motion: (opts.vibeProfile.motion as Record<string, unknown>) ?? {},
              composition: (opts.vibeProfile.composition as Record<string, unknown>) ?? {},
            }
          : undefined,
        brandThemeGrading: opts.brandThemeGrading,
      };

      const allPhotoUrls = [
        opts.referenceImageUrl,
        ...(opts.additionalPhotoUrls ?? []),
      ].filter((u): u is string => typeof u === 'string' && isUsableGalleryPhotoUrl(u));

      if (allPhotoUrls.length >= 2) {
        body.promptImages = allPhotoUrls.slice(0, 4);
        console.log(`[auto-produce] Multi-reference reel: ${allPhotoUrls.length} photos`);
      } else if (opts.referenceImageUrl) {
        body.promptImage = opts.referenceImageUrl;
      }
    }

    const res = await fetch(`${baseUrl}/api/generate-reel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[auto-produce] Runway reel failed', res.status, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const videoUrl = (data.videoUrl ?? data.outputUrls?.[0]) as string | undefined;
    if (videoUrl) {
      console.log('[auto-produce] Runway reel produced:', videoUrl.slice(0, 80));
      return {
        videoUrl,
        cameraMotion,
        reelPace: effectiveReelPace,
        sectorId,
        hookScore: hookScore.score,
        strategy: runwayStrategy,
      };
    }
    return null;
  } catch (err) {
    console.warn('[auto-produce] Runway reel error', err);
    return null;
  }
}

/**
 * Sync Remotion still render — replaces announcement SVG / generate-event-card for posts & story posters.
 */
import {
  ensureBrandTemplateLibrary,
  resolveProductionTemplate,
} from './brand-template-library';
import { resolveBrandRemotionRenderPolicy, resolveContentIntent } from './brand-motion-profile';
import { getBrandKit } from './agency-brand-kits';
import {
  fetchBrandProductionTokensForWorkspace,
  resolveBrandProductionTokens,
} from './brand-production-tokens';
import { resolveKitForSector } from './remotion-template-registry';
import { tenantKitSeed } from './tenant-template-seed';
import { isUsableGalleryPhotoUrl } from './media-url';
import { resolvePosterOverlayCopy } from './poster-copy';
import { resolveSlotRenderTypography } from './brand-template-slot-typography';
import { resolveSlotLogoForRender } from './brand-logo-production';
import { buildInternalProductionHeaders } from './tenant-production-guard';
import type { RemotionFalTemplateAlignment } from './brand-design-template-production';
import type { ContentIntent } from './brand-motion-profile';

export interface RemotionBrandStillInput {
  workspaceId: string;
  photoUrl: string;
  headline: string;
  caption?: string;
  brandName: string;
  location?: string;
  sector?: string;
  mood?: string;
  treatment?: string;
  templateUseCase?: string;
  contentType: 'post' | 'story';
  ideaIndex?: number;
  posterTemplateId?: string;
  storyTemplateId?: string;
  brandTheme?: Record<string, unknown> | null;
  primaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  usedTemplateIds?: string[];
  eventDate?: string;
  eventTime?: string;
  cta?: string;
  baseUrl?: string;
  grafikerMaxRetries?: number;
  librarySlotKey?: string;
  slotRole?: string;
  /** Phase 2 — fal onboarding template color/vibe/layout hints (Remotion variety preserved). */
  falTemplateAlignment?: RemotionFalTemplateAlignment | null;
  /** Faz 2.2/2.3 — production tier; premium preserves full Grafiker/CD (gpt-4o) */
  profileTier?: 'economy' | 'agency' | 'premium';
}

async function resolvePhotoUrlForRender(photoUrl: string, baseUrl?: string): Promise<string> {
  if (!photoUrl.includes('/api/media') || !photoUrl.includes('key=')) return photoUrl;

  if (typeof window === 'undefined') {
    try {
      const { getPresignedUrl } = await import('@/lib/r2-storage');
      const keyMatch = photoUrl.match(/[?&]key=([^&]+)/);
      if (keyMatch?.[1]) {
        return getPresignedUrl(decodeURIComponent(keyMatch[1]), 3600);
      }
    } catch { /* keep original */ }
    return photoUrl;
  }

  try {
    const origin = baseUrl ?? window.location.origin;
    const metaRes = await fetch(`${origin}/api/media-proxy?url=${encodeURIComponent(photoUrl)}&meta=1`);
    if (metaRes.ok) {
      const meta = await metaRes.json().catch(() => null);
      if (meta?.presignedUrl) return meta.presignedUrl as string;
    }
  } catch { /* keep original */ }
  return photoUrl;
}

export interface RemotionBrandStillResult {
  imageUrl: string;
  grafikerScore: number | null;
  grafikerPass: boolean;
  templateId?: string;
  posterTemplateId?: string;
  librarySlotKey?: string;
  kitId?: string;
  brandDesignTemplateId?: string;
  brandDesignTemplateType?: string;
  brandDesignTemplateName?: string;
}

/** Server or client — returns PNG URL + Grafiker QA from SpecPoster* still render. */
export async function renderRemotionBrandStillResult(
  input: RemotionBrandStillInput,
): Promise<RemotionBrandStillResult | null> {
  try {
    const baseUrl = input.baseUrl
      ?? (typeof window !== 'undefined' ? window.location.origin : (process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000'));

    const photoUrlRaw = input.photoUrl.trim();
    if (!isUsableGalleryPhotoUrl(photoUrlRaw)) return null;

    const photoUrl = await resolvePhotoUrlForRender(photoUrlRaw, baseUrl);
    const sector = input.sector ?? 'general_business';
    const library = ensureBrandTemplateLibrary(input.brandTheme ?? null, {
      sector,
      kitId: resolveKitForSector(sector, tenantKitSeed(input.workspaceId)),
      tenantId: input.workspaceId,
    });

    const intent: ContentIntent = input.falTemplateAlignment?.contentIntent
      ?? resolveContentIntent({
      treatment: input.treatment,
      templateUseCase: input.templateUseCase,
      mood: input.mood,
      headline: input.headline,
      contentType: input.contentType,
    });

    const isPost = input.contentType === 'post';
    const production = resolveProductionTemplate({
      library,
      sector,
      intent,
      treatment: input.treatment,
      ideaIndex: input.ideaIndex ?? 0,
      format: 'post',
      usedTemplateIds: input.usedTemplateIds,
      headline: input.headline,
      caption: input.caption,
      brandTheme: input.brandTheme,
      librarySlotKey: input.librarySlotKey,
      slotRole: input.slotRole,
      templateUseCase: input.templateUseCase,
    });

    const overlay = resolvePosterOverlayCopy({
      headline: input.headline,
      ideationHeadline: input.headline,
      subtitle: input.caption,
      caption: input.caption,
      brandName: input.brandName,
      location: input.location,
      eventDate: input.eventDate,
      eventTime: input.eventTime,
      cta: input.cta,
      sector,
    });

    const posterTemplateId = input.posterTemplateId ?? production.posterTemplateId ?? 'poster_promo_split_01';
    const storyTemplateId = input.storyTemplateId ?? production.storyTemplateId;
    if (input.usedTemplateIds) {
      const picked = isPost ? posterTemplateId : storyTemplateId;
      if (picked) input.usedTemplateIds.push(picked);
    }
    const kit = getBrandKit(production.kitId);
    const tokens = input.workspaceId
      ? await fetchBrandProductionTokensForWorkspace(input.workspaceId, {
          sector,
          brandName: input.brandName,
        })
      : resolveBrandProductionTokens({
          brandTheme: input.brandTheme,
          sector,
          kitHeading: kit?.headingFont,
          kitBody: kit?.bodyFont,
          brandName: input.brandName,
        });

    const primaryColor =
      input.falTemplateAlignment?.primaryColor
      ?? input.primaryColor
      ?? tokens.primaryColor;
    const accentColor =
      input.falTemplateAlignment?.accentColor
      ?? input.accentColor
      ?? tokens.accentColor;

    const compositionId = isPost ? 'SpecPosterPost' : 'SpecPosterStory';
    const renderPolicy = resolveBrandRemotionRenderPolicy(input.brandTheme ?? null, { sector });
    const templateLocked = Boolean(library.locked);
    const slotTypo = resolveSlotRenderTypography({
      slot: production.slot,
      templateId: posterTemplateId,
      format: isPost ? 'post' : 'story',
      brandHeadingFont: tokens.headingFont ?? kit?.headingFont,
      brandBodyFont: tokens.bodyFont ?? kit?.bodyFont,
      sector,
    });
    const res = await fetch(`${baseUrl}/api/remotion/render`, {
      method: 'POST',
      headers: buildInternalProductionHeaders(input.workspaceId),
      body: JSON.stringify({
        compositionId,
        useCreativeDirector: true,
        brandTemplateLocked: templateLocked || renderPolicy.brandTemplateLocked,
        motionStyle: renderPolicy.motionStyle,
        locale: renderPolicy.locale,
        allowedCompositions: renderPolicy.allowedCompositions,
        uploadToR2: Boolean(process.env.R2_BUCKET_NAME),
        workspaceId: input.workspaceId,
        grafikerMaxRetries: input.grafikerMaxRetries,
        profileTier: input.profileTier,
        props: {
          templateId: posterTemplateId,
          posterTemplateId,
          kitId: production.kitId,
          librarySlotKey: production.slot.key,
          photoUrl,
          headline: overlay.headline || input.headline.trim() || 'İçerik',
          subtitle: overlay.subtitle || (input.caption ?? '').trim().slice(0, 120),
          brandName: input.brandName,
          location: overlay.venueArea ?? '',
          primaryColor,
          accentColor,
          fontFamily: slotTypo.headingFont,
          bodyFont: slotTypo.bodyFont,
          fontPersonality: slotTypo.fontPersonality,
          honorTemplateTypography: slotTypo.honorTemplateTypography,
          headlineColor: tokens.headlineColor,
          subtitleColor: tokens.subtitleColor,
          overlayOpacity: tokens.overlayOpacity,
          logoUrl: resolveSlotLogoForRender(input.logoUrl, production.slot),
          eventDate: input.eventDate || undefined,
          eventTime: input.eventTime || undefined,
          cta: overlay.cta || input.cta || undefined,
          format: isPost ? '1:1' : 'story',
          sector: input.sector,
          businessType: input.sector,
          contentIntent: intent,
          sceneBrief: input.falTemplateAlignment?.sceneBrief ?? '',
          mood: input.falTemplateAlignment?.typographyVibe ?? input.mood,
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) return null;
    const data = await res.json() as {
      imageUrl?: string;
      grafikerScore?: number | null;
      grafikerPass?: boolean;
    };
    if (!data.imageUrl) return null;
    return {
      imageUrl: data.imageUrl,
      grafikerScore: data.grafikerScore ?? null,
      grafikerPass: data.grafikerPass !== false,
      templateId: posterTemplateId,
      posterTemplateId,
      librarySlotKey: production.slot.key,
      kitId: production.kitId,
      brandDesignTemplateId: input.falTemplateAlignment?.matched.id,
      brandDesignTemplateType: input.falTemplateAlignment?.matched.templateType,
      brandDesignTemplateName: input.falTemplateAlignment?.matched.templateName,
    };
  } catch {
    return null;
  }
}

/** Server or client — returns PNG URL from Remotion SpecPoster* still render. */
export async function renderRemotionBrandStill(
  input: RemotionBrandStillInput,
): Promise<string | null> {
  const result = await renderRemotionBrandStillResult(input);
  return result?.imageUrl ?? null;
}

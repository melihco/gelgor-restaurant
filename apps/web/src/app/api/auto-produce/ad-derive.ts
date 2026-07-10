/**
 * Ad creative derivation for auto-produce.
 *
 * Derives Meta + Google ad artifacts from a completed designed_post snapshot.
 * Primary engine: fal.ai designed still (GPT-image grounded + Ideogram fallback).
 * Remotion fallback removed — ads use gallery-grounded fal designs only.
 */

import {
  adPipelineForChannel,
  adPlatformLabel,
  adSlotRoleForChannel,
  shouldDeriveWeeklyAdPair,
  type AdPublishChannel,
} from '@/lib/ad-publish-utils';
import {
  bindBrandTemplateForFalProduction,
} from '@/lib/brand-design-template-production';
import type { BrandTemplateLibrary } from '@/lib/brand-template-library';
import type { BrandProductionTokens } from '@/lib/brand-production-tokens';
import {
  buildBrandOperatingProfileDirective,
  resolveBrandOperatingProfile,
  type BrandOperatingProfile,
} from '@/lib/brand-operating-profile';
import { resolveFalDesignIntensityForChannel } from '@/lib/fal-design-intensity';
import { resolveFalBrandInput } from '@/lib/fal-brand-input';
import { sanitizeProductionHeadline } from '@/lib/production-headline-quality';
import { resolveFalAdCreativeDirectives } from '@/lib/fal-ad-creative-prompt';
import { serverConfig } from '@/lib/server-config';
import { produceFalDesignedPost } from './pipelines/fal-designed-post-pipeline';
import type { NexusClient } from './nexus-client';

export interface DesignedPostSnapshot {
  imageUrl: string;
  referencePhotoUrl?: string;
  headline: string;
  caption: string;
  cta: string;
  hashtags: string[];
  missionId: string;
  nodeKey: string;
  ideaId: string;
  ideaIndex: number;
  templateUseCase?: string;
}

export interface AdDeriveRenderContext {
  brandBusinessType: string;
  brandLocation?: string;
  brandLogoUrl?: string;
  brandTheme?: Record<string, unknown> | null;
  brandTokens?: BrandProductionTokens;
  templateLibrary?: BrandTemplateLibrary;
  primaryColor?: string;
  accentColor?: string;
  routeBaseUrl: string;
  grafikerMaxRetries?: number;
  usedTemplateIds?: string[];
  brandDescription?: string;
  visualDna?: string;
  brandTone?: string;
  brandReferenceImageUrls?: string[];
  operatingProfile?: BrandOperatingProfile;
}

function adCtaForChannel(cta: string, channel: AdPublishChannel): string {
  const trimmed = cta.trim();
  if (channel === 'google_ads' && /demo|deneme/i.test(trimmed)) {
    return 'Keşfet';
  }
  return trimmed.slice(0, 30);
}

function adLibrarySlotKeyForSnapshot(_snapshot: DesignedPostSnapshot): string {
  return 'ad_creative_post';
}

function resolveAdSceneHint(snapshot: DesignedPostSnapshot): string {
  return [snapshot.headline, snapshot.caption.slice(0, 120)]
    .filter(Boolean)
    .join(' — ')
    .slice(0, 160);
}

async function renderAdCreativeWithFal(
  workspaceId: string,
  channel: AdPublishChannel,
  snapshot: DesignedPostSnapshot,
  adHeadline: string,
  adCta: string,
  brandName: string,
  renderCtx: AdDeriveRenderContext,
  role: string,
): Promise<{ imageUrl: string; engine: string | null; costUsd: number }> {
  const photoUrl = (snapshot.referencePhotoUrl?.trim() || snapshot.imageUrl?.trim());
  const operatingProfile = renderCtx.operatingProfile ?? resolveBrandOperatingProfile({
    businessType: renderCtx.brandBusinessType,
    brandDescription: renderCtx.brandDescription,
    visualDna: renderCtx.visualDna,
    brandTone: renderCtx.brandTone,
    brandTheme: renderCtx.brandTheme,
  });
  const tokens = renderCtx.brandTokens;
  if (!tokens) {
    throw new Error('Ad derive requires brandTokens in render context');
  }
  const brandColors = {
    primary: renderCtx.primaryColor || tokens.primaryColor,
    accent: renderCtx.accentColor || tokens.accentColor,
  };
  const falBrand = resolveFalBrandInput({
    brandTheme: renderCtx.brandTheme,
    templateLibrary: renderCtx.templateLibrary,
    librarySlotKey: adLibrarySlotKeyForSnapshot(snapshot),
    tokens,
    sector: renderCtx.brandBusinessType,
    caption: snapshot.caption,
    headline: adHeadline,
    referencePhotoUrl: photoUrl,
    sceneHint: resolveAdSceneHint(snapshot),
    format: 'post',
    visualDna: renderCtx.visualDna,
    brandTone: renderCtx.brandTone,
    brandDescription: renderCtx.brandDescription,
    designBriefDirectives: [
      ...resolveFalAdCreativeDirectives(channel),
      buildBrandOperatingProfileDirective(operatingProfile),
    ].filter((item): item is string => Boolean(item)),
  });
  const binding = await bindBrandTemplateForFalProduction({
    workspaceId,
    slotRole: role,
    librarySlotKey: adLibrarySlotKeyForSnapshot(snapshot),
    format: 'post',
    caption: snapshot.caption,
    adHocBrief: false,
    missionReferenceUrl: photoUrl,
    baseDirectives: falBrand.promptDirectives,
    brandColors: falBrand.brandColors,
    logoUrl: renderCtx.brandLogoUrl,
    brandVibe: falBrand.vibe,
  });

  const falResult = await produceFalDesignedPost({
    isFalDesignPost: true,
    existingImageUrl: null,
    workspaceId,
    referenceUrl: photoUrl,
    brandReferenceImageUrls: renderCtx.brandReferenceImageUrls ?? [],
    headline: adHeadline,
    caption: snapshot.caption,
    cta: adCta,
    brandName,
    brandColors: falBrand.brandColors,
    brandVibe: falBrand.vibe,
    backgroundStyle: falBrand.backgroundStyle,
    sector: renderCtx.brandBusinessType,
    location: renderCtx.brandLocation,
    logoUrl: renderCtx.brandLogoUrl,
    mood: undefined,
    sceneHint: falBrand.sceneHint,
    grafikerMaxRetries: renderCtx.grafikerMaxRetries,
    brandDirectives: falBrand.promptDirectives,
    visualDnaTone: falBrand.visualDnaTone,
    designIntensityLevel: resolveFalDesignIntensityForChannel(renderCtx.brandTheme, 'post'),
    requireGroundedGallery: Boolean(photoUrl),
    brandTemplateBinding: binding,
    aspectRatio: '4:5',
    subtitle: adCta,
    captionAwareHeadline: true,
    logoPlacement: null,
  });

  if (!falResult?.imageUrl) {
    throw new Error(`fal ad derive failed (${channel})`);
  }

  return {
    imageUrl: falResult.imageUrl,
    engine: falResult.falDesignEngine,
    costUsd: falResult.costDelta || 0.05,
  };
}

/** Meta + Google ad artifacts — fal.ai designed still on gallery photo. */
export async function deriveAdCreativesFromDesignedPost(
  workspaceId: string,
  snapshot: DesignedPostSnapshot,
  missionType: string,
  brandName: string,
  renderCtx: AdDeriveRenderContext,
  nexusClient: NexusClient,
): Promise<Array<{ id?: string; title: string; imageUrl: string; error?: string }>> {
  if (!shouldDeriveWeeklyAdPair(missionType)) return [];

  const photoUrl = (snapshot.referencePhotoUrl?.trim() || snapshot.imageUrl?.trim());
  if (!photoUrl) return [];

  const operatingProfile = renderCtx.operatingProfile ?? resolveBrandOperatingProfile({
    businessType: renderCtx.brandBusinessType,
    brandDescription: renderCtx.brandDescription,
    visualDna: renderCtx.visualDna,
    brandTone: renderCtx.brandTone,
    brandTheme: renderCtx.brandTheme,
  });
  const sanitizedHeadline = sanitizeProductionHeadline({
    headline: snapshot.headline,
    caption: snapshot.caption,
    brandName,
    businessType: renderCtx.brandBusinessType,
    maxLen: 72,
  });

  const channels: AdPublishChannel[] = ['meta_ads', 'google_ads'];
  const derived: Array<{ id?: string; title: string; imageUrl: string; error?: string }> = [];
  const usedTemplateIds = [...(renderCtx.usedTemplateIds ?? [])];
  const useFalPrimary = serverConfig.fal.configured;
  const reuseDesignedPostStill = serverConfig.autoProduce.reuseDesignedPostStill;

  for (const channel of channels) {
    const role = adSlotRoleForChannel(channel);
    const pipeline = adPipelineForChannel(channel);
    const headlineLimit = channel === 'google_ads' ? 30 : 40;
    const adHeadline = sanitizedHeadline.slice(0, headlineLimit);
    const adCta = adCtaForChannel(snapshot.cta, channel);
    const platformLabel = adPlatformLabel(channel);

    let adImageUrl = snapshot.imageUrl;
    let adDedicatedRender = false;
    let adRenderEngine: 'fal' | 'remotion' | 'reuse' = 'reuse';
    let falDesignEngine: string | null = null;
    let costUsd = 0.001;

    if (useFalPrimary) {
      try {
        const fal = await renderAdCreativeWithFal(
          workspaceId,
          channel,
          snapshot,
          adHeadline,
          adCta,
          brandName,
          renderCtx,
          role,
        );
        adImageUrl = fal.imageUrl;
        adDedicatedRender = true;
        adRenderEngine = 'fal';
        falDesignEngine = fal.engine;
        costUsd = fal.costUsd;
        console.log(
          `[auto-produce] Ad creative FAL (${channel}): engine=${fal.engine ?? 'fal'} "${adHeadline.slice(0, 40)}"`,
        );
      } catch (falErr) {
        console.warn(
          `[auto-produce] Ad FAL failed (${channel}), reusing designed_post still: ${String(falErr).slice(0, 100)}`,
        );
      }
    }

    if (!adDedicatedRender && reuseDesignedPostStill) {
      console.log(`[auto-produce] Ad creative reuse (${channel}): designed_post still — render atlandı`);
      adRenderEngine = 'reuse';
      costUsd = 0.001;
    } else if (!adDedicatedRender) {
      console.warn(
        `[auto-produce] Ad FAL unavailable (${channel}) — reusing designed_post still (no Remotion)`,
      );
      adRenderEngine = 'reuse';
      costUsd = 0.001;
    }

    try {
      const { emitAiCostLine } = await import('@/lib/ai-cost-telemetry');
      emitAiCostLine({
        callType: 'other',
        usd: costUsd,
        missionId: snapshot.missionId || null,
        workspaceId,
        slotKey: `${snapshot.ideaIndex}:${role}`,
        detail: `ad-derive:${channel}:${adRenderEngine}${falDesignEngine ? `:${falDesignEngine}` : ''}`,
      });
    } catch { /* telemetri üretimi bozmamalı */ }

    const metadata: Record<string, unknown> = {
      auto_produced: true,
      source: 'auto-produce',
      derived_from: 'designed_post',
      ad_render_dedicated: adDedicatedRender,
      ad_render_engine: adRenderEngine,
      ...(falDesignEngine ? { fal_design_engine: falDesignEngine } : {}),
      derived_idea_index: snapshot.ideaIndex,
      mission_id: snapshot.missionId || undefined,
      node_key: snapshot.nodeKey || undefined,
      publish_channel: channel,
      ad_platform: channel,
      production_role: role,
      pipeline,
      ad_creative: true,
      meta_ads_ready: false,
      google_ads_ready: false,
      ad_primary_text: snapshot.caption.slice(0, 125),
      ad_headline: adHeadline,
      ad_cta: adCta,
      publish_package: 'primary',
      publish_priority: 'extended',
      cost_usd_estimate: costUsd,
    };

    const contentJson = JSON.stringify({
      kind: 'ad_creative',
      contentType: 'ad',
      caption: snapshot.caption,
      hashtags: snapshot.hashtags,
      cta: adCta,
      headline: adHeadline,
      imageUrl: adImageUrl,
      idea_index: snapshot.ideaIndex,
      mission_id: snapshot.missionId || undefined,
      node_key: snapshot.nodeKey || undefined,
      ad_platform: channel,
    });

    const saved = await nexusClient.saveArtifact(workspaceId, {
      title: `${adHeadline || brandName} — ${platformLabel}`,
      contentUrl: adImageUrl,
      content: contentJson,
      platform: channel === 'google_ads' ? 'google_ads' : 'meta_ads',
      contentType: 'ad',
      metadata,
    });

    derived.push({ id: saved.id, title: `${adHeadline} — ${platformLabel}`, imageUrl: adImageUrl, error: saved.error });
    if (saved.id) {
      console.log(`[auto-produce] Derived ${channel} ad: ${saved.id.slice(0, 8)} "${adHeadline.slice(0, 40)}"`);
    }
  }

  return derived;
}

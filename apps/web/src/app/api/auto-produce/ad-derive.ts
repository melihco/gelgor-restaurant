/**
 * Ad creative derivation for auto-produce.
 *
 * Derives Meta + Google ad artifacts from a completed designed_post snapshot.
 * Extracted from route.ts to keep ad-specific logic isolated.
 */

import {
  adPipelineForChannel,
  adPlatformLabel,
  adSlotRoleForChannel,
  shouldDeriveWeeklyAdPair,
  type AdPublishChannel,
} from '@/lib/ad-publish-utils';
import { renderRemotionBrandStillResult } from '@/lib/remotion-brand-kit';
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
  primaryColor?: string;
  accentColor?: string;
  routeBaseUrl: string;
  grafikerMaxRetries?: number;
  usedTemplateIds?: string[];
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

/** Meta + Google ad artifacts — dedicated Remotion still (not designed_post clone). */
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

  const channels: AdPublishChannel[] = ['meta_ads', 'google_ads'];
  const derived: Array<{ id?: string; title: string; imageUrl: string; error?: string }> = [];
  const usedTemplateIds = [...(renderCtx.usedTemplateIds ?? [])];

  for (const channel of channels) {
    const role = adSlotRoleForChannel(channel);
    const pipeline = adPipelineForChannel(channel);
    const headlineLimit = channel === 'google_ads' ? 30 : 40;
    const adHeadline = snapshot.headline.slice(0, headlineLimit);
    const adCta = adCtaForChannel(snapshot.cta, channel);
    const platformLabel = adPlatformLabel(channel);

    let adImageUrl = snapshot.imageUrl;
    try {
      const adRender = await renderRemotionBrandStillResult({
        workspaceId,
        photoUrl,
        headline: adHeadline,
        caption: snapshot.caption,
        brandName,
        location: renderCtx.brandLocation,
        sector: renderCtx.brandBusinessType,
        templateUseCase: 'ad_creative',
        treatment: 'ad_creative',
        contentType: 'post',
        ideaIndex: snapshot.ideaIndex + (channel === 'google_ads' ? 1 : 0),
        brandTheme: renderCtx.brandTheme,
        logoUrl: renderCtx.brandLogoUrl,
        primaryColor: renderCtx.primaryColor,
        accentColor: renderCtx.accentColor,
        usedTemplateIds,
        baseUrl: renderCtx.routeBaseUrl,
        cta: adCta,
        grafikerMaxRetries: renderCtx.grafikerMaxRetries,
        librarySlotKey: adLibrarySlotKeyForSnapshot(snapshot),
        slotRole: role,
      });
      if (adRender?.imageUrl) {
        adImageUrl = adRender.imageUrl;
        console.log(`[auto-produce] Ad creative render (${channel}): "${adHeadline.slice(0, 40)}"`);
      }
    } catch (adRenderErr) {
      console.warn(`[auto-produce] Ad render fallback to designed_post: ${String(adRenderErr).slice(0, 80)}`);
    }

    const metadata: Record<string, unknown> = {
      auto_produced: true,
      source: 'auto-produce',
      derived_from: 'designed_post',
      ad_render_dedicated: adImageUrl !== snapshot.imageUrl,
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
      cost_usd_estimate: adImageUrl !== snapshot.imageUrl ? 0.01 : 0.001,
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

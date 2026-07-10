/**
 * Meta Ads + Google Ads — artifact detection, platform labels, publish readiness.
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactContent, parseArtifactMetadata } from '@/lib/artifact-utils';

export type AdPublishChannel = 'meta_ads' | 'google_ads';

/** Derived ad pair per mission (from designed_post — no extra LLM). */
export const MISSION_AD_PAIR_COUNTS = {
  meta: 1,
  google: 1,
  total: 2,
} as const;

/** Meta/Google clones of designed_post — same image, separate artifact rows. */
export function isDerivedAdCreative(artifact: OutputArtifact): boolean {
  const meta = parseArtifactMetadata(artifact.metadata);
  const content = parseArtifactContent(artifact.content);
  return meta.derived_from === 'designed_post'
    || content.derived_from === 'designed_post'
    || (isPaidAdArtifact(artifact) && meta.publish_priority === 'extended');
}

/** Instagram-style feed scroll — one card per idea (no ad derivative duplicates). */
export function isOrganicFeedArtifact(artifact: OutputArtifact): boolean {
  return !isDerivedAdCreative(artifact);
}

export function isPaidAdArtifact(artifact: OutputArtifact): boolean {
  const meta = parseArtifactMetadata(artifact.metadata);
  const role = String(meta.production_role ?? '');
  const pipeline = String(meta.pipeline ?? '');
  const channel = String(meta.publish_channel ?? '');
  return role === 'paid_ad_creative'
    || role === 'paid_ad_google_creative'
    || pipeline === 'meta_ad'
    || pipeline === 'google_ad'
    || channel === 'meta_ads'
    || channel === 'google_ads'
    || meta.ad_creative === true;
}

export function adChannelFromArtifact(artifact: OutputArtifact): AdPublishChannel | null {
  const meta = parseArtifactMetadata(artifact.metadata);
  const channel = String(meta.publish_channel ?? '').trim();
  if (channel === 'google_ads' || meta.ad_platform === 'google_ads') return 'google_ads';
  if (channel === 'meta_ads' || meta.ad_platform === 'meta_ads') return 'meta_ads';
  const role = String(meta.production_role ?? '');
  if (role === 'paid_ad_google_creative' || meta.pipeline === 'google_ad') return 'google_ads';
  if (role === 'paid_ad_creative' || meta.pipeline === 'meta_ad' || meta.ad_creative === true) {
    return 'meta_ads';
  }
  return null;
}

export function adPlatformLabel(channel: AdPublishChannel | null | undefined): string {
  if (channel === 'google_ads') return 'Google Ads';
  if (channel === 'meta_ads') return 'Meta Ads';
  return 'Reklam';
}

export function adPlatformShortLabel(channel: AdPublishChannel | null | undefined): string {
  if (channel === 'google_ads') return 'Google';
  if (channel === 'meta_ads') return 'Meta';
  return 'Reklam';
}

export function adPublishReady(meta: Record<string, unknown>, channel: AdPublishChannel): boolean {
  if (channel === 'meta_ads') return meta.meta_ads_ready === true;
  if (channel === 'google_ads') return meta.google_ads_ready === true;
  return false;
}

/** Weekly + campaign missions get Meta+Google ad derivatives from designed_post. */
export function shouldDeriveWeeklyAdPair(
  missionType: string | null | undefined,
): boolean {
  const t = String(missionType ?? 'weekly_content').trim();
  return t === 'weekly_content' || t === 'campaign' || t === 'event' || t === 'ads_focus';
}

export function adSlotRoleForChannel(channel: AdPublishChannel): string {
  return channel === 'google_ads' ? 'paid_ad_google_creative' : 'paid_ad_creative';
}

export function adPipelineForChannel(channel: AdPublishChannel): string {
  return 'fal_design';
}

/**
 * Fal.ai ad creative prompts — Meta Ads + Google Ads (multi-tenant, sector-driven).
 */
import type { ProductionAssignment } from './mission-production-manifest';
import type { AdPublishChannel } from './ad-publish-utils';

export function isPaidAdProductionSlot(
  assignment: Pick<ProductionAssignment, 'slot_role' | 'pipeline'>,
): boolean {
  return assignment.slot_role === 'paid_ad_creative'
    || assignment.slot_role === 'paid_ad_google_creative'
    || assignment.pipeline === 'meta_ad'
    || assignment.pipeline === 'google_ad';
}

export function resolveAdChannelFromAssignment(
  assignment: Pick<ProductionAssignment, 'slot_role' | 'publish_channel'>,
): AdPublishChannel | null {
  if (
    assignment.slot_role === 'paid_ad_google_creative'
    || assignment.publish_channel === 'google_ads'
  ) {
    return 'google_ads';
  }
  if (
    assignment.slot_role === 'paid_ad_creative'
    || assignment.publish_channel === 'meta_ads'
  ) {
    return 'meta_ads';
  }
  return null;
}

export function adHeadlineCharLimit(channel: AdPublishChannel): number {
  return channel === 'google_ads' ? 30 : 40;
}

export function resolveFalAdCreativeDirectives(channel: AdPublishChannel): string[] {
  if (channel === 'google_ads') {
    return [
      'GOOGLE ADS PAID CREATIVE — this image is a Google Ads display / Performance Max visual asset.',
      'Design for policy-safe paid search/display: high contrast readable headline (max 30 chars on-image), minimal clutter, strong focal point.',
      'Composition must survive square and landscape crops; keep logo and CTA in safe zones.',
      'Use the grounded gallery photo as the hero — do not replace with stock or AI-generated scenery.',
      'No fake Google UI chrome, no misleading superlatives, no before/after medical claims.',
    ];
  }
  return [
    'META ADS PAID CREATIVE — this image is a Meta (Facebook/Instagram) paid social ad unit.',
    'Scroll-stopping feed placement: bold headline hierarchy (max 40 chars on-image), clear CTA zone, brand logo safe area.',
    'Use the grounded gallery photo as the hero — authentic venue/product, not generic stock.',
    '4:5 vertical safe for Feed; typography must stay legible on mobile at small size.',
    'No fake Instagram/Facebook UI, no engagement bait, policy-safe promotional tone.',
  ];
}

export function resolveFalAdDesignHint(channel: AdPublishChannel): string {
  return channel === 'google_ads'
    ? 'google_ads_display_creative'
    : 'meta_ads_feed_creative';
}

import { describe, expect, it } from 'vitest';
import {
  adHeadlineCharLimit,
  isPaidAdProductionSlot,
  resolveAdChannelFromAssignment,
  resolveFalAdCreativeDirectives,
} from '@/lib/fal-ad-creative-prompt';
import {
  applyMissionFalAdAssignment,
  shouldApplyMissionFalAd,
} from '@/lib/mission-fal-ad';
import { shouldRenderRemotionStory } from '@/lib/production-pipeline-router';

describe('fal-ad-creative-prompt', () => {
  it('detects paid ad production slots', () => {
    expect(isPaidAdProductionSlot({ slot_role: 'paid_ad_creative', pipeline: 'fal_design' })).toBe(true);
    expect(isPaidAdProductionSlot({ slot_role: 'organic_post', pipeline: 'gallery_photo' })).toBe(false);
  });

  it('resolves Meta vs Google channel from slot role', () => {
    expect(
      resolveAdChannelFromAssignment({ slot_role: 'paid_ad_google_creative', publish_channel: 'google_ads' }),
    ).toBe('google_ads');
    expect(
      resolveAdChannelFromAssignment({ slot_role: 'paid_ad_creative', publish_channel: 'meta_ads' }),
    ).toBe('meta_ads');
  });

  it('uses platform-specific headline limits', () => {
    expect(adHeadlineCharLimit('google_ads')).toBe(30);
    expect(adHeadlineCharLimit('meta_ads')).toBe(40);
  });

  it('includes platform labels in fal directives', () => {
    const meta = resolveFalAdCreativeDirectives('meta_ads').join(' ');
    const google = resolveFalAdCreativeDirectives('google_ads').join(' ');
    expect(meta).toMatch(/META ADS/i);
    expect(google).toMatch(/GOOGLE ADS/i);
  });
});

describe('mission-fal-ad assignment', () => {
  it('rewrites paid ad slots to fal_design pipeline', () => {
    const out = applyMissionFalAdAssignment({
      idea_index: 0,
      slot_role: 'paid_ad_google_creative',
      pipeline: 'google_ad',
      publish_channel: 'google_ads',
      rationale: 'seed',
      copy_bundle_id: 'week',
    });
    expect(out.pipeline).toBe('fal_design');
    expect(out.fal_design_hint).toBe('google_ads_display_creative');
    expect(shouldApplyMissionFalAd(out)).toBe(true);
  });

  it('does not route default paid ad slots to Remotion story', () => {
    expect(
      shouldRenderRemotionStory({
        idea_index: 0,
        slot_role: 'paid_ad_creative',
        pipeline: 'fal_design',
        publish_channel: 'meta_ads',
        rationale: 'test',
        copy_bundle_id: 'week',
      }),
    ).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyVideoTierScopeToMontageStrategy,
  isVideoTierScopeActive,
  resolveFalReelMotionAttemptBudget,
} from '@/lib/video-tier-scope';
import { resolveReelMontageStrategy } from '@/lib/reel-multi-production';

describe('video-tier-scope', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ['VIDEO_TIER_SCOPE', 'AI_MODEL_TIER']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ['VIDEO_TIER_SCOPE', 'AI_MODEL_TIER']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.restoreAllMocks();
  });

  it('scopes non-premium when flag defaults on', () => {
    expect(isVideoTierScopeActive('agency')).toBe(true);
    expect(isVideoTierScopeActive('economy')).toBe(true);
    expect(isVideoTierScopeActive('premium')).toBe(false);
  });

  it('opt-out disables scope', () => {
    process.env.VIDEO_TIER_SCOPE = 'false';
    expect(isVideoTierScopeActive('agency')).toBe(false);
    expect(applyVideoTierScopeToMontageStrategy('sequential', 'agency')).toBe('sequential');
  });

  it('collapses montage to single for agency', () => {
    expect(applyVideoTierScopeToMontageStrategy('sequential', 'agency')).toBe('single');
    expect(applyVideoTierScopeToMontageStrategy('multi_ref', 'agency')).toBe('single');
    expect(applyVideoTierScopeToMontageStrategy('sequential', 'premium')).toBe('sequential');
  });

  it('caps reel motion attempts for scoped tiers', () => {
    expect(resolveFalReelMotionAttemptBudget('fal_reel', 3, 'agency')).toBe(1);
    expect(resolveFalReelMotionAttemptBudget('fal_reel', 3, 'premium')).toBe(3);
    expect(resolveFalReelMotionAttemptBudget('fal_story', 3, 'agency')).toBe(1);
  });

  it('resolveReelMontageStrategy honors VIDEO_TIER_SCOPE', () => {
    expect(resolveReelMontageStrategy({
      photoCount: 3,
      transitionStyle: 'montage',
      productionTier: 'agency',
    })).toBe('single');

    process.env.VIDEO_TIER_SCOPE = 'false';
    expect(resolveReelMontageStrategy({
      photoCount: 3,
      transitionStyle: 'montage',
      productionTier: 'agency',
    })).toBe('sequential');
  });
});

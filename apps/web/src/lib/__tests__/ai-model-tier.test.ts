import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AI_MODEL_PROFILES,
  getAiModelProfile,
  resolveAiModelTier,
  tierFromPackageSlug,
} from '@/lib/ai-model-tier';

const TOUCHED = ['AI_MODEL_TIER'] as const;

describe('ai-model-tier', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of TOUCHED) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of TOUCHED) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('defaults to starter when no env or package hint', () => {
    expect(resolveAiModelTier()).toBe('starter');
    expect(getAiModelProfile().falImageModel).toBe('fal-ai/flux/schnell');
    expect(getAiModelProfile().preferFalDesignedPosts).toBe(true);
  });

  it('maps package slugs to tiers', () => {
    expect(tierFromPackageSlug('starter')).toBe('starter');
    expect(tierFromPackageSlug('studio')).toBe('starter');
    expect(tierFromPackageSlug('growth')).toBe('agency');
    expect(tierFromPackageSlug('signature')).toBe('premium');
  });

  it('honors AI_MODEL_TIER env override', () => {
    process.env.AI_MODEL_TIER = 'premium';
    expect(resolveAiModelTier()).toBe('premium');
    expect(getAiModelProfile().chatCreative).toBe('gpt-4o');
  });

  it('maps economy alias to starter', () => {
    process.env.AI_MODEL_TIER = 'economy';
    expect(resolveAiModelTier()).toBe('starter');
  });

  it('starter profile uses mini + medium gpt-image + flux schnell', () => {
    const p = AI_MODEL_PROFILES.starter;
    expect(p.chatStandard).toBe('gpt-4o-mini');
    expect(p.chatCreative).toBe('gpt-4o-mini');
    expect(p.imageOpenAiQuality).toBe('medium');
    expect(p.falIdeogramModel).toBe('ideogram/v4');
  });
});

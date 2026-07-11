/**
 * Tests for the server-side configuration registry.
 * Verifies lazy reads, defaults, URL normalization, and required-var semantics.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { serverConfig, requireEnv } from '@/lib/server-config';

const TOUCHED = [
  'REDIS_URL',
  'CREW_BACKEND_URL',
  'INTERNAL_API_KEY',
  'NEXUS_API_URL',
  'NEXT_PUBLIC_API_URL',
  'BACKEND_ORIGIN',
  'META_APP_ID',
  'PIXABAY_API_KEY',
  'CLOUDFLARE_ACCOUNT_ID',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'OPENAI_API_KEY',
  'FAL_API_KEY',
  'CREATOMATE_API_KEY',
  'SMART_AGENCY_IMAGE_PROVIDER',
  'SMART_AGENCY_IMAGE_MODEL',
  'OPENAI_IMAGE_MODEL',
  'SMART_AGENCY_IMAGE_QUALITY',
  'FAL_IMAGE_MODEL',
  'AI_MODEL_TIER',
  'PREFER_FAL_DESIGNED_POSTS',
  'SMART_AGENCY_IMAGE_EXPAND_SCENE',
  'SMART_AGENCY_IMAGE_EXPAND_MODEL',
  'REMOTION_GLOBAL_MAX_CONCURRENT_RENDERS',
  'GRAFIKER_LITE',
  'CD_LITE',
  'AUTO_PRODUCE_ENABLE',
  'AUTO_PRODUCE_GALLERY_ONLY',
  'AUTO_PRODUCE_MAX_DAILY',
  'MISSION_AUTO_PRODUCE_MAX_PER_RUN',
  'AUTO_PRODUCE_MAX_REELS_DAILY',
  'AUTO_PRODUCE_DAILY_BUDGET_USD',
  'AD_REUSE_DESIGNED_POST_STILL',
  'STORY_MOTION_PLATES_ENABLED',
  'STORY_TYPOGRAPHY_ENABLED',
  'SKIP_ENHANCE_FOR_REMOTION_GRADE',
  'CAROUSEL_HERO_ENHANCE_ONLY',
  'VIDEO_TIER_SCOPE',
] as const;

describe('serverConfig', () => {
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

  describe('redis', () => {
    it('is disabled when REDIS_URL is unset', () => {
      expect(serverConfig.redis.enabled).toBe(false);
      expect(serverConfig.redis.url).toBeUndefined();
    });

    it('reads REDIS_URL lazily', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      expect(serverConfig.redis.enabled).toBe(true);
      expect(serverConfig.redis.url).toBe('redis://localhost:6379');
    });

    it('treats blank values as unset', () => {
      process.env.REDIS_URL = '   ';
      expect(serverConfig.redis.enabled).toBe(false);
    });
  });

  describe('crewBackend.baseUrl', () => {
    it('defaults to local IPv4 loopback', () => {
      expect(serverConfig.crewBackend.baseUrl).toBe('http://127.0.0.1:8000');
    });

    it('rewrites localhost to 127.0.0.1 and strips trailing slash', () => {
      process.env.CREW_BACKEND_URL = 'http://localhost:8000/';
      expect(serverConfig.crewBackend.baseUrl).toBe('http://127.0.0.1:8000');
    });

    it('adds a scheme when missing', () => {
      process.env.CREW_BACKEND_URL = 'crew.internal:9000';
      expect(serverConfig.crewBackend.baseUrl).toBe('http://crew.internal:9000');
    });
  });

  describe('internal.apiKey', () => {
    it('falls back to the dev key', () => {
      expect(serverConfig.internal.apiKey).toBe('smartagency-internal-dev-key');
    });

    it('reads INTERNAL_API_KEY when set', () => {
      process.env.INTERNAL_API_KEY = 'prod-secret';
      expect(serverConfig.internal.apiKey).toBe('prod-secret');
    });
  });

  describe('r2', () => {
    it('applies bucket default and derives endpoint from account id', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acct123';
      expect(serverConfig.r2.bucket).toBe('smartagency-media');
      expect(serverConfig.r2.endpoint).toBe('https://acct123.r2.cloudflarestorage.com');
    });

    it('prefers an explicit endpoint', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acct123';
      process.env.R2_ENDPOINT = 'https://custom.example.com';
      expect(serverConfig.r2.endpoint).toBe('https://custom.example.com');
    });

    it('reports configured only when all credentials are present', () => {
      expect(serverConfig.r2.configured).toBe(false);
      process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
      process.env.R2_ACCESS_KEY_ID = 'k';
      expect(serverConfig.r2.configured).toBe(false);
      process.env.R2_SECRET_ACCESS_KEY = 's';
      expect(serverConfig.r2.configured).toBe(true);
    });

    it('requireCredentials throws when missing', () => {
      expect(() => serverConfig.r2.requireCredentials()).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
    });

    it('bucketConfigured gates on R2_BUCKET_NAME presence (not the default)', () => {
      // bucket has a default, so it is always truthy; bucketConfigured must not be.
      expect(serverConfig.r2.bucket).toBe('smartagency-media');
      expect(serverConfig.r2.bucketConfigured).toBe(false);
      process.env.R2_BUCKET_NAME = 'my-bucket';
      expect(serverConfig.r2.bucketConfigured).toBe(true);
    });

    it('requireCredentials returns values when present', () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'a';
      process.env.R2_ACCESS_KEY_ID = 'k';
      process.env.R2_SECRET_ACCESS_KEY = 's';
      expect(serverConfig.r2.requireCredentials()).toEqual({
        accountId: 'a',
        accessKeyId: 'k',
        secretAccessKey: 's',
      });
    });
  });

  describe('ai providers', () => {
    it('openai is unconfigured by default and configured when set', () => {
      expect(serverConfig.openai.configured).toBe(false);
      expect(serverConfig.openai.apiKey).toBeUndefined();
      process.env.OPENAI_API_KEY = 'sk-test';
      expect(serverConfig.openai.configured).toBe(true);
      expect(serverConfig.openai.requireApiKey()).toBe('sk-test');
    });

    it('fal is unconfigured by default and configured when set', () => {
      expect(serverConfig.fal.configured).toBe(false);
      process.env.FAL_API_KEY = 'fal-test';
      expect(serverConfig.fal.configured).toBe(true);
      expect(serverConfig.fal.apiKey).toBe('fal-test');
    });

    it('openai.requireApiKey throws when missing', () => {
      expect(() => serverConfig.openai.requireApiKey()).toThrow(/OPENAI_API_KEY/);
    });

    it('creatomate is unconfigured by default and configured when set', () => {
      expect(serverConfig.creatomate.configured).toBe(false);
      expect(serverConfig.creatomate.apiKey).toBeUndefined();
      process.env.CREATOMATE_API_KEY = 'creat-test';
      expect(serverConfig.creatomate.configured).toBe(true);
      expect(serverConfig.creatomate.apiKey).toBe('creat-test');
    });

    it('nexus.baseUrl defaults to local Nexus and honors NEXUS_API_URL', () => {
      expect(serverConfig.nexus.baseUrl).toBe('http://127.0.0.1:5050');
      process.env.NEXUS_API_URL = 'https://api.example.com/';
      expect(serverConfig.nexus.baseUrl).toBe('https://api.example.com');
    });

    it('nexus.baseUrl falls back to NEXT_PUBLIC_API_URL', () => {
      process.env.NEXT_PUBLIC_API_URL = 'https://public.example.com';
      expect(serverConfig.nexus.baseUrl).toBe('https://public.example.com');
    });

    it('meta.appId and pixabay.apiKey are undefined by default and read their env vars', () => {
      expect(serverConfig.meta.appId).toBeUndefined();
      expect(serverConfig.pixabay.apiKey).toBeUndefined();
      process.env.META_APP_ID = 'meta-123';
      process.env.PIXABAY_API_KEY = 'pix-456';
      expect(serverConfig.meta.appId).toBe('meta-123');
      expect(serverConfig.pixabay.apiKey).toBe('pix-456');
    });

    it('imageProvider defaults to flux and honors override', () => {
      expect(serverConfig.imageProvider).toBe('flux');
      process.env.SMART_AGENCY_IMAGE_PROVIDER = 'openai';
      expect(serverConfig.imageProvider).toBe('openai');
    });
  });

  describe('imageGen', () => {
    it('applies starter-tier defaults', () => {
      expect(serverConfig.ai.tier).toBe('starter');
      expect(serverConfig.imageGen.model).toBe('gpt-image-1');
      expect(serverConfig.imageGen.editModel).toBe('gpt-image-1');
      expect(serverConfig.imageGen.quality).toBe('medium');
      expect(serverConfig.imageGen.falModel).toBe('fal-ai/flux/schnell');
      expect(serverConfig.imageGen.preferFalDesignedPosts).toBe(true);
      expect(serverConfig.imageGen.expandScene).toBe(false);
      expect(serverConfig.imageGen.expandModel).toBe('gpt-4o-mini');
    });

    it('premium tier via AI_MODEL_TIER env', () => {
      process.env.AI_MODEL_TIER = 'premium';
      expect(serverConfig.ai.tier).toBe('premium');
      expect(serverConfig.imageGen.model).toBe('gpt-image-2');
      expect(serverConfig.imageGen.quality).toBe('high');
      expect(serverConfig.imageGen.falModel).toBe('fal-ai/flux-pro/v1.1-ultra');
    });

    it('model prefers SMART_AGENCY_IMAGE_MODEL then OPENAI_IMAGE_MODEL', () => {
      process.env.OPENAI_IMAGE_MODEL = 'gpt-image-1';
      expect(serverConfig.imageGen.model).toBe('gpt-image-1');
      // editModel ignores OPENAI_IMAGE_MODEL (matches legacy behavior)
      expect(serverConfig.imageGen.editModel).toBe('gpt-image-1');
      process.env.SMART_AGENCY_IMAGE_MODEL = 'gpt-image-custom';
      expect(serverConfig.imageGen.model).toBe('gpt-image-custom');
      expect(serverConfig.imageGen.editModel).toBe('gpt-image-custom');
    });

    it('expandScene is true only for the literal "true"', () => {
      process.env.SMART_AGENCY_IMAGE_EXPAND_SCENE = '1';
      expect(serverConfig.imageGen.expandScene).toBe(false);
      process.env.SMART_AGENCY_IMAGE_EXPAND_SCENE = 'true';
      expect(serverConfig.imageGen.expandScene).toBe(true);
    });
  });

  describe('remotion', () => {
    it('defaults the global render cap to 8', () => {
      expect(serverConfig.remotion.globalMaxConcurrentRenders).toBe(8);
    });

    it('honors and floors the global render cap at 1', () => {
      process.env.REMOTION_GLOBAL_MAX_CONCURRENT_RENDERS = '16';
      expect(serverConfig.remotion.globalMaxConcurrentRenders).toBe(16);
      process.env.REMOTION_GLOBAL_MAX_CONCURRENT_RENDERS = '0';
      expect(serverConfig.remotion.globalMaxConcurrentRenders).toBe(1);
    });

    it('lite flags are off by default and on for "true"', () => {
      expect(serverConfig.remotion.grafikerLite).toBe(false);
      expect(serverConfig.remotion.cdLite).toBe(false);
      process.env.GRAFIKER_LITE = 'true';
      process.env.CD_LITE = 'true';
      expect(serverConfig.remotion.grafikerLite).toBe(true);
      expect(serverConfig.remotion.cdLite).toBe(true);
    });
  });

  describe('autoProduce', () => {
    it('applies defaults (enabled, gallery-only)', () => {
      expect(serverConfig.autoProduce.enabled).toBe(true);
      expect(serverConfig.autoProduce.galleryOnly).toBe(true);
      expect(serverConfig.autoProduce.maxDaily).toBe(200);
      expect(serverConfig.autoProduce.maxPerRun).toBe(24);
      expect(serverConfig.autoProduce.maxReelsDaily).toBe(15);
      expect(serverConfig.autoProduce.dailyBudgetUsd).toBe(50);
      expect(serverConfig.autoProduce.reuseDesignedPostStill).toBe(false);
    });

    it('toggles off only via the literal "false"', () => {
      process.env.AUTO_PRODUCE_ENABLE = 'false';
      process.env.AUTO_PRODUCE_GALLERY_ONLY = 'false';
      expect(serverConfig.autoProduce.enabled).toBe(false);
      expect(serverConfig.autoProduce.galleryOnly).toBe(false);
    });

    it('parses numeric overrides', () => {
      process.env.AUTO_PRODUCE_MAX_DAILY = '300';
      process.env.AUTO_PRODUCE_DAILY_BUDGET_USD = '12.5';
      expect(serverConfig.autoProduce.maxDaily).toBe(300);
      expect(serverConfig.autoProduce.dailyBudgetUsd).toBe(12.5);
    });
  });

  describe('productionFlags', () => {
    it('story flags default on, enhance flags default off', () => {
      expect(serverConfig.productionFlags.storyMotionPlatesEnabled).toBe(true);
      expect(serverConfig.productionFlags.storyTypographyEnabled).toBe(true);
      expect(serverConfig.productionFlags.skipEnhanceForRemotionGrade).toBe(false);
      expect(serverConfig.productionFlags.carouselHeroEnhanceOnly).toBe(false);
      expect(serverConfig.productionFlags.videoTierScope).toBe(false);
    });

    it('honors explicit toggles', () => {
      process.env.STORY_MOTION_PLATES_ENABLED = 'false';
      process.env.VIDEO_TIER_SCOPE = 'true';
      expect(serverConfig.productionFlags.storyMotionPlatesEnabled).toBe(false);
      expect(serverConfig.productionFlags.videoTierScope).toBe(true);
    });
  });

  describe('requireEnv', () => {
    it('throws a descriptive error when absent', () => {
      expect(() => requireEnv('REDIS_URL')).toThrow(/Missing required environment variable: REDIS_URL/);
    });
  });
});

/**
 * Server-side configuration registry.
 *
 * Single, typed access point for environment-driven configuration used by the
 * Next.js server runtime (BFF routes, workers, infra clients). Centralizing this
 * here replaces scattered `process.env.X ?? default` / `process.env.X!` reads so
 * that defaults, normalization, and "required" semantics live in one place.
 *
 * SERVER ONLY — do not import from client components. Values are read lazily via
 * getters so the registry picks up the runtime environment (important for Next)
 * and never throws at import time.
 */

import { resolveServerApiBaseUrl } from '@/lib/backend-origin';
import {
  getAiModelProfile,
  resolveAiModelTier,
  type AiModelProfile,
  type AiModelTier,
  type ChatModelKind,
} from '@/lib/ai-model-tier';

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Reads a required variable, throwing a clear, actionable error when absent. */
export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(
      `[server-config] Missing required environment variable: ${name}. ` +
        `Set it in the deployment environment or .env.local.`,
    );
  }
  return value;
}

function normalizeBaseUrl(raw: string): string {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return withScheme.replace(/\/$/, '');
}

export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export const serverConfig = {
  redis: {
    get url(): string | undefined {
      return readEnv('REDIS_URL');
    },
    get enabled(): boolean {
      return Boolean(readEnv('REDIS_URL'));
    },
  },

  crewBackend: {
    /**
     * Python crew backend base URL for BFF routes. Prefers 127.0.0.1 over
     * localhost — on macOS localhost can resolve to ::1 while uvicorn binds IPv4.
     */
    get baseUrl(): string {
      const raw = readEnv('CREW_BACKEND_URL') ?? 'http://127.0.0.1:8000';
      return normalizeBaseUrl(raw).replace('://localhost', '://127.0.0.1');
    },
  },

  internal: {
    /** Shared key for the .NET/Next ↔ Python internal contract. */
    get apiKey(): string {
      return readEnv('INTERNAL_API_KEY') ?? 'smartagency-internal-dev-key';
    },
  },

  openai: {
    get apiKey(): string | undefined {
      return readEnv('OPENAI_API_KEY');
    },
    get configured(): boolean {
      return Boolean(readEnv('OPENAI_API_KEY'));
    },
    /** Returns the OpenAI key or throws — use after a `configured` guard. */
    requireApiKey(): string {
      return requireEnv('OPENAI_API_KEY');
    },
  },

  fal: {
    get apiKey(): string | undefined {
      return readEnv('FAL_API_KEY');
    },
    get configured(): boolean {
      return Boolean(readEnv('FAL_API_KEY'));
    },
    requireApiKey(): string {
      return requireEnv('FAL_API_KEY');
    },
  },

  creatomate: {
    get apiKey(): string | undefined {
      return readEnv('CREATOMATE_API_KEY');
    },
    get configured(): boolean {
      return Boolean(readEnv('CREATOMATE_API_KEY'));
    },
  },

  /** .NET Nexus customer API origin for server-side route handlers. */
  nexus: {
    /**
     * Canonical server-side Nexus REST base. Delegates to the single resolver
     * (NEXUS_API_URL → NEXT_PUBLIC_API_URL → BACKEND_ORIGIN, normalized).
     */
    get baseUrl(): string {
      return resolveServerApiBaseUrl();
    },
  },

  /** Meta (Facebook/Instagram) Graph API app config. */
  meta: {
    get appId(): string | undefined {
      return readEnv('META_APP_ID');
    },
  },

  /** Pixabay stock media API key (music tracks). */
  pixabay: {
    get apiKey(): string | undefined {
      return readEnv('PIXABAY_API_KEY');
    },
  },

  /** Default image generation provider (flux via fal, or openai). */
  get imageProvider(): string {
    const override = readEnv('SMART_AGENCY_IMAGE_PROVIDER');
    if (override) return override;
    return this.ai.profile.imageProvider;
  },

  /**
   * Tier-aware AI model profile (Starter / Agency / Premium).
   * Set AI_MODEL_TIER=starter|agency|premium for deployment-wide override.
   */
  ai: {
    get tier(): AiModelTier {
      return resolveAiModelTier();
    },
    get profile(): AiModelProfile {
      return getAiModelProfile(this.tier);
    },
    chatModel(kind: ChatModelKind = 'standard'): string {
      const p = this.profile;
      if (kind === 'creative') return p.chatCreative;
      if (kind === 'hero') return p.chatHero;
      return p.chatStandard;
    },
    profileFor(input?: {
      packageSlug?: string | null;
      productionTier?: import('@/lib/production-profile').ProductionProfileTier | null;
    }): AiModelProfile {
      return getAiModelProfile(resolveAiModelTier(input));
    },
  },

  /** Image generation model/quality tuning (OpenAI gpt-image + fal flux). */
  imageGen: {
    /** OpenAI generate model. */
    get model(): string {
      return readEnv('SMART_AGENCY_IMAGE_MODEL')
        ?? readEnv('OPENAI_IMAGE_MODEL')
        ?? serverConfig.ai.profile.imageOpenAiModel;
    },
    /** OpenAI edit/enhance model (no OPENAI_IMAGE_MODEL fallback, matches legacy). */
    get editModel(): string {
      return readEnv('SMART_AGENCY_IMAGE_MODEL') ?? serverConfig.ai.profile.imageOpenAiModel;
    },
    get quality(): string {
      return readEnv('SMART_AGENCY_IMAGE_QUALITY') ?? serverConfig.ai.profile.imageOpenAiQuality;
    },
    get falModel(): string {
      return readEnv('FAL_IMAGE_MODEL') ?? serverConfig.ai.profile.falImageModel;
    },
    get falTypographyFallback(): string {
      return readEnv('FAL_TYPOGRAPHY_FALLBACK_MODEL') ?? serverConfig.ai.profile.falTypographyFallback;
    },
    get falIdeogramModel(): string {
      return readEnv('FAL_IDEOGRAM_MODEL') ?? serverConfig.ai.profile.falIdeogramModel;
    },
    get preferFalDesignedPosts(): boolean {
      if (readEnv('PREFER_FAL_DESIGNED_POSTS') === 'true') return true;
      if (readEnv('PREFER_FAL_DESIGNED_POSTS') === 'false') return false;
      return serverConfig.ai.profile.preferFalDesignedPosts;
    },
    /** When true, expand the scene prompt via a small chat model before image gen. */
    get expandScene(): boolean {
      return readEnv('SMART_AGENCY_IMAGE_EXPAND_SCENE') === 'true';
    },
    get expandModel(): string {
      return readEnv('SMART_AGENCY_IMAGE_EXPAND_MODEL') ?? 'gpt-4o-mini';
    },
  },

  /** Auto-produce budget / operator ceilings (package limits apply first). */
  autoProduce: {
    /** Master switch — disable with AUTO_PRODUCE_ENABLE=false. */
    get enabled(): boolean {
      return readEnv('AUTO_PRODUCE_ENABLE') !== 'false';
    },
    /** Gallery-only mode — disable with AUTO_PRODUCE_GALLERY_ONLY=false. */
    get galleryOnly(): boolean {
      return readEnv('AUTO_PRODUCE_GALLERY_ONLY') !== 'false';
    },
    get maxDaily(): number {
      return parseInt(readEnv('AUTO_PRODUCE_MAX_DAILY') ?? '200', 10);
    },
    get maxPerRun(): number {
      return parseInt(readEnv('MISSION_AUTO_PRODUCE_MAX_PER_RUN') ?? '24', 10);
    },
    get maxReelsDaily(): number {
      return parseInt(readEnv('AUTO_PRODUCE_MAX_REELS_DAILY') ?? '15', 10);
    },
    get dailyBudgetUsd(): number {
      return parseFloat(readEnv('AUTO_PRODUCE_DAILY_BUDGET_USD') ?? '50');
    },
    /** Reuse the designed-post still for ad derivation. */
    get reuseDesignedPostStill(): boolean {
      return readEnv('AD_REUSE_DESIGNED_POST_STILL') === 'true';
    },
  },

  /** Misc production/story feature flags. */
  productionFlags: {
    /** Story motion plates on by default. */
    get storyMotionPlatesEnabled(): boolean {
      return readEnv('STORY_MOTION_PLATES_ENABLED') !== 'false';
    },
    /** Story kinetic typography on by default. */
    get storyTypographyEnabled(): boolean {
      return readEnv('STORY_TYPOGRAPHY_ENABLED') !== 'false';
    },
    /** Skip designed_post background enhance when render-time grade covers it. */
    get skipEnhanceForDesignedGrade(): boolean {
      return readEnv('SKIP_ENHANCE_FOR_DESIGNED_GRADE') === 'true'
        // Legacy env name — remove after Render env vars are migrated.
        || readEnv('SKIP_ENHANCE_FOR_REMOTION_GRADE') === 'true';
    },
    get carouselHeroEnhanceOnly(): boolean {
      return readEnv('CAROUSEL_HERO_ENHANCE_ONLY') === 'true';
    },
    get videoTierScope(): boolean {
      return readEnv('VIDEO_TIER_SCOPE') === 'true';
    },
  },

  /** Local Satori typography rendering for text-heavy design slots. */
  localTypography: {
    /** Master switch — enable with LOCAL_TYPOGRAPHY_ENABLED=true (canary default off). */
    get enabled(): boolean {
      return readEnv('LOCAL_TYPOGRAPHY_ENABLED') === 'true';
    },
  },

  r2: {
    get accountId(): string | undefined {
      return readEnv('CLOUDFLARE_ACCOUNT_ID');
    },
    get bucket(): string {
      return readEnv('R2_BUCKET_NAME') ?? 'smartagency-media';
    },
    /** True only when R2_BUCKET_NAME is explicitly set (presence gate, no default). */
    get bucketConfigured(): boolean {
      return Boolean(readEnv('R2_BUCKET_NAME'));
    },
    get publicUrl(): string {
      return readEnv('R2_PUBLIC_URL') ?? '';
    },
    get endpoint(): string {
      const explicit = readEnv('R2_ENDPOINT');
      if (explicit) return explicit;
      const accountId = readEnv('CLOUDFLARE_ACCOUNT_ID');
      return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '';
    },
    get configured(): boolean {
      return Boolean(
        readEnv('CLOUDFLARE_ACCOUNT_ID') &&
          readEnv('R2_ACCESS_KEY_ID') &&
          readEnv('R2_SECRET_ACCESS_KEY'),
      );
    },
    /** Returns required R2 credentials or throws with a clear message. */
    requireCredentials(): R2Credentials {
      return {
        accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      };
    },
  },
} as const;

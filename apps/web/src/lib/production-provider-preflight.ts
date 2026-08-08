/**
 * Image-provider preflight + billing circuit breaker for auto-produce.
 *
 * Server-oriented: may touch Redis. Do not import from client components.
 *
 * Circuit-open status strings must NOT re-arm the circuit (poison pill).
 */

import {
  clearOpenAiQuotaBlockedForTests,
  isOpenAiQuotaBlocked,
  markOpenAiQuotaBlocked,
  syncOpenAiQuotaBlockedUntil,
} from '@/lib/openai-error-utils';
import { serverConfig } from '@/lib/server-config';

const FAL_BILLING_COOLDOWN_MS = 30 * 60 * 1000;
const REDIS_FAL_KEY = 'prod:provider_circuit:fal';
const REDIS_OPENAI_KEY = 'prod:provider_circuit:openai';

let falBillingBlockedUntil = 0;

export type ProductionProviderPreflightCode =
  | 'image_provider_not_configured'
  | 'provider_billing_circuit_open';

export type ProductionProviderPreflight = {
  ok: boolean;
  code?: ProductionProviderPreflightCode;
  reason?: string;
  falDegraded?: boolean;
  providers: {
    imageProvider: string;
    openaiConfigured: boolean;
    falConfigured: boolean;
    openaiCircuitOpen: boolean;
    falCircuitOpen: boolean;
  };
};

async function redisSetPx(key: string, ms: number): Promise<void> {
  try {
    const { getRedisClient } = await import('@/lib/redis-client');
    const r = getRedisClient();
    if (!r || ms <= 0) return;
    await r.set(key, '1', 'PX', ms);
  } catch {
    /* best-effort */
  }
}

async function redisDel(...keys: string[]): Promise<void> {
  try {
    const { getRedisClient } = await import('@/lib/redis-client');
    const r = getRedisClient();
    if (!r || keys.length === 0) return;
    await r.del(...keys);
  } catch {
    /* best-effort */
  }
}

export function markFalBillingBlocked(cooldownMs = FAL_BILLING_COOLDOWN_MS): void {
  const ms = Math.max(1_000, cooldownMs);
  falBillingBlockedUntil = Date.now() + ms;
  void redisSetPx(REDIS_FAL_KEY, ms);
}

export function isFalBillingBlocked(): boolean {
  return Date.now() < falBillingBlockedUntil;
}

export function clearFalBillingCircuitForTests(): void {
  falBillingBlockedUntil = 0;
  void redisDel(REDIS_FAL_KEY);
}

export function clearProductionProviderBillingCircuits(): void {
  falBillingBlockedUntil = 0;
  clearOpenAiQuotaBlockedForTests();
  void redisDel(REDIS_FAL_KEY, REDIS_OPENAI_KEY);
}

/** Pull Redis TTLs into local clocks (call at produce start). */
export async function refreshProductionProviderCircuitsFromRedis(): Promise<void> {
  try {
    const { getRedisClient } = await import('@/lib/redis-client');
    const r = getRedisClient();
    if (!r) return;
    const [falTtl, oaTtl] = await Promise.all([
      r.pttl(REDIS_FAL_KEY),
      r.pttl(REDIS_OPENAI_KEY),
    ]);
    if (falTtl > 0) falBillingBlockedUntil = Math.max(falBillingBlockedUntil, Date.now() + falTtl);
    else if (falTtl === -2) falBillingBlockedUntil = 0;
    if (oaTtl > 0) syncOpenAiQuotaBlockedUntil(Date.now() + oaTtl);
    else if (oaTtl === -2) syncOpenAiQuotaBlockedUntil(0);
  } catch {
    /* best-effort */
  }
}

function isCircuitStatusMessage(lower: string): boolean {
  return (
    lower.includes('provider_billing_circuit_open')
    || lower.includes('[skip-no-fal-quota]')
    || lower.includes('billing/quota circuits are open')
    || lower.includes('billing circuit open')
  );
}

export function isProviderBillingFailureMessage(message: string): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!lower || isCircuitStatusMessage(lower)) return false;
  return (
    lower.includes('exhausted balance')
    || lower.includes('balance exhausted')
    || lower.includes('hard limit')
    || lower.includes('billing_hard_limit')
    || lower.includes('insufficient_quota')
    || lower.includes('exceeded your current quota')
    || lower.includes('image generation provider billing limit')
    || lower.includes('provider billing limit reached')
    || lower.includes('fal.ai balance exhausted')
  );
}

export function recordProductionProviderBillingFailure(
  message: string,
): 'openai' | 'fal' | null {
  if (!isProviderBillingFailureMessage(message)) return null;
  const lower = message.toLowerCase();
  if (
    lower.includes('fal.ai')
    || lower.includes('exhausted balance')
    || lower.includes('balance exhausted')
  ) {
    markFalBillingBlocked();
    return 'fal';
  }
  markOpenAiQuotaBlocked();
  void redisSetPx(REDIS_OPENAI_KEY, FAL_BILLING_COOLDOWN_MS);
  return 'openai';
}

function primaryImageProvider(): string {
  return String(serverConfig.imageProvider ?? 'flux').toLowerCase();
}

export function getProductionProviderPreflight(): ProductionProviderPreflight {
  const imageProvider = primaryImageProvider();
  const openaiConfigured = serverConfig.openai.configured;
  const falConfigured = serverConfig.fal.configured;
  const openaiCircuitOpen = isOpenAiQuotaBlocked();
  const falCircuitOpen = isFalBillingBlocked();

  const providers = {
    imageProvider,
    openaiConfigured,
    falConfigured,
    openaiCircuitOpen,
    falCircuitOpen,
  };

  const needsFal = imageProvider === 'flux' || imageProvider === 'fal';
  const needsOpenai = imageProvider === 'openai' || imageProvider === 'gpt-image'
    || imageProvider === 'gpt-image-1' || imageProvider === 'gpt-image-2';

  if (needsFal && !falConfigured && !openaiConfigured) {
    return {
      ok: false,
      code: 'image_provider_not_configured',
      reason: 'FAL_API_KEY (and OPENAI_API_KEY fallback) missing — cannot produce images',
      providers,
    };
  }
  if (needsOpenai && !openaiConfigured && !falConfigured) {
    return {
      ok: false,
      code: 'image_provider_not_configured',
      reason: 'OPENAI_API_KEY (and FAL_API_KEY fallback) missing — cannot produce images',
      providers,
    };
  }
  if (!openaiConfigured && !falConfigured) {
    return {
      ok: false,
      code: 'image_provider_not_configured',
      reason: 'Neither OPENAI_API_KEY nor FAL_API_KEY is configured',
      providers,
    };
  }

  if (openaiCircuitOpen && falCircuitOpen) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'OpenAI and fal.ai billing/quota circuits are open — top up and retry later',
      providers,
    };
  }

  if (falCircuitOpen && openaiConfigured) {
    return {
      ok: true,
      falDegraded: true,
      reason: 'fal.ai billing circuit open — continuing with OpenAI; fal-video slots skipped',
      providers,
    };
  }

  if (openaiCircuitOpen && falConfigured) {
    return {
      ok: true,
      reason: 'OpenAI quota circuit open — continuing with fal.ai image path',
      providers,
    };
  }

  if (needsFal && falCircuitOpen && !openaiConfigured) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'fal.ai billing circuit open — top up at fal.ai/dashboard/billing',
      providers,
    };
  }
  if (needsOpenai && openaiCircuitOpen && !falConfigured) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'OpenAI quota/billing circuit open — check OpenAI billing and retry later',
      providers,
    };
  }
  if (falCircuitOpen && !openaiConfigured) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'fal.ai billing circuit open — top up at fal.ai/dashboard/billing',
      providers,
    };
  }
  if (openaiCircuitOpen && !falConfigured) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'OpenAI quota/billing circuit open — check OpenAI billing and retry later',
      providers,
    };
  }

  return { ok: true, providers };
}

export function httpStatusForProviderPreflight(
  code: ProductionProviderPreflightCode | undefined,
): number {
  if (code === 'provider_billing_circuit_open') return 402;
  return 503;
}

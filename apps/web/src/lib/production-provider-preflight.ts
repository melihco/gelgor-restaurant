/**
 * Image-provider preflight + billing circuit breaker for auto-produce.
 *
 * Prevents draining a full mission queue when fal/OpenAI keys are missing or
 * a real billing/quota failure already tripped a cooldown.
 *
 * Circuits are in-process + Redis (shared by Next web + BullMQ worker).
 * Circuit-open status strings must NOT re-arm the circuit (poison pill).
 */

import {
  clearOpenAiQuotaBlockedForTests,
  isOpenAiQuotaBlocked,
  markOpenAiQuotaBlocked,
  refreshOpenAiQuotaCircuitFromRedis,
} from '@/lib/openai-error-utils';
import { serverConfig } from '@/lib/server-config';

const FAL_BILLING_COOLDOWN_MS = 30 * 60 * 1000;
const REDIS_FAL_KEY = 'prod:provider_circuit:fal';

let falBillingBlockedUntil = 0;

export type ProductionProviderPreflightCode =
  | 'image_provider_not_configured'
  | 'provider_billing_circuit_open';

export type ProductionProviderPreflight = {
  ok: boolean;
  code?: ProductionProviderPreflightCode;
  reason?: string;
  /** Mission may continue; fal-video slots should skip until fal recovers. */
  falDegraded?: boolean;
  providers: {
    imageProvider: string;
    openaiConfigured: boolean;
    falConfigured: boolean;
    openaiCircuitOpen: boolean;
    falCircuitOpen: boolean;
  };
};

async function redisFalSetPx(ms: number): Promise<void> {
  try {
    const { getRedisClient } = await import('@/lib/redis-client');
    const r = getRedisClient();
    if (!r || ms <= 0) return;
    await r.set(REDIS_FAL_KEY, '1', 'PX', ms);
  } catch {
    /* best-effort */
  }
}

async function redisFalDel(): Promise<void> {
  try {
    const { getRedisClient } = await import('@/lib/redis-client');
    await getRedisClient()?.del(REDIS_FAL_KEY);
  } catch {
    /* best-effort */
  }
}

export function markFalBillingBlocked(cooldownMs = FAL_BILLING_COOLDOWN_MS): void {
  const ms = Math.max(1_000, cooldownMs);
  falBillingBlockedUntil = Date.now() + ms;
  void redisFalSetPx(ms);
}

export function isFalBillingBlocked(): boolean {
  return Date.now() < falBillingBlockedUntil;
}

/** Test helper — drop fal circuit without waiting for TTL. */
export function clearFalBillingCircuitForTests(): void {
  falBillingBlockedUntil = 0;
  void redisFalDel();
}

/** Clear both provider billing circuits locally + Redis (ops recovery). */
export function clearProductionProviderBillingCircuits(): void {
  falBillingBlockedUntil = 0;
  clearOpenAiQuotaBlockedForTests();
  void redisFalDel();
}

/** Pull Redis TTLs into local clocks (call at produce start). */
export async function refreshProductionProviderCircuitsFromRedis(): Promise<void> {
  await refreshOpenAiQuotaCircuitFromRedis();
  try {
    const { getRedisClient } = await import('@/lib/redis-client');
    const r = getRedisClient();
    if (!r) return;
    const ttl = await r.pttl(REDIS_FAL_KEY);
    if (ttl > 0) falBillingBlockedUntil = Math.max(falBillingBlockedUntil, Date.now() + ttl);
    else if (ttl === -2) falBillingBlockedUntil = 0;
  } catch {
    /* best-effort */
  }
}

/** Circuit status strings — never treat these as a fresh billing failure. */
function isCircuitStatusMessage(lower: string): boolean {
  return (
    lower.includes('provider_billing_circuit_open')
    || lower.includes('[skip-no-fal-quota]')
    || lower.includes('billing/quota circuits are open')
    || lower.includes('billing circuit open')
  );
}

/**
 * True only for concrete provider billing/quota exhaustion — not rate limits,
 * not our own circuit-open status strings (which contain the word "billing").
 */
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

/**
 * Trip the matching provider circuit from a slot/API error message.
 * Returns which provider tripped, or null if the message is not billing-related.
 */
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
  return 'openai';
}

function primaryImageProvider(): string {
  return String(serverConfig.imageProvider ?? 'flux').toLowerCase();
}

/**
 * Fail-loud before mission drain when keys are missing or BOTH billing circuits
 * are open. If only fal is blocked but OpenAI is configured, allow the mission
 * (posts/stories via OpenAI; fal-video slots skip per-slot).
 */
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

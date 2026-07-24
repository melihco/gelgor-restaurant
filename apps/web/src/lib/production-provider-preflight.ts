/**
 * Image-provider preflight + billing circuit breaker for auto-produce.
 *
 * Prevents draining a full mission queue when fal/OpenAI keys are missing or
 * a billing/quota failure already tripped an in-process cooldown.
 * Complements package/USD budget checks in auto-produce/budget.ts.
 */

import { isOpenAiQuotaBlocked, markOpenAiQuotaBlocked } from '@/lib/openai-error-utils';
import { serverConfig } from '@/lib/server-config';

const FAL_BILLING_COOLDOWN_MS = 30 * 60 * 1000;

let falBillingBlockedUntil = 0;

export type ProductionProviderPreflightCode =
  | 'image_provider_not_configured'
  | 'provider_billing_circuit_open';

export type ProductionProviderPreflight = {
  ok: boolean;
  code?: ProductionProviderPreflightCode;
  reason?: string;
  providers: {
    imageProvider: string;
    openaiConfigured: boolean;
    falConfigured: boolean;
    openaiCircuitOpen: boolean;
    falCircuitOpen: boolean;
  };
};

export function markFalBillingBlocked(cooldownMs = FAL_BILLING_COOLDOWN_MS): void {
  falBillingBlockedUntil = Date.now() + cooldownMs;
}

export function isFalBillingBlocked(): boolean {
  return Date.now() < falBillingBlockedUntil;
}

/** Test helper — reset fal circuit without waiting for TTL. */
export function clearFalBillingCircuitForTests(): void {
  falBillingBlockedUntil = 0;
}

export function isProviderBillingFailureMessage(message: string): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('billing')
    || lower.includes('exhausted balance')
    || lower.includes('balance exhausted')
    || lower.includes('hard limit')
    || lower.includes('insufficient_quota')
    || lower.includes('exceeded your current quota')
    || lower.includes('provider billing limit')
    || lower.includes('image generation provider billing')
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
 * Fail-loud before mission drain when keys are missing or billing circuits are open.
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

  // Prefer primary provider circuit; if both open, always block.
  if (openaiCircuitOpen && falCircuitOpen) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'OpenAI and fal.ai billing/quota circuits are open — top up and retry later',
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
  // Primary provider circuit open even when the other key exists — still fail loud
  // so we do not burn a half-mission on a dying primary path.
  if (needsFal && falCircuitOpen) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'fal.ai billing circuit open — top up at fal.ai/dashboard/billing',
      providers,
    };
  }
  if (needsOpenai && openaiCircuitOpen) {
    return {
      ok: false,
      code: 'provider_billing_circuit_open',
      reason: 'OpenAI quota/billing circuit open — check OpenAI billing and retry later',
      providers,
    };
  }
  // Non-primary: if the only configured provider's circuit is open, block.
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

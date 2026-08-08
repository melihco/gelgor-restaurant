/** Classify OpenAI errors — avoid retry loops on billing/quota exhaustion. */

export type OpenAiErrorCode = 'openai_quota_exceeded' | 'billing_hard_limit' | 'openai_error';

const QUOTA_COOLDOWN_MS = 30 * 60 * 1000;

let quotaBlockedUntil = 0;

/** In-process cooldown — skip further enhance calls in same Node process after quota hit. */
export function markOpenAiQuotaBlocked(cooldownMs = QUOTA_COOLDOWN_MS): void {
  const ms = Math.max(1_000, cooldownMs);
  quotaBlockedUntil = Date.now() + ms;
}

export function isOpenAiQuotaBlocked(): boolean {
  return Date.now() < quotaBlockedUntil;
}

/** Test/ops helper — drop OpenAI quota circuit without waiting for TTL. */
export function clearOpenAiQuotaBlockedForTests(): void {
  quotaBlockedUntil = 0;
}

/**
 * True for real quota/billing exhaustion only.
 * Generic HTTP 429 / rate_limit_exceeded must NOT trip the 30m billing circuit —
 * those are transient and often mention "billing" in OpenAI copy.
 */
export function isOpenAiQuotaOrBillingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    const s = String(err ?? '');
    return /billing_hard_limit|insufficient_quota|exceeded your current quota/i.test(s);
  }
  const e = err as { message?: string; code?: string; status?: number; error?: { code?: string; message?: string } };
  const msg = String(e.message ?? e.error?.message ?? '');
  const code = String(e.code ?? e.error?.code ?? '');
  const blob = `${code} ${msg}`;
  if (/rate_limit_exceeded|rate limit/i.test(blob) && !/insufficient_quota|billing_hard_limit|exceeded your current quota/i.test(blob)) {
    return false;
  }
  return /billing_hard_limit|insufficient_quota|exceeded your current quota/i.test(blob);
}

export function classifyOpenAiError(err: unknown): OpenAiErrorCode {
  const e = err as { message?: string; code?: string; error?: { code?: string } };
  const code = String(e?.code ?? e?.error?.code ?? '');
  const msg = String(e?.message ?? '');
  if (code === 'billing_hard_limit_reached' || /billing_hard_limit/i.test(msg)) {
    return 'billing_hard_limit';
  }
  if (isOpenAiQuotaOrBillingError(err)) return 'openai_quota_exceeded';
  return 'openai_error';
}

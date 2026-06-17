/** Classify OpenAI errors — avoid retry loops on billing/quota exhaustion. */

export type OpenAiErrorCode = 'openai_quota_exceeded' | 'billing_hard_limit' | 'openai_error';

const QUOTA_COOLDOWN_MS = 30 * 60 * 1000;
let quotaBlockedUntil = 0;

/** In-process cooldown — skip further enhance calls in same Node process after quota hit. */
export function markOpenAiQuotaBlocked(): void {
  quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
}

export function isOpenAiQuotaBlocked(): boolean {
  return Date.now() < quotaBlockedUntil;
}

export function isOpenAiQuotaOrBillingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    const s = String(err ?? '');
    return /billing_hard_limit|insufficient_quota|exceeded your current quota/i.test(s);
  }
  const e = err as { message?: string; code?: string; status?: number; error?: { code?: string; message?: string } };
  const msg = String(e.message ?? e.error?.message ?? '');
  const code = String(e.code ?? e.error?.code ?? '');
  if (e.status === 429) return true;
  return /billing_hard_limit|insufficient_quota|rate_limit_exceeded/i.test(`${code} ${msg}`);
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

/**
 * PayTR iFrame API credentials — server-only.
 * Set PAYTR_MERCHANT_ID / KEY / SALT in the deployment env (.env.local).
 */

function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface PaytrConfig {
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  testMode: boolean;
  /** Public app origin for ok/fail redirects + callback absolute URL hints */
  publicBaseUrl: string;
  debugOn: boolean;
}

export function isPaytrConfigured(): boolean {
  return Boolean(
    readEnv('PAYTR_MERCHANT_ID') &&
      readEnv('PAYTR_MERCHANT_KEY') &&
      readEnv('PAYTR_MERCHANT_SALT'),
  );
}

/** Explicit kill-switch; when unset, enabled iff credentials exist. */
export function isPaytrEnabled(): boolean {
  const flag = readEnv('PAYTR_ENABLED');
  if (flag === 'false') return false;
  if (flag === 'true') return isPaytrConfigured();
  return isPaytrConfigured();
}

export function getPaytrConfig(): PaytrConfig {
  const merchantId = readEnv('PAYTR_MERCHANT_ID');
  const merchantKey = readEnv('PAYTR_MERCHANT_KEY');
  const merchantSalt = readEnv('PAYTR_MERCHANT_SALT');
  if (!merchantId || !merchantKey || !merchantSalt) {
    throw new Error(
      '[paytr] Missing PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, or PAYTR_MERCHANT_SALT',
    );
  }

  const publicBaseUrl = (
    readEnv('PAYTR_PUBLIC_BASE_URL') ??
    readEnv('WEB_BASE_URL') ??
    readEnv('NEXT_PUBLIC_APP_URL') ??
    'http://127.0.0.1:3000'
  ).replace(/\/$/, '');

  const testMode =
    readEnv('PAYTR_TEST_MODE') === '1' ||
    readEnv('PAYTR_TEST_MODE') === 'true' ||
    process.env.NODE_ENV !== 'production';

  return {
    merchantId,
    merchantKey,
    merchantSalt,
    testMode,
    publicBaseUrl,
    debugOn: readEnv('PAYTR_DEBUG') === 'true' || testMode,
  };
}

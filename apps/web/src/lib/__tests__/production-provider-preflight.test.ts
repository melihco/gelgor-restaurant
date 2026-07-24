import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server-config', () => ({
  serverConfig: {
    imageProvider: 'flux',
    openai: { configured: true },
    fal: { configured: true },
  },
}));

vi.mock('@/lib/openai-error-utils', () => ({
  isOpenAiQuotaBlocked: vi.fn(() => false),
  markOpenAiQuotaBlocked: vi.fn(),
}));

import { serverConfig } from '@/lib/server-config';
import { isOpenAiQuotaBlocked, markOpenAiQuotaBlocked } from '@/lib/openai-error-utils';
import {
  clearFalBillingCircuitForTests,
  getProductionProviderPreflight,
  httpStatusForProviderPreflight,
  isProviderBillingFailureMessage,
  markFalBillingBlocked,
  recordProductionProviderBillingFailure,
} from '@/lib/production-provider-preflight';

describe('production-provider-preflight', () => {
  beforeEach(() => {
    clearFalBillingCircuitForTests();
    vi.mocked(isOpenAiQuotaBlocked).mockReturnValue(false);
    (serverConfig as { imageProvider: string }).imageProvider = 'flux';
    (serverConfig.openai as { configured: boolean }).configured = true;
    (serverConfig.fal as { configured: boolean }).configured = true;
  });

  afterEach(() => {
    clearFalBillingCircuitForTests();
  });

  it('passes when flux primary and fal is configured', () => {
    const p = getProductionProviderPreflight();
    expect(p.ok).toBe(true);
    expect(p.providers.falConfigured).toBe(true);
  });

  it('fails when neither provider key is configured', () => {
    (serverConfig.openai as { configured: boolean }).configured = false;
    (serverConfig.fal as { configured: boolean }).configured = false;
    const p = getProductionProviderPreflight();
    expect(p.ok).toBe(false);
    expect(p.code).toBe('image_provider_not_configured');
    expect(httpStatusForProviderPreflight(p.code)).toBe(503);
  });

  it('fails when fal billing circuit is open for flux primary', () => {
    markFalBillingBlocked(60_000);
    const p = getProductionProviderPreflight();
    expect(p.ok).toBe(false);
    expect(p.code).toBe('provider_billing_circuit_open');
    expect(httpStatusForProviderPreflight(p.code)).toBe(402);
  });

  it('openai primary: circuit open fails closed', () => {
    (serverConfig as { imageProvider: string }).imageProvider = 'openai';
    vi.mocked(isOpenAiQuotaBlocked).mockReturnValue(true);
    const p = getProductionProviderPreflight();
    expect(p.ok).toBe(false);
    expect(p.code).toBe('provider_billing_circuit_open');
  });

  it('classifies fal balance exhausted and trips fal circuit', () => {
    const msg = 'enqueue failed 403: fal.ai balance exhausted — top up at fal.ai/dashboard/billing';
    expect(isProviderBillingFailureMessage(msg)).toBe(true);
    expect(recordProductionProviderBillingFailure(msg)).toBe('fal');
    expect(getProductionProviderPreflight().ok).toBe(false);
  });

  it('classifies OpenAI quota and trips openai circuit', () => {
    const msg = 'You exceeded your current quota / insufficient_quota';
    expect(recordProductionProviderBillingFailure(msg)).toBe('openai');
    expect(markOpenAiQuotaBlocked).toHaveBeenCalled();
  });

  it('ignores non-billing slot errors', () => {
    expect(recordProductionProviderBillingFailure('gallery_theme_mismatch')).toBeNull();
    expect(getProductionProviderPreflight().ok).toBe(true);
  });
});

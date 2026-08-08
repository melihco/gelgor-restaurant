import { afterEach, describe, expect, it } from 'vitest';
import {
  clearOpenAiQuotaBlockedForTests,
  isOpenAiQuotaBlocked,
  isOpenAiQuotaOrBillingError,
  markOpenAiQuotaBlocked,
} from '../openai-error-utils';

describe('openai-error-utils', () => {
  afterEach(() => {
    clearOpenAiQuotaBlockedForTests();
  });

  it('detects insufficient_quota', () => {
    expect(
      isOpenAiQuotaOrBillingError({
        status: 429,
        code: 'insufficient_quota',
        message: 'You exceeded your current quota',
      }),
    ).toBe(true);
  });

  it('does not treat rate_limit_exceeded 429 as billing', () => {
    expect(
      isOpenAiQuotaOrBillingError({
        status: 429,
        code: 'rate_limit_exceeded',
        message: 'Rate limit reached. Please check your plan and billing details.',
      }),
    ).toBe(false);
  });

  it('mark/clear quota circuit', () => {
    markOpenAiQuotaBlocked();
    expect(isOpenAiQuotaBlocked()).toBe(true);
    clearOpenAiQuotaBlockedForTests();
    expect(isOpenAiQuotaBlocked()).toBe(false);
  });
});

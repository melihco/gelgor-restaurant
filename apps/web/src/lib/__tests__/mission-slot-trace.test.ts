import { describe, expect, it } from 'vitest';
import {
  customerSlotBlockLabel,
  customerSlotRetryLabel,
  formatCustomerSlotTraceLine,
  matchSlotCostUsd,
} from '@/lib/mission-slot-trace';

describe('mission slot trace (shop + beach)', () => {
  it('matches shop harvest spend by idea + role', () => {
    expect(matchSlotCostUsd([
      { slot_key: '0::fal_designed_post', idea_index: 0, slot_role: 'fal_designed_post', total_usd: 0.16 },
      { slot_key: '5::organic_carousel', idea_index: 5, slot_role: 'organic_carousel', total_usd: 0.044 },
    ], 5, 'organic_carousel')).toBe(0.044);
  });

  it('writes retry and billing block for a stuck beach still', () => {
    expect(customerSlotRetryLabel(1, 3)).toBe('deneme 1/3');
    expect(customerSlotBlockLabel({
      status: 'pending',
      lastError: 'provider_billing_circuit_open',
    })).toBe('Kota kapalı');
    expect(formatCustomerSlotTraceLine({
      attempts: 1,
      maxAttempts: 3,
      costUsd: 0,
      status: 'pending',
      lastError: 'provider_billing_circuit_open',
    })).toBe('deneme 1/3 · $0 · Kota kapalı');
  });

  it('marks skipped reel without inventing spend', () => {
    expect(customerSlotBlockLabel({
      status: 'skipped',
      lastError: 'skip-no-fal-quota: reel paused until fal wallet',
    })).toBe('Reel kapalı');
    expect(formatCustomerSlotTraceLine({
      attempts: 0,
      maxAttempts: 3,
      costUsd: 0,
      status: 'skipped',
      lastError: 'skip-no-fal-quota: reel paused until fal wallet',
    })).toBe('deneme 0/3 · $0 · Reel kapalı');
  });
});

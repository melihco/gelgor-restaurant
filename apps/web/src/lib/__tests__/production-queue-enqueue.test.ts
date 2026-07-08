import { describe, expect, it } from 'vitest';

import {
  buildProductionSlotJobId,
  resolveEnqueuePriority,
} from '@/lib/production-queue-enqueue';

describe('buildProductionSlotJobId', () => {
  it('is stable for the same factory job ids', () => {
    const jobs = [
      { id: 'aaaa-bbbb-cccc-dddd-eeeeeeeeeeee', slotKey: '1:organic_post' },
      { id: 'ffff-gggg-hhhh-iiii-jjjjjjjjjjjj', slotKey: '0:story' },
    ];
    const a = buildProductionSlotJobId('mission-1', jobs);
    const b = buildProductionSlotJobId('mission-1', [...jobs].reverse());
    expect(a).toBe(b);
    expect(a).not.toContain(String(Date.now()).slice(0, 8));
  });

  it('differs when factory job ids differ', () => {
    const a = buildProductionSlotJobId('m1', [{ id: 'id-a', slotKey: '0:a' }]);
    const b = buildProductionSlotJobId('m1', [{ id: 'id-b', slotKey: '0:a' }]);
    expect(a).not.toBe(b);
  });
});

describe('resolveEnqueuePriority', () => {
  it('clamps explicit priority to 0-10', () => {
    expect(resolveEnqueuePriority(5)).toBe(5);
    expect(resolveEnqueuePriority(99)).toBe(10);
    expect(resolveEnqueuePriority(-1)).toBe(0);
  });
});

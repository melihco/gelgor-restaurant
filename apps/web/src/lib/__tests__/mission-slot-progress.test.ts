import { describe, expect, it } from 'vitest';
import { resolveMissionSlotProgress } from '@/lib/mission-feed-package';

describe('resolveMissionSlotProgress', () => {
  it('prefers factory ready/total over deduped artifact count', () => {
    const progress = resolveMissionSlotProgress({
      factoryReady: 16,
      factoryTotal: 17,
      pkg: { primaryCount: 7 } as never,
    });
    expect(progress).toEqual({ ready: 16, target: 17 });
  });
});

import { describe, expect, it } from 'vitest';

import { missionProductionStatusCopy } from '@/lib/mission-production-status';

describe('missionProductionStatusCopy', () => {
  it('returns idle copy when no factory jobs', () => {
    expect(missionProductionStatusCopy(null).title).toContain('Planınız hazır');
  });

  it('returns queued platform message', () => {
    const copy = missionProductionStatusCopy({
      total: 18,
      ready: 0,
      phase: 'queued',
      blockReason: 'platform_queue',
      estimatedWaitMinutes: 45,
      inFlight: 0,
      queued: 18,
    });
    expect(copy.title).toBe('Üretim sırasındasınız');
    expect(copy.subtitle).toContain('45 dk');
    expect(copy.inProgress).toBe(true);
  });

  it('returns producing message when in flight', () => {
    const copy = missionProductionStatusCopy({
      total: 18,
      ready: 0,
      phase: 'producing',
      inFlight: 2,
      queued: 15,
    });
    expect(copy.title).toBe('Görseller üretiliyor');
    expect(copy.subtitle).toBe('Üretim devam ediyor (0/18 hazır · 2 üretiliyor).');
    expect(copy.inProgress).toBe(true);
  });

  it('returns slot-only producing subtitle when nothing is in flight', () => {
    const copy = missionProductionStatusCopy({
      total: 18,
      ready: 0,
      phase: 'producing',
      inFlight: 0,
      queued: 18,
    });
    expect(copy.subtitle).toBe('Üretim devam ediyor (0/18 slot).');
  });
});

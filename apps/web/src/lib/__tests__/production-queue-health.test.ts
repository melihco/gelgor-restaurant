import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/queue-client', () => ({
  getProductionQueue: vi.fn(),
}));

import { getProductionQueue } from '@/lib/queue-client';
import { getProductionQueueWorkerSnapshot } from '@/lib/production-queue-health';

describe('getProductionQueueWorkerSnapshot', () => {
  beforeEach(() => {
    vi.mocked(getProductionQueue).mockReset();
  });

  it('reports unavailable when REDIS_URL / queue missing', async () => {
    vi.mocked(getProductionQueue).mockReturnValue(null);
    await expect(getProductionQueueWorkerSnapshot()).resolves.toEqual({
      available: false,
      workerCount: 0,
      reason: 'REDIS_URL not set',
    });
  });

  it('returns workerCount from BullMQ getWorkers', async () => {
    vi.mocked(getProductionQueue).mockReturnValue({
      getWorkers: async () => [{ id: 'w1' }, { id: 'w2' }],
    } as never);
    await expect(getProductionQueueWorkerSnapshot()).resolves.toEqual({
      available: true,
      workerCount: 2,
    });
  });
});

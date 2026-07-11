import { describe, expect, it } from 'vitest';
import {
  acquireProductionLock,
  acquireProductionLocksForRun,
  forceReleaseProductionLock,
  releaseProductionLock,
} from '@/lib/production-in-process-lock';

describe('production-in-process-lock', () => {
  const ws = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('acquireProductionLocksForRun recovers stale in-memory workspace lock once', async () => {
    const first = await acquireProductionLock(ws);
    expect(first).toBe(true);

    const blocked = await acquireProductionLocksForRun(ws, null, { recoverStale: false });
    expect(blocked.workspace).toBe(false);

    const recovered = await acquireProductionLocksForRun(ws, null, { recoverStale: true });
    expect(recovered.workspace).toBe(true);

    await releaseProductionLock(ws);
  });

  it('forceReleaseProductionLock clears an orphaned workspace lock', async () => {
    const first = await acquireProductionLock(ws);
    expect(first).toBe(true);

    await forceReleaseProductionLock(ws);

    const second = await acquireProductionLock(ws);
    expect(second).toBe(true);

    await releaseProductionLock(ws);
  });
});

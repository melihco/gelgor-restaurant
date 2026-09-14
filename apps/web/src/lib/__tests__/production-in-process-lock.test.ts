import { describe, expect, it } from 'vitest';
import {
  acquireProductionLock,
  acquireProductionLocksForRun,
  forceReleaseProductionLock,
  releaseAllProductionLocks,
  releaseProductionLock,
  resolveProductionLockLane,
} from '@/lib/production-in-process-lock';

describe('production-in-process-lock', () => {
  const ws = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('acquireProductionLocksForRun recovers a stale lock but never steals a live paint', async () => {
    const first = await acquireProductionLock(ws);
    expect(first).toBe(true);

    const blocked = await acquireProductionLocksForRun(ws, null, { recoverStale: false });
    expect(blocked.workspace).toBe(false);

    // Worker retry a few seconds after a dropped connection: the route is still
    // painting — the lock is live, the duplicate run must be refused.
    const live = await acquireProductionLocksForRun(ws, null, { recoverStale: true });
    expect(live.workspace).toBe(false);

    // Past the stale threshold the orphan is recovered once.
    const recovered = await acquireProductionLocksForRun(ws, null, { recoverStale: true, staleAfterMs: 0 });
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

  it('reel batch uses a video lock that does not block shop or beach stills', async () => {
    const shop = '11111111-1111-1111-1111-111111111111';
    const beach = '22222222-2222-2222-2222-222222222222';
    const mission = '33333333-3333-3333-3333-333333333333';

    expect(resolveProductionLockLane({
      backfillSlotKeys: ['2:instagram_reel'],
      catalogSlotBindings: { '2:instagram_reel': 'local_products_shop_product_detail_reel' },
    })).toBe('video');
    expect(resolveProductionLockLane({
      backfillSlotKeys: ['0:instagram_post'],
      catalogSlotBindings: { '0:instagram_post': 'beach_club_sunset_golden_story' },
    })).toBe('still');

    const reel = await acquireProductionLocksForRun(shop, mission, { lane: 'video' });
    expect(reel.workspace).toBe(true);
    expect(reel.mission).toBe(true);

    const shopStill = await acquireProductionLocksForRun(shop, mission, { lane: 'still' });
    expect(shopStill.workspace).toBe(true);
    expect(shopStill.mission).toBe(true);

    const beachStill = await acquireProductionLocksForRun(beach, mission, { lane: 'still' });
    expect(beachStill.workspace).toBe(true);

    await releaseAllProductionLocks(shop, mission, 'video');
    await releaseAllProductionLocks(shop, mission, 'still');
    await releaseAllProductionLocks(beach, mission, 'still');
  });
});

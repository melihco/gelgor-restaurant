import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetBriefJobStatusMemoryForTests,
  getBriefJobStatus,
  setBriefJobStatus,
} from '../brief-job-status';

describe('brief-job-status', () => {
  afterEach(() => {
    __resetBriefJobStatusMemoryForTests();
  });

  it('stores and loads queued → complete for a workspace job', async () => {
    await setBriefJobStatus({
      jobId: 'job-beach-1',
      workspaceId: 'ws-beach-club',
      status: 'queued',
      produced: 0,
    });
    const queued = await getBriefJobStatus('job-beach-1');
    expect(queued?.status).toBe('queued');
    expect(queued?.workspaceId).toBe('ws-beach-club');

    await setBriefJobStatus({
      jobId: 'job-beach-1',
      workspaceId: 'ws-beach-club',
      status: 'complete',
      produced: 2,
      catalogSlotKeys: ['beach_club_dj_night_teaser_post'],
    });
    const done = await getBriefJobStatus('job-beach-1');
    expect(done?.status).toBe('complete');
    expect(done?.produced).toBe(2);
    expect(done?.catalogSlotKeys).toEqual(['beach_club_dj_night_teaser_post']);
  });

  it('stores failed status with error for local_products_shop job', async () => {
    await setBriefJobStatus({
      jobId: 'job-shop-1',
      workspaceId: 'ws-local-products',
      status: 'failed',
      produced: 0,
      error: 'library_template_required',
    });
    const failed = await getBriefJobStatus('job-shop-1');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toBe('library_template_required');
    expect(failed?.workspaceId).toBe('ws-local-products');
  });

  it('returns null for unknown jobId', async () => {
    expect(await getBriefJobStatus('missing')).toBeNull();
  });
});

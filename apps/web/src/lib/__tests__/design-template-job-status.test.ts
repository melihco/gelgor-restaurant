import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetDesignTemplateJobStatusMemoryForTests,
  getDesignTemplateJobStatus,
  getDesignTemplateJobStatusByWorkspace,
  isDesignTemplateJobInFlight,
  setDesignTemplateJobStatus,
} from '../design-template-job-status';

describe('design-template-job-status', () => {
  afterEach(() => {
    __resetDesignTemplateJobStatusMemoryForTests();
  });

  it('stores and loads by jobId and workspaceId (beach_club)', async () => {
    await setDesignTemplateJobStatus({
      jobId: 'dt-job-beach-1',
      workspaceId: 'ws-beach-club',
      status: 'queued',
      generated: 0,
    });
    const byJob = await getDesignTemplateJobStatus('dt-job-beach-1');
    const byWs = await getDesignTemplateJobStatusByWorkspace('ws-beach-club');
    expect(byJob?.status).toBe('queued');
    expect(byWs?.jobId).toBe('dt-job-beach-1');
    expect(isDesignTemplateJobInFlight(byWs)).toBe(true);
  });

  it('marks complete and clears in-flight for local_products_shop', async () => {
    await setDesignTemplateJobStatus({
      jobId: 'dt-job-shop-1',
      workspaceId: 'ws-local-products',
      status: 'running',
      generated: 0,
    });
    expect(isDesignTemplateJobInFlight(
      await getDesignTemplateJobStatusByWorkspace('ws-local-products'),
    )).toBe(true);

    await setDesignTemplateJobStatus({
      jobId: 'dt-job-shop-1',
      workspaceId: 'ws-local-products',
      status: 'complete',
      generated: 8,
    });
    const done = await getDesignTemplateJobStatusByWorkspace('ws-local-products');
    expect(done?.status).toBe('complete');
    expect(done?.generated).toBe(8);
    expect(isDesignTemplateJobInFlight(done)).toBe(false);
  });

  it('returns null for unknown ids', async () => {
    expect(await getDesignTemplateJobStatus('missing')).toBeNull();
    expect(await getDesignTemplateJobStatusByWorkspace('missing-ws')).toBeNull();
  });
});

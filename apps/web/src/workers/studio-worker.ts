/**
 * Local studio worker — in-process produceFromQueueJob (tsx).
 * Not bundled for Render. Docker worker stays on production-worker.ts → HTTP → Next.
 */
import { loadLocalEnv } from './load-local-env';

loadLocalEnv();

import { Worker, type Job } from 'bullmq';
import { getQueueConnection, PRODUCTION_SLOTS_QUEUE, type ProductionSlotJobData } from '../lib/queue-client';
import {
  productionGlobalInflightMax,
  releaseGlobalProductionSlot,
  tryAcquireGlobalProductionSlot,
} from '../lib/production-global-inflight';
import { produceFromQueueJob } from '../studio/produce-from-job';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
const CONCURRENCY = Math.max(1, Number(process.env.PRODUCTION_WORKER_CONCURRENCY ?? 1));
const RATE_MAX = Math.max(1, Number(process.env.PRODUCTION_WORKER_RATE_MAX ?? 10));
const RATE_DURATION_MS = Math.max(1000, Number(process.env.PRODUCTION_WORKER_RATE_DURATION_MS ?? 60_000));

async function processSlotBatch(job: Job<ProductionSlotJobData>): Promise<unknown> {
  const acquired = await tryAcquireGlobalProductionSlot();
  if (!acquired) {
    throw new Error(
      `global production inflight cap (${productionGlobalInflightMax()}) — retry later`,
    );
  }
  try {
    const { autoProduceBody, factoryJobs, missionId, workspaceId, callbackUrl } = job.data;
    const result = await produceFromQueueJob({
      autoProduceBody: { ...autoProduceBody, workspaceId, missionId },
      factoryJobs,
      missionId,
      workspaceId,
      callbackUrl,
    });
    try {
      await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': INTERNAL_KEY,
        },
        body: JSON.stringify({
          mission_id: missionId,
          workspace_id: workspaceId,
          factory_jobs: factoryJobs,
          produce_data: result.body,
          http_status: result.status,
        }),
      });
    } catch (err) {
      throw new Error(`callback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { missionId, slots: factoryJobs.length, httpStatus: result.status };
  } finally {
    await releaseGlobalProductionSlot();
  }
}

function main(): void {
  const connection = getQueueConnection();
  if (!connection) {
    console.error('[studio-worker] REDIS_URL not set — cannot start worker.');
    process.exit(1);
  }

  const worker = new Worker<ProductionSlotJobData>(PRODUCTION_SLOTS_QUEUE, processSlotBatch, {
    connection,
    concurrency: CONCURRENCY,
    limiter: { max: RATE_MAX, duration: RATE_DURATION_MS },
  });

  worker.on('completed', (job, result) => {
    console.log(`[studio-worker] completed job=${job.id}`, result);
  });
  worker.on('failed', (job, err) => {
    console.warn(`[studio-worker] failed job=${job?.id}: ${err?.message}`);
  });

  console.log(
    `[studio-worker] started. queue=${PRODUCTION_SLOTS_QUEUE} concurrency=${CONCURRENCY} direct=1`,
  );

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();

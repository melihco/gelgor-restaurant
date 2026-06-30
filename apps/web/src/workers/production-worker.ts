/**
 * BullMQ production worker — consumes the `production:slots` queue.
 *
 * Each job is a claimed slot batch (1-5 slots) enqueued by the Python production
 * factory. The worker:
 *   1. Executes the pipeline via the internal /api/auto-produce endpoint.
 *   2. Calls back to Python (/internal/v1/production-jobs/complete) so the claimed
 *      production_jobs rows are marked ready/failed by slot key.
 *
 * Distributed concurrency control (replaces Python's sequential per-mission drain):
 *   - `PRODUCTION_WORKER_CONCURRENCY` jobs run in parallel PER worker process.
 *   - A BullMQ rate limiter caps global throughput (protects fal.ai / OpenAI quotas).
 * Scale horizontally by running multiple worker processes/containers.
 *
 * Run:  tsx src/workers/production-worker.ts   (or: npm run worker:production)
 */

import { Worker, type Job } from 'bullmq';
import { getQueueConnection, PRODUCTION_SLOTS_QUEUE, type ProductionSlotJobData } from '../lib/queue-client';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
const WEB_BASE_URL = (process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

const CONCURRENCY = Math.max(1, Number(process.env.PRODUCTION_WORKER_CONCURRENCY ?? 2));
// Global rate limit across this worker: max N jobs per `duration` ms.
const RATE_MAX = Math.max(1, Number(process.env.PRODUCTION_WORKER_RATE_MAX ?? 10));
const RATE_DURATION_MS = Math.max(1000, Number(process.env.PRODUCTION_WORKER_RATE_DURATION_MS ?? 60_000));

async function processSlotBatch(job: Job<ProductionSlotJobData>): Promise<unknown> {
  const { autoProduceBody, factoryJobs, missionId, workspaceId, callbackUrl } = job.data;

  // 1. Execute production via the internal auto-produce route.
  let produceData: Record<string, unknown> = {};
  let httpStatus = 0;
  try {
    const resp = await fetch(`${WEB_BASE_URL}/api/auto-produce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      body: JSON.stringify(autoProduceBody),
    });
    httpStatus = resp.status;
    produceData = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  } catch (err) {
    produceData = { error: err instanceof Error ? err.message : 'auto-produce fetch failed' };
  }

  // 2. Call back to Python to mark each claimed job ready/failed by slot key.
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
        produce_data: produceData,
        http_status: httpStatus,
      }),
    });
  } catch (err) {
    // If the callback fails, the jobs stay 'running' and Python's stale-claim
    // window reclaims + re-drains them. Surface the error to BullMQ for retry.
    throw new Error(`callback failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { missionId, slots: factoryJobs.length, httpStatus };
}

function main(): void {
  const connection = getQueueConnection();
  if (!connection) {
    console.error('[production-worker] REDIS_URL not set — cannot start worker.');
    process.exit(1);
  }

  const worker = new Worker<ProductionSlotJobData>(PRODUCTION_SLOTS_QUEUE, processSlotBatch, {
    connection,
    concurrency: CONCURRENCY,
    limiter: { max: RATE_MAX, duration: RATE_DURATION_MS },
  });

  worker.on('completed', (job, result) => {
    console.log(`[production-worker] completed job=${job.id}`, result);
  });
  worker.on('failed', (job, err) => {
    console.warn(`[production-worker] failed job=${job?.id}: ${err?.message}`);
  });
  worker.on('error', (err) => {
    console.error('[production-worker] worker error:', err?.message ?? err);
  });

  console.log(
    `[production-worker] started. queue=${PRODUCTION_SLOTS_QUEUE} concurrency=${CONCURRENCY} ` +
      `rate=${RATE_MAX}/${RATE_DURATION_MS}ms web=${WEB_BASE_URL}`,
  );

  const shutdown = async () => {
    console.log('[production-worker] shutting down...');
    await worker.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();

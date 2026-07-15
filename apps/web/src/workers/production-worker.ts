import { loadLocalEnv } from './load-local-env';

// Must run before queue-client reads process.env.REDIS_URL.
loadLocalEnv();

import { Worker, type Job } from 'bullmq';
import { getQueueConnection, PRODUCTION_SLOTS_QUEUE, type ProductionSlotJobData } from '../lib/queue-client';
import {
  productionGlobalInflightMax,
  releaseGlobalProductionSlot,
  tryAcquireGlobalProductionSlot,
} from '../lib/production-global-inflight';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
const WEB_BASE_URL = (process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

// Default concurrency=1: avoids two parallel workers saturating the same local Next.js
// instance (which causes "fetch failed" / http_status=0). Override with
// PRODUCTION_WORKER_CONCURRENCY env var when running multiple Next replicas behind a LB.
const CONCURRENCY = Math.max(1, Number(process.env.PRODUCTION_WORKER_CONCURRENCY ?? 1));
// Global rate limit across this worker: max N jobs per `duration` ms.
const RATE_MAX = Math.max(1, Number(process.env.PRODUCTION_WORKER_RATE_MAX ?? 10));
const RATE_DURATION_MS = Math.max(1000, Number(process.env.PRODUCTION_WORKER_RATE_DURATION_MS ?? 60_000));

// Pre-flight health check: verify Next.js is reachable before attempting production.
// Returns true when the service is up, false otherwise.
async function isNextJsReachable(): Promise<boolean> {
  try {
    const resp = await fetch(`${WEB_BASE_URL}/api/health/live`, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// Sleep helper for retry backoff.
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function processSlotBatch(job: Job<ProductionSlotJobData>): Promise<unknown> {
  const acquired = await tryAcquireGlobalProductionSlot();
  if (!acquired) {
    throw new Error(
      `global production inflight cap (${productionGlobalInflightMax()}) — retry later`,
    );
  }

  try {
    return await runSlotBatch(job);
  } finally {
    await releaseGlobalProductionSlot();
  }
}

async function runSlotBatch(job: Job<ProductionSlotJobData>): Promise<unknown> {
  const { autoProduceBody, factoryJobs, missionId, workspaceId, callbackUrl } = job.data;

  const bodyWorkspace = String(autoProduceBody?.workspaceId ?? '').trim();
  const bodyMission = String(autoProduceBody?.missionId ?? '').trim();
  if (
    (bodyWorkspace && bodyWorkspace.toLowerCase() !== workspaceId.toLowerCase())
    || (bodyMission && bodyMission.toLowerCase() !== missionId.toLowerCase())
  ) {
    throw new Error(
      `tenant envelope mismatch mission=${missionId} workspace=${workspaceId}`,
    );
  }

  const pinnedAutoProduceBody = {
    ...autoProduceBody,
    workspaceId,
    missionId,
  };

  // 1. Execute production via the internal auto-produce route.
  //    Retry up to 2 times when Next.js is temporarily unreachable (http_status=0).
  //    Backoff delays let the server recover from transient saturation.
  const FETCH_RETRY_DELAYS_MS = [8_000, 20_000] as const;
  const fetchTimeoutMs = Math.max(
    60_000,
    Number(process.env.PRODUCTION_WORKER_FETCH_TIMEOUT_MS ?? 620_000),
  );

  let produceData: Record<string, unknown> = {};
  let httpStatus = 0;

  for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
    // Pre-flight: confirm Next.js is up before sending the heavy request.
    if (!(await isNextJsReachable())) {
      const retryDelay = FETCH_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined) {
        console.warn(
          `[production-worker] auto-produce unreachable after health-check (all retries exhausted) mission=${missionId}`,
        );
        break;
      }
      console.warn(
        `[production-worker] Next.js health-check failed mission=${missionId} — retrying in ${retryDelay}ms (attempt ${attempt + 1})`,
      );
      await sleep(retryDelay);
      continue;
    }

    const abortController = new AbortController();
    const fetchTimer = setTimeout(() => abortController.abort(), fetchTimeoutMs);
    try {
      const resp = await fetch(`${WEB_BASE_URL}/api/auto-produce`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': INTERNAL_KEY,
          'X-Tenant-Id': workspaceId,
        },
        body: JSON.stringify(pinnedAutoProduceBody),
        signal: abortController.signal,
      });
      httpStatus = resp.status;
      produceData = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
      if (httpStatus === 409) {
        produceData = {
          ...produceData,
          reason: 'production_in_flight',
          skipped: true,
          produced: 0,
        };
      }
    } catch (err) {
      produceData = { error: err instanceof Error ? err.message : 'auto-produce fetch failed' };
    } finally {
      clearTimeout(fetchTimer);
    }

    if (httpStatus !== 0) break; // success or non-transport error

    const retryDelay = FETCH_RETRY_DELAYS_MS[attempt];
    if (retryDelay === undefined) {
      console.warn(
        `[production-worker] auto-produce unreachable mission=${missionId} error=${String(produceData.error ?? 'unknown')} — all retries exhausted`,
      );
      break;
    }
    console.warn(
      `[production-worker] auto-produce fetch failed mission=${missionId} — retrying in ${retryDelay}ms (attempt ${attempt + 1})`,
    );
    await sleep(retryDelay);
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

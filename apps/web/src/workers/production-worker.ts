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

// This file is esbuild-bundled into production-worker.cjs for Render.
// Do not import studio / satori / sharp here — native .node files break the bundle.
// Local in-process studio: `npm run studio` → studio-worker.ts.

// Default concurrency=1: avoids two parallel workers saturating the same local Next.js
// instance (which causes "fetch failed" / http_status=0). Override with
// PRODUCTION_WORKER_CONCURRENCY env var when running multiple Next replicas behind a LB.
const CONCURRENCY = Math.max(1, Number(process.env.PRODUCTION_WORKER_CONCURRENCY ?? 1));
const RATE_MAX = Math.max(1, Number(process.env.PRODUCTION_WORKER_RATE_MAX ?? 10));
const RATE_DURATION_MS = Math.max(1000, Number(process.env.PRODUCTION_WORKER_RATE_DURATION_MS ?? 60_000));

async function isNextJsReachable(): Promise<boolean> {
  try {
    const healthTimeoutMs = Math.max(
      8_000,
      Number(process.env.PRODUCTION_WORKER_HEALTH_TIMEOUT_MS ?? 35_000),
    );
    const resp = await fetch(`${WEB_BASE_URL}/api/health/live`, {
      method: 'GET',
      signal: AbortSignal.timeout(healthTimeoutMs),
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const HEARTBEAT_MS = Math.max(
  15_000,
  Number(process.env.PRODUCTION_WORKER_HEARTBEAT_MS ?? 45_000),
);

function heartbeatUrl(callbackUrl: string): string {
  return callbackUrl.replace(/\/complete\/?$/, '/heartbeat');
}

async function touchFactoryJobs(
  callbackUrl: string,
  factoryJobs: ProductionSlotJobData['factoryJobs'],
): Promise<void> {
  const jobIds = factoryJobs.map((row) => String(row.id ?? '').trim()).filter(Boolean);
  if (!callbackUrl || jobIds.length === 0) return;
  try {
    await fetch(heartbeatUrl(callbackUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify({ job_ids: jobIds }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    /* watchdog still has the silent window */
  }
}

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

  const FETCH_RETRY_DELAYS_MS = [8_000, 20_000] as const;
  const fetchTimeoutMs = Math.max(
    60_000,
    Number(process.env.PRODUCTION_WORKER_FETCH_TIMEOUT_MS ?? 620_000),
  );

  let produceData: Record<string, unknown> = {};
  let httpStatus = 0;
  const heartbeatTimer = setInterval(() => {
    void touchFactoryJobs(callbackUrl, factoryJobs);
  }, HEARTBEAT_MS);
  void touchFactoryJobs(callbackUrl, factoryJobs);

  try {
    for (let attempt = 0; attempt <= FETCH_RETRY_DELAYS_MS.length; attempt++) {
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
        } else if (httpStatus === 429) {
          const budgetReason = String(
            produceData.reason || produceData.error || 'budget_exhausted',
          );
          produceData = {
            ...produceData,
            reason: budgetReason,
            error: budgetReason,
            skipped: true,
            produced: 0,
          };
        }
      } catch (err) {
        produceData = { error: err instanceof Error ? err.message : 'auto-produce fetch failed' };
      } finally {
        clearTimeout(fetchTimer);
      }

      if (httpStatus !== 0) break;

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
      throw new Error(`callback failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { missionId, slots: factoryJobs.length, httpStatus };
  } finally {
    clearInterval(heartbeatTimer);
  }
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

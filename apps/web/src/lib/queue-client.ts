/**
 * BullMQ queue client — distributed production execution.
 *
 * The Python production factory (Celery drain) enqueues slot-batch jobs here via
 * the /api/queue/enqueue route. A separate BullMQ worker process (src/workers)
 * consumes them, runs the production pipeline, and calls back to Python.
 *
 * Queues:
 *   - production:slots — one job = one claimed slot batch (1-5 slots).
 *
 * Connection uses REDIS_URL (shared with Python + docker-compose). When REDIS_URL
 * is unset, getProductionQueue() returns null so callers can fall back to the
 * synchronous HTTP executor.
 */

import { Queue, type QueueOptions, type ConnectionOptions } from 'bullmq';

// NOTE: BullMQ disallows ':' in queue names (it's the Redis key separator).
export const PRODUCTION_SLOTS_QUEUE = 'production-slots';

export function getQueueConnection(): ConnectionOptions | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  // BullMQ accepts a connection URL via the `url`-less options; we pass the
  // parsed pieces through ioredis-compatible options.
  return { url: redisUrl } as unknown as ConnectionOptions;
}

export interface FactoryJobRef {
  /** production_jobs.id (uuid) claimed by Python. */
  id: string;
  /** `${ideaIndex}:${slot_role}` slot key. */
  slotKey: string;
}

export interface ProductionSlotJobData {
  /** Body forwarded verbatim to /api/auto-produce. */
  autoProduceBody: Record<string, unknown>;
  /** Claimed factory jobs this batch maps to (for the completion callback). */
  factoryJobs: FactoryJobRef[];
  missionId: string;
  workspaceId: string;
  /** Python callback URL to mark jobs ready/failed after execution. */
  callbackUrl: string;
}

let _queue: Queue<ProductionSlotJobData> | null = null;
let _initialized = false;

const DEFAULT_JOB_OPTS: QueueOptions['defaultJobOptions'] = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600 },
};

export function getProductionQueue(): Queue<ProductionSlotJobData> | null {
  if (_initialized) return _queue;
  _initialized = true;

  const connection = getQueueConnection();
  if (!connection) {
    _queue = null;
    return null;
  }

  _queue = new Queue<ProductionSlotJobData>(PRODUCTION_SLOTS_QUEUE, {
    connection,
    defaultJobOptions: DEFAULT_JOB_OPTS,
  });
  return _queue;
}

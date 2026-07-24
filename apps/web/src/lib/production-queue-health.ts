/**
 * BullMQ production-slots health helpers.
 *
 * When PRODUCTION_EXECUTOR=bullmq, claimed jobs only progress if at least one
 * `npm run worker:production` (or deploy worker) is consuming the queue.
 * These helpers make that dependency visible and fail-loud at enqueue time.
 */

import { getProductionQueue } from '@/lib/queue-client';

export type ProductionQueueWorkerSnapshot = {
  available: boolean;
  workerCount: number;
  reason?: string;
};

/** How many BullMQ workers are currently registered on production-slots. */
export async function getProductionQueueWorkerSnapshot(): Promise<ProductionQueueWorkerSnapshot> {
  const queue = getProductionQueue();
  if (!queue) {
    return { available: false, workerCount: 0, reason: 'REDIS_URL not set' };
  }
  try {
    const workers = await queue.getWorkers();
    return { available: true, workerCount: workers.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'getWorkers failed';
    return { available: false, workerCount: 0, reason: message };
  }
}

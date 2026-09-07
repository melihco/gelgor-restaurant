/**
 * Studio process entry.
 *
 * `npm start` in this package runs `apps/web/src/workers/production-worker.ts`
 * with STUDIO_DIRECT=1 (default). The worker calls produceFromQueueJob —
 * bind → paint → motion → gate — without POSTing Next.
 */
export const STUDIO_PROCESS = 'production-worker';

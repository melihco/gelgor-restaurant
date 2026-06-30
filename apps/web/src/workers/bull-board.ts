/**
 * Bull Board dashboard — BullMQ queue monitoring UI.
 *
 * Standalone Express server (separate from Next.js) that visualizes the
 * production-slots queue: waiting/active/completed/failed/delayed jobs, retries,
 * and per-job data. Useful during load tests and production incident triage.
 *
 * Run:  tsx src/workers/bull-board.ts   (or: npm run dashboard:queues)
 * Open: http://localhost:3100/queues
 */

import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getProductionQueue } from '../lib/queue-client';

const PORT = Number(process.env.BULL_BOARD_PORT ?? 3100);

function main(): void {
  const queue = getProductionQueue();
  if (!queue) {
    console.error('[bull-board] REDIS_URL not set — cannot start dashboard.');
    process.exit(1);
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/queues');

  createBullBoard({
    queues: [new BullMQAdapter(queue)],
    serverAdapter,
  });

  const app = express();
  app.use('/queues', serverAdapter.getRouter());
  app.get('/', (_req, res) => res.redirect('/queues'));

  app.listen(PORT, () => {
    console.log(`[bull-board] dashboard on http://localhost:${PORT}/queues`);
  });
}

main();

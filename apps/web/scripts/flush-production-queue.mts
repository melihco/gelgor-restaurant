#!/usr/bin/env npx tsx
/**
 * Dev-only: obliterate the production-slots BullMQ queue (clears wait/active backlog).
 *
 * Usage:
 *   REDIS_URL=redis://127.0.0.1:6379/0 npx tsx scripts/flush-production-queue.mts
 *   npx tsx scripts/flush-production-queue.mts --dry-run
 */
import { Queue } from 'bullmq';

import { PRODUCTION_SLOTS_QUEUE } from '../src/lib/queue-client';

const dryRun = process.argv.includes('--dry-run');
const redisUrl = process.env.REDIS_URL;

async function main(): Promise<void> {
  if (!redisUrl) {
    console.error('REDIS_URL is required');
    process.exit(1);
  }

  const queue = new Queue(PRODUCTION_SLOTS_QUEUE, {
    connection: { url: redisUrl } as never,
  });

  try {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
      'paused',
    );
    const depth =
      (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    console.log('Before:', counts, 'depth=', depth);

    if (dryRun) {
      console.log('Dry run — no changes.');
      return;
    }

    await queue.obliterate({ force: true });
    console.log('Queue obliterated:', PRODUCTION_SLOTS_QUEUE);
  } finally {
    await queue.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

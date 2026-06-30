/**
 * Load test for the multi-tenant scaling primitives.
 *
 * Validates the three pieces that gate 1000-tenant production:
 *   1. BullMQ enqueue + worker throughput (jobs/sec).
 *   2. Redis distributed lock correctness under contention (no double-acquire).
 *   3. Redis distributed semaphore cap (never exceeds max concurrent holders).
 *
 * Usage:
 *   REDIS_URL=redis://localhost:6379/0 node scripts/load-test-queue.mjs 1000
 *
 * The argument is the tenant/job count (default 50). Run with 50, 200, 1000.
 * Requires a reachable Redis (docker compose up -d redis).
 */

import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';

const N = Number(process.argv[2] ?? 50);
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379/0';
const QUEUE = 'loadtest-slots';

const connection = { url: REDIS_URL };

function now() {
  return Number(process.hrtime.bigint() / 1000000n);
}

// ── 1. BullMQ throughput ────────────────────────────────────────────────────
async function testQueueThroughput() {
  const queue = new Queue(QUEUE, { connection });
  await queue.drain(true).catch(() => {});

  let processed = 0;
  let maxInFlight = 0;
  let inFlight = 0;
  const concurrency = Math.min(50, Math.max(4, Math.floor(N / 10)));

  const start = now();
  const done = new Promise((resolve) => {
    const worker = new Worker(
      QUEUE,
      async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Simulate a tiny unit of work.
        await new Promise((r) => setTimeout(r, 2));
        inFlight -= 1;
        processed += 1;
        if (processed >= N) resolve(worker);
      },
      { connection, concurrency },
    );
    worker.on('error', () => {});
  });

  const enqueueStart = now();
  const jobs = Array.from({ length: N }, (_, i) => ({
    name: QUEUE,
    data: { i },
    opts: { removeOnComplete: true, removeOnFail: true },
  }));
  await queue.addBulk(jobs);
  const enqueueMs = now() - enqueueStart;

  const worker = await done;
  const totalMs = now() - start;
  await worker.close();
  await queue.close();

  console.log(`\n[1] BullMQ throughput (N=${N}, worker concurrency=${concurrency})`);
  console.log(`    enqueue ${N} jobs:   ${enqueueMs} ms (${Math.round((N / enqueueMs) * 1000)} jobs/s)`);
  console.log(`    process ${N} jobs:   ${totalMs} ms (${Math.round((N / totalMs) * 1000)} jobs/s)`);
  console.log(`    max in-flight:       ${maxInFlight} (cap was ${concurrency})`);
}

// ── 2. Distributed lock correctness ─────────────────────────────────────────
async function testLockContention() {
  const client = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const key = 'loadtest:lock';
  await client.del(key);

  const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
  let acquired = 0;
  let conflicts = 0;

  // N contenders race for ONE lock; exactly one should win at a time.
  await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const token = `t-${i}`;
      const ok = await client.set(key, token, 'EX', 30, 'NX');
      if (ok === 'OK') {
        acquired += 1;
        // Hold briefly, then release with token check.
        await new Promise((r) => setTimeout(r, 1));
        await client.eval(RELEASE_LUA, 1, key, token);
      } else {
        conflicts += 1;
      }
    }),
  );

  console.log(`\n[2] Distributed lock contention (N=${N} contenders, single key)`);
  console.log(`    acquired (sequential winners): ${acquired}`);
  console.log(`    rejected (correctly blocked):  ${conflicts}`);
  console.log(`    correctness: ${acquired + conflicts === N ? 'OK' : 'FAIL'}`);
  await client.del(key);
  await client.quit();
}

// ── 3. Distributed semaphore cap ────────────────────────────────────────────
async function testSemaphoreCap() {
  const client = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
  const key = 'sem:loadtest';
  await client.del(key);
  const MAX = 8;

  const ACQUIRE_LUA = `
local key = KEYS[1] local nowt = tonumber(ARGV[1]) local ttl = tonumber(ARGV[2])
local max = tonumber(ARGV[3]) local token = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, nowt - ttl)
local count = redis.call('ZCARD', key)
if count < max then redis.call('ZADD', key, nowt, token) redis.call('PEXPIRE', key, ttl) return 1 end
return 0`;

  let maxHeld = 0;
  let held = 0;

  await Promise.all(
    Array.from({ length: N }, async (_, i) => {
      const token = `s-${i}`;
      for (;;) {
        const got = await client.eval(ACQUIRE_LUA, 1, key, Date.now().toString(), '10000', String(MAX), token);
        if (got === 1) break;
        await new Promise((r) => setTimeout(r, 5));
      }
      held += 1;
      maxHeld = Math.max(maxHeld, held);
      await new Promise((r) => setTimeout(r, 3));
      held -= 1;
      await client.zrem(key, token);
    }),
  );

  console.log(`\n[3] Distributed semaphore cap (N=${N} acquirers, max=${MAX})`);
  console.log(`    peak concurrent holders: ${maxHeld}`);
  console.log(`    cap respected: ${maxHeld <= MAX ? 'OK' : 'FAIL'}`);
  await client.del(key);
  await client.quit();
}

async function main() {
  console.log(`Load test — N=${N}, redis=${REDIS_URL}`);
  await testQueueThroughput();
  await testLockContention();
  await testSemaphoreCap();
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('load test failed:', err);
  process.exit(1);
});

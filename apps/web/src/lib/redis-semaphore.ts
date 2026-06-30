/**
 * Redis distributed counting semaphore (self-healing, sorted-set based).
 *
 * Caps a resource (e.g. concurrent Remotion renders) GLOBALLY across multiple
 * Next.js instances. Each holder adds a token scored by acquire time; stale
 * tokens (holders that crashed mid-work) expire after `ttlMs` so the semaphore
 * never deadlocks.
 *
 * No-ops gracefully (acquire always succeeds) when REDIS_URL is unset — the
 * caller's in-process limit remains the only gate (single-instance dev).
 */

import { getRedisClient } from './redis-client';

const ACQUIRE_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local token = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - ttl)
local count = redis.call('ZCARD', key)
if count < max then
  redis.call('ZADD', key, now, token)
  redis.call('PEXPIRE', key, ttl)
  return 1
end
return 0
`;

export interface DistributedSemaphoreOptions {
  key: string;
  max: number;
  ttlMs: number;
  /** Max time to wait for a slot before giving up. */
  waitTimeoutMs?: number;
  /** Poll interval while waiting. */
  pollIntervalMs?: number;
}

function semKey(name: string): string {
  return `sem:${name}`;
}

async function tryAcquire(opts: DistributedSemaphoreOptions, token: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return true; // degraded: rely on in-process gate
  try {
    const res = await client.eval(
      ACQUIRE_LUA,
      1,
      semKey(opts.key),
      Date.now().toString(),
      opts.ttlMs.toString(),
      opts.max.toString(),
      token,
    );
    return res === 1;
  } catch {
    return true; // fail-open: never block production on a semaphore outage
  }
}

/**
 * Block (polling) until a semaphore slot is acquired or the wait times out.
 * Returns the held token (release it later) or null if Redis is unused/timed out
 * (caller should proceed using its in-process gate).
 */
export async function acquireDistributedSlot(opts: DistributedSemaphoreOptions): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return null;

  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const waitTimeout = opts.waitTimeoutMs ?? 5 * 60 * 1000;
  const poll = opts.pollIntervalMs ?? 500;
  const deadline = Date.now() + waitTimeout;

  for (;;) {
    if (await tryAcquire(opts, token)) return token;
    if (Date.now() >= deadline) return null; // give up; proceed with in-process gate
    await new Promise((r) => setTimeout(r, poll));
  }
}

export async function releaseDistributedSlot(key: string, token: string | null): Promise<void> {
  if (!token) return;
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.zrem(semKey(key), token);
  } catch {
    // best-effort; stale token expires via ttl
  }
}

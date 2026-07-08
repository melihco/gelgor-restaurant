/**
 * Cluster-wide cap on concurrent auto-produce executions (Redis counter).
 * Workers acquire before calling /api/auto-produce and release in finally.
 */
import Redis from 'ioredis';

const KEY = 'prod_rate:global:inflight';
const DEFAULT_MAX = Math.max(
  1,
  Number.parseInt(process.env.PRODUCTION_GLOBAL_MAX_INFLIGHT ?? '12', 10) || 12,
);
const TTL_SEC = Math.max(
  120,
  Number.parseInt(process.env.PRODUCTION_GLOBAL_INFLIGHT_TTL_SEC ?? '900', 10) || 900,
);

let _redis: Redis | null = null;

function client(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!_redis) {
    _redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      commandTimeout: 2_000,
    });
  }
  return _redis;
}

export async function tryAcquireGlobalProductionSlot(
  maxInflight = DEFAULT_MAX,
): Promise<boolean> {
  const r = client();
  if (!r) return true;
  try {
    const n = await r.incr(KEY);
    if (n === 1) await r.expire(KEY, TTL_SEC);
    if (n > maxInflight) {
      await r.decr(KEY);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function releaseGlobalProductionSlot(): Promise<void> {
  const r = client();
  if (!r) return;
  try {
    const n = await r.decr(KEY);
    if (n <= 0) await r.del(KEY);
  } catch {
    /* best-effort */
  }
}

export function productionGlobalInflightMax(): number {
  return DEFAULT_MAX;
}

/**
 * Production lock — distributed mutual exclusion for auto-produce.
 *
 * Backend priority:
 *   1. ioredis against REDIS_URL (same Redis as Python backend + docker-compose) — preferred.
 *   2. Upstash Redis REST (UPSTASH_REDIS_REST_URL / _TOKEN) — serverless deploys.
 *   3. In-memory Map — single-instance dev ONLY. Logs a warning, since this provides
 *      NO mutual exclusion across multiple Next.js instances.
 *
 * Locks carry a per-acquire token so release only clears a lock we still hold
 * (Lua check on ioredis; best-effort on Upstash). TTL auto-expires stale locks
 * if a worker dies mid-production.
 */

import { getRedisClient } from './redis-client';

const _workspaceProductionLock = new Map<string, number>();
const _missionProductionLock = new Map<string, number>();
const PRODUCTION_LOCK_TTL_MS = 12 * 60 * 1000;
const PRODUCTION_LOCK_TTL_SEC = Math.ceil(PRODUCTION_LOCK_TTL_MS / 1000);

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// Tokens held per key so we only release our own lock.
const _heldTokens = new Map<string, string>();

let _warnedInMemory = false;

function newToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function lockKey(prefix: string, id: string): string {
  return `prod_lock:${prefix}:${id}`;
}

const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

// ── ioredis backend ──────────────────────────────────────────────────────────
async function ioredisSetNX(key: string, token: string, ttlSec: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    const res = await client.set(key, token, 'EX', ttlSec, 'NX');
    return res === 'OK';
  } catch {
    return false;
  }
}

async function ioredisRelease(key: string, token: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    await client.eval(RELEASE_LUA, 1, key, token);
    return true;
  } catch {
    return false;
  }
}

// ── Upstash REST backend ───────────────────────────────────────────────────────
async function upstashSetNX(key: string, token: string, ttlSec: number): Promise<boolean> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return false;
  try {
    const resp = await fetch(
      `${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(token)}/EX/${ttlSec}/NX`,
      { method: 'POST', headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } },
    );
    const data = (await resp.json()) as { result: string | null };
    return data.result === 'OK';
  } catch {
    return false;
  }
}

async function upstashDel(key: string): Promise<void> {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  try {
    await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    });
  } catch {
    // best-effort
  }
}

// ── Backend selection ──────────────────────────────────────────────────────────
const useIoRedis = Boolean(getRedisClient());
const useUpstash = !useIoRedis && Boolean(UPSTASH_URL && UPSTASH_TOKEN);

function warnInMemoryOnce(): void {
  if (_warnedInMemory) return;
  _warnedInMemory = true;
  console.warn(
    '[production-lock] No REDIS_URL or Upstash configured — using in-memory lock. ' +
      'This provides NO mutual exclusion across multiple Next.js instances. ' +
      'Set REDIS_URL for multi-instance deployments.',
  );
}

async function acquire(key: string, lockMap: Map<string, number>): Promise<boolean> {
  if (useIoRedis) {
    const token = newToken();
    const ok = await ioredisSetNX(key, token, PRODUCTION_LOCK_TTL_SEC);
    if (ok) _heldTokens.set(key, token);
    return ok;
  }
  if (useUpstash) {
    const token = newToken();
    const ok = await upstashSetNX(key, token, PRODUCTION_LOCK_TTL_SEC);
    if (ok) _heldTokens.set(key, token);
    return ok;
  }
  warnInMemoryOnce();
  const now = Date.now();
  const expiresAt = lockMap.get(key);
  if (expiresAt != null && expiresAt > now) return false;
  lockMap.set(key, now + PRODUCTION_LOCK_TTL_MS);
  return true;
}

async function release(key: string, lockMap: Map<string, number>): Promise<void> {
  if (useIoRedis) {
    const token = _heldTokens.get(key);
    if (token) {
      await ioredisRelease(key, token);
      _heldTokens.delete(key);
    }
    return;
  }
  if (useUpstash) {
    await upstashDel(key);
    _heldTokens.delete(key);
    return;
  }
  lockMap.delete(key);
}

export async function acquireProductionLock(workspaceId: string): Promise<boolean> {
  return acquire(lockKey('ws', workspaceId), _workspaceProductionLock);
}

export async function acquireMissionProductionLock(missionId: string): Promise<boolean> {
  return acquire(lockKey('mission', missionId), _missionProductionLock);
}

export async function releaseProductionLock(workspaceId: string): Promise<void> {
  await release(lockKey('ws', workspaceId), _workspaceProductionLock);
}

export async function releaseMissionProductionLock(missionId: string): Promise<void> {
  await release(lockKey('mission', missionId), _missionProductionLock);
}

export async function releaseAllProductionLocks(workspaceId: string, missionId?: string | null): Promise<void> {
  await releaseProductionLock(workspaceId);
  if (missionId) await releaseMissionProductionLock(missionId);
}

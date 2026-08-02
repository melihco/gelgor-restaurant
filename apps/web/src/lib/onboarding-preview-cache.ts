/**
 * Short-lived cache for pre-signup brand analyze (full discovery payload).
 * Avoids a second Apify scrape during post-signup deep setup.
 */

import { createHash, randomBytes } from 'node:crypto';
import { getRedisClient, hasRedis } from '@/lib/redis-client';

const TTL_SEC = 45 * 60;
const MEMORY_TTL_MS = TTL_SEC * 1000;
const KEY_PREFIX = 'onboarding:preview:v1:';

type MemoryEntry = { payload: unknown; expiresAt: number };
const memory = new Map<string, MemoryEntry>();

function fingerprint(input: {
  websiteUrl?: string;
  instagramHandle?: string;
  googleBusinessUrl?: string;
  menuUrl?: string;
}): string {
  const raw = JSON.stringify({
    w: String(input.websiteUrl ?? '').trim().toLowerCase(),
    i: String(input.instagramHandle ?? '').replace(/^@/, '').trim().toLowerCase(),
    g: String(input.googleBusinessUrl ?? '').trim().toLowerCase(),
    m: String(input.menuUrl ?? '').trim().toLowerCase(),
  });
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export function buildPreviewCacheKey(input: {
  websiteUrl?: string;
  instagramHandle?: string;
  googleBusinessUrl?: string;
  menuUrl?: string;
}): string {
  const fp = fingerprint(input);
  const nonce = randomBytes(4).toString('hex');
  return `${fp}_${nonce}`;
}

function redisKey(cacheKey: string): string {
  return `${KEY_PREFIX}${cacheKey}`;
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k);
  }
}

export async function storeOnboardingPreviewDiscovery(
  cacheKey: string,
  discovery: unknown,
): Promise<void> {
  const payload = JSON.stringify(discovery);
  const redis = hasRedis() ? getRedisClient() : null;
  if (redis) {
    try {
      await redis.set(redisKey(cacheKey), payload, 'EX', TTL_SEC);
      return;
    } catch (err) {
      console.warn('[onboarding-preview-cache] redis set failed:', err);
    }
  }
  pruneMemory();
  memory.set(cacheKey, { payload: discovery, expiresAt: Date.now() + MEMORY_TTL_MS });
}

export async function loadOnboardingPreviewDiscovery(
  cacheKey: string,
): Promise<Record<string, unknown> | null> {
  const key = String(cacheKey ?? '').trim();
  if (!key || key.length > 80) return null;

  const redis = hasRedis() ? getRedisClient() : null;
  if (redis) {
    try {
      const raw = await redis.get(redisKey(key));
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      }
    } catch (err) {
      console.warn('[onboarding-preview-cache] redis get failed:', err);
    }
  }

  pruneMemory();
  const hit = memory.get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) memory.delete(key);
    return null;
  }
  if (hit.payload && typeof hit.payload === 'object') {
    return hit.payload as Record<string, unknown>;
  }
  return null;
}

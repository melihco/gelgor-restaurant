/**
 * Shared ioredis client for Next.js (distributed locks + BullMQ).
 *
 * Connects to REDIS_URL (the same Redis the Python backend and docker-compose use).
 * A single lazy singleton is reused across the process. When REDIS_URL is not set,
 * returns null so callers fall back to Upstash REST or in-memory behavior.
 */

import IORedis, { type Redis } from 'ioredis';
import { serverConfig } from './server-config';

let _client: Redis | null = null;
let _initialized = false;

export function getRedisClient(): Redis | null {
  if (_initialized) return _client;
  _initialized = true;

  const redisUrl = serverConfig.redis.url;
  if (!redisUrl) {
    _client = null;
    return null;
  }

  try {
    _client = new IORedis(redisUrl, {
      // BullMQ requires this; harmless for plain commands.
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: 3000,
    });
    _client.on('error', (err) => {
      // Avoid crashing the process on transient Redis errors.
      console.warn('[redis-client] connection error:', err?.message ?? err);
    });
  } catch (err) {
    console.warn('[redis-client] failed to init:', err);
    _client = null;
  }
  return _client;
}

export function hasRedis(): boolean {
  return serverConfig.redis.enabled;
}

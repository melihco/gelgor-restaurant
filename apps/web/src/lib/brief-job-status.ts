/**
 * Short-lived status for New Brief background jobs (Feed “+” → Tasarla & Üret).
 * Redis when available; in-process Map fallback for local/dev.
 */
import { getRedisClient, hasRedis } from '@/lib/redis-client';

export type BriefJobStatusState = 'queued' | 'running' | 'complete' | 'failed';

export interface BriefJobStatus {
  jobId: string;
  workspaceId: string;
  status: BriefJobStatusState;
  produced: number;
  error?: string;
  catalogSlotKeys?: string[];
  updatedAt: number;
}

const TTL_SEC = 60 * 60;
const MEMORY_TTL_MS = TTL_SEC * 1000;
const KEY_PREFIX = 'brief-job:v1:';

type MemoryEntry = { value: BriefJobStatus; expiresAt: number };
const memory = new Map<string, MemoryEntry>();

function redisKey(jobId: string): string {
  return `${KEY_PREFIX}${jobId}`;
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k);
  }
}

function normalizeJobId(jobId: string): string | null {
  const id = String(jobId ?? '').trim();
  if (!id || id.length > 80) return null;
  return id;
}

export async function setBriefJobStatus(
  input: Omit<BriefJobStatus, 'updatedAt'> & { updatedAt?: number },
): Promise<BriefJobStatus> {
  const jobId = normalizeJobId(input.jobId);
  if (!jobId) {
    throw new Error('invalid brief jobId');
  }
  const record: BriefJobStatus = {
    jobId,
    workspaceId: String(input.workspaceId ?? '').trim(),
    status: input.status,
    produced: Math.max(0, Number(input.produced) || 0),
    ...(input.error ? { error: String(input.error).slice(0, 500) } : {}),
    ...(input.catalogSlotKeys?.length
      ? { catalogSlotKeys: input.catalogSlotKeys.map(String).filter(Boolean).slice(0, 20) }
      : {}),
    updatedAt: input.updatedAt ?? Date.now(),
  };

  let redis = null as ReturnType<typeof getRedisClient>;
  try {
    redis = hasRedis() ? getRedisClient() : null;
  } catch {
    redis = null;
  }
  if (redis) {
    try {
      await redis.set(redisKey(jobId), JSON.stringify(record), 'EX', TTL_SEC);
      return record;
    } catch (err) {
      console.warn('[brief-job-status] redis set failed:', err);
    }
  }

  pruneMemory();
  memory.set(jobId, { value: record, expiresAt: Date.now() + MEMORY_TTL_MS });
  return record;
}

export async function getBriefJobStatus(jobId: string): Promise<BriefJobStatus | null> {
  const id = normalizeJobId(jobId);
  if (!id) return null;

  let redis = null as ReturnType<typeof getRedisClient>;
  try {
    redis = hasRedis() ? getRedisClient() : null;
  } catch {
    redis = null;
  }
  if (redis) {
    try {
      const raw = await redis.get(redisKey(id));
      if (raw) {
        const parsed = JSON.parse(raw) as BriefJobStatus;
        if (parsed && typeof parsed === 'object' && parsed.jobId) return parsed;
      }
    } catch (err) {
      console.warn('[brief-job-status] redis get failed:', err);
    }
  }

  pruneMemory();
  const hit = memory.get(id);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) memory.delete(id);
    return null;
  }
  return hit.value;
}

/** Test helper — clear in-memory store. */
export function __resetBriefJobStatusMemoryForTests(): void {
  memory.clear();
}

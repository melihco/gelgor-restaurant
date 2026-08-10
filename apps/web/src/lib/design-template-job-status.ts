/**
 * Short-lived status for onboarding design-template background jobs.
 * Redis when available; in-process Map fallback for local/dev.
 * Primary key is workspaceId (idempotent lock); jobId is also indexed.
 */
import { getRedisClient, hasRedis } from '@/lib/redis-client';

export type DesignTemplateJobStatusState = 'queued' | 'running' | 'complete' | 'failed';

export interface DesignTemplateJobStatus {
  jobId: string;
  workspaceId: string;
  status: DesignTemplateJobStatusState;
  generated: number;
  error?: string;
  updatedAt: number;
}

const TTL_SEC = 60 * 60;
const MEMORY_TTL_MS = TTL_SEC * 1000;
const JOB_KEY_PREFIX = 'design-template-job:v1:';
const WS_KEY_PREFIX = 'design-template-job:ws:v1:';

type MemoryEntry = { value: DesignTemplateJobStatus; expiresAt: number };
const memoryByJob = new Map<string, MemoryEntry>();
const memoryByWorkspace = new Map<string, MemoryEntry>();

function jobRedisKey(jobId: string): string {
  return `${JOB_KEY_PREFIX}${jobId}`;
}

function workspaceRedisKey(workspaceId: string): string {
  return `${WS_KEY_PREFIX}${workspaceId}`;
}

function pruneMemory(): void {
  const now = Date.now();
  for (const [k, v] of memoryByJob) {
    if (v.expiresAt <= now) memoryByJob.delete(k);
  }
  for (const [k, v] of memoryByWorkspace) {
    if (v.expiresAt <= now) memoryByWorkspace.delete(k);
  }
}

function normalizeId(id: string, maxLen = 80): string | null {
  const trimmed = String(id ?? '').trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

async function getRedis() {
  try {
    return hasRedis() ? getRedisClient() : null;
  } catch {
    return null;
  }
}

export async function setDesignTemplateJobStatus(
  input: Omit<DesignTemplateJobStatus, 'updatedAt'> & { updatedAt?: number },
): Promise<DesignTemplateJobStatus> {
  const jobId = normalizeId(input.jobId);
  const workspaceId = normalizeId(input.workspaceId);
  if (!jobId || !workspaceId) {
    throw new Error('invalid design-template jobId or workspaceId');
  }
  const record: DesignTemplateJobStatus = {
    jobId,
    workspaceId,
    status: input.status,
    generated: Math.max(0, Number(input.generated) || 0),
    ...(input.error ? { error: String(input.error).slice(0, 500) } : {}),
    updatedAt: input.updatedAt ?? Date.now(),
  };

  const redis = await getRedis();
  if (redis) {
    try {
      const payload = JSON.stringify(record);
      await redis.set(jobRedisKey(jobId), payload, 'EX', TTL_SEC);
      await redis.set(workspaceRedisKey(workspaceId), payload, 'EX', TTL_SEC);
      return record;
    } catch (err) {
      console.warn('[design-template-job-status] redis set failed:', err);
    }
  }

  pruneMemory();
  const entry: MemoryEntry = { value: record, expiresAt: Date.now() + MEMORY_TTL_MS };
  memoryByJob.set(jobId, entry);
  memoryByWorkspace.set(workspaceId, entry);
  return record;
}

async function readRecord(
  redisKey: string,
  memoryMap: Map<string, MemoryEntry>,
  memoryKey: string,
): Promise<DesignTemplateJobStatus | null> {
  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redis.get(redisKey);
      if (raw) {
        const parsed = JSON.parse(raw) as DesignTemplateJobStatus;
        if (parsed && typeof parsed === 'object' && parsed.jobId) return parsed;
      }
    } catch (err) {
      console.warn('[design-template-job-status] redis get failed:', err);
    }
  }

  pruneMemory();
  const hit = memoryMap.get(memoryKey);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) memoryMap.delete(memoryKey);
    return null;
  }
  return hit.value;
}

export async function getDesignTemplateJobStatus(
  jobId: string,
): Promise<DesignTemplateJobStatus | null> {
  const id = normalizeId(jobId);
  if (!id) return null;
  return readRecord(jobRedisKey(id), memoryByJob, id);
}

export async function getDesignTemplateJobStatusByWorkspace(
  workspaceId: string,
): Promise<DesignTemplateJobStatus | null> {
  const id = normalizeId(workspaceId);
  if (!id) return null;
  return readRecord(workspaceRedisKey(id), memoryByWorkspace, id);
}

/** True when a job is already in flight for this workspace. */
export function isDesignTemplateJobInFlight(
  status: DesignTemplateJobStatus | null | undefined,
): boolean {
  return status?.status === 'queued' || status?.status === 'running';
}

/** Test helper — clear in-memory stores. */
export function __resetDesignTemplateJobStatusMemoryForTests(): void {
  memoryByJob.clear();
  memoryByWorkspace.clear();
}

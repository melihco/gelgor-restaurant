/**
 * BullMQ production-slots enqueue helpers — stable job ids + dedup.
 */
import type { FactoryJobRef } from '@/lib/queue-client';

const MAX_JOB_ID_LEN = 200;

/** Stable id from claimed Postgres production_jobs rows (avoids timestamp duplicates). */
export function buildProductionSlotJobId(
  missionId: string,
  factoryJobs: FactoryJobRef[],
): string {
  const refs = [...factoryJobs].sort((a, b) => a.id.localeCompare(b.id));
  const idPart = refs.map((j) => j.id.replace(/-/g, '')).join('-') || 'batch';
  const slotPart = refs.map((j) => j.slotKey).sort().join('_') || 'batch';
  const raw = `${missionId}-${idPart}-${slotPart}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, MAX_JOB_ID_LEN);
}

/**
 * Map factory urgency → BullMQ priority.
 *
 * Factory / Postgres use higher numbers for more urgent work (e.g. 10 = boost).
 * BullMQ processes **lower** priority numbers first among the prioritized zset
 * (`score = priority * 2^32 + counter`). Passing factory-10 through unchanged
 * parked boosted jobs behind everyone else, so urgent tenants looked stuck
 * while the worker drained lower-urgency work.
 *
 * Mapping: factory urgency 1..10 → BullMQ 10..1 (10 most urgent → BullMQ 1).
 * `0` / omitted keeps the default wait-list path (BullMQ priority 0).
 */
export function resolveEnqueuePriority(explicit?: number): number {
  if (typeof explicit !== 'number' || !Number.isFinite(explicit)) {
    return 0;
  }
  const urgency = Math.max(0, Math.min(10, Math.floor(explicit)));
  if (urgency <= 0) return 0;
  return 11 - urgency;
}

export const ACTIVE_BULLMQ_JOB_STATES = new Set([
  'waiting',
  'active',
  'delayed',
  'paused',
  'waiting-children',
]);

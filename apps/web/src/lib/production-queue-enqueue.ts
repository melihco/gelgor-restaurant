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

export function resolveEnqueuePriority(explicit?: number): number {
  if (typeof explicit === 'number' && Number.isFinite(explicit)) {
    return Math.max(0, Math.min(10, Math.floor(explicit)));
  }
  return 0;
}

export const ACTIVE_BULLMQ_JOB_STATES = new Set([
  'waiting',
  'active',
  'delayed',
  'paused',
  'waiting-children',
]);

/**
 * Flush captured fal.ai requests into cost_events SSOT.
 * Every completed/failed queue request with a real request_id must land here —
 * including orphans when the slot fails after fal succeeds.
 */

import { estimateFalModelUsd } from '@/lib/ai-cost-catalog';
import { emitAiCostLine, type AiCallType } from '@/lib/ai-cost-telemetry';
import {
  getCapturedFalRequests,
  type FalRequestKind,
  type FalRequestRecord,
} from '@/lib/fal-request-tracker';
import { buildProductionSlotKey } from '@/lib/production-cost-types';

export interface FlushFalCostContext {
  workspaceId: string;
  missionId?: string | null;
  artifactId?: string | null;
  ideaIndex?: number | null;
  slotRole?: string | null;
  pipeline?: string | null;
  /** Slot failed after fal spent — still billable. */
  orphan?: boolean;
}

function callTypeForKind(kind: FalRequestKind): AiCallType {
  if (kind === 'video') return 'video_fal';
  if (kind === 'flux_sync') return 'fal_still';
  return 'fal_typography';
}

function isBillableFalRequest(r: FalRequestRecord): boolean {
  if (!r.requestId?.trim()) return false;
  if (r.requestId.startsWith('enqueue-failed:')) return false;
  // Submitted-only: fal accepted the job — billable even if we timed out waiting.
  return r.status === 'completed' || r.status === 'failed' || r.status === 'submitted';
}

/**
 * Persist one cost_event per billable fal request in the active slot buffer.
 * Idempotent via `fal:{requestId}` keys. Returns summed catalog USD recorded.
 */
export async function flushFalRequestsToCostLedger(
  ctx: FlushFalCostContext,
): Promise<{ recordedUsd: number; count: number }> {
  if (!ctx.workspaceId) return { recordedUsd: 0, count: 0 };

  const requests = getCapturedFalRequests().filter(isBillableFalRequest);
  if (requests.length === 0) return { recordedUsd: 0, count: 0 };

  const slotKey =
    ctx.ideaIndex != null && ctx.slotRole
      ? buildProductionSlotKey(ctx.ideaIndex, ctx.slotRole)
      : null;

  let recordedUsd = 0;
  let count = 0;

  for (const req of requests) {
    const usd = estimateFalModelUsd(req.model, req.kind);
    if (usd <= 0) continue;

    const isSync = req.requestId.startsWith('sync:');
    emitAiCostLine({
      callType: callTypeForKind(req.kind),
      usd,
      provider: 'fal',
      model: req.model,
      missionId: ctx.missionId ?? null,
      workspaceId: ctx.workspaceId,
      artifactId: ctx.artifactId ?? null,
      slotKey,
      slotRole: ctx.slotRole ?? null,
      ideaIndex: ctx.ideaIndex ?? null,
      pipeline: ctx.pipeline ?? null,
      falRequestId: isSync ? null : req.requestId,
      detail: [
        `fal:${req.kind}:${req.status}`,
        ctx.orphan ? 'orphan_slot_fail' : null,
        req.outputUrl ? `out:${req.outputUrl.slice(0, 80)}` : null,
        req.error ? `err:${req.error.slice(0, 80)}` : null,
      ].filter(Boolean).join('|'),
      persist: true,
    });
    recordedUsd += usd;
    count += 1;
  }

  return {
    recordedUsd: Math.round(recordedUsd * 100000) / 100000,
    count,
  };
}

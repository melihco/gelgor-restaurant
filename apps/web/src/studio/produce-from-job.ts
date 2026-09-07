import type { ProductionSlotJobData } from '@/lib/queue-client';
import {
  executeAutoProduce,
  type AutoProduceRequestBody,
  type AutoProduceExecuteResult,
} from './execute-auto-produce';

export function studioDirectEnabled(): boolean {
  const raw = String(process.env.STUDIO_DIRECT ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * BullMQ batch → in-process studio. Replaces the Next HTTP hop.
 */
export async function produceFromQueueJob(
  job: ProductionSlotJobData,
): Promise<AutoProduceExecuteResult> {
  const bodyWorkspace = String(job.autoProduceBody?.workspaceId ?? '').trim();
  const bodyMission = String(job.autoProduceBody?.missionId ?? '').trim();
  if (
    (bodyWorkspace && bodyWorkspace.toLowerCase() !== job.workspaceId.toLowerCase())
    || (bodyMission && bodyMission.toLowerCase() !== job.missionId.toLowerCase())
  ) {
    return {
      status: 400,
      body: {
        error: `tenant envelope mismatch mission=${job.missionId} workspace=${job.workspaceId}`,
      },
    };
  }

  const pinned = {
    ...job.autoProduceBody,
    workspaceId: job.workspaceId,
    missionId: job.missionId,
  } as AutoProduceRequestBody;

  if (!Array.isArray(pinned.ideas)) {
    return { status: 400, body: { error: 'No ideas provided' } };
  }

  const result = await executeAutoProduce(pinned, null, { trustedInternal: true });
  if (result.status === 409) {
    return {
      status: 409,
      body: {
        ...result.body,
        reason: 'production_in_flight',
        skipped: true,
        produced: 0,
      },
    };
  }
  if (result.status === 429) {
    const budgetReason = String(result.body.reason || result.body.error || 'budget_exhausted');
    return {
      status: 429,
      body: {
        ...result.body,
        reason: budgetReason,
        error: budgetReason,
        skipped: true,
        produced: 0,
      },
    };
  }
  return result;
}

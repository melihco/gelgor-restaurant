/**
 * Internal enqueue endpoint — Python production factory (BullMQ mode) calls this
 * to push a claimed slot batch onto the BullMQ ``production:slots`` queue.
 *
 * Auth: X-Internal-Api-Key (internal service-to-service only).
 *
 * Body: { autoProduceBody, factoryJobs, missionId, workspaceId, priority? }
 * The job is enriched with the Python callback URL so the worker can mark the
 * claimed production_jobs ready/failed after execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getProductionQueue,
  PRODUCTION_SLOTS_QUEUE,
  type ProductionSlotJobData,
} from '@/lib/queue-client';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import {
  ACTIVE_BULLMQ_JOB_STATES,
  buildProductionSlotJobId,
  resolveEnqueuePriority,
} from '@/lib/production-queue-enqueue';
import { getProductionQueueWorkerSnapshot } from '@/lib/production-queue-health';
import { serverConfig } from '@/lib/server-config';
import {
  assertProductionJobEnvelope,
  assertWorkspaceMatchesRequestTenant,
} from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';

const INTERNAL_KEY = serverConfig.internal.apiKey;

interface EnqueueBody {
  autoProduceBody: Record<string, unknown>;
  factoryJobs: { id: string; slotKey: string }[];
  missionId: string;
  workspaceId: string;
  priority?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = req.headers.get('x-internal-api-key');
  if (!key || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: EnqueueBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { autoProduceBody, factoryJobs, missionId, workspaceId, priority } = body;
  if (!autoProduceBody || !workspaceId || !missionId) {
    return NextResponse.json(
      { error: 'autoProduceBody, workspaceId, and missionId required' },
      { status: 400 },
    );
  }

  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const envelopeGuard = assertProductionJobEnvelope({
    workspaceId,
    missionId,
    autoProduceBody,
  });
  if (envelopeGuard) return envelopeGuard;

  // Worker executes this payload verbatim — pin tenant fields to the envelope SSOT.
  const pinnedBody: Record<string, unknown> = {
    ...autoProduceBody,
    workspaceId,
    missionId,
  };

  const queue = getProductionQueue();
  if (!queue) {
    return NextResponse.json(
      { error: 'BullMQ unavailable (REDIS_URL not set)', code: 'queue_unavailable' },
      { status: 503 },
    );
  }

  // Fail loud when no consumer is registered — otherwise Python marks jobs
  // `running` and they sit until the stale-claim window (11+ min).
  const workers = await getProductionQueueWorkerSnapshot();
  if (workers.available && workers.workerCount < 1) {
    console.error(
      `[queue/enqueue] production_worker_offline mission=${missionId} ` +
        `slots=${Array.isArray(factoryJobs) ? factoryJobs.length : 0} — ` +
        'start: cd apps/web && npm run worker:production (or ./scripts/ensure-production-worker.sh)',
    );
    return NextResponse.json(
      {
        error:
          'No BullMQ production worker is online. Jobs would stall in running. '
          + 'Start npm run worker:production (deploy: smartagency-production-worker).',
        code: 'production_worker_offline',
        workerCount: 0,
      },
      { status: 503 },
    );
  }

  const callbackUrl = `${getCrewBackendBaseUrl()}/internal/v1/production-jobs/complete`;

  const normalizedJobs = Array.isArray(factoryJobs) ? factoryJobs : [];
  const jobData: ProductionSlotJobData = {
    autoProduceBody: pinnedBody,
    factoryJobs: normalizedJobs,
    missionId,
    workspaceId,
    callbackUrl,
  };

  const jobId = buildProductionSlotJobId(missionId, normalizedJobs);
  const jobPriority = resolveEnqueuePriority(priority);

  try {
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (ACTIVE_BULLMQ_JOB_STATES.has(state)) {
        // Refresh urgency — factory boosts were previously ignored on dedupe, and
        // BullMQ lower-number-first ordering made "priority 10" wait behind everyone.
        if (jobPriority > 0) {
          try {
            await existing.changePriority({ priority: jobPriority });
          } catch {
            /* best-effort; job remains queued */
          }
        }
        return NextResponse.json({
          ok: true,
          jobId,
          slots: jobData.factoryJobs.length,
          deduplicated: true,
          reason: 'already_queued',
          state,
          priority: jobPriority,
        });
      }
      if (state === 'completed' || state === 'failed') {
        try {
          await existing.remove();
        } catch {
          /* race with worker — fall through to add */
        }
      }
    }

    const job = await queue.add(PRODUCTION_SLOTS_QUEUE, jobData, {
      jobId,
      priority: jobPriority,
    });
    return NextResponse.json({
      ok: true,
      jobId: job.id,
      slots: jobData.factoryJobs.length,
      deduplicated: false,
      priority: jobPriority,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'enqueue failed';
    return NextResponse.json({ error: message, code: 'enqueue_error' }, { status: 500 });
  }
}

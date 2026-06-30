/**
 * Internal enqueue endpoint — Python production factory (BullMQ mode) calls this
 * to push a claimed slot batch onto the BullMQ ``production:slots`` queue.
 *
 * Auth: X-Internal-Api-Key (internal service-to-service only).
 *
 * Body: { autoProduceBody, factoryJobs, missionId, workspaceId }
 * The job is enriched with the Python callback URL so the worker can mark the
 * claimed production_jobs ready/failed after execution.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProductionQueue, PRODUCTION_SLOTS_QUEUE, type ProductionSlotJobData } from '@/lib/queue-client';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

const INTERNAL_KEY = serverConfig.internal.apiKey;

interface EnqueueBody {
  autoProduceBody: Record<string, unknown>;
  factoryJobs: { id: string; slotKey: string }[];
  missionId: string;
  workspaceId: string;
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

  const { autoProduceBody, factoryJobs, missionId, workspaceId } = body;
  if (!autoProduceBody || !workspaceId) {
    return NextResponse.json({ error: 'autoProduceBody and workspaceId required' }, { status: 400 });
  }

  const queue = getProductionQueue();
  if (!queue) {
    return NextResponse.json(
      { error: 'BullMQ unavailable (REDIS_URL not set)', code: 'queue_unavailable' },
      { status: 503 },
    );
  }

  // Python callback so the worker can mark claimed jobs ready/failed.
  const callbackUrl = `${getCrewBackendBaseUrl()}/internal/v1/production-jobs/complete`;

  const jobData: ProductionSlotJobData = {
    autoProduceBody,
    factoryJobs: Array.isArray(factoryJobs) ? factoryJobs : [],
    missionId,
    workspaceId,
    callbackUrl,
  };

  try {
    const job = await queue.add(PRODUCTION_SLOTS_QUEUE, jobData, {
      // De-dupe identical batch enqueues within a short window via deterministic id.
      jobId: `${missionId}:${(jobData.factoryJobs.map((j) => j.slotKey).sort().join(',')) || Date.now()}`,
    });
    return NextResponse.json({ ok: true, jobId: job.id, slots: jobData.factoryJobs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'enqueue failed';
    return NextResponse.json({ error: message, code: 'enqueue_error' }, { status: 500 });
  }
}

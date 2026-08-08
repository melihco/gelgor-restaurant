/**
 * Queue stats endpoint — production-slots queue depth + job counts.
 *
 * Returns BullMQ job-state counts for monitoring / alerting (e.g. page when
 * `waiting` or `failed` cross a threshold). Auth via X-Internal-Api-Key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProductionQueue } from '@/lib/queue-client';
import { productionGlobalInflightMax } from '@/lib/production-global-inflight';
import { getProductionQueueWorkerSnapshot } from '@/lib/production-queue-health';
import {
  clearProductionProviderBillingCircuits,
  getProductionProviderPreflight,
  refreshProductionProviderCircuitsFromRedis,
} from '@/lib/production-provider-preflight';
import { serverConfig } from '@/lib/server-config';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import Redis from 'ioredis';

export const runtime = 'nodejs';

const INTERNAL_KEY = serverConfig.internal.apiKey;

/** POST { "action": "clear_provider_billing_circuits" } — ops recovery when keys are topped up. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = req.headers.get('x-internal-api-key');
  if (!key || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { action?: string; workspaceId?: string } = {};
  try {
    body = (await req.json()) as { action?: string; workspaceId?: string };
  } catch {
    body = {};
  }
  if (body.action !== 'clear_provider_billing_circuits') {
    return NextResponse.json(
      { error: 'unsupported_action', hint: 'clear_provider_billing_circuits' },
      { status: 400 },
    );
  }
  clearProductionProviderBillingCircuits();
  // Ensure Redis keys are gone before reporting (async del is fire-and-forget in clear).
  await refreshProductionProviderCircuitsFromRedis();
  clearProductionProviderBillingCircuits();
  const providerPreflight = getProductionProviderPreflight();

  // Revive billing-exhausted factory jobs + kick drain so brands keep producing
  // without a manual SQL requeue (multi-tenant; optional workspace scope).
  let billingRequeue: Record<string, unknown> | null = null;
  if (providerPreflight.ok) {
    try {
      const crewBase = getCrewBackendBaseUrl().replace(/\/$/, '');
      const res = await fetch(`${crewBase}/internal/v1/production-jobs/requeue-billing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Internal-Api-Key': INTERNAL_KEY,
        },
        body: JSON.stringify({
          workspace_id: body.workspaceId || null,
          lookback_hours: 72,
          limit: 200,
          kick_drain: true,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      billingRequeue = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      billingRequeue.status = res.status;
    } catch (err) {
      billingRequeue = {
        ok: false,
        error: err instanceof Error ? err.message : 'requeue_billing_failed',
      };
    }
  }

  return NextResponse.json({
    cleared: true,
    providerPreflight,
    billingRequeue,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const key = req.headers.get('x-internal-api-key');
  if (!key || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const queue = getProductionQueue();
  if (!queue) {
    return NextResponse.json({ available: false, reason: 'REDIS_URL not set' });
  }

  try {
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    const depth = (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0);
    const workerSnap = await getProductionQueueWorkerSnapshot();
    const workerCount = workerSnap.workerCount;
    const backlog = (counts.waiting ?? 0) + (counts.delayed ?? 0);
    await refreshProductionProviderCircuitsFromRedis();
    const providerPreflight = getProductionProviderPreflight();

    let globalInflight: number | null = null;
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      const r = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2_000,
        commandTimeout: 2_000,
      });
      try {
        const v = await r.get('prod_rate:global:inflight');
        globalInflight = v != null ? Number(v) : 0;
      } catch {
        globalInflight = null;
      } finally {
        r.disconnect();
      }
    }

    return NextResponse.json({
      available: true,
      queue: queue.name,
      counts,
      depth,
      workerCount,
      globalInflight,
      globalInflightMax: productionGlobalInflightMax(),
      providerPreflight,
      // Simple alert hints; thresholds tunable by the caller/monitor.
      alerts: {
        backlogHigh: depth > 500,
        failuresHigh: (counts.failed ?? 0) > 100,
        globalInflightHigh:
          globalInflight != null && globalInflight >= productionGlobalInflightMax(),
        /** Claimed/queued work with zero consumers — the Dolunay failure mode. */
        noWorkers: workerCount === 0 && backlog > 0,
        workerOffline: workerCount === 0,
        providerBillingCircuit: !providerPreflight.ok
          && providerPreflight.code === 'provider_billing_circuit_open',
        imageProviderOffline: !providerPreflight.ok
          && providerPreflight.code === 'image_provider_not_configured',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stats failed';
    return NextResponse.json({ available: false, error: message }, { status: 500 });
  }
}

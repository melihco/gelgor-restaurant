/**
 * Queue stats endpoint — production-slots queue depth + job counts.
 *
 * Returns BullMQ job-state counts for monitoring / alerting (e.g. page when
 * `waiting` or `failed` cross a threshold). Auth via X-Internal-Api-Key.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProductionQueue } from '@/lib/queue-client';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

const INTERNAL_KEY = serverConfig.internal.apiKey;

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
    return NextResponse.json({
      available: true,
      queue: queue.name,
      counts,
      depth,
      // Simple alert hints; thresholds tunable by the caller/monitor.
      alerts: {
        backlogHigh: depth > 500,
        failuresHigh: (counts.failed ?? 0) > 100,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stats failed';
    return NextResponse.json({ available: false, error: message }, { status: 500 });
  }
}

/**
 * Internal ops — upsert production_slot_definitions from sector_slot_pack seed.
 * Auth: X-Internal-Api-Key (no tenant scope).
 */

import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

const INTERNAL_KEY = serverConfig.internal.apiKey;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = req.headers.get('x-internal-api-key');
  if (!key || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return proxyToCrewBackend('/api/v1/slot-catalog/sync-seed', {
    method: 'POST',
    body: {},
    timeoutMs: 120_000,
    headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
  });
}

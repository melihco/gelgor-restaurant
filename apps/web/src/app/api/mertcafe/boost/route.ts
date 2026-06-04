import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

import { loadMertcafeWorkspaceConfig, MERTCAFE_BASE_URL, parseMertcafeErrorBody } from '@/lib/mertcafe-api';
import { assertTenantHasApiKey, requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

type BoostBody = {
  post_id?: string;
  goal?: 'engagement' | 'reach' | 'traffic' | 'messages';
  budget?: number;
  duration_days?: number;
  workspaceId?: string;
};

async function callBoostWithRetry(payload: Record<string, unknown>): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${MERTCAFE_BASE_URL}/api/boost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });
    if (res.ok || ![502, 503, 504].includes(res.status) || attempt === 2) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return last as Response;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as BoostBody | null;
  if (!body?.post_id) return NextResponse.json({ error: 'post_id is required' }, { status: 400 });

  const wsCheck = requireMertcafeWorkspaceId(body.workspaceId);
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }
  const tenant = await loadMertcafeWorkspaceConfig(wsCheck.workspaceId);
  const apiReady = assertTenantHasApiKey(tenant);
  if (!apiReady.ok) {
    return NextResponse.json({ error: apiReady.error, code: apiReady.code }, { status: 422 });
  }

  const payload = {
    api_key: tenant.apiKey,
    post_id: body.post_id,
    goal: body.goal ?? 'engagement',
    budget: Math.max(20, Number(body.budget ?? 50)),
    duration_days: Math.max(1, Number(body.duration_days ?? 7)),
  };

  try {
    const res = await callBoostWithRetry(payload);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          error: parseMertcafeErrorBody(data as Record<string, unknown>) || `Boost failed (${res.status})`,
          upstream_status: res.status,
          request_id: (data as { request_id?: string }).request_id,
        },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Boost failed' }, { status: 503 });
  }
}

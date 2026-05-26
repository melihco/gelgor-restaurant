import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BASE_URL = process.env.MERTCAFE_BASE_URL ?? 'https://web-production-02d278.up.railway.app';
const API_KEY = process.env.MERTCAFE_API_KEY ?? '';

type BoostBody = {
  post_id?: string;
  goal?: 'engagement' | 'reach' | 'traffic' | 'messages';
  budget?: number;
  duration_days?: number;
};

async function callBoostWithRetry(payload: Record<string, unknown>): Promise<Response> {
  let last: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${BASE_URL}/api/boost`, {
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
  if (!API_KEY) return NextResponse.json({ error: 'MERTCAFE_API_KEY is not configured' }, { status: 500 });

  const body = (await request.json().catch(() => null)) as BoostBody | null;
  if (!body?.post_id) return NextResponse.json({ error: 'post_id is required' }, { status: 400 });

  const payload = {
    api_key: API_KEY,
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
          error: (data as { message?: string; error?: string }).message || (data as { message?: string; error?: string }).error || `Boost failed (${res.status})`,
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

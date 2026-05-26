import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CREW_API = process.env.CREW_BACKEND_URL ?? 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  if (!body?.workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  const { workspaceId, ...payload } = body;
  try {
    const res = await fetch(`${CREW_API}/api/v1/social/meta/boost/${workspaceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

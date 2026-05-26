import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CREW_API = process.env.CREW_BACKEND_URL ?? 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${CREW_API}/api/v1/social/meta/ad-accounts/${workspaceId}`, {
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
      signal: AbortSignal.timeout(25_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CREW_API = getCrewBackendBaseUrl();
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${CREW_API}/api/v1/social/meta/campaigns/${workspaceId}`, {
      headers: {
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(25_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'crew_backend_unreachable',
        message,
        hint: 'Start Python: ./scripts/start-crew-backend.sh',
        campaigns: [],
      },
      { status: 503 },
    );
  }
}

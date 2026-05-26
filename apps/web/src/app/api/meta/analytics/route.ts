import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const CREW_API = process.env.CREW_BACKEND_URL ?? 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${CREW_API}/api/v1/social/meta/analytics/${workspaceId}`, {
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
      next: { revalidate: 3600 },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const workspaceId = request.nextUrl.searchParams.get('workspaceId');
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  try {
    await fetch(`${CREW_API}/api/v1/social/meta/disconnect/${workspaceId}`, {
      method: 'DELETE',
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'disconnect failed' }, { status: 500 });
  }
}

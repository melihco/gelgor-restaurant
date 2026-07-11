import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

const INTERNAL_KEY = serverConfig.internal.apiKey;

export async function GET(req: NextRequest) {
  const access = await assertPlatformAdminAccess(req);
  if (access instanceof Response) return access;

  const origin = req.nextUrl.origin;
  try {
    const res = await fetch(`${origin}/api/queue/stats`, {
      headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'queue stats unavailable' },
      { status: 502 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { loadPlatformAdminOverview } from '@/lib/platform-admin-data';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const overview = await loadPlatformAdminOverview(req);
  return NextResponse.json(overview);
}

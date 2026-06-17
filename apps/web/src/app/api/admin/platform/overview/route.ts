import { NextRequest, NextResponse } from 'next/server';
import { loadPlatformAdminOverview } from '@/lib/platform-admin-data';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const overview = await loadPlatformAdminOverview(req);
  return NextResponse.json(overview);
}

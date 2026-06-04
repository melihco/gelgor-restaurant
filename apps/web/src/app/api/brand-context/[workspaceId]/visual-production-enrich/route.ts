/**
 * POST — opt-in Visual Production Director enrich (proxies to Crew).
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const body = await req.json();
  return proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/visual-production-enrich`,
    { method: 'POST', workspaceId, body, timeoutMs: 120_000 },
  );
}

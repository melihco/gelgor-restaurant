/**
 * BFF — announcement overlay template preferences (stored in brand_theme.announcement_library)
 */
import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  return proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/announcement-templates`,
    { method: 'GET', workspaceId },
  );
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<NextResponse> {
  const { workspaceId } = await context.params;
  const body = await req.json();
  return proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}/announcement-templates`,
    { method: 'PUT', workspaceId, body },
  );
}

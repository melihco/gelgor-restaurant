import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}));
  const workspaceId = (body as any)?.workspaceId
    ?? req.headers.get('x-workspace-id')
    ?? '';

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  return proxyToCrewBackend(
    `/api/v1/social/meta/disconnect/${workspaceId}`,
    { method: 'DELETE', workspaceId },
  );
}

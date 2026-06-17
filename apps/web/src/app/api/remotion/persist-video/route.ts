import { NextRequest, NextResponse } from 'next/server';
import { persistRemotionVideoOutput } from '@/lib/remotion-video-persist';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: {
    workspaceId?: string;
    videoBase64?: string;
    compositionId?: string;
    bytes?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const workspaceId = String(body.workspaceId ?? '').trim();
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const videoUrl = await persistRemotionVideoOutput(workspaceId, {
    videoBase64: body.videoBase64,
    compositionId: body.compositionId,
    bytes: body.bytes,
  });

  if (!videoUrl) {
    return NextResponse.json({ error: 'Video persist failed' }, { status: 422 });
  }

  return NextResponse.json({ videoUrl });
}

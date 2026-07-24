import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ workspaceId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { workspaceId } = await ctx.params;
  if (!workspaceId?.trim()) {
    return Response.json({ error: 'workspaceId required' }, { status: 400 });
  }

  return proxyToCrewBackend(`/api/v1/platform/brands/${workspaceId}`, {
    workspaceId,
    method: 'GET',
  });
}

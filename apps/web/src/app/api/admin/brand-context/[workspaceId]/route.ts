import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Ctx = { params: Promise<{ workspaceId: string }> };

/** GET|PATCH → Nexus /api/platform/brand-context/{workspaceId} */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { workspaceId } = await ctx.params;
  return proxyNexusJson(req, `/api/platform/brand-context/${workspaceId}`, {
    method: 'GET',
    headers: forwardOperatorHeaders(req),
    body: null,
    search: '',
  });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { workspaceId } = await ctx.params;
  const body = await req.text();
  return proxyNexusJson(req, `/api/platform/brand-context/${workspaceId}`, {
    method: 'PATCH',
    headers: {
      ...forwardOperatorHeaders(req),
      'Content-Type': 'application/json',
    },
    body,
    search: '',
  });
}

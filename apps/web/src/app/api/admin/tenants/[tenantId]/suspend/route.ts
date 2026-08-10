import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ tenantId: string }> };

/** POST → Nexus POST /api/platform/tenants/{id}/suspend */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId } = await ctx.params;
  return proxyNexusJson(req, `/api/platform/tenants/${tenantId}/suspend`, {
    method: 'POST',
    headers: {
      ...forwardOperatorHeaders(req),
      'Content-Type': 'application/json',
    },
    body: '{}',
    search: '',
  });
}

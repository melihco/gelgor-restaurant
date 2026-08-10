import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Platform admin brand-context subpaths → Nexus /api/platform/brand-context/{ws}/…
 * Allowlisted to match PlatformBrandContextController.
 */
const ALLOWED = new Set([
  'snapshot',
  'analyze',
  'complete-gaps',
  'confirm-constitution',
  'theme',
  'vibe',
  'gallery-analysis',
  'brand-gaps',
]);

type Ctx = { params: Promise<{ workspaceId: string; path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { workspaceId, path } = await ctx.params;
  if (!workspaceId || !/^[0-9a-f-]{36}$/i.test(workspaceId)) {
    return Response.json({ error: 'invalid workspaceId' }, { status: 400 });
  }
  if (!path?.length || path.length > 2) {
    return Response.json({ error: 'path required' }, { status: 400 });
  }
  const leaf = path[0]!;
  if (!ALLOWED.has(leaf)) {
    return Response.json(
      { error: 'path not allowlisted for admin brand-context', path },
      { status: 400 },
    );
  }

  const method = req.method.toUpperCase();
  const needsBody = method !== 'GET' && method !== 'HEAD';
  const body = needsBody ? await req.text() : null;
  const headers = {
    ...forwardOperatorHeaders(req),
    ...(needsBody ? { 'Content-Type': 'application/json' } : {}),
  };

  return proxyNexusJson(
    req,
    `/api/platform/brand-context/${workspaceId}/${path.join('/')}`,
    {
      method,
      headers,
      body,
      search: req.nextUrl.search || '',
    },
  );
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;

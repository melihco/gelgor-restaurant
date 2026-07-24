import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import {
  proxyNexusJson,
  targetTenantInternalHeaders,
} from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ALLOWED_PREFIXES = [
  'security/',
  'Agents',
  'agents',
  'Briefs',
  'briefs',
  'Tasks',
  'tasks',
  'actions',
  'Packages',
  'packages',
  'Integrations',
  'integrations',
  'Setup',
  'setup',
  'operations',
  'Artifacts',
  'artifacts',
];

function isAllowedNexusPath(segments: string[]): boolean {
  const joined = segments.join('/');
  return ALLOWED_PREFIXES.some(
    (p) => joined === p.replace(/\/$/, '') || joined.startsWith(p),
  );
}

type Ctx = { params: Promise<{ tenantId: string; path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const { tenantId, path } = await ctx.params;
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return Response.json({ error: 'invalid tenantId' }, { status: 400 });
  }
  if (!path?.length || !isAllowedNexusPath(path)) {
    return Response.json(
      { error: 'path not allowlisted for platform workspace proxy', path },
      { status: 400 },
    );
  }

  const nexusPath = `/api/${path.join('/')}`;
  const bearer = req.headers.get('x-impersonation-token')?.trim() || undefined;
  const headers = targetTenantInternalHeaders(tenantId, {
    bearerToken: bearer,
    userId: req.headers.get('x-target-user-id')?.trim() || undefined,
    officeId: req.headers.get('x-target-office-id')?.trim() || undefined,
  });
  if (req.headers.get('content-type')) {
    headers['Content-Type'] = req.headers.get('content-type')!;
  }

  return proxyNexusJson(req, nexusPath, { headers });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

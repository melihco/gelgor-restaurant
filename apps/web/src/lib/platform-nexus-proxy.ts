/**
 * Server-only helpers for Super Admin → Nexus with target-tenant scope.
 *
 * Two modes:
 * 1) Operator JWT (cookie/Bearer) — for /api/platform/* (registry, impersonate)
 * 2) INTERNAL_API_KEY + X-Platform-Admin — for tenant-scoped Users/Agents/Briefs/…
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(
  /\/$/,
  '',
);

function internalApiKey(): string {
  return (
    process.env.INTERNAL_API_KEY?.trim()
    || process.env.NEXUS_INTERNAL_API_KEY?.trim()
    || 'smartagency-internal-dev-key'
  );
}

/** Forward operator session headers to Nexus platform endpoints. */
export function forwardOperatorHeaders(req: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const authorization = req.headers.get('authorization');
  const tenant = req.headers.get('x-tenant-id');
  const user = req.headers.get('x-user-id');
  const office = req.headers.get('x-office-id');
  const cookie = req.headers.get('cookie');
  if (authorization) headers.Authorization = authorization;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  if (user) headers['X-User-Id'] = user;
  if (office) headers['X-Office-Id'] = office;
  if (cookie) headers.Cookie = cookie;
  return headers;
}

/**
 * Headers for reading/writing a *selected brand* via Nexus tenant APIs.
 * Requires INTERNAL_API_KEY; Nexus PermissionService elevates with X-Platform-Admin.
 */
export function targetTenantInternalHeaders(
  tenantId: string,
  opts?: { userId?: string; officeId?: string; bearerToken?: string },
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Internal-Api-Key': internalApiKey(),
    'X-Platform-Admin': '1',
    'X-Tenant-Id': tenantId,
  };
  if (opts?.userId) headers['X-User-Id'] = opts.userId;
  if (opts?.officeId) headers['X-Office-Id'] = opts.officeId;
  if (opts?.bearerToken) headers.Authorization = `Bearer ${opts.bearerToken}`;
  return headers;
}

export async function proxyNexusJson(
  req: NextRequest,
  path: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
    search?: string;
  },
): Promise<NextResponse> {
  const method = init?.method ?? req.method;
  const qs = init?.search ?? (req.nextUrl.search || '');
  const url = `${NEXUS_API}${path.startsWith('/') ? path : `/${path}`}${qs}`;
  const upstream = await fetch(url, {
    method,
    headers: init?.headers,
    body: init?.body === undefined
      ? (method === 'GET' || method === 'HEAD' ? undefined : await req.text())
      : init.body ?? undefined,
    cache: 'no-store',
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    },
  });
}

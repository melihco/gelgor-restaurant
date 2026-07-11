import type { NextRequest } from 'next/server';
import { extractTenantIdFromAuthHeader } from '@/lib/jwt-tenant';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');

export interface PlatformAdminUser {
  userId: string;
  tenantId: string;
  tenantName: string;
  role: string;
  displayName: string;
  email: string;
  permissions: string[];
}

function copyForwardHeaders(req: NextRequest): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const auth = req.headers.get('authorization');
  const tenant = req.headers.get('x-tenant-id');
  const user = req.headers.get('x-user-id');
  const office = req.headers.get('x-office-id');
  if (auth) headers.Authorization = auth;
  if (tenant) headers['X-Tenant-Id'] = tenant;
  if (user) headers['X-User-Id'] = user;
  if (office) headers['X-Office-Id'] = office;
  return headers;
}

function isPlatformAdminDevBypass(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return (
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN === 'true' ||
    process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true'
  );
}

/** Client + server — platform admin yüzeyine erişim kontrolü. */
export function canAccessPlatformAdmin(permissions: string[] | null | undefined): boolean {
  if (isPlatformAdminDevBypass()) return true;

  const perms = permissions ?? [];
  if (perms.includes('users.manage')) return true;
  const flagEnabled = process.env.NEXT_PUBLIC_PLATFORM_ADMIN === 'true';
  if (flagEnabled && perms.includes('operations.view')) return true;
  return false;
}

function devBypassPlatformAdminUser(req: NextRequest): PlatformAdminUser {
  const tenantId = resolvePlatformAdminTenantId(req);
  const userId =
    req.headers.get('x-user-id')?.trim() || '00000000-0000-0000-0000-000000000001';
  return {
    userId,
    tenantId,
    tenantName: 'Dev bypass',
    role: 'Admin',
    displayName: 'Dev Admin',
    email: '',
    permissions: ['users.manage', 'operations.view'],
  };
}

/** Oturum / header / env sırasıyla aktif workspace tenant id. */
export function resolvePlatformAdminTenantId(
  req: NextRequest,
  authUser?: PlatformAdminUser | null,
): string {
  const fromAuth = authUser?.tenantId?.trim();
  if (fromAuth) return fromAuth;

  const fromHeader = req.headers.get('x-tenant-id')?.trim();
  if (fromHeader) return fromHeader;

  const fromJwt = extractTenantIdFromAuthHeader(req.headers.get('authorization'));
  if (fromJwt) return fromJwt;

  const fromEnv = process.env.NEXT_PUBLIC_TENANT_ID?.trim();
  if (fromEnv) return fromEnv;

  return '00000000-0000-0000-0000-000000000001';
}

export async function fetchPlatformAdminUser(req: NextRequest): Promise<PlatformAdminUser | null> {
  try {
    const res = await fetch(`${NEXUS_API}/api/security/me`, {
      headers: copyForwardHeaders(req),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PlatformAdminUser;
  } catch {
    return null;
  }
}

/** BFF route guard — null dönerse erişim var; aksi halde NextResponse. */
export async function assertPlatformAdminAccess(
  req: NextRequest,
): Promise<{ user: PlatformAdminUser } | Response> {
  const user = await fetchPlatformAdminUser(req);
  if (!user) {
    if (isPlatformAdminDevBypass()) return { user: devBypassPlatformAdminUser(req) };
    return new Response(JSON.stringify({ error: 'Unauthorized', code: 'auth_required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!canAccessPlatformAdmin(user.permissions)) {
    if (isPlatformAdminDevBypass()) return { user };
    return new Response(JSON.stringify({ error: 'Forbidden', code: 'platform_admin_required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { user };
}

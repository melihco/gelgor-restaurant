import { NextRequest, NextResponse } from 'next/server';
import { extractTenantIdFromAuthHeader } from '@/lib/jwt-tenant';

const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** API prefixes whose first path segment after the prefix is workspace/tenant id. */
const TENANT_PATH_PREFIXES = [
  '/api/brand-context/',
  '/api/brand-context-data/',
  '/api/brand-readiness/',
  '/api/brand-alignment/',
  '/api/gallery-intelligence/',
  '/api/context-signals/',
  '/api/missions/',
  '/api/missions-proxy/',
  '/api/design-director/',
  '/api/design-cards/',
  '/api/brand-rules/',
  '/api/intelligence/',
  '/api/usage-cost/',
  '/api/tenant-learning/',
] as const;

function extractPathTenantId(pathname: string): string | null {
  for (const prefix of TENANT_PATH_PREFIXES) {
    if (!pathname.startsWith(prefix)) continue;
    const segment = pathname.slice(prefix.length).split('/')[0] ?? '';
    if (UUID_RE.test(segment)) return segment;
  }
  return null;
}

export function middleware(req: NextRequest): NextResponse {
  const pathTenant = extractPathTenantId(req.nextUrl.pathname);
  if (!pathTenant) {
    return NextResponse.next();
  }

  const internal = req.headers.get('X-Internal-Api-Key')?.trim();
  if (internal && internal === INTERNAL_KEY) {
    return NextResponse.next();
  }

  const headerTenant = (
    req.headers.get('X-Tenant-Id') ||
    req.headers.get('x-tenant-id') ||
    extractTenantIdFromAuthHeader(req.headers.get('Authorization')) ||
    ''
  ).trim();

  if (!headerTenant) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'X-Tenant-Id required', code: 'tenant_required' },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  if (headerTenant.toLowerCase() !== pathTenant.toLowerCase()) {
    return NextResponse.json(
      {
        error: 'Path tenant does not match authenticated tenant',
        code: 'tenant_mismatch',
        pathTenantId: pathTenant,
      },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/brand-context/:path*',
    '/api/brand-context-data/:path*',
    '/api/brand-readiness/:path*',
    '/api/brand-alignment/:path*',
    '/api/gallery-intelligence/:path*',
    '/api/context-signals/:path*',
    '/api/missions/:path*',
    '/api/missions-proxy/:path*',
    '/api/design-director/:path*',
    '/api/design-cards/:path*',
    '/api/brand-rules/:path*',
    '/api/intelligence/:path*',
    '/api/usage-cost/:path*',
    '/api/tenant-learning/:path*',
  ],
};

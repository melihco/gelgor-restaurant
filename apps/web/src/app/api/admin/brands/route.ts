import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { forwardOperatorHeaders, proxyNexusJson } from '@/lib/platform-nexus-proxy';

export const runtime = 'nodejs';

/**
 * Platform admin brand / tenant registry.
 * - default / ?source=brands → Python brand_contexts (crew intelligence)
 * - ?source=nexus → Nexus GET /api/platform/tenants (customer SSOT)
 * - ?source=tenants → Python mirror tenants
 * - ?source=by_sector → Python brands-by-sector
 */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const source = req.nextUrl.searchParams.get('source') || 'brands';

  if (source === 'nexus') {
    const params = new URLSearchParams(req.nextUrl.searchParams);
    params.delete('source');
    const suffix = params.toString() ? `?${params}` : '';
    return proxyNexusJson(req, '/api/platform/tenants', {
      method: 'GET',
      headers: forwardOperatorHeaders(req),
      body: null,
      search: suffix,
    });
  }

  if (source === 'by_sector') {
    return proxyToCrewBackend('/api/v1/platform/brands-by-sector', { method: 'GET' });
  }

  if (source === 'tenants') {
    const params = new URLSearchParams();
    const q = req.nextUrl.searchParams.get('q');
    const includeInactive = req.nextUrl.searchParams.get('include_inactive');
    if (q) params.set('q', q);
    if (includeInactive) params.set('include_inactive', includeInactive);
    const suffix = params.toString() ? `?${params}` : '';
    return proxyToCrewBackend(`/api/v1/tenants${suffix}`, { method: 'GET' });
  }

  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.delete('source');
  const suffix = params.toString() ? `?${params}` : '';
  return proxyToCrewBackend(`/api/v1/platform/brands${suffix}`, { method: 'GET' });
}

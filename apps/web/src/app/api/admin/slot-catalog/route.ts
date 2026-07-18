import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

/**
 * Platform admin — global slot catalog + tenant management proxies.
 * UI not implemented here; auth-gated BFF for future admin screens.
 */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const sectorId = req.nextUrl.searchParams.get('sector_id');
  const view = req.nextUrl.searchParams.get('view');
  const workspaceId = req.nextUrl.searchParams.get('workspace_id')?.trim();

  if (view === 'library_shelves') {
    return proxyToCrewBackend('/api/v1/slot-catalog/library-shelves', { method: 'GET' });
  }
  if (view === 'sectors') {
    return proxyToCrewBackend('/api/v1/slot-catalog/sectors', { method: 'GET' });
  }
  if (view === 'overview' && workspaceId) {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/overview`, {
      workspaceId,
      method: 'GET',
    });
  }
  if (view === 'facilities' && workspaceId) {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/facilities`, {
      workspaceId,
      method: 'GET',
    });
  }
  if (view === 'assignments' && workspaceId) {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/assignments`, {
      workspaceId,
      method: 'GET',
    });
  }
  if (sectorId) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots`,
      { method: 'GET' },
    );
  }
  return proxyToCrewBackend('/api/v1/slot-catalog/slots', { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const workspaceId =
    (typeof body?.workspace_id === 'string' && body.workspace_id.trim()) ||
    req.nextUrl.searchParams.get('workspace_id')?.trim();
  if (!workspaceId) {
    return Response.json({ error: 'workspace_id required' }, { status: 400 });
  }

  const action =
    (typeof body?.action === 'string' && body.action.trim()) ||
    req.nextUrl.searchParams.get('action') ||
    'bootstrap';

  if (action === 'preview') {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/preview`, {
      workspaceId,
      method: 'POST',
      body: {
        facilities: body?.facilities ?? null,
        assignments: body?.assignments ?? null,
      },
    });
  }
  if (action === 'sync_facilities') {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/sync-facilities`, {
      workspaceId,
      method: 'POST',
      body: {},
    });
  }
  if (action === 'reset_defaults') {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/reset-defaults`, {
      workspaceId,
      method: 'POST',
      body: {
        sector_id: typeof body?.sector_id === 'string' ? body.sector_id : null,
        reset_facilities: body?.reset_facilities !== false,
        reset_assignments: body?.reset_assignments !== false,
        force_operator: body?.force_operator !== false,
      },
    });
  }

  const sectorId = typeof body?.sector_id === 'string' ? body.sector_id : undefined;
  const qs = sectorId ? `?sector_id=${encodeURIComponent(sectorId)}` : '';
  return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/bootstrap${qs}`, {
    workspaceId,
    method: 'POST',
    body: {},
  });
}

export async function PUT(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const workspaceId =
    (typeof body?.workspace_id === 'string' && body.workspace_id.trim()) ||
    req.nextUrl.searchParams.get('workspace_id')?.trim();
  if (!workspaceId) {
    return Response.json({ error: 'workspace_id required' }, { status: 400 });
  }

  const target =
    (typeof body?.target === 'string' && body.target.trim()) ||
    req.nextUrl.searchParams.get('target') ||
    'assignments';

  if (target === 'facilities') {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/facilities`, {
      workspaceId,
      method: 'PUT',
      body: {
        facilities: body?.facilities ?? {},
        sync_assignments: Boolean(body?.sync_assignments),
      },
    });
  }

  return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/assignments`, {
    workspaceId,
    method: 'PUT',
    body: { assignments: body?.assignments ?? [] },
  });
}

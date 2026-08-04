import { NextRequest } from 'next/server';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

/**
 * Platform admin — global slot catalog + tenant management proxies.
 *
 * OpenAPI contract for UI agents: `/docs/admin-slot-catalog.openapi.json`
 * (also `GET ?view=openapi`).
 */
export async function GET(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const sectorId = req.nextUrl.searchParams.get('sector_id');
  const view = req.nextUrl.searchParams.get('view');
  const workspaceId = req.nextUrl.searchParams.get('workspace_id')?.trim();
  const slotKey = req.nextUrl.searchParams.get('slot_key')?.trim();

  if (view === 'openapi') {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    try {
      const path = join(process.cwd(), 'docs', 'admin-slot-catalog.openapi.json');
      const raw = await readFile(path, 'utf8');
      return new Response(raw, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    } catch {
      return Response.json({ error: 'openapi_contract_missing' }, { status: 404 });
    }
  }
  if (view === 'readiness') {
    return proxyToCrewBackend('/api/v1/slot-catalog/readiness', { method: 'GET' });
  }
  if (view === 'library_shelves') {
    return proxyToCrewBackend('/api/v1/slot-catalog/library-shelves', { method: 'GET' });
  }
  if (view === 'sectors') {
    const activeOnly = req.nextUrl.searchParams.get('active_only');
    const qs = activeOnly != null ? `?active_only=${encodeURIComponent(activeOnly)}` : '';
    return proxyToCrewBackend(`/api/v1/slot-catalog/sectors${qs}`, { method: 'GET' });
  }
  if (view === 'sector_resolve' && workspaceId) {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/sector`, {
      workspaceId,
      method: 'GET',
    });
  }
  if (view === 'sector' && sectorId) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}`,
      { method: 'GET' },
    );
  }
  if (view === 'coverage' && sectorId) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/coverage`,
      { method: 'GET' },
    );
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
  if (slotKey) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/slots/${encodeURIComponent(slotKey)}`,
      { method: 'GET' },
    );
  }
  if (sectorId) {
    const params = new URLSearchParams(req.nextUrl.searchParams);
    params.delete('sector_id');
    params.delete('view');
    const qs = params.toString() ? `?${params}` : '';
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots${qs}`,
      { method: 'GET' },
    );
  }
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.delete('view');
  const qs = params.toString() ? `?${params}` : '';
  return proxyToCrewBackend(`/api/v1/slot-catalog/slots${qs}`, { method: 'GET' });
}

export async function POST(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const action =
    (typeof body?.action === 'string' && body.action.trim()) ||
    req.nextUrl.searchParams.get('action') ||
    '';

  // Catalog seed upsert (server injects internal key — platform admin only).
  if (action === 'sync_seed') {
    const key = serverConfig.internal.apiKey;
    if (!key) {
      return Response.json({ error: 'internal_api_key_not_configured' }, { status: 503 });
    }
    return proxyToCrewBackend('/api/v1/slot-catalog/sync-seed', {
      method: 'POST',
      body: {},
      timeoutMs: 120_000,
      headers: { 'X-Internal-Api-Key': key },
    });
  }

  // Global / brand slot authoring (no tenant bootstrap required).
  if (action === 'create_slot' || action === 'create_sector') {
    const path = action === 'create_sector'
      ? '/api/v1/slot-catalog/sectors'
      : '/api/v1/slot-catalog/slots';
    const { action: _a, ...payload } = body as Record<string, unknown>;
    return proxyToCrewBackend(path, { method: 'POST', body: payload });
  }
  if (action === 'clone_slot' && typeof body?.slot_key === 'string') {
    const { action: _a, slot_key: sourceKey, ...payload } = body as Record<string, unknown>;
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/slots/${encodeURIComponent(String(sourceKey))}/clone`,
      { method: 'POST', body: payload },
    );
  }
  if (
    (action === 'archive_slot' || action === 'activate_slot')
    && typeof body?.slot_key === 'string'
  ) {
    const verb = action === 'archive_slot' ? 'archive' : 'activate';
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/slots/${encodeURIComponent(body.slot_key)}/${verb}`,
      { method: 'POST', body: {} },
    );
  }

  const workspaceId =
    (typeof body?.workspace_id === 'string' && body.workspace_id.trim()) ||
    req.nextUrl.searchParams.get('workspace_id')?.trim();
  if (!workspaceId) {
    return Response.json({ error: 'workspace_id required' }, { status: 400 });
  }

  if (action === 'custom_slot') {
    const { action: _a, workspace_id: _w, ...payload } = body as Record<string, unknown>;
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/custom-slots`, {
      workspaceId,
      method: 'POST',
      body: payload,
    });
  }
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

export async function PATCH(req: NextRequest) {
  const auth = await assertPlatformAdminAccess(req);
  if (auth instanceof Response) return auth;

  const body = await req.json().catch(() => ({}));
  const target =
    (typeof body?.target === 'string' && body.target.trim()) ||
    req.nextUrl.searchParams.get('target') ||
    'slot';

  if (target === 'sector' && typeof body?.sector_id === 'string') {
    const { target: _t, sector_id: sectorId, ...payload } = body as Record<string, unknown>;
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(String(sectorId))}`,
      { method: 'PATCH', body: payload },
    );
  }

  const slotKey =
    (typeof body?.slot_key === 'string' && body.slot_key.trim()) ||
    req.nextUrl.searchParams.get('slot_key')?.trim();
  if (!slotKey) {
    return Response.json({ error: 'slot_key required' }, { status: 400 });
  }
  const { target: _t, slot_key: _k, ...payload } = body as Record<string, unknown>;
  return proxyToCrewBackend(
    `/api/v1/slot-catalog/slots/${encodeURIComponent(slotKey)}`,
    { method: 'PATCH', body: payload },
  );
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

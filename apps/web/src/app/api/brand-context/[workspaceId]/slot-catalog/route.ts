import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

type RouteCtx = { params: Promise<{ workspaceId: string }> };

/**
 * BFF — tenant slot catalog:
 * - GET assignments | overview | facilities | library shelves | sector slots
 * - POST bootstrap | preview | sync-facilities | reset-defaults
 * - PUT assignments | facilities
 *
 * No admin UI here — API surface for future Platform / Marka management.
 */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { workspaceId } = await ctx.params;
  const view = req.nextUrl.searchParams.get('view');
  const sectorId = req.nextUrl.searchParams.get('sector_id')?.trim();

  if (view === 'library_shelves') {
    return proxyToCrewBackend('/api/v1/slot-catalog/library-shelves', { method: 'GET' });
  }
  if (view === 'sector_slots' && sectorId) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots`,
      { method: 'GET' },
    );
  }
  if (view === 'overview') {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/overview`, {
      workspaceId,
      method: 'GET',
    });
  }
  if (view === 'facilities') {
    return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/facilities`, {
      workspaceId,
      method: 'GET',
    });
  }

  const enabledOnly = req.nextUrl.searchParams.get('enabled_only') === 'true';
  const qs = enabledOnly ? '?enabled_only=true' : '';
  return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/assignments${qs}`, {
    workspaceId,
    method: 'GET',
  });
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { workspaceId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
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

  // Default: bootstrap (existing clients)
  const sectorId = typeof body?.sector_id === 'string' ? body.sector_id : undefined;
  const qs = sectorId ? `?sector_id=${encodeURIComponent(sectorId)}` : '';
  return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/bootstrap${qs}`, {
    workspaceId,
    method: 'POST',
    body: {},
  });
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { workspaceId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
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

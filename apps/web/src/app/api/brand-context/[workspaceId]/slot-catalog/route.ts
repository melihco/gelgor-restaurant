import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

type RouteCtx = { params: Promise<{ workspaceId: string }> };

/** BFF — tenant slot catalog assignments (read + bootstrap) and sector slot definitions. */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { workspaceId } = await ctx.params;
  const view = req.nextUrl.searchParams.get('view');
  const sectorId = req.nextUrl.searchParams.get('sector_id')?.trim();
  if (view === 'sector_slots' && sectorId) {
    return proxyToCrewBackend(
      `/api/v1/slot-catalog/sectors/${encodeURIComponent(sectorId)}/slots`,
      { method: 'GET' },
    );
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
  return proxyToCrewBackend(`/api/v1/slot-catalog/tenants/${workspaceId}/assignments`, {
    workspaceId,
    method: 'PUT',
    body,
  });
}

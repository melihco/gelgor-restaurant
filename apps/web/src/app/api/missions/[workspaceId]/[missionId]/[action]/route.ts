/**
 * Catch-all handler for mission sub-actions:
 *   GET  /api/missions/{ws}/{id}/progress
 *   GET  /api/missions/{ws}/{id}
 *   PUT  /api/missions/{ws}/{id}/approve
 *   PUT  /api/missions/{ws}/{id}/reject
 *   PUT  /api/missions/{ws}/{id}/cancel
 *
 * When action === the missionId itself (i.e. no sub-path), the route file at
 * [missionId]/route.ts handles GET detail. This file handles named actions.
 */
import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string; action: string }> },
) {
  const { workspaceId, missionId, action } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;
  const search = req.nextUrl.searchParams.toString();
  const suffix = search ? `?${search}` : '';
  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/${missionId}/${action}${suffix}`,
    { workspaceId, timeoutMs: action === 'progress' ? 60_000 : 25_000 },
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string; action: string }> },
) {
  const { workspaceId, missionId, action } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;
  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body */ }
  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/${missionId}/${action}`,
    { method: 'PUT', body, workspaceId, timeoutMs: 25_000 },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string; action: string }> },
) {
  const { workspaceId, missionId, action } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;
  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body */ }
  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/${missionId}/${action}`,
    { method: 'POST', body, workspaceId, timeoutMs: 60_000 },
  );
}

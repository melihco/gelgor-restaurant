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

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string; action: string }> },
) {
  const { workspaceId, missionId, action } = await params;
  return proxyToCrewBackend(`/api/v1/missions/${workspaceId}/${missionId}/${action}`);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string; action: string }> },
) {
  const { workspaceId, missionId, action } = await params;
  let body: unknown = {};
  try { body = await req.json(); } catch { /* no body */ }
  return proxyToCrewBackend(
    `/api/v1/missions/${workspaceId}/${missionId}/${action}`,
    { method: 'PUT', body, timeoutMs: 15_000 },
  );
}

/**
 * BFF route — gallery match-score log (Sprint 2 / S2.9).
 *
 * GET  → { scores: number[], updatedAt }
 * POST { scores: number[] } → appends to the rolling window (~40 kept).
 *
 * Feeds the GIS "matcher avg ≥58" check.
 */
import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/gallery-match-stats`, {
    method: 'GET',
    workspaceId,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await request.json().catch(() => ({ scores: [] }));
  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/gallery-match-stats`, {
    method: 'POST',
    workspaceId,
    body,
    timeoutMs: 10_000,
  });
}

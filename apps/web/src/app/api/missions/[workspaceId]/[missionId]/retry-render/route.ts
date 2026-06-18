/**
 * POST /api/missions/{workspaceId}/{missionId}/retry-render
 * Re-triggers Remotion for all failed/stale story + designed-post bundles in one mission.
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import { filterMissionRenderRetryArtifacts } from '@/lib/mission-render-retry';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BASE_URL = (process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');
const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  const listRes = await fetch(`${NEXUS_API}/api/artifacts?limit=120`, {
    headers: {
      'X-Tenant-Id': workspaceId,
      'X-Internal-Api-Key': INTERNAL_KEY,
    },
  });
  if (!listRes.ok) {
    return NextResponse.json({ error: 'artifacts_list_failed' }, { status: listRes.status });
  }

  const artifacts = (await listRes.json()) as Array<{ id: string; metadata?: string; content?: string; contentUrl?: string; contentType?: string; createdAt?: string }>;
  const stubs = artifacts.map((art) => ({
    id: art.id,
    content: art.content ?? '{}',
    metadata: art.metadata ? JSON.parse(art.metadata) : {},
    contentUrl: art.contentUrl ?? '',
    createdAt: art.createdAt ?? new Date().toISOString(),
    contentType: art.contentType,
  })) as unknown as import('@/types').OutputArtifact[];

  const targets = filterMissionRenderRetryArtifacts(stubs, missionId);
  if (!targets.length) {
    return NextResponse.json({ ok: true, queued: 0, message: 'Yeniden render gerektiren bundle yok' });
  }

  const results: Array<{ artifactId: string; status: number }> = [];
  for (const art of targets.slice(0, 12)) {
    const res = await fetch(`${BASE_URL}/api/production-bundle/${art.id}/retry-render`, {
      method: 'POST',
      headers: { 'X-Tenant-Id': workspaceId },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    results.push({ artifactId: art.id, status: res?.status ?? 0 });
  }

  return NextResponse.json({
    ok: true,
    queued: results.filter((r) => r.status === 202 || r.status === 200).length,
    total: targets.length,
    results,
  }, { status: 202 });
}

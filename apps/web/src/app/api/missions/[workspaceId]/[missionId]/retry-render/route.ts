/**
 * POST /api/missions/{workspaceId}/{missionId}/retry-render
 * Re-triggers fal overlay for all failed/stale story + designed-post bundles in one mission.
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertPathTenantMatchesRequest, buildInternalProductionHeaders } from '@/lib/tenant-production-guard';
import { parseArtifactMetadata } from '@/lib/artifact-utils';
import { filterMissionRenderRetryArtifacts } from '@/lib/mission-render-retry';
import { serverConfig } from '@/lib/server-config';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BASE_URL = getNextjsInternalOrigin();
const NEXUS_API = serverConfig.nexus.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; missionId: string }> },
) {
  const { workspaceId, missionId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  try {
    const listRes = await fetch(
      `${NEXUS_API}/api/artifacts?missionId=${encodeURIComponent(missionId)}&limit=200`,
      {
        headers: {
          'X-Tenant-Id': workspaceId,
          'X-Internal-Api-Key': INTERNAL_KEY,
        },
      },
    );
    if (!listRes.ok) {
      return NextResponse.json({ error: 'artifacts_list_failed' }, { status: listRes.status });
    }

    const raw = await listRes.text();
    let artifacts: Array<{ id: string; metadata?: unknown; content?: string; contentUrl?: string; contentType?: string; createdAt?: string }>;
    try {
      artifacts = JSON.parse(raw) as typeof artifacts;
    } catch {
      console.error('[retry-render] artifacts_list_json_invalid', { workspaceId, missionId, bytes: raw.length });
      return NextResponse.json({ error: 'artifacts_list_invalid_json' }, { status: 502 });
    }

    const stubs = artifacts.map((art) => ({
      id: art.id,
      content: art.content ?? '{}',
      metadata: parseArtifactMetadata(art.metadata),
      contentUrl: art.contentUrl ?? '',
      createdAt: art.createdAt ?? new Date().toISOString(),
      contentType: art.contentType,
    })) as unknown as import('@/types').OutputArtifact[];

    const targets = filterMissionRenderRetryArtifacts(stubs, missionId);
    if (!targets.length) {
      return NextResponse.json({ ok: true, queued: 0, message: 'Yeniden render gerektiren bundle yok' });
    }

    const storyFirst = [...targets].sort((a, b) => {
      const metaA = (a.metadata ?? {}) as Record<string, unknown>;
      const metaB = (b.metadata ?? {}) as Record<string, unknown>;
      const storyA = String(metaA.production_role ?? '').includes('story')
        || String(metaA.pipeline ?? '') === 'remotion_story';
      const storyB = String(metaB.production_role ?? '').includes('story')
        || String(metaB.pipeline ?? '') === 'remotion_story';
      if (storyA === storyB) return 0;
      return storyA ? -1 : 1;
    });

    const results: Array<{ artifactId: string; status: number }> = [];
    await Promise.allSettled(
      storyFirst.slice(0, 12).map(async (art) => {
        const res = await fetch(`${BASE_URL}/api/production-bundle/${art.id}/retry-render`, {
          method: 'POST',
          headers: buildInternalProductionHeaders(workspaceId),
          signal: AbortSignal.timeout(15_000),
        }).catch(() => null);
        results.push({ artifactId: art.id, status: res?.status ?? 0 });
      }),
    );

    return NextResponse.json({
      ok: true,
      queued: results.filter((r) => r.status === 202 || r.status === 200).length,
      total: targets.length,
      results,
    }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'retry_render_failed';
    console.error('[retry-render]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

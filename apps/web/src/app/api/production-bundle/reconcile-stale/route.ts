/**
 * POST /api/production-bundle/reconcile-stale
 * Marks stuck `rendering` bundles as ready when a gallery still exists (Remotion timeout / no R2).
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';
import {
  isBundleStaleRendering,
  expectsRemotionStoryVideo,
  resolveGalleryPhotoForRender,
  resolvePosterUrl,
} from '@/lib/production-bundle';
import { parseArtifactContent } from '@/lib/artifact-utils';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

const NEXUS_API = serverConfig.nexus.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

async function patchReady(
  artifactId: string,
  tenantId: string,
  imageUrl: string,
  contentType: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${NEXUS_API}/api/artifacts/${artifactId}/attach-image`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId,
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify({
        imageUrl,
        contentType,
        productionBundle: true,
        referencePhotoUrl: imageUrl,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const tenantId = (
    req.headers.get('X-Tenant-Id') ||
    req.headers.get('x-tenant-id') ||
    ''
  ).trim();
  const tenantGuard = assertWorkspaceMatchesRequestTenant(req, tenantId);
  if (tenantGuard) return tenantGuard;
  if (!tenantId) {
    return NextResponse.json({ error: 'X-Tenant-Id required' }, { status: 400 });
  }

  const listRes = await fetch(`${NEXUS_API}/api/artifacts?limit=40`, {
    headers: {
      'X-Tenant-Id': tenantId,
      'X-Internal-Api-Key': INTERNAL_KEY,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!listRes.ok) {
    return NextResponse.json({ error: 'artifacts list failed' }, { status: listRes.status });
  }
  const artifacts = (await listRes.json()) as Array<{
    id: string;
    content?: string;
    metadata?: string;
    contentUrl?: string;
    createdAt?: string;
    contentType?: string;
  }>;

  let reconciled = 0;
  let candidates = 0;
  for (const art of artifacts) {
    let metadata: Record<string, unknown> = {};
    if (art.metadata) {
      try {
        metadata = JSON.parse(art.metadata) as Record<string, unknown>;
      } catch {
        metadata = {};
      }
    }

    const stub = {
      id: art.id,
      content: art.content ?? '{}',
      metadata,
      contentUrl: art.contentUrl ?? '',
      createdAt: art.createdAt ?? new Date().toISOString(),
      contentType: art.contentType,
    } as unknown as import('@/types').OutputArtifact;

    if (!isBundleStaleRendering(stub)) continue;
    if (expectsRemotionStoryVideo(stub)) continue;
    candidates += 1;
    if (candidates > 5) break;

    const poster = resolveGalleryPhotoForRender(stub) || resolvePosterUrl(stub);
    if (!poster) continue;

    const content = parseArtifactContent(stub.content);
    const kind = String(content.kind || art.contentType || 'instagram_story').toLowerCase();
    const contentType = kind.includes('post') ? 'instagram_post' : 'instagram_story';

    if (await patchReady(art.id, tenantId, poster, contentType)) {
      reconciled += 1;
    }
  }

  return NextResponse.json({ reconciled });
}

/**
 * POST /api/production-bundle/reconcile-stale
 * Marks stuck `rendering` bundles as ready when a gallery still exists (Remotion timeout / no R2).
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';
import {
  isBundleStaleRendering,
  resolveGalleryPhotoForRender,
  resolvePosterUrl,
} from '@/lib/production-bundle';
import { parseArtifactContent } from '@/app/mobile/_components/artifact-utils';

export const runtime = 'nodejs';

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

async function patchReady(
  artifactId: string,
  tenantId: string,
  imageUrl: string,
  contentType: string,
): Promise<boolean> {
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
  });
  return res.ok;
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

  const listRes = await fetch(`${NEXUS_API}/api/artifacts`, {
    headers: {
      'X-Tenant-Id': tenantId,
      'X-Internal-Api-Key': INTERNAL_KEY,
    },
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
  for (const art of artifacts) {
    const stub = {
      id: art.id,
      content: art.content ?? '{}',
      metadata: art.metadata ? JSON.parse(art.metadata) : {},
      contentUrl: art.contentUrl ?? '',
      createdAt: art.createdAt ?? new Date().toISOString(),
      contentType: art.contentType,
    } as unknown as import('@/types').OutputArtifact;

    if (!isBundleStaleRendering(stub)) continue;

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

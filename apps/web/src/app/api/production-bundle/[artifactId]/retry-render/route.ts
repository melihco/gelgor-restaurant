/**
 * POST /api/production-bundle/{artifactId}/retry-render
 * Re-triggers fal/GPT-image overlay for a stuck/failed production bundle (fire-and-forget).
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';
import { parseArtifactContent, parseArtifactMetadata } from '@/lib/artifact-utils';
import {
  getProductionBundleStatus,
  isBundleRendering,
  isPostKind,
  resolveBrandedPostUrl,
  resolveGalleryPhotoForRender,
  resolvePosterUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { serverConfig } from '@/lib/server-config';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NEXUS_API = serverConfig.nexus.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;
const BASE_URL = getNextjsInternalOrigin();

async function patchBundleStatus(
  artifactId: string,
  tenantId: string,
  status: 'rendering' | 'ready' | 'failed',
  error?: string,
): Promise<void> {
  await fetch(`${NEXUS_API}/api/artifacts/${artifactId}/bundle-status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Internal-Api-Key': INTERNAL_KEY,
    },
    body: JSON.stringify({ status, error: error?.slice(0, 300) }),
  }).catch(() => undefined);
}

async function attachPoster(
  artifactId: string,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${NEXUS_API}/api/artifacts/${artifactId}/attach-image`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': tenantId,
      'X-Internal-Api-Key': INTERNAL_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  try {
    const { artifactId } = await params;
    const tenantId = req.headers.get('X-Tenant-Id') || req.headers.get('x-tenant-id') || '';
    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_required' }, { status: 400 });
    }
    const tenantGuard = assertWorkspaceMatchesRequestTenant(req, tenantId);
    if (tenantGuard) return tenantGuard;

    const artRes = await fetch(`${NEXUS_API}/api/artifacts/${artifactId}`, {
      headers: {
        'X-Tenant-Id': tenantId,
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
    });
    if (!artRes.ok) {
      return NextResponse.json({ error: 'artifact_not_found' }, { status: 404 });
    }
    const artifact = await artRes.json();
    const content = parseArtifactContent(artifact.content);
    const meta = parseArtifactMetadata(artifact.metadata);
    const normalizedArtifact = { ...artifact, metadata: meta };

    const posterUrl = resolveGalleryPhotoForRender(artifact)
      || resolvePosterUrl(artifact)
      || String(content.reference_photo_url || meta.reference_photo_url || content.imageUrl || '').trim();
    if (!posterUrl) {
      return NextResponse.json({ error: 'no_poster_url' }, { status: 400 });
    }

    const hadVideo = Boolean(resolveStoryVideoUrl(normalizedArtifact));
    const hadPoster = Boolean(resolveBrandedPostUrl(normalizedArtifact));
    const isPost = isPostKind(normalizedArtifact);
    const previousStatus = getProductionBundleStatus(normalizedArtifact);
    const wasRendering = isBundleRendering(artifact);

    await patchBundleStatus(artifactId, tenantId, 'rendering');

    void (async () => {
      try {
        await runFalRetryRender({ artifactId, tenantId, artifact, content, meta, isPost, posterUrl });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await patchBundleStatus(artifactId, tenantId, 'failed', msg);
      }
    })();

    return NextResponse.json({
      ok: true,
      status: 'rendering',
      artifactId,
      hadVideo,
      hadPoster,
      isPost,
      previousStatus,
      wasRendering,
      pipeline: 'fal_retry',
    }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'retry_render_failed';
    console.error('[retry-render]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runFalRetryRender(args: {
  artifactId: string;
  tenantId: string;
  artifact: Record<string, unknown>;
  content: Record<string, unknown>;
  meta: Record<string, unknown>;
  isPost: boolean;
  posterUrl: string;
}): Promise<void> {
  const { artifactId, tenantId, artifact, content, meta, isPost, posterUrl } = args;
  const headline = String(meta.headline || content.headline || artifact.title || 'Marka Story');
  const caption = String(content.caption || meta.caption || '').trim();
  const sector = String(meta.sector || meta.business_type || '');
  const brandName = String(meta.brandName || content.brandName || 'Brand');
  const location = String(meta.location || content.location || '');
  const contentType = isPost ? 'post' : 'story';

  const res = await fetch(`${BASE_URL}/api/generate-instagram-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: headline,
      caption: caption.slice(0, 300) || headline,
      contentType,
      brandName,
      location,
      industry: sector,
      workspaceId: tenantId,
      referenceImageUrls: [posterUrl],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    await patchBundleStatus(
      artifactId,
      tenantId,
      'failed',
      `fal_render_failed:${res.status}:${errText.slice(0, 120)}`,
    );
    return;
  }

  const data = await res.json() as { imageUrl?: string };
  const imageUrl = String(data.imageUrl ?? '').trim();
  if (!imageUrl) {
    await patchBundleStatus(artifactId, tenantId, 'failed', 'no_image_output');
    return;
  }

  const ok = await attachPoster(artifactId, tenantId, {
    imageUrl,
    contentType: isPost ? 'instagram_post' : 'instagram_story',
    productionBundle: true,
    referencePhotoUrl: posterUrl,
    source: 'fal_retry',
    renderMs: null,
  });
  if (!ok) {
    await patchBundleStatus(artifactId, tenantId, 'failed', 'attach_poster_failed');
    return;
  }
  await patchBundleStatus(artifactId, tenantId, 'ready');
}

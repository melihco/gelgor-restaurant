/**
 * POST /api/production-bundle/{artifactId}/retry-render
 * Re-triggers Remotion for a stuck/failed production bundle story (fire-and-forget).
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';
import { parseArtifactContent } from '@/app/mobile/_components/artifact-utils';
import {
  getProductionBundleStatus,
  isBundleRendering,
  isPostKind,
  resolveBrandedPostUrl,
  resolveGalleryPhotoForRender,
  resolvePosterUrl,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { getBrandKit } from '@/lib/agency-brand-kits';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import { applyBrandTokensToRenderProps, fetchBrandProductionTokensForWorkspace } from '@/lib/brand-production-tokens';

export const runtime = 'nodejs';
export const maxDuration = 300;

const NEXUS_API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
const BASE_URL = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';

async function patchBundleStatus(
  artifactId: string,
  tenantId: string,
  status: 'rendering' | 'failed',
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

async function attachVideo(
  artifactId: string,
  tenantId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${NEXUS_API}/api/artifacts/${artifactId}/attach-video`, {
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
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;

    const posterUrl = resolveGalleryPhotoForRender(artifact)
      || resolvePosterUrl(artifact)
      || String(content.reference_photo_url || meta.reference_photo_url || content.imageUrl || '').trim();
    if (!posterUrl) {
      return NextResponse.json({ error: 'no_poster_url' }, { status: 400 });
    }

    const hadVideo = Boolean(resolveStoryVideoUrl(artifact));
    const hadPoster = Boolean(resolveBrandedPostUrl(artifact));
    const isPost = isPostKind(artifact);
    const previousStatus = getProductionBundleStatus(artifact);

    await patchBundleStatus(artifactId, tenantId, 'rendering');

    const compositionId = String(
      meta.compositionId || content.compositionId || (isPost ? 'SpecPosterPost' : 'SpecStory'),
    );
    const templateId = String(
      meta.posterTemplateId || content.posterTemplateId
      || meta.templateId || content.templateId
      || (isPost ? 'poster_promo_split_01' : 'remotion_editorial_bottom_01'),
    );
    const headline = String(meta.headline || content.headline || artifact.title || 'Marka Story');
    const subtitle = String(content.caption || meta.caption || '').slice(0, 100);

    const brandTokens = await fetchBrandProductionTokensForWorkspace(tenantId, {
      brandName: String(meta.brandName || content.brandName || 'Brand'),
      sector: String(meta.sector || meta.business_type || ''),
    });

    const renderProps = applyBrandTokensToRenderProps({
      templateId,
      kitId: meta.kitId || content.kitId,
      photoUrl: posterUrl,
      headline,
      subtitle,
      brandName: String(meta.brandName || content.brandName || 'Brand'),
      location: String(meta.location || content.location || ''),
      logoUrl: String(meta.logoUrl || meta.logo_url || ''),
    }, brandTokens);
    if (isPost) {
      renderProps.posterTemplateId = templateId;
    }

    // Fire-and-forget — Remotion can take 1–3 min; don't block the Feed UI
    fetch(`${BASE_URL}/api/remotion/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        compositionId,
        workspaceId: tenantId,
        useCreativeDirector: true,
        motionStyle: String(meta.motionStyle || meta.motion_style || ''),
        locale: String(meta.locale || meta.language || ''),
        uploadToR2: Boolean(process.env.R2_BUCKET_NAME),
        props: renderProps,
      }),
      signal: AbortSignal.timeout(280_000),
    }).then(async (renderRes) => {
      const data = await renderRes.json().catch(() => ({})) as {
        videoUrl?: string;
        imageUrl?: string;
        compositionId?: string;
        grafikerScore?: number | null;
        grafikerPass?: boolean;
        durationMs?: number;
        error?: string;
      };

      if (!renderRes.ok) {
        await patchBundleStatus(
          artifactId,
          tenantId,
          'failed',
          data.error || `Render failed (${renderRes.status})`,
        );
        return;
      }

      if (isPost) {
        if (!data.imageUrl) {
          await patchBundleStatus(artifactId, tenantId, 'failed', 'No poster output');
          return;
        }
        const ok = await attachPoster(artifactId, tenantId, {
          imageUrl: data.imageUrl,
          contentType: 'instagram_post',
          productionBundle: true,
          compositionId: data.compositionId || compositionId,
          posterTemplateId: templateId,
          referencePhotoUrl: posterUrl,
          renderMs: data.durationMs ?? null,
        });
        if (!ok) await patchBundleStatus(artifactId, tenantId, 'failed', 'attach_poster_failed');
        return;
      }

      if (!data.videoUrl) {
        await patchBundleStatus(
          artifactId,
          tenantId,
          'failed',
          data.error || 'No video output',
        );
        return;
      }

      const ok = await attachVideo(artifactId, tenantId, {
        videoUrl: data.videoUrl,
        posterUrl,
        compositionId: data.compositionId || compositionId,
        grafikerScore: data.grafikerScore ?? null,
        grafikerPass: data.grafikerPass !== false,
        renderMs: data.durationMs ?? null,
      });

      if (!ok) {
        await patchBundleStatus(artifactId, tenantId, 'failed', 'attach_video_failed');
      }
    }).catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      await patchBundleStatus(artifactId, tenantId, 'failed', msg);
    });

    return NextResponse.json({
      ok: true,
      status: 'rendering',
      artifactId,
      hadVideo,
      hadPoster,
      isPost,
      previousStatus,
      wasRendering: isBundleRendering(artifact),
    }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'retry_render_failed';
    console.error('[retry-render]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

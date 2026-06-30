/**
 * POST /api/production-bundle/{artifactId}/retry-render
 * Re-triggers Remotion for a stuck/failed production bundle story (fire-and-forget).
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
import { getBrandKit } from '@/lib/agency-brand-kits';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import {
  applyBrandTokensToRenderProps,
  fetchBrandProductionTokensForWorkspace,
  fetchBrandThemeForWorkspace,
} from '@/lib/brand-production-tokens';
import {
  buildSafeOverlayRetryProps,
  callRemotionRenderApi,
  ensureRemotionPhotoUrl,
} from '@/lib/remotion-bundle-render';
import { persistRemotionVideoOutput } from '@/lib/remotion-video-persist';
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

    // Heavy prep (brand tokens, theme, template library, render) is moved into the
    // fire-and-forget worker so the UI gets an immediate 202 even when the host is
    // busy rendering other stories. Returning 202 only after token/library fetches
    // (which themselves slow under render load) was causing client 60s timeouts.
    void (async () => {
     try {
      await runRetryRender({ artifactId, tenantId, artifact, content, meta, isPost, posterUrl });
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
    }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'retry_render_failed';
    console.error('[retry-render]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runRetryRender(args: {
  artifactId: string;
  tenantId: string;
  artifact: Record<string, unknown>;
  content: Record<string, unknown>;
  meta: Record<string, unknown>;
  isPost: boolean;
  posterUrl: string;
}): Promise<void> {
    const { artifactId, tenantId, artifact, content, meta, isPost, posterUrl } = args;
    const compositionId = String(
      meta.compositionId || content.compositionId || (isPost ? 'SpecPosterPost' : 'SpecStory'),
    );
    const templateId = String(
      meta.posterTemplateId || content.posterTemplateId
      || meta.templateId || content.templateId
      || (isPost ? 'poster_promo_split_01' : 'remotion_editorial_bottom_01'),
    );
    const headline = String(meta.headline || content.headline || artifact.title || 'Marka Story');
    const voiceoverCaption = String(content.caption || meta.caption || '').trim();
    const subtitle = voiceoverCaption.slice(0, 100);

    const sector = String(meta.sector || meta.business_type || '');
    const [brandTokens, theme] = await Promise.all([
      fetchBrandProductionTokensForWorkspace(tenantId, {
        brandName: String(meta.brandName || content.brandName || 'Brand'),
        sector,
      }),
      fetchBrandThemeForWorkspace(tenantId),
    ]);

    const librarySlotKey = String(
      meta.library_slot_key || meta.librarySlotKey || content.librarySlotKey || '',
    ).trim();
    let slotTypography: {
      headingFont?: string;
      bodyFont?: string;
      fontPersonality?: string;
      honorTemplateTypography?: boolean;
    } | undefined;
    let logoUrl = String(meta.logoUrl || meta.logo_url || '');
    if (librarySlotKey && !isPost) {
      const { ensureBrandTemplateLibrary } = await import('@/lib/brand-template-library');
      const { resolveKitForSector } = await import('@/lib/remotion-template-registry');
      const { tenantKitSeed } = await import('@/lib/tenant-template-seed');
      const { resolveSlotRenderTypography } = await import('@/lib/brand-template-slot-typography');
      const { resolveSlotLogoForRender } = await import('@/lib/brand-logo-production');
      const kitId = resolveKitForSector(sector, tenantKitSeed(tenantId));
      const library = ensureBrandTemplateLibrary(theme, { sector, kitId, tenantId });
      const slot = library.slots.find((s) => s.key === librarySlotKey);
      if (slot) {
        const slotTypo = resolveSlotRenderTypography({
          slot: {
            fontMode: slot.fontMode,
            fontPersonality: slot.fontPersonality,
            headingFont: slot.headingFont,
            bodyFont: slot.bodyFont,
            format: 'story',
            storyTemplateId: slot.storyTemplateId,
            posterTemplateId: slot.posterTemplateId,
          },
          templateId,
          format: 'story',
          brandHeadingFont: brandTokens.headingFont,
          brandBodyFont: brandTokens.bodyFont,
          sector,
        });
        slotTypography = {
          headingFont: slotTypo.headingFont,
          bodyFont: slotTypo.bodyFont,
          fontPersonality: slotTypo.fontPersonality,
          honorTemplateTypography: slotTypo.honorTemplateTypography,
        };
        logoUrl = resolveSlotLogoForRender(logoUrl, slot) ?? '';
      }
    }

    const photoUrlForRender = ensureRemotionPhotoUrl(posterUrl);

    const renderProps = applyBrandTokensToRenderProps({
      templateId,
      kitId: meta.kitId || content.kitId,
      librarySlotKey: librarySlotKey || undefined,
      photoUrl: photoUrlForRender,
      headline,
      subtitle,
      caption: voiceoverCaption,
      voiceoverScript: voiceoverCaption,
      brandName: String(meta.brandName || content.brandName || 'Brand'),
      location: String(meta.location || content.location || ''),
      logoUrl,
      sector,
    }, brandTokens, slotTypography);
    if (isPost) {
      renderProps.posterTemplateId = templateId;
    }

    // Remotion can take 1–3 min — this whole function runs in the background worker
    // started by POST, so the awaits below never block the client response.
    const baseRenderBody = {
      compositionId,
      workspaceId: tenantId,
      motionStyle: String(meta.motionStyle || meta.motion_style || ''),
      locale: String(meta.locale || meta.language || ''),
      uploadToR2: serverConfig.r2.bucketConfigured,
      requirePersistent: true,
      brandTemplateLocked: Boolean(meta.brandTemplateLocked ?? meta.brand_template_locked),
    };

    let data = await callRemotionRenderApi(BASE_URL, {
      ...baseRenderBody,
      useCreativeDirector: true,
      props: renderProps,
    });

    if (!data.ok) {
      data = await callRemotionRenderApi(BASE_URL, {
        ...baseRenderBody,
        useCreativeDirector: false,
        props: buildSafeOverlayRetryProps(renderProps as Record<string, unknown>),
      });
    }

    if (!data.ok) {
      await patchBundleStatus(
        artifactId,
        tenantId,
        'failed',
        data.error || `Render failed (${data.status})`,
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
      else await patchBundleStatus(artifactId, tenantId, 'ready');
      return;
    }

    const videoUrl = await persistRemotionVideoOutput(tenantId, {
      videoUrl: data.videoUrl,
      videoBase64: data.videoBase64,
      compositionId: data.compositionId || compositionId,
      bytes: data.bytes,
    });
    if (!videoUrl) {
      await patchBundleStatus(
        artifactId,
        tenantId,
        'failed',
        data.error || 'No video output',
      );
      return;
    }

    const ok = await attachVideo(artifactId, tenantId, {
      videoUrl,
      posterUrl,
      compositionId: data.compositionId || compositionId,
      grafikerScore: data.grafikerScore ?? null,
      grafikerPass: data.grafikerPass !== false,
      renderMs: data.durationMs ?? null,
    });

    if (!ok) {
      await patchBundleStatus(artifactId, tenantId, 'failed', 'attach_video_failed');
    } else {
      await patchBundleStatus(artifactId, tenantId, 'ready');
    }
}

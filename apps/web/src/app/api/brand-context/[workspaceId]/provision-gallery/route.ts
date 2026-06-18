/**
 * POST /api/brand-context/{workspaceId}/provision-gallery
 *
 * Fills reference_image_urls with sector-curated stock photos when the tenant
 * has no own photos (typical for SaaS / digital brands). Targets 100 images
 * for full gallery intelligence; 8 minimum for BRS readiness gates.
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson, proxyToCrewBackend } from '@/lib/crew-proxy';
import {
  mergeSectorGallerySeed,
  resolveSyntheticGalleryTarget,
} from '@/lib/sector-gallery-seed';
import { parseStringOrArray } from '@/lib/brand-readiness';
import { filterReachableGalleryUrls, filterUsableGalleryPhotoUrls } from '@/lib/media-url';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function runGalleryAnalyzeCoverage(origin: string, workspaceId: string): Promise<{
  newlyAnalyzed: number;
  remaining: number;
  complete: boolean;
}> {
  let totalNew = 0;
  let remaining = 1;
  let complete = false;

  for (let batch = 0; batch < 6 && remaining > 0; batch++) {
    const res = await fetch(`${origin}/api/gallery-intelligence/${workspaceId}/analyze-coverage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'standard', maxImages: 25 }),
      signal: AbortSignal.timeout(280_000),
    }).catch(() => null);

    if (!res?.ok) break;
    const data = (await res.json()) as {
      newlyAnalyzed?: number;
      remaining?: number;
      complete?: boolean;
    };
    totalNew += data.newlyAnalyzed ?? 0;
    remaining = data.remaining ?? 0;
    complete = Boolean(data.complete);
    if ((data.newlyAnalyzed ?? 0) === 0 && remaining > 0) break;
  }

  return { newlyAnalyzed: totalNew, remaining, complete };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { analyze?: boolean; allowSynthetic?: boolean };
  const shouldAnalyze = body.analyze !== false;
  const allowSynthetic = body.allowSynthetic !== false;

  const ctxRes = await fetchCrewBackendJson<{
    reference_image_urls?: unknown;
    business_type?: string;
    logo_url?: string | null;
  }>(`/api/v1/brand-context/${workspaceId}`, { workspaceId });

  if (!ctxRes.ok || !ctxRes.data) {
    return NextResponse.json({ error: 'brand context not found' }, { status: 404 });
  }

  const ctx = ctxRes.data;
  const existing = parseStringOrArray(ctx.reference_image_urls);
  const logo = (ctx.logo_url ?? '').trim();
  const usable = filterUsableGalleryPhotoUrls(
    existing.filter((u) => !logo || u !== logo),
  );
  const target = allowSynthetic
    ? resolveSyntheticGalleryTarget(ctx.business_type, usable.length)
    : usable.length;

  const { urls: mergedUrls, added, provisioned } = allowSynthetic
    ? mergeSectorGallerySeed(usable, ctx.business_type, target)
    : { urls: usable, added: 0, provisioned: false };

  let urls = mergedUrls;
  const hasUnsplash = mergedUrls.some(
    (u) => u.includes('images.unsplash.com') || u.includes('plus.unsplash.com'),
  );
  if (hasUnsplash && mergedUrls.length > 0) {
    const health = await filterReachableGalleryUrls(mergedUrls, { maxProbe: 120, concurrency: 10 });
    if (health.rejected.length > 0) {
      console.warn(
        `[provision-gallery] Dropped ${health.rejected.length} unreachable Unsplash URLs for ${workspaceId}`,
      );
    }
    urls = health.urls;
  }

  const prunedExisting = !provisioned && hasUnsplash && urls.length < usable.length;

  if (!provisioned) {
    if (prunedExisting) {
      const patchRes = await proxyToCrewBackend(
        `/api/v1/brand-context/${workspaceId}`,
        {
          method: 'PATCH',
          body: { reference_image_urls: JSON.stringify(urls) },
          workspaceId,
          timeoutMs: 15_000,
        },
      );
      if (!patchRes.ok) {
        const err = await patchRes.text().catch(() => '');
        return NextResponse.json({ error: err || 'PATCH failed' }, { status: patchRes.status });
      }
    }
    let analyzeSummary = null;
    if (shouldAnalyze && urls.length > 0) {
      const origin = req.nextUrl.origin;
      analyzeSummary = await runGalleryAnalyzeCoverage(origin, workspaceId);
    }
    return NextResponse.json({
      provisioned: false,
      prunedDeadUrls: prunedExisting,
      usableCount: urls.length,
      target,
      analyze: analyzeSummary,
      message: prunedExisting
        ? `${usable.length - urls.length} süresi dolmuş Unsplash görseli galeriden temizlendi.`
        : urls.length >= target
          ? 'Galeri yeterli — sentetik foto eklenmedi.'
          : 'Galeri hedefi karşılandı veya sektör uygun değil.',
    });
  }

  const patchRes = await proxyToCrewBackend(
    `/api/v1/brand-context/${workspaceId}`,
    {
      method: 'PATCH',
      body: { reference_image_urls: JSON.stringify(urls) },
      workspaceId,
      timeoutMs: 15_000,
    },
  );

  if (!patchRes.ok) {
    const err = await patchRes.text().catch(() => '');
    return NextResponse.json({ error: err || 'PATCH failed' }, { status: patchRes.status });
  }

  let analyzeSummary = null;
  if (shouldAnalyze) {
    analyzeSummary = await runGalleryAnalyzeCoverage(req.nextUrl.origin, workspaceId);
  }

  return NextResponse.json({
    provisioned: true,
    added,
    usableCount: urls.length,
    target,
    sector: ctx.business_type ?? 'general_business',
    analyze: analyzeSummary,
    message: `${added} sektör görseli galeriye eklendi (hedef: ${target}).`,
  });
}

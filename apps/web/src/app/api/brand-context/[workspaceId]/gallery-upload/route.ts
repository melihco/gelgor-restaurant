/**
 * POST /api/brand-context/{workspaceId}/gallery-upload
 * Upload brand gallery photo(s) → persist reference_image_urls → run vision analysis.
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { filterBrandGalleryUrls } from '@/lib/gallery-upload';
import { parseStringOrArray } from '@/lib/brand-readiness';
import { isR2Configured, generateStorageKey, uploadToR2 } from '@/lib/r2-storage';
import type { GalleryPhotoAnalysis } from '@/app/api/analyze-gallery/route';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const maxDuration = 180;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function appendReferenceUrls(workspaceId: string, newUrls: string[]): Promise<string[]> {
  const ctxRes = await fetchCrewBackendJson<{ reference_image_urls?: unknown }>(
    `/api/v1/brand-context/${workspaceId}`,
    { workspaceId },
  );
  const existing = filterBrandGalleryUrls(
    parseStringOrArray(ctxRes.data?.reference_image_urls),
  );
  const merged = [...newUrls.filter((u) => !existing.includes(u)), ...existing];
  const patchRes = await fetchCrewBackendJson(
    `/api/v1/brand-context/${workspaceId}`,
    {
      method: 'PATCH',
      workspaceId,
      body: { reference_image_urls: JSON.stringify(merged) },
    },
  );
  if (!patchRes.ok) {
    throw new Error(`reference_urls_patch_failed_${patchRes.status}`);
  }
  return merged;
}

async function analyzeAndPersist(
  workspaceId: string,
  urls: string[],
): Promise<{ results: GalleryPhotoAnalysis[]; errors: Array<{ url: string; error: string }> }> {
  if (!urls.length) return { results: [], errors: [] };

  let existingAnalysis: Record<string, unknown> = {};
  const cacheRes = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/brand-context/${workspaceId}/gallery-analysis`,
    { workspaceId },
  );
  if (cacheRes.ok && cacheRes.data) existingAnalysis = cacheRes.data;

  const origin = getNextjsInternalOrigin();
  const analyzeRes = await fetch(`${origin}/api/analyze-gallery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assetUrls: urls,
      maxImages: urls.length,
      existingAnalysis,
    }),
    signal: AbortSignal.timeout(150_000),
  });
  if (!analyzeRes.ok) {
    const errText = await analyzeRes.text().catch(() => '');
    throw new Error(`analyze_failed_${analyzeRes.status}:${errText.slice(0, 120)}`);
  }
  const data = await analyzeRes.json() as {
    results?: GalleryPhotoAnalysis[];
    errors?: Array<{ url: string; error: string }>;
  };
  const results = Array.isArray(data.results) ? data.results : [];
  if (results.length) {
    await fetchCrewBackendJson(
      `/api/v1/brand-context/${workspaceId}/gallery-analysis`,
      {
        method: 'POST',
        workspaceId,
        body: { results },
        timeoutMs: 15_000,
      },
    );
  }
  return { results, errors: data.errors ?? [] };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const tenantGuard = assertPathTenantMatchesRequest(req, workspaceId);
  if (tenantGuard) return tenantGuard;

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 storage not configured' }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const files = form.getAll('file').filter((f): f is File => f instanceof File);
    const single = form.get('file');
    if (!files.length && single instanceof File) files.push(single);
    if (!files.length) {
      return NextResponse.json({ error: 'no_files' }, { status: 400 });
    }

    const uploadedUrls: string[] = [];
    for (const file of files.slice(0, 12)) {
      if (file.size > MAX_FILE_BYTES) continue;
      const mime = file.type || 'image/jpeg';
      if (!mime.startsWith('image/')) continue;
      const ext = mime.includes('png') ? 'png'
        : mime.includes('webp') ? 'webp'
        : mime.includes('gif') ? 'gif'
        : 'jpg';
      const key = generateStorageKey(workspaceId, 'image', ext);
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadToR2(buffer, key, mime);
      if (result.url) uploadedUrls.push(result.url);
    }

    if (!uploadedUrls.length) {
      return NextResponse.json({ error: 'upload_failed' }, { status: 400 });
    }

    await appendReferenceUrls(workspaceId, uploadedUrls);
    const { results, errors } = await analyzeAndPersist(workspaceId, uploadedUrls);

    return NextResponse.json({
      ok: true,
      uploaded: uploadedUrls.length,
      urls: uploadedUrls,
      analyzed: results.length,
      results,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'gallery_upload_failed';
    console.error('[gallery-upload]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

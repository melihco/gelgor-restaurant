/**
 * POST /api/brand-context/{workspaceId}/gallery-upload
 * Upload brand gallery photo(s) → persist reference_image_urls → queue vision analysis in background.
 */
import { after, NextRequest, NextResponse } from 'next/server';
import { assertPathTenantMatchesRequest, buildInternalProductionHeaders } from '@/lib/tenant-production-guard';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { isR2Configured, generateStorageKey, uploadToR2 } from '@/lib/r2-storage';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function appendReferenceUrls(workspaceId: string, newUrls: string[]): Promise<string[]> {
  const appendRes = await fetchCrewBackendJson<{ urls?: string[]; total?: number }>(
    `/api/v1/brand-context/${workspaceId}/gallery/append`,
    {
      method: 'POST',
      workspaceId,
      body: { urls: newUrls },
      timeoutMs: 20_000,
    },
  );
  if (!appendRes.ok || !Array.isArray(appendRes.data?.urls)) {
    throw new Error(`reference_urls_append_failed_${appendRes.status}`);
  }
  return appendRes.data.urls;
}

function scheduleBackgroundGalleryAnalysis(workspaceId: string, maxImages: number): void {
  after(async () => {
    const origin = getNextjsInternalOrigin();
    try {
      const res = await fetch(`${origin}/api/gallery-intelligence/${workspaceId}/analyze-coverage`, {
        method: 'POST',
        headers: buildInternalProductionHeaders(workspaceId),
        body: JSON.stringify({ tier: 'standard', maxImages }),
        signal: AbortSignal.timeout(280_000),
      });
      if (!res.ok) {
        console.warn('[gallery-upload] background analysis failed', workspaceId, res.status);
      }
    } catch (err) {
      console.warn('[gallery-upload] background analysis error', workspaceId, err);
    }
  });
}

async function uploadOneFile(workspaceId: string, file: File): Promise<string | null> {
  if (file.size > MAX_FILE_BYTES) return null;
  const mime = file.type || 'image/jpeg';
  if (!mime.startsWith('image/')) return null;
  const ext = mime.includes('png') ? 'png'
    : mime.includes('webp') ? 'webp'
    : mime.includes('gif') ? 'gif'
    : 'jpg';
  const key = generateStorageKey(workspaceId, 'image', ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadToR2(buffer, key, mime);
  return result.url ?? null;
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
    const files = [
      ...form.getAll('file'),
      ...form.getAll('files'),
    ].filter((f): f is File => f instanceof File);
    const single = form.get('file');
    if (!files.length && single instanceof File) files.push(single);
    if (!files.length) {
      return NextResponse.json({ error: 'no_files' }, { status: 400 });
    }

    const batch = files.slice(0, 12);
    const uploadedUrls = (
      await Promise.all(batch.map((file) => uploadOneFile(workspaceId, file)))
    ).filter((url): url is string => Boolean(url));

    if (!uploadedUrls.length) {
      return NextResponse.json({ error: 'upload_failed' }, { status: 400 });
    }

    const merged = await appendReferenceUrls(workspaceId, uploadedUrls);
    scheduleBackgroundGalleryAnalysis(workspaceId, uploadedUrls.length);

    return NextResponse.json({
      ok: true,
      uploaded: uploadedUrls.length,
      total: merged.length,
      urls: uploadedUrls,
      analysisPending: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'gallery_upload_failed';
    console.error('[gallery-upload]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

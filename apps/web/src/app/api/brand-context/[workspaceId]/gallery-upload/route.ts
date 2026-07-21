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

type UploadBlob = Blob & { name?: string; type: string };

function collectUploadBlobs(form: FormData): UploadBlob[] {
  const out: UploadBlob[] = [];
  for (const key of ['file', 'files']) {
    for (const entry of form.getAll(key)) {
      if (typeof entry === 'string') continue;
      if (typeof Blob !== 'undefined' && entry instanceof Blob && entry.size > 0) {
        out.push(entry as UploadBlob);
      }
    }
  }
  return out;
}

function guessImageMime(file: UploadBlob): string {
  const named = String(file.name ?? '').toLowerCase();
  const typed = String(file.type ?? '').toLowerCase();
  if (typed.startsWith('image/')) return typed;
  if (named.endsWith('.png')) return 'image/png';
  if (named.endsWith('.webp')) return 'image/webp';
  if (named.endsWith('.gif')) return 'image/gif';
  if (named.endsWith('.heic') || named.endsWith('.heif')) return 'image/heic';
  if (named.endsWith('.jpg') || named.endsWith('.jpeg')) return 'image/jpeg';
  // iOS WebView often sends empty type for camera rolls — treat as jpeg.
  if (!typed && named) return 'image/jpeg';
  return typed;
}

function isLikelyImage(file: UploadBlob): boolean {
  const mime = guessImageMime(file);
  if (mime.startsWith('image/')) return true;
  const named = String(file.name ?? '').toLowerCase();
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(named);
}

async function normalizeImageBuffer(
  buffer: Buffer,
  mime: string,
  fileName: string,
): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const hint = `${mime} ${fileName}`.toLowerCase();
  const isHeic = hint.includes('heic') || hint.includes('heif');
  if (isHeic) {
    try {
      const sharp = (await import('sharp')).default;
      const out = await sharp(buffer).rotate().jpeg({ quality: 88 }).toBuffer();
      return { buffer: out, mime: 'image/jpeg', ext: 'jpg' };
    } catch (err) {
      throw new Error(
        err instanceof Error && /heif|heic|compression/i.test(err.message)
          ? 'heic_unsupported_convert_to_jpg'
          : (err instanceof Error ? err.message : 'heic_convert_failed'),
      );
    }
  }
  const ext = mime.includes('png') ? 'png'
    : mime.includes('webp') ? 'webp'
    : mime.includes('gif') ? 'gif'
    : 'jpg';
  const safeMime = mime.startsWith('image/') ? mime : 'image/jpeg';
  return { buffer, mime: safeMime, ext };
}

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

async function uploadOneFile(workspaceId: string, file: UploadBlob): Promise<string | null> {
  if (file.size > MAX_FILE_BYTES) return null;
  if (!isLikelyImage(file)) return null;
  const mimeGuess = guessImageMime(file);
  const raw = Buffer.from(await file.arrayBuffer());
  const normalized = await normalizeImageBuffer(raw, mimeGuess, String(file.name ?? ''));
  const key = generateStorageKey(workspaceId, 'image', normalized.ext);
  const result = await uploadToR2(normalized.buffer, key, normalized.mime);
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
    const files = collectUploadBlobs(form);
    if (!files.length) {
      return NextResponse.json({ error: 'no_files' }, { status: 400 });
    }

    const batch = files.slice(0, 12);
    const uploadedUrls: string[] = [];
    const perFileErrors: string[] = [];
    for (const file of batch) {
      try {
        const url = await uploadOneFile(workspaceId, file);
        if (url) uploadedUrls.push(url);
        else if (file.size > MAX_FILE_BYTES) perFileErrors.push('file_too_large_max_10mb');
        else if (!isLikelyImage(file)) perFileErrors.push('images_only_jpg_png_webp');
        else perFileErrors.push('upload_failed');
      } catch (err) {
        perFileErrors.push(err instanceof Error ? err.message : 'upload_failed');
      }
    }

    if (!uploadedUrls.length) {
      const message = perFileErrors.includes('file_too_large_max_10mb')
        ? 'file_too_large_max_10mb'
        : perFileErrors.includes('images_only_jpg_png_webp')
          ? 'images_only_jpg_png_webp'
          : 'upload_failed';
      return NextResponse.json({ error: message }, { status: 400 });
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

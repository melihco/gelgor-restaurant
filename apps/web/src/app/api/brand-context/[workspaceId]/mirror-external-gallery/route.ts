/**
 * POST /api/brand-context/{workspaceId}/mirror-external-gallery
 *
 * Re-host external brand gallery URLs (website / CDN) on R2 so production
 * enhance + Remotion can fetch them reliably.
 */
import { NextRequest, NextResponse } from 'next/server';
import { assertPathTenantMatchesRequest } from '@/lib/tenant-production-guard';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { parseStringOrArray } from '@/lib/brand-readiness';
import { filterBrandGalleryUrls } from '@/lib/gallery-upload';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { generateStorageKey, isR2Configured, uploadToR2 } from '@/lib/r2-storage';

export const runtime = 'nodejs';
export const maxDuration = 300;

function isAlreadyHosted(url: string): boolean {
  const u = url.trim();
  if (!u) return true;
  if (u.startsWith('/api/media')) return true;
  const r2Public = process.env.R2_PUBLIC_URL?.trim();
  if (r2Public && u.startsWith(r2Public)) return true;
  return false;
}

function extFromUrl(url: string, contentType?: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.gif')) return 'gif';
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  return 'jpg';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const denied = assertPathTenantMatchesRequest(req, workspaceId);
  if (denied) return denied;

  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 storage not configured' }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { maxPhotos?: number };
  const maxPhotos = Math.min(Math.max(body.maxPhotos ?? 25, 1), 40);

  const ctxRes = await fetchCrewBackendJson<{ reference_image_urls?: unknown }>(
    `/api/v1/brand-context/${workspaceId}`,
    { workspaceId, timeoutMs: 20_000 },
  );
  if (!ctxRes.ok || !ctxRes.data) {
    return NextResponse.json({ error: 'brand context not found' }, { status: 404 });
  }

  const existing = filterBrandGalleryUrls(parseStringOrArray(ctxRes.data.reference_image_urls));
  const toMirror = existing.filter((u) => !isAlreadyHosted(u)).slice(0, maxPhotos);

  if (!toMirror.length) {
    return NextResponse.json({
      ok: true,
      mirrored: 0,
      total: existing.length,
      message: 'Tüm galeri URL\'leri zaten barındırılıyor.',
    });
  }

  const urlMap = new Map<string, string>();
  let mirrored = 0;
  const errors: string[] = [];

  for (const sourceUrl of toMirror) {
    try {
      const buffer = await fetchExternalImageBuffer(sourceUrl);
      if (!buffer) {
        errors.push(`${sourceUrl.slice(0, 60)}: fetch_failed`);
        continue;
      }
      const ext = extFromUrl(sourceUrl);
      const key = generateStorageKey(workspaceId, 'image', ext);
      const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const uploaded = await uploadToR2(buffer, key, ct);
      if (uploaded.url) {
        urlMap.set(sourceUrl, uploaded.url);
        mirrored += 1;
      }
    } catch (err) {
      errors.push(`${sourceUrl.slice(0, 60)}: ${err instanceof Error ? err.message : 'upload_failed'}`);
    }
  }

  if (!urlMap.size) {
    return NextResponse.json(
      { ok: false, mirrored: 0, errors, message: 'Hiçbir foto R2\'ye aktarılamadı' },
      { status: 422 },
    );
  }

  const merged = existing.map((u) => urlMap.get(u) ?? u);
  const patchRes = await fetchCrewBackendJson(
    `/api/v1/brand-context/${workspaceId}`,
    {
      method: 'PATCH',
      workspaceId,
      body: { reference_image_urls: JSON.stringify(merged) },
      timeoutMs: 20_000,
    },
  );
  if (!patchRes.ok) {
    return NextResponse.json({ error: 'reference_urls_patch_failed' }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    mirrored,
    total: merged.length,
    errors: errors.length ? errors : undefined,
    message: `${mirrored} galeri fotoğrafı R2\'ye taşındı.`,
  });
}

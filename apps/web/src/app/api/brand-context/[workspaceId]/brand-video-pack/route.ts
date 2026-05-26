import { NextRequest, NextResponse } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Resolve a video URL to a publicly accessible HTTPS URL that Creatomate can fetch.
 *
 * Three cases:
 * 1. /api/media?key=...  → proxy URL (localhost-relative) → generate R2 presigned URL
 * 2. Runway CloudFront   → signed JWT, may be inaccessible externally → upload to R2
 * 3. Already public https:// (R2 with public domain, other CDN) → pass through
 */
async function resolvePublicVideoUrl(videoUrl: string, workspaceId: string): Promise<string> {
  const { isR2Configured, generateStorageKey, uploadImageFromUrl, getPresignedUrl } = await import('@/lib/r2-storage');

  // Case 1: our own media proxy → extract R2 key and get presigned URL
  if (videoUrl.startsWith('/api/media?key=')) {
    if (!isR2Configured()) return videoUrl;
    const key = new URLSearchParams(videoUrl.split('?')[1]).get('key');
    if (!key) return videoUrl;
    const signed = await getPresignedUrl(key, 7200); // 2h — enough for Creatomate
    return signed;
  }

  // Case 2: Runway CloudFront signed URL → re-upload to R2 for stable access
  if (videoUrl.includes('cloudfront.net') || videoUrl.includes('runway')) {
    if (!isR2Configured()) return videoUrl; // fallback: hope it works
    try {
      const key = generateStorageKey(workspaceId, 'video', 'mp4');
      const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) return videoUrl;
      const { uploadToR2, getPresignedUrl: getPS } = await import('@/lib/r2-storage');
      const buf = Buffer.from(await res.arrayBuffer());
      await uploadToR2(buf, key, 'video/mp4');
      return await getPS(key, 7200);
    } catch {
      return videoUrl; // fallback to original
    }
  }

  // Case 3: already a public https:// URL
  return videoUrl;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const body = await req.json() as Record<string, unknown>;

  // Resolve video URL to a publicly accessible one before sending to Creatomate
  const rawVideoUrl = typeof body.video_url === 'string' ? body.video_url : '';
  let publicVideoUrl = rawVideoUrl;
  if (rawVideoUrl) {
    try {
      publicVideoUrl = await resolvePublicVideoUrl(rawVideoUrl, workspaceId);
    } catch {
      // non-blocking — use original URL
    }
  }

  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/brand-video-pack`, {
    body: { ...body, video_url: publicVideoUrl },
    timeoutMs: 295_000,
  });
}

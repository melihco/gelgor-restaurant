import { NextRequest } from 'next/server';
import { proxyToCrewBackend } from '@/lib/crew-proxy';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Resolve video URL to a publicly accessible HTTPS URL.
 * Shotstack (and Creatomate) need to download the video from a public URL.
 * - /api/media?key=... → R2 presigned URL (2h validity)
 * - Runway CloudFront JWT URL → re-upload to R2 for stable access
 * - Already public https:// → pass through
 */
async function resolvePublicVideoUrl(videoUrl: string, workspaceId: string): Promise<string> {
  try {
    const { isR2Configured, generateStorageKey, uploadToR2, getPresignedUrl } = await import('@/lib/r2-storage');

    // Case 1: our own media proxy → extract R2 key → presigned URL
    if (videoUrl.startsWith('/api/media?key=')) {
      if (!isR2Configured()) return videoUrl;
      const key = new URLSearchParams(videoUrl.split('?')[1]).get('key');
      if (key) return await getPresignedUrl(key, 7200);
    }

    // Case 2: Runway CloudFront signed URL → re-upload to R2
    if (videoUrl.includes('cloudfront.net') || videoUrl.includes('runway')) {
      if (!isR2Configured()) return videoUrl;
      const res = await fetch(videoUrl, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) return videoUrl;
      const buf = Buffer.from(await res.arrayBuffer());
      const key = generateStorageKey(workspaceId, 'video', 'mp4');
      await uploadToR2(buf, key, 'video/mp4');
      return await getPresignedUrl(key, 7200);
    }
  } catch {
    // non-blocking fallback
  }
  return videoUrl;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const body = await req.json() as Record<string, unknown>;

  // Resolve video URL so Shotstack/Creatomate can access it
  const rawUrl = typeof body.video_url === 'string' ? body.video_url : '';
  let publicUrl = rawUrl;
  if (rawUrl) {
    publicUrl = await resolvePublicVideoUrl(rawUrl, workspaceId);
  }

  return proxyToCrewBackend(`/api/v1/brand-context/${workspaceId}/auto-render`, {
    body: { ...body, video_url: publicUrl },
    timeoutMs: 295_000,
  });
}

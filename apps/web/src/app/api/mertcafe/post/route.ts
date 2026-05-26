import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { generateStorageKey, getPresignedUrl, uploadToR2 } from '@/lib/r2-storage';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BASE_URL = process.env.MERTCAFE_BASE_URL ?? 'https://web-production-02d278.up.railway.app';
const API_KEY = process.env.MERTCAFE_API_KEY ?? '';

type PostType = 'feed' | 'story' | 'reels' | 'carousel';

type PublishBody = {
  content?: string;
  image_url?: string;
  video_url?: string;
  media_urls?: string[];
  hashtags?: string[];
  post_type?: PostType;
  share_to_feed?: boolean;
  workspaceId?: string;
  artifactId?: string;
};

function toPublicUrl(input: string | undefined, origin: string): string | undefined {
  if (!input) return undefined;
  const url = input.trim();
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${origin}${url}`;
  return `${origin}/${url}`;
}

/**
 * If the URL is an internal /api/media?key=... proxy URL, resolve it to a
 * direct R2 presigned URL so Mertcafe (on Railway) can fetch it without
 * going through our ngrok tunnel.
 */
async function resolveToPublicR2Url(url: string): Promise<string> {
  if (!url.includes('/api/media') || !url.includes('key=')) return url;
  try {
    const { getPresignedUrl } = await import('@/lib/r2-storage');
    // Extract the key from ?key=... or /api/media?key=...
    const keyMatch = url.match(/[?&]key=([^&]+)/);
    if (!keyMatch) return url;
    const key = decodeURIComponent(keyMatch[1]);
    const presigned = await getPresignedUrl(key, 3 * 3600); // 3 hours
    console.log('[mertcafe/post] Resolved R2 key to presigned URL:', key.slice(0, 60));
    return presigned;
  } catch (err) {
    console.warn('[mertcafe/post] R2 presign failed, using original URL:', err);
    return url;
  }
}

async function assertMediaReachable(url: string, kind: 'image' | 'video'): Promise<string | null> {
  try {
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    if (!res.ok && [403, 405].includes(res.status)) {
      // Some signed URLs reject HEAD but allow GET.
      res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      });
    }
    if (!res.ok) return `${kind} URL is not reachable (${res.status})`;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (kind === 'image' && ct && !ct.startsWith('image/')) {
      return `image URL content-type is invalid (${ct || 'unknown'})`;
    }
    if (kind === 'video' && ct && !ct.startsWith('video/')) {
      return `video URL content-type is invalid (${ct || 'unknown'})`;
    }
    return null;
  } catch (err) {
    return `${kind} URL check failed: ${err instanceof Error ? err.message : 'unknown error'}`;
  }
}

async function normalizeImageForInstagram(url: string, postType: PostType): Promise<string> {
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    const contentType = (head.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) return url;

    const imageRes = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!imageRes.ok) return url;
    const input = Buffer.from(await imageRes.arrayBuffer());
    const looksWebp = contentType.includes('image/webp') || /\.webp(\?|$)/i.test(url);
    const meta = await sharp(input).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    let shouldTransform = looksWebp;
    let working = sharp(input);

    if (postType === 'feed' && w > 0 && h > 0) {
      const ratio = w / h;
      if (ratio < 0.75 || ratio > 1.91) {
        const target = 4 / 5;
        if (ratio < target) {
          const targetH = Math.round(w / target);
          const top = Math.max(0, Math.floor((h - targetH) / 2));
          working = working.extract({ left: 0, top, width: w, height: Math.min(targetH, h) });
        } else {
          const targetW = Math.round(h * target);
          const left = Math.max(0, Math.floor((w - targetW) / 2));
          working = working.extract({ left, top: 0, width: Math.min(targetW, w), height: h });
        }
        shouldTransform = true;
      }
    }

    if (!shouldTransform) return url;
    const output = await working.jpeg({ quality: 92 }).toBuffer();
    const key = generateStorageKey('mertcafe-publish', 'image', 'jpg');
    const uploaded = await uploadToR2(output, key, 'image/jpeg');
    try {
      return await getPresignedUrl(uploaded.key, 24 * 3600);
    } catch {
      return uploaded.url;
    }
  } catch {
    return url;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!API_KEY) {
    return NextResponse.json({ error: 'MERTCAFE_API_KEY is not configured' }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as PublishBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const postType = body.post_type ?? 'feed';
  const hashtags = Array.isArray(body.hashtags) ? body.hashtags.map(String) : [];
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '');
  const payload: Record<string, unknown> = { api_key: API_KEY };

  if (postType === 'story') {
    let imageUrl = toPublicUrl(body.image_url, origin);
    if (!imageUrl) return NextResponse.json({ error: 'image_url is required for story posts' }, { status: 400 });
    // Resolve internal R2 proxy URLs to direct presigned CDN URLs before normalizing
    imageUrl = await resolveToPublicR2Url(imageUrl);
    imageUrl = toPublicUrl(await normalizeImageForInstagram(imageUrl, postType), origin) ?? imageUrl;
    const mediaError = await assertMediaReachable(imageUrl, 'image');
    if (mediaError) {
      return NextResponse.json(
        { error: `Story publish blocked: ${mediaError}. Check NEXT_PUBLIC_SITE_URL/public tunnel.` },
        { status: 422 },
      );
    }
    payload.image_url = imageUrl;
    payload.post_type = 'story';
    // Story model: only image_url + post_type (caption/hashtags omitted).
  } else if (postType === 'reels') {
    let videoUrl = toPublicUrl(body.video_url, origin);
    if (!videoUrl) return NextResponse.json({ error: 'video_url is required for reels posts' }, { status: 400 });
    // Resolve internal R2 proxy URLs to direct presigned CDN URLs
    videoUrl = await resolveToPublicR2Url(videoUrl);
    const mediaError = await assertMediaReachable(videoUrl, 'video');
    if (mediaError) {
      return NextResponse.json(
        { error: `Reels publish blocked: ${mediaError}. Check NEXT_PUBLIC_SITE_URL/public tunnel.` },
        { status: 422 },
      );
    }
    payload.video_url = videoUrl;
    payload.post_type = 'reels';
    payload.share_to_feed = body.share_to_feed ?? true;
    payload.content = body.content ?? '';
    if (hashtags.length) payload.hashtags = hashtags;
  } else if (postType === 'carousel') {
    const mediaUrls = Array.isArray(body.media_urls)
      ? body.media_urls.map((u) => toPublicUrl(String(u), origin)).filter(Boolean)
      : [];
    if (mediaUrls.length < 2) return NextResponse.json({ error: 'media_urls must contain at least 2 URLs for carousel posts' }, { status: 400 });
    for (const mediaUrl of mediaUrls as string[]) {
      const kind: 'image' | 'video' = /\.(mp4|mov|webm|avi)(\?|$)/i.test(mediaUrl) ? 'video' : 'image';
      const mediaError = await assertMediaReachable(mediaUrl, kind);
      if (mediaError) {
        return NextResponse.json(
          { error: `Carousel publish blocked: ${mediaError}. URL: ${mediaUrl}` },
          { status: 422 },
        );
      }
    }
    payload.media_urls = mediaUrls;
    payload.post_type = 'carousel';
    payload.content = body.content ?? '';
    if (hashtags.length) payload.hashtags = hashtags;
  } else {
    let imageUrl = toPublicUrl(body.image_url, origin);
    if (!imageUrl) return NextResponse.json({ error: 'image_url is required for feed posts' }, { status: 400 });
    // Resolve internal R2 proxy URLs to direct presigned CDN URLs before normalizing
    imageUrl = await resolveToPublicR2Url(imageUrl);
    imageUrl = toPublicUrl(await normalizeImageForInstagram(imageUrl, postType), origin) ?? imageUrl;
    const mediaError = await assertMediaReachable(imageUrl, 'image');
    if (mediaError) {
      return NextResponse.json(
        { error: `Feed publish blocked: ${mediaError}. Check NEXT_PUBLIC_SITE_URL/public tunnel.` },
        { status: 422 },
      );
    }
    payload.image_url = imageUrl;
    payload.content = body.content ?? '';
    if (hashtags.length) payload.hashtags = hashtags;
  }

  try {
    const callWithRetry = async (): Promise<Response> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await fetch(`${BASE_URL}/api/post`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(110_000),
        });
        if (res.ok || ![502, 503, 504].includes(res.status) || attempt === 2) return res;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      return fetch(`${BASE_URL}/api/post`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    };

    const upstream = await callWithRetry();

    const rawBody = await upstream.text();
    let data: Record<string, unknown> = {};
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
      } catch {
        data = { raw: rawBody };
      }
    }

    if (!upstream.ok) {
      const errorMessage = String(
        data.detail
        || data.error
        || data.message
        || data.raw
        || `Mertcafe publish failed (${upstream.status})`,
      );
      return NextResponse.json(
        {
          error: errorMessage,
          upstream_status: upstream.status,
          request_id: typeof data.request_id === 'string' ? data.request_id : undefined,
        },
        { status: upstream.status },
      );
    }

    if (typeof data.post_id === 'string' && body.artifactId && body.workspaceId) {
      const nexusBase = process.env.NEXUS_API_URL ?? 'http://localhost:5050';
      try {
        await fetch(`${nexusBase}/api/artifacts/${body.artifactId}/ig-media`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': body.workspaceId },
          body: JSON.stringify({
            ig_media_id: data.post_id,
            permalink: typeof data.permalink === 'string' ? data.permalink : undefined,
          }),
        });
      } catch {
        // non-fatal metadata patch
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Mertcafe publish failed' },
      { status: 500 },
    );
  }
}

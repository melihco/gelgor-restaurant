import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import sharp from '@/lib/sharp-runtime';
import { generateStorageKey, getPresignedUrl, uploadToR2 } from '@/lib/r2-storage';
import {
  extractAccountIdFromPostResponse,
  extractMertcafeOAuthAccountId,
  loadMertcafeWorkspaceConfig,
  mertcafeGet,
  parseMertcafeErrorBody,
} from '@/lib/mertcafe-api';
import { appendMertcafeAccountToPayload } from '@/lib/mertcafe-config';
import {
  isNonRetryableMertcafePublishError,
  resolveMertcafePublishAuth,
} from '@/lib/mertcafe-publish-auth';
import { assertTenantMertcafeReady, requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';
import { serverConfig } from '@/lib/server-config';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';

export const runtime = 'nodejs';
export const maxDuration = 120;

const BASE_URL = process.env.MERTCAFE_BASE_URL ?? 'https://web-production-02d278.up.railway.app';

/** Server-side fetches — never use dead/expired NEXT_PUBLIC_SITE_URL (ngrok). */
function internalAppOrigin(): string {
  return getNextjsInternalOrigin().replace('://localhost', '://127.0.0.1');
}

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
  /** Override env — Instagram Business account id for Zernio/Mertcafe */
  account_id?: string;
  /** Use OAuth-linked Instagram (omit account_id). Value "oauth" also works. */
  use_oauth_account?: boolean;
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
/** Internal /api/media-proxy — re-upload to R2 so Mertcafe can fetch (localhost/tunnel unsafe). */
async function resolveMediaProxyForPublish(
  url: string,
  origin: string,
  postType: PostType,
): Promise<string> {
  if (!url.includes('/api/media-proxy')) return url;
  const publicUrl = toPublicUrl(url, origin) ?? url;
  const normalized = await normalizeImageForInstagram(publicUrl, postType);
  if (normalized !== publicUrl && normalized.startsWith('http')) return normalized;
  try {
    const res = await fetch(publicUrl, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return url;
    const buffer = Buffer.from(await res.arrayBuffer());
    const key = generateStorageKey('mertcafe-publish', 'image', 'jpg');
    const uploaded = await uploadToR2(buffer, key, 'image/jpeg');
    return await getPresignedUrl(uploaded.key, 24 * 3600);
  } catch {
    return url;
  }
}

async function resolveToPublicR2Url(url: string): Promise<string> {
  if (!url.includes('/api/media') || !url.includes('key=')) return url;
  try {
    const keyMatch = url.match(/[?&]key=([^&]+)/);
    const rawKey = keyMatch?.[1];
    if (!rawKey) return url;
    const key = decodeURIComponent(rawKey);
    const publicBase = serverConfig.r2.publicUrl?.replace(/\/$/, '');
    if (publicBase) {
      return `${publicBase}/${key.replace(/^\//, '')}`;
    }
    const { getPresignedUrl } = await import('@/lib/r2-storage');
    const presigned = await getPresignedUrl(key, 3 * 3600);
    console.log('[mertcafe/post] Resolved R2 key to presigned URL:', key.slice(0, 60));
    return presigned;
  } catch (err) {
    console.warn('[mertcafe/post] R2 presign failed, using original URL:', err);
    return url;
  }
}

async function mirrorAppMediaToR2(url: string, postType: PostType): Promise<string> {
  const internal = internalAppOrigin();
  let fetchUrl = url;
  if (fetchUrl.startsWith('/')) {
    fetchUrl = `${internal}${fetchUrl}`;
  } else if (fetchUrl.includes('/api/media') || fetchUrl.includes('/api/media-proxy')) {
    try {
      const parsed = new URL(fetchUrl, internal);
      fetchUrl = `${internal}${parsed.pathname}${parsed.search}`;
    } catch {
      fetchUrl = `${internal}${fetchUrl.startsWith('/') ? fetchUrl : `/${fetchUrl}`}`;
    }
  }
  const fetched = await fetchImageBuffer(fetchUrl);
  if (!fetched) {
    throw new Error('Görsel sunucudan okunamadı — R2 yükleme başarısız.');
  }
  return uploadNormalizedFeedImage(fetched.buffer);
}

/** R2 object key stored as /{workspaceId}/stories/file.mp4 (no /api/media prefix). */
const R2_KEY_BARE = /^\/([0-9a-f-]{36}\/(?:stories|video|reel|image)\/[^?#]+\.(?:mp4|mov|webm))$/i;
const R2_KEY_NO_SLASH = /^([0-9a-f-]{36}\/(?:stories|video|reel|image)\/[^?#]+\.(?:mp4|mov|webm))$/i;

async function resolveRemotionLocalVideo(rawUrl: string, workspaceId?: string): Promise<string | undefined> {
  const match = rawUrl.match(/\/api\/remotion\/video\/([^/?#]+\.mp4)/i);
  if (!match?.[1]) return undefined;
  const filename = match[1];
  if (filename.includes('/') || filename.includes('..')) return undefined;
  const filePath = path.join('/tmp/remotion-serve', filename);
  if (!fs.existsSync(filePath)) return undefined;

  if (serverConfig.r2.bucketConfigured && workspaceId) {
    try {
      const buffer = fs.readFileSync(filePath);
      const key = `${workspaceId}/stories/publish-${filename}`;
      await uploadToR2(buffer, key, 'video/mp4');
      const presigned = await getPresignedUrl(key, 3 * 3600);
      console.log('[mertcafe/post] Uploaded local Remotion video to R2:', key.slice(0, 60));
      return presigned;
    } catch (err) {
      console.warn('[mertcafe/post] Remotion local → R2 upload failed:', err);
    }
  }
  return undefined;
}

async function resolveVideoUrlForPublish(
  rawUrl: string | undefined,
  workspaceId?: string,
): Promise<string | undefined> {
  if (!rawUrl?.trim()) return undefined;
  const trimmed = rawUrl.trim();

  const remotionLocal = await resolveRemotionLocalVideo(trimmed, workspaceId);
  if (remotionLocal) return remotionLocal;

  // Bare R2 storage key — presign before adding origin (Instagram needs public HTTPS)
  const keyMatch = trimmed.match(R2_KEY_BARE) ?? trimmed.match(R2_KEY_NO_SLASH);
  const storageKey = keyMatch?.[1];
  if (storageKey) {
    try {
      const { getPresignedUrl } = await import('@/lib/r2-storage');
      const presigned = await getPresignedUrl(storageKey, 3 * 3600);
      console.log('[mertcafe/post] Presigned R2 key path:', storageKey.slice(0, 60));
      return presigned;
    } catch (err) {
      console.warn('[mertcafe/post] R2 key path presign failed:', err);
    }
  }

  let url: string;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    url = trimmed;
  } else if (trimmed.startsWith('/')) {
    url = `${internalAppOrigin()}${trimmed}`;
  } else {
    url = `${internalAppOrigin()}/${trimmed}`;
  }
  return resolveToPublicR2Url(url);
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

/** Resolve any app/R2/gallery URL to a publicly reachable HTTPS URL for Mertcafe. */
async function prepareImageUrlForPublish(
  raw: string | undefined,
  postType: PostType,
): Promise<string | undefined> {
  if (!raw?.trim()) return undefined;
  let url = raw.trim();

  // Presign R2 proxy paths before prefixing with (possibly dead) public tunnel URL.
  if (url.includes('/api/media') && url.includes('key=')) {
    url = await resolveToPublicR2Url(url);
  }

  const keyMatch = url.match(R2_KEY_BARE) ?? url.match(R2_KEY_NO_SLASH);
  const storageKey = keyMatch?.[1];
  if (storageKey && !url.startsWith('http')) {
    try {
      const publicBase = serverConfig.r2.publicUrl?.replace(/\/$/, '');
      if (publicBase) {
        url = `${publicBase}/${storageKey}`;
      } else {
        const { getPresignedUrl } = await import('@/lib/r2-storage');
        url = await getPresignedUrl(storageKey, 3 * 3600);
      }
    } catch (err) {
      console.warn('[mertcafe/post] bare R2 key presign failed:', err);
    }
  }

  if (url.startsWith('/')) {
    url = `${internalAppOrigin()}${url}`;
  }

  if (url.includes('/api/media-proxy') || (url.includes('/api/media?') && url.includes('key='))) {
    url = await resolveMediaProxyForPublish(url, internalAppOrigin(), postType);
    url = await resolveToPublicR2Url(url);
  }

  if (url.includes('/api/media') || url.includes('/api/media-proxy') || url.includes('127.0.0.1') || url.includes('localhost')) {
    url = await mirrorAppMediaToR2(url, postType);
  }

  url = await normalizeImageForInstagram(url, postType);
  return url;
}

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
      return null;
    }
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  } catch {
    return null;
  }
}

async function uploadNormalizedFeedImage(buffer: Buffer): Promise<string> {
  const key = generateStorageKey('mertcafe-publish', 'image', 'jpg');
  await uploadToR2(buffer, key, 'image/jpeg');
  return getPresignedUrl(key, 24 * 3600);
}

/** Instagram feed: 0.75 (3:4) – 1.91; story-format görselleri merkezden kırpar. */
async function normalizeImageForInstagram(url: string, postType: PostType): Promise<string> {
  if (postType !== 'feed') return url;

  const fetched = await fetchImageBuffer(url);
  if (!fetched) return url;

  const { buffer: input, contentType } = fetched;
  const looksWebp = contentType.includes('image/webp') || /\.webp(\?|$)/i.test(url);

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input).metadata();
  } catch {
    return url;
  }

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w <= 0 || h <= 0) return url;

  const ratio = w / h;
  const minRatio = 0.75;
  const maxRatio = 1.91;
  const needsCrop = ratio < minRatio || ratio > maxRatio;
  const needsConvert = looksWebp;

  if (!needsCrop && !needsConvert) return url;

  let working = sharp(input);
  if (needsCrop) {
    if (ratio < minRatio) {
      const targetH = Math.round(w / minRatio);
      const top = Math.max(0, Math.floor((h - targetH) / 2));
      working = working.extract({ left: 0, top, width: w, height: Math.min(targetH, h) });
    } else {
      const targetW = Math.round(h * maxRatio);
      const left = Math.max(0, Math.floor((w - targetW) / 2));
      working = working.extract({ left, top: 0, width: Math.min(targetW, w), height: h });
    }
  }

  try {
    const output = await working.jpeg({ quality: 92 }).toBuffer();
    const outMeta = await sharp(output).metadata();
    const outW = outMeta.width ?? 0;
    const outH = outMeta.height ?? 0;
    const outRatio = outW > 0 && outH > 0 ? outW / outH : 0;
    if (outRatio < minRatio - 0.01 || outRatio > maxRatio + 0.01) {
      throw new Error(`Kırpma sonrası oran hâlâ geçersiz (${outW}×${outH}).`);
    }
    const presigned = await uploadNormalizedFeedImage(output);
    console.log(
      '[mertcafe/post] Normalized feed image',
      `${w}×${h} → ${outW}×${outH}`,
      presigned.slice(0, 80),
    );
    return presigned;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unknown';
    throw new Error(
      `Görsel Instagram feed oranına kırpılamadı (${w}×${h}, ${ratio.toFixed(2)}:1). ${detail}`,
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as PublishBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const wsCheck = requireMertcafeWorkspaceId(body.workspaceId);
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }
  const workspaceId = wsCheck.workspaceId;

  const tenant = await loadMertcafeWorkspaceConfig(workspaceId);
  if (!tenant.hasApiKey) {
    return NextResponse.json(
      { error: 'Bu tenant için Mertcafe API anahtarı yok.', code: 'MISSING_API_KEY' },
      { status: 422 },
    );
  }

  const statusProbe = await mertcafeGet('/api/status', tenant.apiKey);
  const instagramConnected = statusProbe.ok && Boolean(statusProbe.data.instagram_connected);
  const oauthAccountId = instagramConnected
    ? extractMertcafeOAuthAccountId(statusProbe.data)
    : undefined;

  const explicitOAuth =
    body.use_oauth_account === true || body.account_id === 'oauth';
  const explicitManual = body.use_oauth_account === false;
  const publishAuth = resolveMertcafePublishAuth({
    instagram_connected: instagramConnected,
    use_oauth_account: explicitOAuth
      ? true
      : explicitManual
        ? false
        : tenant.useOAuthAccount,
    publish_account_id: body.account_id ?? tenant.publishAccountId ?? null,
    oauth_account_id: oauthAccountId ?? null,
  });
  const useOAuth = publishAuth.useOAuthAccount;

  if (useOAuth) {
    if (!instagramConnected) {
      return NextResponse.json(
        {
          error:
            'Yeni bağladığınız Instagram henüz hazır değil. OAuth tamamlandıktan sonra Ayarlar → Durumu yenile → OAuth senkronu deneyin.',
          code: 'INSTAGRAM_NOT_CONNECTED',
        },
        { status: 422 },
      );
    }
  } else {
    const ready = assertTenantMertcafeReady(tenant);
    if (!ready.ok) {
      return NextResponse.json({ error: ready.error, code: ready.code }, { status: 422 });
    }
  }

  const postType = body.post_type ?? 'feed';
  const hashtags = Array.isArray(body.hashtags) ? body.hashtags.map(String) : [];
  const payload: Record<string, unknown> = { api_key: tenant.apiKey };
  if (!useOAuth) {
    appendMertcafeAccountToPayload(
      payload,
      workspaceId,
      publishAuth.accountId ?? body.account_id,
      tenant.publishAccountId,
    );
    if (!payload.account_id) {
      return NextResponse.json(
        { error: 'Bu tenant için yayın hesap ID eksik.', code: 'MISSING_PUBLISH_ACCOUNT' },
        { status: 422 },
      );
    }
  }

  if (postType === 'story') {
    let videoCandidate = await resolveVideoUrlForPublish(body.video_url, body.workspaceId);

    if (videoCandidate) {
      let mediaError = await assertMediaReachable(videoCandidate, 'video');
      if (mediaError && /content-type is invalid \(image\//i.test(mediaError)) {
        console.warn('[mertcafe/post] video_url is a still image — publishing as image story:', videoCandidate.slice(0, 100));
        videoCandidate = undefined;
      } else if (mediaError) {
        return NextResponse.json(
          { error: `Video story publish blocked: ${mediaError}. Upload to R2 or set NEXT_PUBLIC_SITE_URL.` },
          { status: 422 },
        );
      }
    }

    if (videoCandidate) {
      payload.video_url = videoCandidate;
      payload.post_type = 'story';
    } else {
      let imageUrl: string | undefined;
      try {
        imageUrl = await prepareImageUrlForPublish(body.image_url, postType);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Story görseli hazırlanamadı.' },
          { status: 422 },
        );
      }
      if (!imageUrl) return NextResponse.json({ error: 'image_url or video_url is required for story posts' }, { status: 400 });
      const mediaError = await assertMediaReachable(imageUrl, 'image');
      if (mediaError) {
        return NextResponse.json(
          { error: `Story publish blocked: ${mediaError}. Görsel R2'ye yüklenemedi veya erişilemiyor.` },
          { status: 422 },
        );
      }
      payload.image_url = imageUrl;
      payload.post_type = 'story';
    }
  } else if (postType === 'reels') {
    let videoUrl = await resolveVideoUrlForPublish(body.video_url, body.workspaceId);
    if (!videoUrl) return NextResponse.json({ error: 'video_url is required for reels posts' }, { status: 400 });
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
    const rawUrls = Array.isArray(body.media_urls) ? body.media_urls.map(String) : [];
    if (rawUrls.length < 2) return NextResponse.json({ error: 'media_urls must contain at least 2 URLs for carousel posts' }, { status: 400 });
    const mediaUrls: string[] = [];
    for (const raw of rawUrls) {
      try {
        const prepared = await prepareImageUrlForPublish(raw, postType);
        if (prepared) mediaUrls.push(prepared);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Carousel görseli hazırlanamadı.' },
          { status: 422 },
        );
      }
    }
    if (mediaUrls.length < 2) return NextResponse.json({ error: 'media_urls must contain at least 2 URLs for carousel posts' }, { status: 400 });
    for (const mediaUrl of mediaUrls) {
      const kind: 'image' | 'video' = /\.(mp4|mov|webm|avi)(\?|$)/i.test(mediaUrl) ? 'video' : 'image';
      const mediaError = await assertMediaReachable(mediaUrl, kind);
      if (mediaError) {
        return NextResponse.json(
          { error: `Carousel publish blocked: ${mediaError}. URL: ${mediaUrl.slice(0, 120)}` },
          { status: 422 },
        );
      }
    }
    payload.media_urls = mediaUrls;
    payload.post_type = 'carousel';
    payload.content = body.content ?? '';
    if (hashtags.length) payload.hashtags = hashtags;
  } else {
    let imageUrl: string | undefined;
    try {
      imageUrl = await prepareImageUrlForPublish(body.image_url, postType);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Feed görseli Instagram oranına uyarlanamadı.' },
        { status: 422 },
      );
    }
    if (!imageUrl) return NextResponse.json({ error: 'image_url is required for feed posts' }, { status: 400 });
    const mediaError = await assertMediaReachable(imageUrl, 'image');
    if (mediaError) {
      return NextResponse.json(
        { error: `Feed publish blocked: ${mediaError}. Görsel R2'ye yüklenemedi veya erişilemiyor.` },
        { status: 422 },
      );
    }
    payload.image_url = imageUrl;
    payload.content = body.content ?? '';
    if (hashtags.length) payload.hashtags = hashtags;
  }

  try {
    let upstreamStatus = 0;
    let data: Record<string, unknown> = {};

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await fetch(`${BASE_URL}/api/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(110_000),
      });
      upstreamStatus = res.status;

      const rawBody = await res.text();
      data = {};
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody);
          if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
        } catch {
          data = { raw: rawBody };
        }
      }

      if (res.ok) break;

      const errorMessage = parseMertcafeErrorBody(data)
        || String(data.error || data.message || data.raw || '');
      if (isNonRetryableMertcafePublishError(errorMessage)) break;
      if (![502, 503, 504].includes(res.status) || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }

    if (upstreamStatus < 200 || upstreamStatus >= 300) {
      const errorMessage = parseMertcafeErrorBody(data)
        || `Mertcafe publish failed (${upstreamStatus})`;
      console.error('[mertcafe/post] upstream failed', {
        status: upstreamStatus,
        error: errorMessage,
        postType,
        workspaceId,
        account_id: payload.account_id ?? null,
        use_oauth: !payload.account_id,
      });
      const clientStatus = isNonRetryableMertcafePublishError(errorMessage)
        ? 422
        : upstreamStatus;
      return NextResponse.json(
        {
          error: errorMessage,
          upstream_status: upstreamStatus,
          request_id: typeof data.request_id === 'string' ? data.request_id : undefined,
        },
        { status: clientStatus },
      );
    }

    if (typeof data.post_id === 'string' && body.artifactId && body.workspaceId) {
      const nexusBase = serverConfig.nexus.baseUrl;
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

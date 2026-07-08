/**
 * POST /api/remotion/render
 *
 * Server-side Remotion render API.
 * Accepts story props + composition ID, returns uploaded MP4 URL.
 *
 * Render pipeline:
 *   1. Bundle the Remotion composition (cached after first build)
 *   2. renderMedia() → MP4 buffer in memory
 *   3. Upload to R2 / S3 (or return as base64 for small payloads)
 *   4. Return { videoUrl, thumbUrl, compositionId, durationMs }
 *
 * This replaces Creatomate — no monthly fee, $0.001/render compute cost.
 */

import { NextRequest, NextResponse } from 'next/server';
import { assertWorkspaceMatchesRequestTenant } from '@/lib/tenant-production-guard';
import type { StoryCompositionId } from '@/remotion/types';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { randomUUID } from 'crypto';
import { mediaUrlForKey } from '@/lib/media-url';
import { isSafeHttpHost } from '@/lib/trusted-media-hosts';
import { acquireDistributedSlot, releaseDistributedSlot } from '@/lib/redis-semaphore';
import {
  resolveRemotionMaxConcurrentRenders,
  resolveRemotionRenderConcurrency,
} from '@/lib/production-throughput';
import { getRemotionTemplate } from '@/lib/remotion-template-catalog';
import {
  resolveTemplateFromDirector,
  type CreativeDirectorLayoutOverrides,
} from '@/lib/creative-director-routing';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';
import {
  parseMotionProfileFromTheme,
  resolveBrandRemotionRenderPolicy,
  shouldEnableStoryVoiceover,
  type ContentIntent,
} from '@/lib/brand-motion-profile';
import { resolveShowcasePhotoForRender } from '@/lib/brand-showcase-presets';
import {
  isUsableGalleryPhotoUrl,
  normalizePhotoUrlForRemotionRender,
  unwrapMediaProxyUrl,
} from '@/lib/media-url';
import {
  buildDirectorLayoutSpecPatch,
  buildGrafikerRetryPatch,
  grafikerMeetsBar,
  GRAFIKER_MAX_RETRIES,
  resolveGrafikerMaxRetries,
  type GrafikerReviewResult,
} from '@/lib/remotion-quality';
import {
  applyBrandTokensToRenderProps,
  fetchBrandProductionTokensForWorkspace,
  fetchBrandThemeForWorkspace,
} from '@/lib/brand-production-tokens';
import { resolveLibrarySlotRenderBinding } from '@/lib/remotion-template-binding';
import { buildBrandTextOverlayLayoutPatch } from '@/lib/brand-text-overlay-prefs';
import { resolveStoryAudioMood } from '@/lib/story-audio-mood';
import { resolveStoryMusicUrl } from '@/lib/story-audio-catalog';
import {
  buildStoryVoiceoverScript,
  generateStoryVoiceoverFile,
  isStoryVoiceoverEnabled,
  safeUnlinkStoryVoiceover,
} from '@/lib/story-voiceover';
import type { StoryProps } from '@/remotion/types';
import {
  pruneStaleRemotionTempDirs,
  removeRemotionBundleDir,
} from '@/lib/remotion-temp-cleanup';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

const RENDER_BASE_URL = getNextjsInternalOrigin();
const RENDER_ASSET_DIR = '/tmp/remotion-serve';

let remotionAssetServer: http.Server | null = null;
let remotionAssetServerBase: string | null = null;

/** Separate port from Next.js :3000 — Remotion only accepts http(s) asset URLs. */
function ensureRemotionAssetServer(): Promise<string> {
  if (remotionAssetServerBase) return Promise.resolve(remotionAssetServerBase);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const rawPath = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        const name = path.basename(rawPath);
        if (!name || name.includes('..')) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const filePath = path.join(RENDER_ASSET_DIR, name);
        const resolvedRoot = path.resolve(RENDER_ASSET_DIR);
        if (!path.resolve(filePath).startsWith(resolvedRoot) || !fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const ct = ext === '.mp3' ? 'audio/mpeg' : ext === '.png' ? 'image/png' : 'image/jpeg';
        const fileSize = fs.statSync(filePath).size;
        // Audio files: allow Chromium to cache in-memory so Html5Audio doesn't re-fetch on every frame.
        // Images: no-store (they may be regenerated between renders).
        const cacheControl = ext === '.mp3' ? 'public, max-age=3600' : 'no-store';

        // Honour Range requests — required for Safari/iOS and Remotion Html5Audio duration probe.
        const rangeHeader = req.headers['range'];
        let start = 0;
        let end = fileSize - 1;
        let statusCode = 200;
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            start = parseInt(match[1]!, 10);
            end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
            statusCode = 206;
          }
        }
        const chunkSize = end - start + 1;
        res.writeHead(statusCode, {
          'Content-Type': ct,
          'Content-Length': chunkSize,
          'Cache-Control': cacheControl,
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
          ...(statusCode === 206 ? { 'Content-Range': `bytes ${start}-${end}/${fileSize}` } : {}),
        });

        // Stream large files to avoid blocking the event loop with readFileSync.
        // For audio (can be 100 MB+), streaming is critical for concurrent Remotion renders.
        if (ext === '.mp3' || fileSize > 512 * 1024) {
          const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 });
          stream.pipe(res);
        } else {
          const data = fs.readFileSync(filePath);
          res.end(data);
        }
      } catch {
        res.statusCode = 500;
        res.end();
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      remotionAssetServer = server;
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      if (!port) {
        reject(new Error('remotion asset server failed to bind'));
        return;
      }
      remotionAssetServerBase = `http://127.0.0.1:${port}`;
      console.log(`[remotion] temp asset server ${remotionAssetServerBase}`);
      resolve(remotionAssetServerBase);
    });
  });
}

async function remotionLocalAssetHttpUrl(filePath: string): Promise<string> {
  const base = await ensureRemotionAssetServer();
  return `${base}/${path.basename(filePath)}`;
}

/**
 * Pre-download story background music to the Remotion local asset server.
 *
 * Problem: Remotion's Html5Audio component calls the /api/story-music/ proxy URL
 * dozens of times in parallel during headless render. On first load the proxy must
 * fetch from upstream (7–23 s) → hits the 28 s delayRender timeout → render fails.
 *
 * Fix: download the MP3 once before the render starts and serve it from the same
 * local http server used for voiceover and image assets. Subsequent requests from
 * Chromium get the file instantly from memory (the http server reads from disk).
 *
 * Cache hierarchy:
 *   1. Already in /tmp/story-music-cache/ (written by /api/story-music/ handler) → copy
 *   2. Already in RENDER_ASSET_DIR from a previous render in this process → reuse
 *   3. Fetch via /api/story-music/ proxy (which will also cache it for future renders)
 */
const STORY_MUSIC_CACHE_DIR = '/tmp/story-music-cache';

async function materializeStoryMusicForRender(trackId: string): Promise<string | null> {
  const safeId = trackId.replace(/[^a-z0-9-]/gi, '_').slice(0, 120);
  const renderPath = path.join(RENDER_ASSET_DIR, `story-music-${safeId}.mp3`);
  const apiCachePath = path.join(STORY_MUSIC_CACHE_DIR, `${safeId}.mp3`);

  fs.mkdirSync(RENDER_ASSET_DIR, { recursive: true });

  // 1. Already materialized in this process
  if (fs.existsSync(renderPath) && fs.statSync(renderPath).size > 10_000) {
    return remotionLocalAssetHttpUrl(renderPath);
  }

  // 2. Already cached by the /api/story-music/ handler
  if (fs.existsSync(apiCachePath) && fs.statSync(apiCachePath).size > 10_000) {
    fs.copyFileSync(apiCachePath, renderPath);
    console.log(`[remotion] story music pre-cached from disk: ${safeId}`);
    return remotionLocalAssetHttpUrl(renderPath);
  }

  // 3. Fetch via proxy (will also populate the api cache for future requests)
  try {
    const proxyUrl = `${RENDER_BASE_URL}/api/story-music/${encodeURIComponent(trackId)}`;
    const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) {
      console.warn(`[remotion] music prefetch failed: ${res.status} for ${trackId}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 10_000) {
      console.warn(`[remotion] music prefetch too small (${buf.length} bytes): ${trackId}`);
      return null;
    }
    fs.writeFileSync(renderPath, buf);
    console.log(`[remotion] story music prefetched (${(buf.length / 1024).toFixed(0)} KB): ${safeId}`);
    return remotionLocalAssetHttpUrl(renderPath);
  } catch (err) {
    console.warn(`[remotion] music prefetch error: ${(err as Error).message?.slice(0, 80)}`);
    return null;
  }
}

function isLocalDevOrigin(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  } catch {
    return url.includes('localhost') || url.includes('127.0.0.1');
  }
}

/**
 * Last resort for localhost-only URLs — AVIF/WebP → JPEG on disk, served via temp http port.
 * External CDN / presigned R2 URLs are passed through (no localize).
 */
async function materializeImageAsJpegForHeadlessRender(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('file://')) return trimmed;

  let fetchUrl = trimmed;
  if (trimmed.startsWith('/')) {
    fetchUrl = `${RENDER_BASE_URL}${trimmed}`;
  }

  const sharp = (await import('sharp')).default;

  // Render time is the most failure-prone step: external brand/Wix CDNs are slow
  // or hotlink-protected, and a single timed-out fetch fails the whole bundle.
  // Try a direct fetch with retry, then fall back to fetchExternalImageBuffer
  // (proper Referer + 403 handling) before giving up.
  const fetchRaw = async (): Promise<Buffer> => {
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(fetchUrl, {
          signal: AbortSignal.timeout(45_000),
          headers: {
            Accept: 'image/*,*/*;q=0.8',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
          },
          redirect: 'follow',
        });
        if (!res.ok) {
          throw new Error(`image materialize failed: HTTP ${res.status} for ${trimmed.slice(0, 80)}`);
        }
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        lastErr = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
      }
    }
    // Last resort: proven external fetcher (Referer/hotlink-aware) for http(s) URLs.
    if (/^https?:\/\//i.test(fetchUrl)) {
      try {
        const { fetchExternalImageBuffer } = await import('@/lib/external-image-fetch');
        const buf = await fetchExternalImageBuffer(fetchUrl, 30_000);
        if (buf && buf.length > 0) return buf;
      } catch {
        /* fall through to throw */
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('image materialize failed');
  };

  try {
    const raw = await fetchRaw();
    const jpegBuffer = await sharp(raw).jpeg({ quality: 92 }).toBuffer();
    const filePath = path.join(RENDER_ASSET_DIR, `render-asset-${randomUUID()}.jpg`);
    fs.mkdirSync(RENDER_ASSET_DIR, { recursive: true });
    fs.writeFileSync(filePath, jpegBuffer);
    return await remotionLocalAssetHttpUrl(filePath);
  } catch (err) {
    const msg = (err as Error).message?.slice(0, 120) ?? 'unknown';
    console.warn('[remotion] image materialize error:', msg);
    throw err instanceof Error ? err : new Error(msg);
  }
}

function isHeadlessRenderSafeHttpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url) || isLocalDevOrigin(url)) return false;
  return isSafeHttpHost(url);
}

/** Remotion headless browser — never pass CORS-blocked external URLs; materialize locally. */
async function resolveMediaUrlForHeadlessRender(
  url: string,
  workspaceId?: string,
): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('file://')) return trimmed;

  const proxyTarget = unwrapMediaProxyUrl(trimmed);
  if (proxyTarget) {
    if (workspaceId) {
      const { ensureProductionGalleryPhotoUrlServer } = await import('@/lib/gallery-mirror-server');
      const ensured = await ensureProductionGalleryPhotoUrlServer(workspaceId, proxyTarget, { timeoutMs: 18_000 });
      if (ensured) return materializeImageAsJpegForHeadlessRender(ensured);
    }
    if (isHeadlessRenderSafeHttpUrl(proxyTarget)) return proxyTarget;
    return materializeImageAsJpegForHeadlessRender(proxyTarget);
  }

  if (trimmed.startsWith('/api/media-proxy')) {
    if (workspaceId) {
      const { ensureProductionGalleryPhotoUrlServer } = await import('@/lib/gallery-mirror-server');
      const ensured = await ensureProductionGalleryPhotoUrlServer(workspaceId, trimmed, { timeoutMs: 18_000 });
      if (ensured) return materializeImageAsJpegForHeadlessRender(ensured);
    }
    return materializeImageAsJpegForHeadlessRender(trimmed);
  }

  if (trimmed.includes('/api/media') && trimmed.includes('key=')) {
    try {
      const { getPresignedUrl } = await import('@/lib/r2-storage');
      const keyMatch = trimmed.match(/[?&]key=([^&]+)/);
      if (keyMatch?.[1]) {
        const presigned = await getPresignedUrl(decodeURIComponent(keyMatch[1]), 3600);
        if (isHeadlessRenderSafeHttpUrl(presigned)) return presigned;
        return materializeImageAsJpegForHeadlessRender(presigned);
      }
    } catch {
      /* fall through */
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    if (isHeadlessRenderSafeHttpUrl(trimmed)) return trimmed;
    return materializeImageAsJpegForHeadlessRender(trimmed);
  }

  const showcaseUrl = resolveShowcasePhotoForRender(trimmed, RENDER_BASE_URL);
  if (/^https?:\/\//i.test(showcaseUrl)) {
    if (isHeadlessRenderSafeHttpUrl(showcaseUrl)) return showcaseUrl;
    return materializeImageAsJpegForHeadlessRender(showcaseUrl);
  }

  return materializeImageAsJpegForHeadlessRender(showcaseUrl);
}

async function runGrafikerReview(
  composition: { durationInFrames: number; fps: number },
  serveUrl: string,
  inputProps: Record<string, unknown>,
  compositionId: string,
  telemetry?: { attempt?: number; missionId?: string | null; slotKey?: string | null },
  tier?: string,
): Promise<GrafikerReviewResult | null> {
  const openaiKey = serverConfig.openai.apiKey;
  if (!openaiKey) return null;

  // Faz 2.2 — Grafiker-lite: küçük thumbnail (≈768px) + ucuz model. Premium korunur.
  // Tier yalnızca açıkça economy/agency ise lite; eksikse tam kalite (premium-güvenli).
  const lite = serverConfig.remotion.grafikerLite && (tier === 'economy' || tier === 'agency');
  const reviewScale = lite ? 0.4 : 1.0; // 1920 → ~768px

  try {
    const os = await import('os');
    const fsModule = await import('fs');
    const { renderStill } = await import('@remotion/renderer');
    const thumbFile = os.default.tmpdir() + `/remotion-thumb-${Date.now()}.jpg`;
    const reviewFrame = Math.min(90, Math.max(45, Math.round(composition.durationInFrames * 0.35)));

    await renderStill({
      composition: composition as Parameters<typeof renderStill>[0]['composition'],
      serveUrl,
      output: thumbFile,
      inputProps,
      frame: reviewFrame,
      imageFormat: 'jpeg',
      jpegQuality: lite ? 80 : 92,
      scale: reviewScale,
    });

    if (!fsModule.default.existsSync(thumbFile)) return null;

    const thumbBuffer = fsModule.default.readFileSync(thumbFile);
    fsModule.default.unlinkSync(thumbFile);

    const { runGrafikerVisionReview } = await import('@/lib/grafiker-review-service');
    return runGrafikerVisionReview(thumbBuffer, compositionId, 'story', telemetry, tier);
  } catch {
    return null;
  }
}

export const maxDuration = 300; // Remotion: bundle ~90s + render ~60s = 150s; extra buffer

export type RemotionCompositionId =
  | StoryCompositionId
  | 'BrandedFeedPost'
  | 'BrandedFeedPortrait';

export type RemotionRenderRequest = {
  compositionId: RemotionCompositionId;
  props: {
    photoUrl: string;
    headline: string;
    subtitle?: string;
    categoryLabel?: string;
    brandName: string;
    location?: string;
    primaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    overlayOpacity?: number;
    headlineWeight?: number;
    headlineScale?: number;
    templateId?: string;
    kitId?: string;
    contentIntent?: string;
    sector?: string;
    layoutSpecPatch?: Record<string, unknown>;
    galleryPhotoUrls?: string[];
    mood?: string;
    businessType?: string;
    sceneBrief?: string;
    preferredLayoutFamily?: string;
  };
  /** If true, call Creative Director Agent to enhance spec before render (recommended) */
  useCreativeDirector?: boolean;
  /** Marka Detayı kütüphanesi kilitliyse Creative Director şablon ailesini değiştiremez */
  brandTemplateLocked?: boolean;
  /** Tenant motion profile constraints — Creative Director must pick from this list */
  allowedCompositions?: StoryCompositionId[];
  motionStyle?: string;
  locale?: string;
  /** Optional: upload output to R2 and return URL instead of base64 */
  uploadToR2?: boolean;
  /** Production: do not return ephemeral /tmp video URLs */
  requirePersistent?: boolean;
  /** Workspace ID for storage path */
  workspaceId?: string;
  /** Alternate gallery URLs when primary photoUrl is unreachable */
  galleryPhotoCandidates?: string[];
  /** P2-1 — profile-aware Grafiker retry cap (0–2) */
  grafikerMaxRetries?: number;
  /** Faz 2.2 — production tier; premium preserves full Grafiker (gpt-4o high) */
  profileTier?: 'economy' | 'agency' | 'premium';
};

// Bundle is created once and cached between requests (Next.js module cache)
let _bundleUrl: string | null = null;
let _bundling = false;
const BUNDLE_VERSION = '26';

// ── Idempotency cache ─────────────────────────────────────────────────────────
// Prevents duplicate renders when retries hit within a short window.
const _idempotencyCache = new Map<string, { body: string; status: number; expiresAt: number }>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Global render queue ───────────────────────────────────────────────────────
// Remotion renders spawn a headless Chromium + ffmpeg that saturate every CPU
// core. When auto-produce fires several story/post renders via Promise.all, the
// host event loop starves and unrelated API calls (/theme, mission progress,
// /mobile) balloon to 90–140s, while concurrent renders also race on the shared
// webpack bundle dir ("getStaticCompositions undefined"). Admission control keeps
// the box responsive; default allows 2 parallel renders on 8+ core hosts.
const MAX_CONCURRENT_RENDERS_DEFAULT = resolveRemotionMaxConcurrentRenders();
const RENDER_CPU_CONCURRENCY_DEFAULT = resolveRemotionRenderConcurrency(MAX_CONCURRENT_RENDERS_DEFAULT);

let _activeRenders = 0;
const _renderWaiters: Array<() => void> = [];

async function acquireRenderSlot(
  maxConcurrent = MAX_CONCURRENT_RENDERS_DEFAULT,
): Promise<void> {
  if (_activeRenders < maxConcurrent) {
    _activeRenders += 1;
    return;
  }
  await new Promise<void>((resolve) => _renderWaiters.push(resolve));
  // Slot ownership is handed off by releaseRenderSlot without decrementing.
}

function releaseRenderSlot(): void {
  const next = _renderWaiters.shift();
  if (next) {
    next();
  } else {
    _activeRenders = Math.max(0, _activeRenders - 1);
  }
}

function resolveRemotionWebRoot(): string {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), 'apps', 'web'),
  ];
  for (const root of candidates) {
    const audioProbe = path.join(root, 'public', 'audio', 'ambient-chill.mp3');
    if (fs.existsSync(audioProbe)) return root;
  }
  return process.cwd();
}

const STORY_AUDIO_COMPOSITIONS = new Set([
  'EditorialStory',
  'LuxurySplitStory',
  'CinematicStory',
  'EventAnnouncementStory',
  'CampaignHeroStory',
  'MagazineCoverStory',
  'GallerySeriesStory',
  'SpecStory',
]);

function audioPoolFromTheme(theme: Record<string, unknown> | null): string[] {
  const motion = (theme?.motion ?? theme?.Motion) as Record<string, unknown> | undefined;
  const raw = motion?.audio_mood_pool ?? motion?.audioMoodPool;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean);
}

async function enrichStoryAudioProps(
  compositionId: string,
  inputProps: StoryProps,
  opts: { locale?: string; brandTheme: Record<string, unknown> | null },
): Promise<{ props: StoryProps; voiceoverTempPath?: string }> {
  if (!STORY_AUDIO_COMPOSITIONS.has(compositionId)) {
    return { props: inputProps };
  }

  const ext = inputProps as unknown as Record<string, unknown>;

  // storyMusicUrl === '' is an explicit "disable audio" signal (used by showcase renders).
  // Preserve it so getInputProps().storyMusicUrl stays '' in the composition and no URL resolves.
  if (ext.storyMusicUrl === '') {
    const locale = String(opts.locale ?? ext.locale ?? 'tr');
    return { props: { ...inputProps, audioMood: '', storyMusicUrl: '', locale } };
  }

  const locale = String(opts.locale ?? ext.locale ?? 'tr');
  const motionProfile = parseMotionProfileFromTheme(opts.brandTheme ?? undefined, {
    sector: String(ext.sector ?? ext.businessType ?? ''),
  });
  const poolFromTheme = audioPoolFromTheme(opts.brandTheme);
  const audioMood = resolveStoryAudioMood({
    explicit: String(ext.audioMood ?? ''),
    selected: motionProfile.storyAudioMood,
    pool: motionProfile.audioMoodPool.length ? motionProfile.audioMoodPool : poolFromTheme,
    sector: String(ext.sector ?? ext.businessType ?? ''),
  });

  // Resolve the proxy URL first, then pre-materialize to the local asset server.
  // This prevents the Html5Audio delayRender timeout that occurs when Remotion's headless
  // Chromium fires dozens of parallel requests to /api/story-music/ and the upstream
  // fetch (7–23 s) exceeds the 28 s delayRender deadline.
  const rawMusicProxyUrl = resolveStoryMusicUrl(audioMood);
  let resolvedMusicUrl: string | undefined = rawMusicProxyUrl ?? undefined;

  if (rawMusicProxyUrl) {
    // Case 1: proxy URL → extract trackId and materialize via /api/story-music/
    const trackIdMatch = rawMusicProxyUrl.match(/\/api\/story-music\/([^/?#]+)/);
    const trackId = trackIdMatch?.[1] ? decodeURIComponent(trackIdMatch[1]) : null;
    if (trackId) {
      const localUrl = await materializeStoryMusicForRender(trackId);
      if (localUrl) resolvedMusicUrl = localUrl;
      // else fall back to proxy URL — render may still work if audio loads fast enough
    } else if (rawMusicProxyUrl.match(/^\/audio\/(.+\.mp3)$/i)) {
      // Case 2: local static file path (e.g. /audio/ambient-chill.mp3)
      // resolveLocalFile() returns staticFile() which is a relative path —
      // headless Chromium can't resolve it. Copy to the temp asset server instead.
      const relPath = rawMusicProxyUrl.replace(/^\//, '');
      const publicPath = path.join(process.cwd(), 'public', relPath);
      if (fs.existsSync(publicPath)) {
        const safeId = path.basename(publicPath, '.mp3').replace(/[^a-z0-9-]/gi, '_');
        const renderPath = path.join(RENDER_ASSET_DIR, `story-music-${safeId}.mp3`);
        fs.mkdirSync(RENDER_ASSET_DIR, { recursive: true });
        if (!fs.existsSync(renderPath) || fs.statSync(renderPath).size < 10_000) {
          fs.copyFileSync(publicPath, renderPath);
        }
        const localUrl = await remotionLocalAssetHttpUrl(renderPath);
        console.log(`[remotion] local audio materialized: ${safeId} → ${localUrl}`);
        resolvedMusicUrl = localUrl;
      }
    }
  }

  let props: StoryProps = {
    ...inputProps,
    audioMood,
    storyMusicUrl: resolvedMusicUrl,
    locale,
  };
  let voiceoverTempPath: string | undefined;

  if (isStoryVoiceoverEnabled() && shouldEnableStoryVoiceover(motionProfile)) {
    // Sprint 5 — Voiceover as ad copy: pass sequence role + ctaHint so the
    // rewriter can produce punchy, role-appropriate copy instead of trimmed captions.
    const script = buildStoryVoiceoverScript({
      brandName: props.brandName,
      headline: props.headline,
      subtitle: props.subtitle,
      caption: String(ext.caption ?? ext.voiceoverScript ?? ''),
      voiceoverScript: String(ext.voiceoverScript ?? ext.caption ?? ''),
      locale,
      sequenceRole: (ext.storySequenceRole as 'hook' | 'proof' | 'cta' | undefined) ?? undefined,
      ctaHint: String(ext.cta ?? '').trim() || undefined,
    });
    const vo = await generateStoryVoiceoverFile({
      script,
      locale,
      voiceId: motionProfile.storyVoiceId,
    });
    if (vo) {
      voiceoverTempPath = vo.filePath;
      props = { ...props, voiceoverUrl: await remotionLocalAssetHttpUrl(vo.filePath) };
      console.log(`[remotion] story voiceover (${locale}): ${script.slice(0, 90)}`);
    }
  } else {
    console.debug('[remotion] story voiceover skipped (disabled, music_only, or no OPENAI_API_KEY)');
  }

  return { props, voiceoverTempPath };
}
let _bundleVersionApplied = '';

async function getBundleUrl(): Promise<string> {
  if (_bundleVersionApplied !== BUNDLE_VERSION) {
    removeRemotionBundleDir(_bundleUrl);
    _bundleUrl = null;
    _bundleVersionApplied = BUNDLE_VERSION;
    pruneStaleRemotionTempDirs({ force: true });
  }
  if (_bundleUrl) return _bundleUrl;
  if (_bundling) {
    // Wait for in-progress bundle
    while (_bundling) await new Promise(r => setTimeout(r, 200));
    return _bundleUrl!;
  }

  _bundling = true;
  try {
    pruneStaleRemotionTempDirs({ keepPath: _bundleUrl, maxAgeMs: 15 * 60 * 1000 });
    const { bundle } = await import('@remotion/bundler');
    const webRoot = resolveRemotionWebRoot();
    const entryPoint = path.resolve(webRoot, 'src/remotion/Root.tsx');
    // publicDir: Remotion copies this into bundle /public — staticFile('audio/x.mp3') → /public/audio/x.mp3
    const publicDir = path.resolve(webRoot, 'public');
    _bundleUrl = await bundle({
      entryPoint,
      webpackOverride: (config) => {
        config.resolve = config.resolve ?? {};
        config.resolve.alias = {
          ...(config.resolve.alias as Record<string, string> | undefined),
          '@': path.resolve(webRoot, 'src'),
        };
        return config;
      },
      publicDir,
    });
    return _bundleUrl;
  } finally {
    _bundling = false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const idempotencyKey = req.headers.get('x-idempotency-key');
  if (idempotencyKey) {
    const cached = _idempotencyCache.get(idempotencyKey);
    if (cached && cached.expiresAt > Date.now()) {
      return new NextResponse(cached.body, {
        status: cached.status,
        headers: { 'content-type': 'application/json', 'x-idempotent-replay': '1' },
      });
    }
  }

  const rawBody = await req.text();
  let admissionTheme: Record<string, unknown> | null = null;
  try {
    const peek = JSON.parse(rawBody) as { workspaceId?: string };
    if (peek.workspaceId) {
      admissionTheme = await fetchBrandThemeForWorkspace(peek.workspaceId).catch(() => null);
    }
  } catch {
    // renderHandler returns 400 for invalid JSON
  }

  const maxConcurrent = resolveRemotionMaxConcurrentRenders(admissionTheme);

  // Distributed render gate: cap concurrent renders GLOBALLY across all Next.js
  // instances (in addition to the per-instance in-process gate below). Self-heals
  // via TTL; no-ops when REDIS_URL is unset. Default global cap = 8, env override.
  const globalRenderCap = serverConfig.remotion.globalMaxConcurrentRenders;
  const distToken = await acquireDistributedSlot({
    key: 'remotion_render',
    max: globalRenderCap,
    ttlMs: 10 * 60 * 1000,
    waitTimeoutMs: 8 * 60 * 1000,
  });

  await acquireRenderSlot(maxConcurrent);
  try {
    const replayReq = new NextRequest(req.url, {
      method: 'POST',
      headers: req.headers,
      body: rawBody,
    });
    const response = await renderHandler(replayReq, {
      renderCpuConcurrency: resolveRemotionRenderConcurrency(maxConcurrent),
    });

    if (idempotencyKey && response.ok) {
      const responseBody = await response.clone().text();
      _idempotencyCache.set(idempotencyKey, {
        body: responseBody,
        status: response.status,
        expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      });
      // Evict stale entries periodically
      if (_idempotencyCache.size > 50) {
        const now = Date.now();
        for (const [k, v] of _idempotencyCache) {
          if (v.expiresAt < now) _idempotencyCache.delete(k);
        }
      }
    }

    return response;
  } finally {
    releaseRenderSlot();
    await releaseDistributedSlot('remotion_render', distToken);
  }
}

async function renderHandler(
  req: NextRequest,
  opts?: { renderCpuConcurrency?: number },
): Promise<NextResponse> {
  const renderCpuConcurrency = opts?.renderCpuConcurrency ?? RENDER_CPU_CONCURRENCY_DEFAULT;
  let body: RemotionRenderRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    compositionId: reqCompositionId,
    props: reqProps,
    uploadToR2 = false,
    requirePersistent = false,
    workspaceId,
    useCreativeDirector = true,
    brandTemplateLocked = false,
    allowedCompositions,
    motionStyle,
    locale,
    grafikerMaxRetries: bodyGrafikerRetries,
    profileTier,
  } = body;
  const grafikerMaxRetries = resolveGrafikerMaxRetries(bodyGrafikerRetries);
  // Faz 2.3 — CD-lite: economy/agency'de Grafiker-fail retry'ındaki ekstra CD
  // çağrısını atla (deterministik retry patch'i korunur) + CD route ucuz modele düşer.
  // Premium / tier-bilinmiyor → tam davranış. Default OFF.
  const cdLite = serverConfig.remotion.cdLite
    && (profileTier === 'economy' || profileTier === 'agency');
  if (workspaceId) {
    const tenantGuard = assertWorkspaceMatchesRequestTenant(req, workspaceId);
    if (tenantGuard) return tenantGuard;
  }
  if (!reqCompositionId || !reqProps?.photoUrl || !reqProps?.headline) {
    return NextResponse.json({ error: 'compositionId, props.photoUrl, props.headline required' }, { status: 400 });
  }
  if (!isUsableGalleryPhotoUrl(reqProps.photoUrl)) {
    return NextResponse.json(
      { error: 'Photo URL is not a usable image asset (invalid or broken gallery link)' },
      { status: 400 },
    );
  }
  let productionPhotoUrl = reqProps.photoUrl.trim();
  const galleryPhotoCandidates = Array.isArray(body.galleryPhotoCandidates)
    ? body.galleryPhotoCandidates.filter((u: unknown): u is string => typeof u === 'string')
    : [];
  let resolvedGalleryPhotoUrls: string[] | undefined;
  let resolvedLogoUrl: string | undefined;
  if (workspaceId) {
    const {
      pickReachableProductionGalleryUrl,
      resolveProductionGalleryUrlsForRemotion,
      resolveRemotionLogoUrlForRender,
    } = await import('@/lib/media-url');
    const picked = await pickReachableProductionGalleryUrl(
      workspaceId,
      productionPhotoUrl,
      galleryPhotoCandidates,
      { timeoutMs: 28_000 },
    );
    if (!picked) {
      return NextResponse.json(
        { error: 'Photo URL is not reachable (expired, blocked, or not an image)' },
        { status: 422 },
      );
    }
    if (picked.fallbackFrom) {
      console.log(
        `[remotion] gallery fallback: ${picked.fallbackFrom.slice(0, 80)} → ${picked.url.slice(0, 80)}`,
      );
    }
    productionPhotoUrl = picked.url;

    const extReqEarly = reqProps as Record<string, unknown>;
    if (Array.isArray(extReqEarly.galleryPhotoUrls) && extReqEarly.galleryPhotoUrls.length > 0) {
      resolvedGalleryPhotoUrls = await resolveProductionGalleryUrlsForRemotion(
        workspaceId,
        extReqEarly.galleryPhotoUrls as string[],
        {
          primaryUrl: productionPhotoUrl,
          candidateUrls: galleryPhotoCandidates,
          timeoutMs: 20_000,
        },
      );
      extReqEarly.galleryPhotoUrls = resolvedGalleryPhotoUrls;
    }
    if (typeof extReqEarly.logoUrl === 'string' && extReqEarly.logoUrl.trim()) {
      resolvedLogoUrl = await resolveRemotionLogoUrlForRender(workspaceId, extReqEarly.logoUrl, {
        timeoutMs: 15_000,
      });
      extReqEarly.logoUrl = resolvedLogoUrl;
    }
  } else {
    const photoUrlForProbe = normalizePhotoUrlForRemotionRender(productionPhotoUrl);
    const { confirmGalleryPhotoReachableForRemotion } = await import('@/lib/media-url');
    const photoReachable = await confirmGalleryPhotoReachableForRemotion(
      productionPhotoUrl || photoUrlForProbe,
      { timeoutMs: 28_000 },
    );
    if (!photoReachable) {
      return NextResponse.json(
        { error: 'Photo URL is not reachable (expired, blocked, or not an image)' },
        { status: 422 },
      );
    }
    productionPhotoUrl = photoUrlForProbe;
  }

  let propsForRender = {
    ...reqProps,
    photoUrl: normalizePhotoUrlForRemotionRender(productionPhotoUrl),
    ...(resolvedGalleryPhotoUrls ? { galleryPhotoUrls: resolvedGalleryPhotoUrls } : {}),
    ...(workspaceId && typeof (reqProps as Record<string, unknown>).logoUrl === 'string'
      ? { logoUrl: resolvedLogoUrl }
      : {}),
  };
  let brandTheme: Record<string, unknown> | null = null;
  let workspaceTokens: Awaited<ReturnType<typeof fetchBrandProductionTokensForWorkspace>> | undefined;
  let slotTypography: {
    headingFont?: string;
    bodyFont?: string;
    fontPersonality?: string;
    honorTemplateTypography?: boolean;
  } | undefined;
  let effectiveBrandTemplateLocked = brandTemplateLocked;
  let effectiveMotionStyle = motionStyle;
  let effectiveLocale = locale;
  let effectiveAllowedCompositions = allowedCompositions;

  if (workspaceId) {
    const { resolveRemotionLogoUrlForRender: resolveLogoForRender } = await import('@/lib/media-url');
    const extReq = reqProps as Record<string, unknown>;
    const sectorHint = String(extReq.sector ?? extReq.businessType ?? '');
    const [tokens, theme] = await Promise.all([
      fetchBrandProductionTokensForWorkspace(workspaceId, {
        brandName: reqProps.brandName,
        sector: sectorHint,
      }),
      fetchBrandThemeForWorkspace(workspaceId),
    ]);
    workspaceTokens = tokens;

    const librarySlotKey = String(extReq.librarySlotKey ?? '').trim();
    const requestedFormat = (
      reqCompositionId.startsWith('SpecPoster')
      || String(extReq.posterTemplateId ?? '').trim()
    ) ? 'post' as const : 'story' as const;
    const incomingTpl = String(
      requestedFormat === 'post'
        ? (extReq.posterTemplateId ?? extReq.templateId ?? '')
        : (extReq.templateId ?? ''),
    ).trim();
    if (librarySlotKey) {
      const { ensureBrandTemplateLibrary } = await import('@/lib/brand-template-library');
      const { resolveKitForSector } = await import('@/lib/remotion-template-registry');
      const { tenantKitSeed } = await import('@/lib/tenant-template-seed');
      const { resolveSlotRenderTypography } = await import('@/lib/brand-template-slot-typography');
      const { resolveSlotLogoForRender } = await import('@/lib/brand-logo-production');
      const kitId = resolveKitForSector(sectorHint, tenantKitSeed(workspaceId));
      const library = ensureBrandTemplateLibrary(theme, {
        sector: sectorHint,
        kitId,
        tenantId: workspaceId,
      });
      const binding = resolveLibrarySlotRenderBinding({
        library,
        librarySlotKey,
        requestedFormat,
        incomingTemplateId: incomingTpl,
      });
      const slot = binding.slot;
      if (slot) {
        if (binding.effectiveTemplateId) {
          extReq.templateId = binding.effectiveTemplateId;
          if (requestedFormat === 'post') {
            extReq.posterTemplateId = binding.effectivePosterTemplateId ?? binding.effectiveTemplateId;
          }
        }
        const slotTypo = resolveSlotRenderTypography({
          slot: {
            fontMode: slot.fontMode,
            fontPersonality: slot.fontPersonality,
            headingFont: slot.headingFont,
            bodyFont: slot.bodyFont,
            format: requestedFormat,
            storyTemplateId: slot.storyTemplateId,
            posterTemplateId: slot.posterTemplateId,
          },
          templateId: binding.effectiveTemplateId || incomingTpl,
          format: requestedFormat,
          brandHeadingFont: tokens.headingFont,
          brandBodyFont: tokens.bodyFont,
          sector: sectorHint,
        });
        slotTypography = {
          headingFont: slotTypo.headingFont,
          bodyFont: slotTypo.bodyFont,
          fontPersonality: slotTypo.fontPersonality,
          honorTemplateTypography: slotTypo.honorTemplateTypography,
        };
        if (extReq.logoUrl) {
          const slotLogo = resolveSlotLogoForRender(String(extReq.logoUrl), slot);
          extReq.logoUrl = slotLogo
            ? await resolveLogoForRender(workspaceId, slotLogo, { timeoutMs: 15_000 })
            : undefined;
        }
        if (library.locked) {
          effectiveBrandTemplateLocked = true;
        }
      }
    }

    brandTheme = theme;
    propsForRender = applyBrandTokensToRenderProps(
      extReq,
      tokens,
      slotTypography ?? (
        extReq.honorTemplateTypography
          ? {
              headingFont: String(extReq.fontFamily ?? tokens.headingFont),
              bodyFont: String(extReq.bodyFont ?? tokens.bodyFont),
              fontPersonality: String(extReq.fontPersonality ?? ''),
              honorTemplateTypography: extReq.honorTemplateTypography === true,
            }
          : undefined
      ),
    ) as typeof reqProps;

    const policy = resolveBrandRemotionRenderPolicy(theme, { sector: sectorHint });
    if (!effectiveBrandTemplateLocked && policy.brandTemplateLocked) {
      effectiveBrandTemplateLocked = true;
    }
    effectiveMotionStyle = effectiveMotionStyle || policy.motionStyle;
    effectiveLocale = effectiveLocale || policy.locale;
    effectiveAllowedCompositions = effectiveAllowedCompositions ?? policy.allowedCompositions;
  }

  // ── Creative Director Agent: enhance spec before render ───────────────────
  let compositionId = reqCompositionId;
  let props = { ...propsForRender };
  let creativeDirector: Record<string, unknown> | null = null;
  const extProps = propsForRender as Record<string, unknown>;
  const incomingTemplateId = String(extProps.templateId ?? '');

  if (useCreativeDirector && reqProps.headline && reqProps.brandName) {
    try {
      const cdBase = getNextjsInternalOrigin();
      const currentTpl = incomingTemplateId ? getRemotionTemplate(incomingTemplateId) : undefined;
      const cdRes = await fetch(`${cdBase}/api/remotion/creative-director`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headline: reqProps.headline,
          caption: reqProps.subtitle || '',
          brandName: reqProps.brandName,
          businessType: extProps.businessType,
          mood: extProps.mood || '',
          primaryColor: reqProps.primaryColor,
          accentColor: reqProps.accentColor,
          allowedCompositions: effectiveAllowedCompositions,
          motionStyle: effectiveMotionStyle,
          locale: effectiveLocale,
          preferredCompositionId: reqCompositionId,
          templateId: incomingTemplateId || undefined,
          currentLayoutFamily: currentTpl?.family,
          contentIntent: extProps.contentIntent,
          sector: extProps.sector,
          galleryPhotoCount: Array.isArray(extProps.galleryPhotoUrls)
            ? (extProps.galleryPhotoUrls as unknown[]).length + 1
            : 1,
          sceneBrief: String(extProps.sceneBrief ?? ''),
          preferredLayoutFamily: extProps.preferredLayoutFamily as RemotionLayoutFamily | undefined,
          storySequenceRole: extProps.storySequenceRole,
          storySequenceIndex: extProps.storySequenceIndex,
          storySequenceTotal: extProps.storySequenceTotal,
          recentLayoutFamilies: extProps.recentLayoutFamilies,
          ctaText: extProps.cta,
          premiumComposition: extProps.premiumComposition ?? undefined,
          profileTier,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (cdRes.ok) {
        const spec = await cdRes.json() as {
          layoutFamily?: string;
          variantIndex?: number;
          compositionId?: StoryCompositionId;
          categoryLabel?: string;
          displayHeadline?: string;
          displaySubtitle?: string;
          overlayOpacity?: number;
          headlineWeight?: number;
          headlineScale?: number;
          layoutOverrides?: CreativeDirectorLayoutOverrides;
          rationale?: string;
          designScore?: number;
        };

        const lockComposition = reqCompositionId === 'EventAnnouncementStory'
          || reqCompositionId === 'GallerySeriesStory'
          || reqCompositionId.startsWith('SpecPoster')
          || (effectiveBrandTemplateLocked && Boolean(incomingTemplateId));

        const isSpecStory = reqCompositionId === 'SpecStory';
        let nextTemplateId = incomingTemplateId;

        if (effectiveBrandTemplateLocked && incomingTemplateId) {
          // Marka Detayı story şablonu — CD yalnızca copy/layout ince ayarı; templateId sabit kalır.
          nextTemplateId = incomingTemplateId;
        } else if (isSpecStory && spec.layoutFamily) {
          nextTemplateId = resolveTemplateFromDirector({
            layoutFamily: spec.layoutFamily as RemotionLayoutFamily,
            variantIndex: spec.variantIndex,
            compositionId: spec.compositionId,
            currentTemplateId: incomingTemplateId || undefined,
            intent: extProps.contentIntent as ContentIntent | undefined,
            sector: String(extProps.sector ?? ''),
            galleryPhotoCount: Array.isArray(extProps.galleryPhotoUrls)
              ? (extProps.galleryPhotoUrls as unknown[]).length + 1
              : 1,
          });
        } else if (!lockComposition && spec.compositionId) {
          const allowed = effectiveAllowedCompositions?.length
            ? new Set(effectiveAllowedCompositions)
            : null;
          let nextComposition = spec.compositionId;
          if (allowed && !allowed.has(nextComposition)) {
            nextComposition = reqCompositionId as StoryCompositionId;
          }
          compositionId = nextComposition;
          nextTemplateId = resolveTemplateFromDirector({
            compositionId: nextComposition,
            currentTemplateId: incomingTemplateId || undefined,
            intent: extProps.contentIntent as ContentIntent | undefined,
            variantIndex: spec.variantIndex,
          });
        }

        const layoutSpecPatch = buildDirectorLayoutSpecPatch({
          layoutOverrides: spec.layoutOverrides,
          overlayOpacity: spec.overlayOpacity ?? 0.6,
          headlineWeight: spec.headlineWeight ?? 700,
          headlineScale: spec.headlineScale ?? 1,
        });

        props = {
          ...reqProps,
          templateId: nextTemplateId || incomingTemplateId,
          headline: spec.displayHeadline || reqProps.headline,
          subtitle: spec.displaySubtitle || reqProps.subtitle,
          categoryLabel: spec.categoryLabel || reqProps.categoryLabel,
          overlayOpacity: spec.overlayOpacity,
          headlineWeight: spec.headlineWeight,
          headlineScale: spec.headlineScale,
          layoutSpecPatch,
        };

        creativeDirector = {
          layoutFamily: spec.layoutFamily,
          variantIndex: spec.variantIndex,
          templateId: nextTemplateId,
          compositionId: isSpecStory ? 'SpecStory' : compositionId,
          rationale: spec.rationale,
          designScore: spec.designScore,
        };

        console.log(
          `[remotion] Creative Director: ${incomingTemplateId || reqCompositionId} → ` +
          `${nextTemplateId} (${spec.layoutFamily}[${spec.variantIndex ?? 0}]) | ` +
          `score=${spec.designScore} | "${spec.displayHeadline}"`,
        );
      }
    } catch (cdErr) {
      console.warn('[remotion] Creative Director failed, using original spec:', (cdErr as Error).message?.slice(0, 60));
    }
  }

  if (workspaceId && compositionId === 'SpecStory') {
    const ext = props as Record<string, unknown>;
    const tplId = String(ext.templateId ?? incomingTemplateId ?? 'remotion_editorial_bottom_01');
    const tpl = getRemotionTemplate(tplId);
    const existingPatch = (ext.layoutSpecPatch ?? {}) as Record<string, unknown>;
    const mergedForPrefs = tpl ? { ...tpl.spec, ...existingPatch } : existingPatch;
    const overlayPatch = buildBrandTextOverlayLayoutPatch(mergedForPrefs, brandTheme);
    props = {
      ...props,
      layoutSpecPatch: { ...existingPatch, ...overlayPatch },
    };
  }

  if (workspaceTokens) {
    props = applyBrandTokensToRenderProps(
      props as Record<string, unknown>,
      workspaceTokens,
      slotTypography ?? (
        (props as Record<string, unknown>).honorTemplateTypography
          ? {
              headingFont: String((props as Record<string, unknown>).fontFamily ?? workspaceTokens.headingFont),
              bodyFont: String((props as Record<string, unknown>).bodyFont ?? workspaceTokens.bodyFont),
              fontPersonality: String((props as Record<string, unknown>).fontPersonality ?? ''),
              honorTemplateTypography: (props as Record<string, unknown>).honorTemplateTypography === true,
            }
          : undefined
      ),
    ) as typeof props;
  }

  const extResolved = props as Record<string, unknown>;
  props = {
    ...props,
    photoUrl: await resolveMediaUrlForHeadlessRender(props.photoUrl, workspaceId),
    galleryPhotoUrls: Array.isArray(extResolved.galleryPhotoUrls)
      ? await Promise.all(
          (extResolved.galleryPhotoUrls as string[]).map((u) =>
            resolveMediaUrlForHeadlessRender(u, workspaceId),
          ),
        )
      : (extResolved.galleryPhotoUrls as string[] | undefined),
    ...(typeof extResolved.logoUrl === 'string'
      ? { logoUrl: await resolveMediaUrlForHeadlessRender(extResolved.logoUrl, workspaceId) }
      : {}),
  } as typeof props;

  const t0 = Date.now();
  const renderMeta = () => ({
    templateId: String((props as Record<string, unknown>).templateId ?? incomingTemplateId ?? ''),
    creativeDirector,
  });

  let voiceoverTempPath: string | undefined;

  try {
    // ── Agency posters: SVG overlay + Sharp (skip amateur CSS Remotion still) ──
    if (compositionId.startsWith('SpecPoster')) {
      const format = compositionId === 'SpecPosterPost'
        ? 'post' as const
        : compositionId === 'SpecPosterPortrait'
          ? 'portrait' as const
          : 'story' as const;
      const ext = props as Record<string, unknown>;
      const posterTemplateId = String(ext.posterTemplateId ?? ext.templateId ?? 'poster_lineup_tiered_01');
      const { renderAgencyPoster } = await import('@/lib/poster-render-service');
      let posterBrandKit;
      if (workspaceId) {
        const tokens = await fetchBrandProductionTokensForWorkspace(workspaceId, {
          brandName: props.brandName,
          sector: String(ext.sector ?? ext.businessType ?? ''),
        });
        posterBrandKit = tokens.announcementKit;
      }
      const {
        buffer: pngBuffer,
        announcementTemplateId,
        grafikerScore: posterGrafikerScore,
        grafikerPass: posterGrafikerPass,
      } = await renderAgencyPoster({
        posterTemplateId,
        photoUrl: props.photoUrl,
        format,
        headline: props.headline,
        subtitle: props.subtitle,
        brandName: props.brandName,
        location: props.location,
        eventDate: ext.eventDate as string | undefined,
        eventTime: ext.eventTime as string | undefined,
        cta: ext.cta as string | undefined,
        primaryColor: props.primaryColor,
        accentColor: props.accentColor,
        headlineColor: ext.headlineColor as string | undefined,
        textColor: (ext.textColor as string | undefined) ?? (ext.subtitleColor as string | undefined),
        fontFamily: props.fontFamily,
        bodyFont: ext.bodyFont as string | undefined,
        brandKit: posterBrandKit,
        brandTheme: (body as { brandTheme?: Record<string, unknown> }).brandTheme ?? null,
        logoUrl: ext.logoUrl as string | undefined,
        lineupArtists: ext.lineupArtists as string[] | undefined,
        sector: String(ext.sector ?? ext.businessType ?? ''),
        profileTier,
      });
      const durationMs = Date.now() - t0;
      console.log(
        `[remotion] ${compositionId} agency poster via ${announcementTemplateId} in ${durationMs}ms (${(pngBuffer.length / 1024).toFixed(0)} KB)`,
      );

      if (uploadToR2 && workspaceId && serverConfig.r2.configured) {
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const { accessKeyId, secretAccessKey } = serverConfig.r2.requireCredentials();
          const s3 = new S3Client({
            region: 'auto',
            endpoint: serverConfig.r2.endpoint,
            credentials: { accessKeyId, secretAccessKey },
          });
          const slug = `${workspaceId.slice(0, 8)}-${compositionId.toLowerCase()}-${Date.now()}`;
          const key = `${workspaceId}/posts/${slug}.png`;
          await s3.send(new PutObjectCommand({
            Bucket: serverConfig.r2.bucket,
            Key: key,
            Body: pngBuffer,
            ContentType: 'image/png',
          }));
          const imageUrl = mediaUrlForKey(key);
          return NextResponse.json({
            imageUrl,
            compositionId,
            durationMs,
            bytes: pngBuffer.length,
            isStill: true,
            announcementTemplateId,
            renderEngine: 'agency-svg',
            grafikerScore: posterGrafikerScore,
            grafikerPass: posterGrafikerPass,
          });
        } catch { /* fall through to base64 */ }
      }

      const b64 = pngBuffer.toString('base64');
      return NextResponse.json({
        imageUrl: `data:image/png;base64,${b64}`,
        compositionId,
        durationMs,
        bytes: pngBuffer.length,
        isStill: true,
        announcementTemplateId,
        renderEngine: 'agency-svg',
        grafikerScore: posterGrafikerScore,
        grafikerPass: posterGrafikerPass,
      });
    }

    const audioEnriched = await enrichStoryAudioProps(compositionId, props, {
      locale: effectiveLocale,
      brandTheme,
    });
    props = audioEnriched.props;
    voiceoverTempPath = audioEnriched.voiceoverTempPath;

    // 1. Get (or build) bundle
    const serveUrl = await getBundleUrl();

    // 2. Select composition
    const { selectComposition } = await import('@remotion/renderer');
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: props,
    });

    // 3. Render to temp file
    const os = await import('os');
    const fsModule = await import('fs');
    const isStillComposition =
      compositionId === 'BrandedFeedPost'
      || compositionId === 'BrandedFeedPortrait'
      || compositionId === 'SpecPosterStory'
      || compositionId === 'SpecPosterPost'
      || compositionId === 'SpecPosterPortrait';

    // Post compositions → PNG still (fast ~3s); story/event → MP4 video
    if (isStillComposition) {
      const tmpPng = os.default.tmpdir() + `/remotion-${compositionId}-${Date.now()}.png`;
      const { renderStill: renderStillPost } = await import('@remotion/renderer');
      await renderStillPost({
        composition,
        serveUrl,
        output: tmpPng,
        inputProps: props,
        frame: 0,
        imageFormat: 'png',
        scale: 1.0,
      });

      if (!fsModule.default.existsSync(tmpPng)) {
        return NextResponse.json({ error: 'Still render produced no output' }, { status: 500 });
      }
      const pngBuffer = fsModule.default.readFileSync(tmpPng);
      fsModule.default.unlinkSync(tmpPng);
      const durationMs = Date.now() - t0;
      console.log(`[remotion] ${compositionId} still rendered in ${durationMs}ms (${(pngBuffer.length / 1024).toFixed(0)} KB)`);

      // Upload or return base64
      if (uploadToR2 && workspaceId && serverConfig.r2.configured) {
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          const { accessKeyId, secretAccessKey } = serverConfig.r2.requireCredentials();
          const s3 = new S3Client({ region: 'auto', endpoint: serverConfig.r2.endpoint, credentials: { accessKeyId, secretAccessKey } });
          const slug = `${workspaceId.slice(0, 8)}-${compositionId.toLowerCase()}-${Date.now()}`;
          const key = `${workspaceId}/posts/${slug}.png`;
          await s3.send(new PutObjectCommand({ Bucket: serverConfig.r2.bucket, Key: key, Body: pngBuffer, ContentType: 'image/png' }));
          const imageUrl = mediaUrlForKey(key);
          return NextResponse.json({ imageUrl, compositionId, durationMs, bytes: pngBuffer.length, isStill: true });
        } catch { /* fall through to base64 */ }
      }

      const b64 = pngBuffer.toString('base64');
      return NextResponse.json({ imageUrl: `data:image/png;base64,${b64}`, compositionId, durationMs, bytes: pngBuffer.length, isStill: true });
    }

    const tmpFile = os.default.tmpdir() + `/remotion-${compositionId}-${Date.now()}.mp4`;
    const { renderMedia, selectComposition: reselectComposition } = await import('@remotion/renderer');

    let renderProps: Record<string, unknown> = { ...props };
    let activeComposition = composition;
    let grafikerReview: GrafikerReviewResult | null = null;
    let videoBuffer: Buffer | null = null;

    // Quality convergence runs on a single still per attempt (cheap), and the full
    // MP4 is rendered once after the layout passes Grafiker (or retries run out).
    // Previously every attempt rendered the entire video, tripling render time on
    // retries (≈128s for a 3-attempt story → ≈45s).
    for (let attempt = 0; attempt <= grafikerMaxRetries; attempt++) {
      grafikerReview = await runGrafikerReview(activeComposition, serveUrl, renderProps, compositionId, { attempt }, profileTier);
      if (grafikerReview) {
        const overlap = grafikerReview.text_overlap ? '⚠ OVERLAP' : '✓ no overlap';
        console.log(
          `[remotion] Grafiker (still ${attempt + 1}): ${grafikerReview.score}/10 pass=${grafikerReview.pass} | ${overlap} | ${grafikerReview.verdict ?? ''}`,
        );
        try {
          const { emitQualityEvent } = await import('@/lib/ai-cost-telemetry');
          emitQualityEvent({
            event: 'grafiker',
            pass: grafikerMeetsBar(grafikerReview),
            score: grafikerReview.score,
            attempt,
            label: `story:${compositionId}`,
          });
        } catch { /* telemetri üretimi bozmamalı */ }
        if (grafikerReview.issues?.length) {
          console.log(`[remotion] Grafiker issues: ${grafikerReview.issues.join(' | ')}`);
        }
      }

      if (!grafikerReview || grafikerMeetsBar(grafikerReview) || attempt >= grafikerMaxRetries) {
        break;
      }

      if (useCreativeDirector && !cdLite && attempt === 0 && reqProps.headline && reqProps.brandName) {
        try {
          const ext = renderProps as Record<string, unknown>;
          const cdRes = await fetch(`${RENDER_BASE_URL}/api/remotion/creative-director`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              headline: String(renderProps.headline ?? reqProps.headline),
              caption: String(renderProps.subtitle ?? reqProps.subtitle ?? ''),
              brandName: String(renderProps.brandName ?? reqProps.brandName),
              businessType: ext.businessType,
              mood: ext.mood || '',
              primaryColor: renderProps.primaryColor,
              accentColor: renderProps.accentColor,
              allowedCompositions: effectiveAllowedCompositions,
              motionStyle: effectiveMotionStyle,
              locale: effectiveLocale,
              preferredCompositionId: compositionId,
              templateId: String(ext.templateId ?? ''),
              contentIntent: ext.contentIntent,
              sector: ext.sector,
              galleryPhotoCount: Array.isArray(ext.galleryPhotoUrls)
                ? (ext.galleryPhotoUrls as unknown[]).length + 1
                : 1,
              sceneBrief: String(ext.sceneBrief ?? ''),
              preferredLayoutFamily: ext.preferredLayoutFamily,
              storySequenceRole: ext.storySequenceRole,
              storySequenceIndex: ext.storySequenceIndex,
              storySequenceTotal: ext.storySequenceTotal,
              recentLayoutFamilies: ext.recentLayoutFamilies,
              ctaText: ext.cta,
              grafikerFeedback: (grafikerReview.issues ?? []).join('; '),
              grafikerScore: grafikerReview.score,
              retryAttempt: attempt + 1,
              premiumComposition: ext.premiumComposition ?? undefined,
              profileTier,
            }),
            signal: AbortSignal.timeout(18_000),
          });
          if (cdRes.ok) {
            const spec = await cdRes.json() as {
              displayHeadline?: string;
              displaySubtitle?: string;
              categoryLabel?: string;
              overlayOpacity?: number;
              headlineWeight?: number;
              headlineScale?: number;
              layoutOverrides?: CreativeDirectorLayoutOverrides;
              layoutFamily?: string;
            };
            const layoutSpecPatch = buildDirectorLayoutSpecPatch({
              layoutOverrides: spec.layoutOverrides,
              overlayOpacity: spec.overlayOpacity ?? 0.6,
              headlineWeight: spec.headlineWeight ?? 700,
              headlineScale: spec.headlineScale ?? 1,
            });
            renderProps = {
              ...renderProps,
              headline: spec.displayHeadline || renderProps.headline,
              subtitle: spec.displaySubtitle || renderProps.subtitle,
              categoryLabel: spec.categoryLabel || renderProps.categoryLabel,
              overlayOpacity: spec.overlayOpacity ?? renderProps.overlayOpacity,
              headlineWeight: spec.headlineWeight ?? renderProps.headlineWeight,
              headlineScale: spec.headlineScale ?? renderProps.headlineScale,
              layoutSpecPatch,
            };
            console.log(
              `[remotion] Creative Director Grafiker retry: "${String(renderProps.headline).slice(0, 32)}" ` +
              `overlay=${spec.overlayOpacity ?? 'n/a'}`,
            );
          }
        } catch (cdRetryErr) {
          console.warn('[remotion] CD Grafiker retry failed:', (cdRetryErr as Error).message?.slice(0, 60));
        }
      }

      const patched = buildGrafikerRetryPatch(renderProps, grafikerReview, attempt);
      if (!patched) break;

      console.log(
        `[remotion] Grafiker retry ${attempt + 1}/${grafikerMaxRetries}: score=${grafikerReview.score} — boosting contrast/layout`,
      );
      renderProps = patched;
      activeComposition = await reselectComposition({
        serveUrl,
        id: compositionId,
        inputProps: renderProps,
      });
    }

    // Single full-video render with the Grafiker-approved (or best-effort) props.
    await renderMedia({
      composition: activeComposition,
      serveUrl,
      codec: 'h264',
      outputLocation: tmpFile,
      inputProps: renderProps,
      concurrency: renderCpuConcurrency,
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct % 20 === 0) console.log(`[remotion] ${compositionId}: ${pct}%`);
      },
      jpegQuality: 95,
      scale: 1.0,
    });
    if (!fsModule.default.existsSync(tmpFile)) {
      return NextResponse.json({ error: 'Render produced no output file' }, { status: 500 });
    }
    videoBuffer = fsModule.default.readFileSync(tmpFile);
    fsModule.default.unlinkSync(tmpFile);
    console.log(`[remotion] rendered ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);

    props = renderProps as typeof props;
    const grafikerScore = grafikerReview?.score ?? null;
    const grafikerPass = grafikerReview ? grafikerMeetsBar(grafikerReview) : true;

    const durationMs = Date.now() - t0;
    console.log(`[remotion] ${compositionId} rendered in ${durationMs}ms, ${videoBuffer!.length} bytes`);

    // 4a. Upload to R2 if requested and configured
    if (uploadToR2 && workspaceId && serverConfig.r2.configured) {
      try {
        const slug = `${workspaceId.slice(0, 8)}-${compositionId.toLowerCase().replace('story', '')}-${Date.now()}`;
        const key = `${workspaceId}/stories/${slug}.mp4`;

        const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
        const { accessKeyId, secretAccessKey } = serverConfig.r2.requireCredentials();
        const s3 = new S3Client({
          region: 'auto',
          endpoint: serverConfig.r2.endpoint,
          credentials: { accessKeyId, secretAccessKey },
        });

        await s3.send(new PutObjectCommand({
          Bucket: serverConfig.r2.bucket,
          Key: key,
          Body: videoBuffer!,
          ContentType: 'video/mp4',
        }));

        const videoUrl = mediaUrlForKey(key);
        return NextResponse.json({ videoUrl, thumbUrl: videoUrl, compositionId, durationMs, bytes: videoBuffer!.length, grafikerScore, grafikerPass, ...renderMeta() });
      } catch (uploadErr) {
        console.warn('[remotion] R2 upload failed, returning base64:', uploadErr);
      }
    }

    // 4b. Local serve — production fallback when R2 missing or upload failed
    try {
      const serveDir = '/tmp/remotion-serve';
      const mkdirModule = await import('fs');
      if (!mkdirModule.default.existsSync(serveDir)) {
        mkdirModule.default.mkdirSync(serveDir, { recursive: true });
      }
      const slug = `${compositionId.toLowerCase().replace('story','')}-${Date.now()}`;
      const serveFile = `${serveDir}/${slug}.mp4`;
      mkdirModule.default.writeFileSync(serveFile, videoBuffer!);
      const videoUrl = `/api/remotion/video/${slug}.mp4`;
      console.log(`[remotion] saved local: ${serveFile}`);
      return NextResponse.json({ videoUrl, thumbUrl: videoUrl, compositionId, durationMs, bytes: videoBuffer!.length, grafikerScore, grafikerPass });
    } catch {
      // Last resort: base64
      const base64 = videoBuffer!.toString('base64');
      return NextResponse.json({ videoBase64: base64, mimeType: 'video/mp4', compositionId, durationMs, bytes: videoBuffer!.length, grafikerScore, grafikerPass, ...renderMeta() });
    }

  } catch (err: any) {
    console.error('[remotion] render error:', err?.message ?? err);
    return NextResponse.json(
      { error: err?.message ?? 'Render failed', compositionId },
      { status: 500 },
    );
  } finally {
    safeUnlinkStoryVoiceover(voiceoverTempPath);
  }
}

/**
 * GET /api/remotion/render — list available compositions and their props schema.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    compositions: [
      { id: 'EditorialStory', description: 'Safe default — bottom gradient, left-aligned type', bestFor: ['daily', 'food', 'venue'] },
      { id: 'MagazineCoverStory', description: 'Awwwards editorial — giant headline, cinematic pan', bestFor: ['feature', 'chef', 'spotlight'] },
      { id: 'CampaignHeroStory', description: 'Campaign hero — centered type + offer pill', bestFor: ['promo', 'offer', 'launch'] },
      { id: 'LuxurySplitStory', description: '60% photo + 40% brand panel', bestFor: ['premium', 'luxury', 'fine dining'] },
      { id: 'CinematicStory', description: 'Atmospheric — centered 1-2 words on empty horizon', bestFor: ['sunset', 'sea', 'sky'] },
      { id: 'EventAnnouncementStory', description: 'Event — date/time/CTA + audio', bestFor: ['events', 'DJ', 'parties'] },
    ],
    requiredProps: ['photoUrl', 'headline', 'brandName'],
    optionalProps: ['subtitle', 'categoryLabel', 'location', 'primaryColor', 'accentColor', 'fontFamily'],
    dimensions: { width: 1080, height: 1920 },
    duration: '5s @ 30fps',
    outputFormat: 'video/mp4 (H.264)',
  });
}

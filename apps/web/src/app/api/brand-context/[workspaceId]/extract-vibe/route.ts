/**
 * Brand Vibe Extraction BFF — agency-grade reference DNA pipeline.
 *
 * Modes:
 *   1. handles scrape (default) — Apify → R2 mirror → GPT-4o Vision → persist
 *   2. onboarding_gallery / image_urls — skip Apify; use provisioned gallery + captions
 *
 * Why this route owns the pipeline (instead of Python):
 *   - R2 credentials live here (S3 SDK + env)
 *   - Direct Node fetch from the Next.js server reaches IG CDN reliably
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { serverConfig } from '@/lib/server-config';
import {
  assembleBrandVibeProfile,
  CAPTION_VOICE_PROMPT,
  parseCaptionList,
  safeParseJsonObject,
  VIBE_VISUAL_PROMPT,
  type BrandVibeProfile,
} from '@/lib/brand-vibe-extraction';
import {
  filterGalleryAnalysisKeys,
  parseBrandReferenceUrls,
  resolveVisionImageUrl,
} from '@/lib/gallery-upload';

export const runtime = 'nodejs';
export const maxDuration = 240;

const CREW_BACKEND = serverConfig.crewBackend.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'image/*,*/*;q=0.8',
  Referer: 'https://www.instagram.com/',
};

interface ScrapeResponse {
  handles: string[];
  image_urls: string[];
  captions: string[];
  fetch_errors: Record<string, string>;
}

async function callPython<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${CREW_BACKEND}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Api-Key': INTERNAL_KEY,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(180_000),
  });
  const json = await r.json();
  if (!r.ok) {
    const detail = (json as { detail?: string; error?: string })?.detail
      ?? (json as { detail?: string; error?: string })?.error
      ?? JSON.stringify(json);
    throw new Error(`python_${r.status}: ${detail}`);
  }
  return json as T;
}

interface MirrorResult {
  storedUrl: string;
  key: string;
}

async function mirrorImageToR2(
  sourceUrl: string,
  workspaceId: string,
  account: string,
): Promise<MirrorResult | null> {
  try {
    const { isR2Configured, generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');
    if (!isR2Configured()) return null;

    const res = await fetch(sourceUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') ?? 'image/jpeg';
    if (!ct.startsWith('image/')) return null;

    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
    const buf = Buffer.from(await res.arrayBuffer());
    const safeAccount = account.replace(/[^a-z0-9-]/gi, '-').toLowerCase().slice(0, 30);
    const key = generateStorageKey(`vibe-ref/${workspaceId}/${safeAccount}`, 'image', ext);
    const result = await uploadToR2(buf, key, ct);
    return { storedUrl: result.url, key };
  } catch (err) {
    console.warn('[extract-vibe] mirror failed', sourceUrl.slice(0, 100), err);
    return null;
  }
}

function mediaKeyFromUrl(url: string): string | null {
  try {
    if (url.includes('/api/media')) {
      const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
      const params = new URLSearchParams(q.startsWith('http') ? new URL(url).search : q);
      const key = params.get('key');
      return key ? decodeURIComponent(key) : null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function loadBrandDiscoverySignals(workspaceId: string): Promise<{
  imageUrls: string[];
  captions: string[];
  handle: string;
}> {
  const ctx = await callPython<Record<string, unknown>>(
    `/api/v1/brand-context/${workspaceId}`,
    { headers: { 'X-Tenant-Id': workspaceId } },
  );
  const refs = parseBrandReferenceUrls(ctx.reference_image_urls);
  const ga = (ctx.gallery_analysis && typeof ctx.gallery_analysis === 'object')
    ? (ctx.gallery_analysis as Record<string, unknown>)
    : {};
  const fromGa = filterGalleryAnalysisKeys(ga);
  const imageUrls = [...new Set([...refs, ...fromGa])];
  const captions = parseCaptionList(ctx.instagram_recent_captions);
  const handle = String(ctx.instagram_handle ?? '').trim().replace(/^@/, '');
  return { imageUrls, captions, handle };
}

async function runVisionAndVoice(input: {
  openai: OpenAI;
  labels: string[];
  visionUrls: string[];
  captions: string[];
  storedFrames: { url: string; source_account: string }[];
  sourceMode: 'handles_scrape' | 'onboarding_gallery';
}): Promise<BrandVibeProfile> {
  const { openai, labels, visionUrls, captions, storedFrames, sourceMode } = input;

  let visualJson: Record<string, unknown> = {};
  const visionRes = await openai.chat.completions.create({
    model: serverConfig.ai.chatModel('creative'),
    max_tokens: 2000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: VIBE_VISUAL_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Brand source(s): ${labels.map((h) => (h.startsWith('@') ? h : '@' + h)).join(', ') || 'brand gallery'}. Analyze the visual DNA from these ${visionUrls.length} images as a set.`,
          },
          ...visionUrls.map((url) => ({
            type: 'image_url' as const,
            image_url: { url, detail: 'low' as const },
          })),
        ],
      },
    ],
  });
  visualJson = safeParseJsonObject(visionRes.choices[0]?.message?.content ?? '{}');

  let voiceJson: Record<string, unknown> = {};
  if (captions.length > 0) {
    try {
      const voiceRes = await openai.chat.completions.create({
        model: serverConfig.ai.chatModel('standard'),
        max_tokens: 600,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CAPTION_VOICE_PROMPT },
          {
            role: 'user',
            content: `Brand source(s): ${labels.join(', ') || 'brand'}.\nRecent captions (one per line):\n\n${captions.slice(0, 20).join('\n---\n')}`,
          },
        ],
      });
      voiceJson = safeParseJsonObject(voiceRes.choices[0]?.message?.content ?? '{}');
    } catch (err) {
      console.warn('[extract-vibe] voice extraction failed', err);
    }
  }

  return assembleBrandVibeProfile({
    sourceAccounts: labels.filter(Boolean),
    visualJson,
    voiceJson,
    referenceFrames: storedFrames,
    captionSampleCount: captions.length,
    sourceMode,
    enrichmentNote:
      sourceMode === 'onboarding_gallery'
        ? 'Onboarding gallery skip-scrape vibe extraction'
        : undefined,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const openaiKey = serverConfig.openai.apiKey;
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 503 });
  }

  let body: {
    handles?: string[];
    posts_per_handle?: number;
    persist?: boolean;
    max_images?: number;
    source?: 'handles' | 'onboarding_gallery';
    image_urls?: string[];
    captions?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const maxImages = Math.max(4, Math.min(Number(body.max_images ?? 12), 20));
  const persist = body.persist !== false;
  const handles = (body.handles ?? [])
    .map((h) => String(h ?? '').trim().replace(/^@/, ''))
    .filter(Boolean);

  const explicitUrls = (body.image_urls ?? [])
    .map((u) => String(u ?? '').trim())
    .filter(Boolean);
  const skipScrape =
    body.source === 'onboarding_gallery'
    || explicitUrls.length > 0;

  const openai = new OpenAI({ apiKey: openaiKey });

  // ── Skip-scrape path (onboarding / gap repair) ───────────────────────────
  if (skipScrape) {
    let imageUrls = explicitUrls;
    let captions = parseCaptionList(body.captions);
    let handle = handles[0] ?? '';

    if (imageUrls.length < 3 || captions.length === 0 || !handle) {
      try {
        const discovery = await loadBrandDiscoverySignals(workspaceId);
        if (imageUrls.length < 3) imageUrls = discovery.imageUrls;
        if (captions.length === 0) captions = discovery.captions;
        if (!handle) handle = discovery.handle;
      } catch (err) {
        console.warn('[extract-vibe] discovery load failed', err);
      }
    }

    imageUrls = [...new Set(imageUrls)].slice(0, maxImages * 2);
    if (imageUrls.length < 3) {
      // Fallback: one Apify scrape of own handle when gallery empty
      if (handle) {
        console.log('[extract-vibe] gallery empty — fallback scrape', { handle });
        try {
          const scrape = await callPython<ScrapeResponse>(
            `/api/v1/brand-context/${workspaceId}/vibe/scrape-refs`,
            {
              method: 'POST',
              body: JSON.stringify({ handles: [handle], posts_per_handle: 12 }),
              headers: { 'X-Tenant-Id': workspaceId },
            },
          );
          imageUrls = scrape.image_urls;
          if (captions.length === 0) captions = scrape.captions;
        } catch (err) {
          return NextResponse.json(
            {
              error: 'no_images_found',
              message: err instanceof Error ? err.message : String(err),
            },
            { status: 422 },
          );
        }
      } else {
        return NextResponse.json(
          {
            error: 'no_images_found',
            message: 'No gallery/reference images and no Instagram handle for fallback scrape.',
          },
          { status: 422 },
        );
      }
    }

    const labels = handle ? [handle] : ['brand_gallery'];
    const candidates = imageUrls.slice(0, maxImages);
    const visionUrls: string[] = [];
    const storedFrames: { url: string; source_account: string }[] = [];

    for (const url of candidates) {
      try {
        const key = mediaKeyFromUrl(url);
        if (key) {
          const { getPresignedUrl } = await import('@/lib/r2-storage');
          const presigned = await getPresignedUrl(key, 3600);
          visionUrls.push(presigned);
          storedFrames.push({ url, source_account: labels[0]! });
          continue;
        }
        if (url.startsWith('/api/media') || url.startsWith('http')) {
          const resolved = await resolveVisionImageUrl(url);
          visionUrls.push(resolved);
          storedFrames.push({ url, source_account: labels[0]! });
        }
      } catch (err) {
        console.warn('[extract-vibe] resolve vision url failed', url.slice(0, 80), err);
      }
      if (visionUrls.length >= maxImages) break;
    }

    if (visionUrls.length < 3) {
      return NextResponse.json(
        {
          error: 'mirror_failed',
          message: `Only ${visionUrls.length} gallery images resolvable for vision.`,
          attempted: candidates.length,
        },
        { status: 502 },
      );
    }

    let profile: BrandVibeProfile;
    try {
      profile = await runVisionAndVoice({
        openai,
        labels,
        visionUrls,
        captions,
        storedFrames: storedFrames.slice(0, visionUrls.length),
        sourceMode: 'onboarding_gallery',
      });
    } catch (err) {
      console.error('[extract-vibe] vision failed', err);
      return NextResponse.json(
        { error: 'vision_failed', message: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }

    if (persist) {
      try {
        await callPython(`/api/v1/brand-context/${workspaceId}/vibe`, {
          method: 'PUT',
          body: JSON.stringify({ vibe: profile }),
          headers: { 'X-Tenant-Id': workspaceId },
        });
      } catch (err) {
        return NextResponse.json(
          {
            ok: false,
            persisted: false,
            profile,
            error: 'persist_failed',
            message: err instanceof Error ? err.message : String(err),
          },
          { status: 200 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      persisted: persist,
      profile,
      stats: {
        source: 'onboarding_gallery',
        images_analyzed: visionUrls.length,
        captions_collected: captions.length,
      },
    });
  }

  // ── Handles scrape path (Brand Hub) ──────────────────────────────────────
  if (handles.length === 0) {
    return NextResponse.json({ error: 'handles required (1-5 IG accounts)' }, { status: 400 });
  }
  const postsPerHandle = Math.max(4, Math.min(Number(body.posts_per_handle ?? 12), 18));

  console.log('[extract-vibe] start', { workspaceId, handles, postsPerHandle, maxImages, persist });

  let scrape: ScrapeResponse;
  try {
    scrape = await callPython<ScrapeResponse>(
      `/api/v1/brand-context/${workspaceId}/vibe/scrape-refs`,
      {
        method: 'POST',
        body: JSON.stringify({ handles, posts_per_handle: postsPerHandle }),
        headers: { 'X-Tenant-Id': workspaceId },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'scrape_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  if (scrape.image_urls.length === 0) {
    return NextResponse.json(
      {
        error: 'no_images_found',
        message: 'Apify returned 0 images. Check Apify quota / handle validity.',
        fetch_errors: scrape.fetch_errors,
      },
      { status: 422 },
    );
  }

  const accountForUrl = (u: string): string => {
    const idx = scrape.image_urls.indexOf(u);
    const perHandle = Math.ceil(scrape.image_urls.length / Math.max(1, handles.length));
    return handles[Math.min(handles.length - 1, Math.floor(idx / perHandle))] ?? handles[0]!;
  };

  const candidates = scrape.image_urls.slice(0, Math.min(scrape.image_urls.length, maxImages * 2));
  const mirrored: { storedUrl: string; key: string; account: string }[] = [];
  const CONC = 4;
  let cursor = 0;
  async function mirrorWorker() {
    while (cursor < candidates.length && mirrored.length < maxImages) {
      const idx = cursor++;
      const src = candidates[idx];
      if (!src) continue;
      const account = accountForUrl(src);
      const r = await mirrorImageToR2(src, workspaceId, account);
      if (r) mirrored.push({ storedUrl: r.storedUrl, key: r.key, account });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, candidates.length) }, mirrorWorker));

  if (mirrored.length < 3) {
    return NextResponse.json(
      {
        error: 'mirror_failed',
        message: `Only ${mirrored.length} images could be mirrored to R2.`,
        mirrored,
        attempted: candidates.length,
      },
      { status: 502 },
    );
  }

  const { getPresignedUrl } = await import('@/lib/r2-storage');
  const visionImages = mirrored.slice(0, maxImages);
  const visionUrls = await Promise.all(
    visionImages.map(async (m) => ({
      ...m,
      presignedUrl: await getPresignedUrl(m.key, 3600),
    })),
  );

  let profile: BrandVibeProfile;
  try {
    profile = await runVisionAndVoice({
      openai,
      labels: handles,
      visionUrls: visionUrls.map((m) => m.presignedUrl),
      captions: scrape.captions,
      storedFrames: visionImages.map((m) => ({
        url: m.storedUrl,
        source_account: m.account,
      })),
      sourceMode: 'handles_scrape',
    });
  } catch (err) {
    console.error('[extract-vibe] vision failed', err);
    return NextResponse.json(
      { error: 'vision_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  if (persist) {
    try {
      await callPython(`/api/v1/brand-context/${workspaceId}/vibe`, {
        method: 'PUT',
        body: JSON.stringify({ vibe: profile }),
        headers: { 'X-Tenant-Id': workspaceId },
      });
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          persisted: false,
          profile,
          error: 'persist_failed',
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    persisted: persist,
    profile,
    stats: {
      handles_requested: handles.length,
      images_scraped: scrape.image_urls.length,
      images_mirrored: mirrored.length,
      images_analyzed: visionImages.length,
      captions_collected: scrape.captions.length,
      scrape_errors: scrape.fetch_errors,
    },
  });
}

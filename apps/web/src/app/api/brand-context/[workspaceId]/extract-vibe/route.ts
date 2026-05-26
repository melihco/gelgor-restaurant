/**
 * Brand Vibe Extraction BFF — agency-grade reference DNA pipeline.
 *
 * Pipeline:
 *   1. Python scrape  → recent post URLs + captions for the given handles
 *   2. Mirror to R2   → bypass Instagram CDN IP/signature restrictions
 *   3. GPT-4o Vision  → structured BrandVibeProfile JSON
 *   4. Python persist → brand_contexts.brand_vibe_profile (JSONB)
 *
 * Why this route owns the pipeline (instead of Python):
 *   - R2 credentials live here (S3 SDK + env)
 *   - Direct Node fetch from the Next.js server reaches IG CDN reliably
 *     (same network as the browser); Python from terminal often gets blocked.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const maxDuration = 240;

const CREW_BACKEND = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'image/*,*/*;q=0.8',
  'Referer': 'https://www.instagram.com/',
};

// ── Helpers ────────────────────────────────────────────────────────────────

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
  /** Stable URL we persist (Next.js /api/media proxy or PUBLIC_URL). */
  storedUrl: string;
  /** Storage key for generating presigned URLs (for OpenAI Vision etc.). */
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

// ── GPT-4o Vision prompts ──────────────────────────────────────────────────

const VIBE_VISUAL_PROMPT = `You are a senior creative director at a top-tier social media agency. You are reverse-engineering the visual DNA of a reference Instagram account so we can produce content that matches its agency-level quality.

Look at ALL the provided images as a SET (they're from the same account / same vibe).

Return ONLY this exact JSON, no markdown:
{
  "palette": {
    "primary": "#rrggbb",
    "accent": "#rrggbb",
    "neutral": "#rrggbb",
    "shadow": "#rrggbb",
    "palette_description": "1 sentence on how the palette feels (e.g. 'sun-bleached warm neutrals with deep teal accents')"
  },
  "typography": {
    "heading_personality": "e.g. 'condensed editorial uppercase serif' / 'wide tracked sans / handwritten script'",
    "body_personality": "e.g. 'minimal small caps' / 'none, captions only'",
    "text_overlay_density": "minimal | medium | dense",
    "typography_role": "1 sentence on what role text plays in the visuals"
  },
  "motion": {
    "pace": "slow_observational | rhythmic | kinetic",
    "cuts_per_10_seconds_estimate": 1.5,
    "camera_movement": "e.g. 'static-locked with subtle parallax' / 'handheld push-in'",
    "shot_grammar": "1 sentence on how shots are composed (e.g. 'wide → product → person reaction, always ending on negative space')"
  },
  "grading": {
    "look": "golden_hour | sun_bleached | cinematic_teal_orange | moody_low_key | clean_minimal | film_grain | vibrant_saturated",
    "lut_directive": "Concrete grading instruction agents can pass to image gen (e.g. 'lift shadows +10, warm highlights, desaturate blues, +grain')"
  },
  "audio": {
    "mood": "ambient | upbeat | dreamy_vocal | tropical_house | indie_acoustic | chill_lofi | none",
    "description": "1 sentence about what kind of music/audio fits"
  },
  "composition": {
    "primary_pattern": "rule_of_thirds | centered | golden_ratio | negative_space_heavy | symmetrical",
    "framing_rules": "1 sentence on framing tendencies (e.g. 'subject lower-third, sky/ceiling occupies top 2/3')",
    "subject_focus": "1 sentence on what is typically the subject"
  },
  "content_pillars_visual": ["3-6 short visual content themes recurring in the feed (e.g. 'sunset poolside', 'flat-lay cocktails', 'guest portraits')"],
  "anti_patterns": ["3-6 things THIS account would NEVER post (e.g. 'cluttered text overlays', 'oversaturated stock-style food', 'busy backgrounds')"],
  "what_makes_this_agency_level": "1-2 sentences naming the specific moves that elevate this above a typical small-business feed"
}`;

const CAPTION_VOICE_PROMPT = `You are a senior copy strategist. Reverse-engineer the caption voice from these recent captions.

Return ONLY this exact JSON, no markdown:
{
  "style": "1 sentence describing the voice (e.g. 'cool insider, lowercase, never explanatory')",
  "avg_word_count": 18,
  "uses_emojis": true,
  "uses_hashtags_in_caption_body": false,
  "punctuation_style": "1 sentence (e.g. 'minimal periods, em-dashes for beats')",
  "tonal_anchors": ["3-5 adjectives that anchor the voice"],
  "writing_rules": ["4-7 specific rules a copywriter can follow to match this voice (e.g. 'never use ! in body', 'always lowercase first word', 'end with a single emoji or nothing')"],
  "example_template": "A reusable skeleton e.g. '{vibe phrase} — {sensory detail}. {invitation}.'"
}`;

interface VibeProfile {
  source_accounts: string[];
  extracted_at: string;
  image_sample_count: number;
  caption_sample_count: number;
  palette?: unknown;
  typography?: unknown;
  motion?: unknown;
  grading?: unknown;
  audio?: unknown;
  composition?: unknown;
  caption_voice?: unknown;
  content_pillars_visual: string[];
  anti_patterns: string[];
  what_makes_this_agency_level?: string;
  reference_frames: { url: string; source_account: string; why_representative?: string }[];
}

function safeParseJson(raw: string): Record<string, unknown> {
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match?.[0] ?? raw);
  } catch {
    return {};
  }
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY missing' }, { status: 503 });
  }

  let body: { handles?: string[]; posts_per_handle?: number; persist?: boolean; max_images?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const handles = (body.handles ?? [])
    .map((h) => String(h ?? '').trim().replace(/^@/, ''))
    .filter(Boolean);
  if (handles.length === 0) {
    return NextResponse.json({ error: 'handles required (1-5 IG accounts)' }, { status: 400 });
  }
  const postsPerHandle = Math.max(4, Math.min(Number(body.posts_per_handle ?? 12), 18));
  const maxImages = Math.max(4, Math.min(Number(body.max_images ?? 12), 20));
  const persist = body.persist !== false;

  console.log('[extract-vibe] start', { workspaceId, handles, postsPerHandle, maxImages, persist });

  // ── Step 1: scrape Apify (via Python) ────────────────────────────────────
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
  console.log(
    '[extract-vibe] scraped',
    { images: scrape.image_urls.length, captions: scrape.captions.length, errors: scrape.fetch_errors },
  );

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

  // ── Step 2: mirror to R2 (round-robin across accounts for diversity) ────
  // Build a flat ordered list trying to interleave accounts.
  const accountForUrl = (u: string): string => {
    const idx = scrape.image_urls.indexOf(u);
    // Crude: split evenly across handles
    const perHandle = Math.ceil(scrape.image_urls.length / Math.max(1, handles.length));
    return handles[Math.min(handles.length - 1, Math.floor(idx / perHandle))] ?? handles[0]!;
  };

  const candidates = scrape.image_urls.slice(0, Math.min(scrape.image_urls.length, maxImages * 2));
  console.log('[extract-vibe] mirroring to R2', { count: candidates.length });

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

  console.log('[extract-vibe] mirrored', { ok: mirrored.length, attempted: candidates.length });

  if (mirrored.length < 3) {
    return NextResponse.json(
      {
        error: 'mirror_failed',
        message: `Only ${mirrored.length} images could be mirrored to R2. Instagram CDN may be blocking from this network.`,
        mirrored,
        attempted: candidates.length,
      },
      { status: 502 },
    );
  }

  // ── Step 3: GPT-4o Vision on presigned R2 URLs ──────────────────────────
  // OpenAI needs absolute, world-fetchable URLs. Generate short-lived
  // presigned URLs for the Vision call. We still persist the stable
  // /api/media?key=... URL in the profile so the frontend keeps working.
  const { getPresignedUrl } = await import('@/lib/r2-storage');
  const openai = new OpenAI({ apiKey: openaiKey });
  const visionImages = mirrored.slice(0, maxImages);

  const visionUrls = await Promise.all(
    visionImages.map(async (m) => ({
      ...m,
      presignedUrl: await getPresignedUrl(m.key, 3600),
    })),
  );

  console.log('[extract-vibe] vision call', { imageCount: visionUrls.length });

  let visualJson: Record<string, unknown> = {};
  try {
    const visionRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: VIBE_VISUAL_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Reference account(s): ${handles.map((h) => '@' + h).join(', ')}. Analyze the visual DNA from these ${visionUrls.length} images as a set.` },
            ...visionUrls.map((m) => ({
              type: 'image_url' as const,
              image_url: { url: m.presignedUrl, detail: 'low' as const },
            })),
          ],
        },
      ],
    });
    visualJson = safeParseJson(visionRes.choices[0]?.message?.content ?? '{}');
  } catch (err) {
    console.error('[extract-vibe] vision failed', err);
    return NextResponse.json(
      { error: 'vision_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  let voiceJson: Record<string, unknown> = {};
  if (scrape.captions.length > 0) {
    try {
      const voiceRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 600,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CAPTION_VOICE_PROMPT },
          {
            role: 'user',
            content: `Reference account(s): ${handles.map((h) => '@' + h).join(', ')}.\nRecent captions (one per line):\n\n${scrape.captions.slice(0, 20).join('\n---\n')}`,
          },
        ],
      });
      voiceJson = safeParseJson(voiceRes.choices[0]?.message?.content ?? '{}');
    } catch (err) {
      console.warn('[extract-vibe] voice extraction failed', err);
    }
  }

  // ── Step 4: assemble + persist ───────────────────────────────────────────
  const profile: VibeProfile = {
    source_accounts: handles,
    extracted_at: new Date().toISOString(),
    image_sample_count: visionImages.length,
    caption_sample_count: scrape.captions.length,
    palette: visualJson.palette,
    typography: visualJson.typography,
    motion: visualJson.motion,
    grading: visualJson.grading,
    audio: visualJson.audio,
    composition: visualJson.composition,
    caption_voice: voiceJson && Object.keys(voiceJson).length > 0 ? voiceJson : undefined,
    content_pillars_visual: Array.isArray(visualJson.content_pillars_visual)
      ? (visualJson.content_pillars_visual as string[]).map(String)
      : [],
    anti_patterns: Array.isArray(visualJson.anti_patterns)
      ? (visualJson.anti_patterns as string[]).map(String)
      : [],
    what_makes_this_agency_level:
      typeof visualJson.what_makes_this_agency_level === 'string'
        ? (visualJson.what_makes_this_agency_level as string)
        : undefined,
    reference_frames: visionImages.map((m) => ({
      url: m.storedUrl,
      source_account: m.account,
    })),
  };

  if (persist) {
    try {
      await callPython(`/api/v1/brand-context/${workspaceId}/vibe`, {
        method: 'PUT',
        body: JSON.stringify({ vibe: profile }),
        headers: { 'X-Tenant-Id': workspaceId },
      });
      console.log('[extract-vibe] persisted', { workspaceId });
    } catch (err) {
      console.error('[extract-vibe] persist failed', err);
      // Don't fail the whole call — return the profile so the user can retry persist
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

/**
 * POST /api/generate-reel
 *
 * Accepts structured JSON (from CrewAI or direct client) and
 * returns a generated Instagram Reel video via Runway Gen 4.5.
 *
 * This route is SERVER-SIDE ONLY. The Runway API key is never exposed
 * to the client.
 *
 * ---
 * Request body: ReelGenerationInput (see reel.types.ts)
 *
 * Response 200: ReelGenerationResult
 * Response 400: { error: string }
 * Response 500: { error: string, detail?: string }
 *
 * ---
 * Example request:
 * POST /api/generate-reel
 * {
 *   "title": "Spring Menu Launch",
 *   "concept": "Elegant restaurant terrace at golden hour with seasonal dishes",
 *   "platform": "instagram",
 *   "contentType": "reel",
 *   "visualStyle": "warm",
 *   "cameraMotion": "dolly_in",
 *   "brandTone": "luxury",
 *   "targetAudience": "food lovers aged 25-45",
 *   "duration": 10,
 *   "tags": ["#spring", "#restaurant"]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getRunwayVideoService } from '@/lib/runway/services/runway-video.service';
import type { ReelGenerationInput } from '@/lib/runway/types/reel.types';
import {
  buildDirectorPromptWithAI,
  buildDirectorPromptTemplate,
  inferContentKind,
} from '@/lib/runway/builders/reel-prompt.builder';
import { applyFidelityToDirectorPrompt } from '@/lib/runway-reel-fidelity';
import { API_BASE_URL } from '@/lib/runtime-config';

/** OpenAI image API max prompt length (leave margin below 4000). */
const DALLE_IMAGE_PROMPT_MAX = 3800;

function clampPrompt(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function hasNonAscii(s: string): boolean {
  return /[^\x00-\x7F]/.test(s);
}

/**
 * Translate non-English text fields to English before sending to Runway.
 * Runway gen4_turbo only accepts English prompts — Turkish/non-ASCII text
 * causes INTERNAL.BAD_OUTPUT.CODE01 failures.
 */
async function translateToEnglishIfNeeded(
  fields: Record<string, string | undefined>,
  apiKey: string,
): Promise<Record<string, string>> {
  const toTranslate = Object.entries(fields).filter(([, v]) => v && hasNonAscii(v));
  if (toTranslate.length === 0) {
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v ?? '']));
  }

  try {
    const openai = new OpenAI({ apiKey });
    const lines = toTranslate.map(([k, v]) => `${k}: ${v}`).join('\n');
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content: 'Translate the following labeled fields to concise English for use in a video generation prompt. Keep it vivid and visual. Return only the labeled fields in the same format.',
        },
        { role: 'user', content: lines },
      ],
    });
    const translated = res.choices[0]?.message?.content ?? '';
    const result: Record<string, string> = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v ?? '']),
    );
    for (const line of translated.split('\n')) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key in result && val) result[key] = val;
    }
    return result;
  } catch {
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v ?? '']));
  }
}

// ── OpenAI image generation (used as Runway input frame) ───────────────────
async function generateStillImageForReel(input: Partial<ReelGenerationInput>): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const openai = new OpenAI({ apiKey });

    // Build a visual prompt for the still image
    const brandContext = input.brandTone ? `, ${input.brandTone} brand aesthetic` : '';
    const audienceCtx = input.targetAudience ? `, targeting ${input.targetAudience}` : '';
    const styleCtx = input.visualStyle ? `, ${input.visualStyle} visual style` : ', cinematic style';
    const imagePrompt = clampPrompt(
      `Instagram Reel keyframe: ${input.concept ?? input.title}${brandContext}${audienceCtx}${styleCtx}. Vertical 9:16 composition, high quality, social media optimized, professional photography, vibrant and engaging.`,
      DALLE_IMAGE_PROMPT_MAX,
    );

    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: imagePrompt,
      n: 1,
      size: '1024x1792', // closest to 9:16 portrait
      quality: 'standard',
      response_format: 'url',
    });

    const url = response.data?.[0]?.url ?? null;
    console.log('[generate-reel] OpenAI still image generated:', url ? 'OK' : 'NULL');
    return url;
  } catch (err) {
    console.error('[generate-reel] OpenAI image generation failed:', err);
    return null;
  }
}

// Force this route to run on the Node.js runtime (not Edge)
export const runtime = 'nodejs';

// Runway gen4.5 can take up to 4 minutes
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Parse body ─────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    );
  }

  // ── Basic shape validation ─────────────────────────────────────────────
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Request body must be a JSON object' },
      { status: 400 },
    );
  }

  const input = body as Partial<ReelGenerationInput>;

  if (!input.title || typeof input.title !== 'string') {
    return NextResponse.json(
      { error: 'Field "title" is required and must be a string' },
      { status: 400 },
    );
  }

  if (!input.concept && !input.promptText) {
    return NextResponse.json(
      { error: 'Either "concept" or "promptText" must be provided' },
      { status: 400 },
    );
  }

  if (input.platform !== 'instagram') {
    return NextResponse.json(
      { error: 'Field "platform" must be "instagram"' },
      { status: 400 },
    );
  }

  // ── Execute generation ─────────────────────────────────────────────────
  try {
    const service = getRunwayVideoService();

    // Supported image formats by Runway: JPEG, PNG, WebP, GIF
    const RUNWAY_SUPPORTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

    // Runway image limits: max 10MB raw, base64 inflates ~33%, so cap raw at ~7MB.
    // Portrait reels require aspect ratio ≤ 2.358 (width/height for landscape is fine,
    // but we need portrait ≥ 0.42 h/w). We pass as URL when image is large.
    const RUNWAY_MAX_BYTES = 7 * 1024 * 1024; // 7MB raw (safe base64 budget)

    /**
     * Runway gen4_turbo hard limit: width/height ≤ 2.358
     *
     * Panoramic/banner images (typical hotel/beach websites) often have 3:1 or 4:1 ratios
     * which Runway rejects. We center-crop them to a 2:1 or portrait ratio using Sharp.
     *
     * Target: square (1:1) crop of the center — best for 9:16 portrait video generation.
     */
    async function cropToRunwayAspectRatio(buf: Buffer, mime: string): Promise<Buffer> {
      try {
        const sharp = (await import('sharp')).default;
        const meta = await sharp(buf).metadata();
        const w = meta.width ?? 0;
        const h = meta.height ?? 0;
        if (!w || !h) return buf;

        const ratio = w / h;
        const RUNWAY_MAX_RATIO = 2.3; // conservative (Runway says 2.358)

        if (ratio <= RUNWAY_MAX_RATIO) return buf; // already fine

        // Center-crop to 2:1 landscape (safe for Runway) → this gives max coverage
        // while staying under the 2.358 limit. For portrait video (9:16) a tighter
        // 1:1 square crop of the center is even better because Runway animates it.
        const cropW = Math.floor(h * 1.0); // 1:1 square from center
        const cropH = h;
        const left = Math.floor((w - cropW) / 2);

        const cropped = Buffer.from(await sharp(buf)
          .extract({ left, top: 0, width: cropW, height: cropH })
          .toBuffer());

        console.log(`[generate-reel] Center-cropped panoramic image ${w}×${h} (ratio ${ratio.toFixed(2)}) → ${cropW}×${cropH} (1:1) for Runway`);
        return cropped;
      } catch (err) {
        console.warn('[generate-reel] Sharp crop failed, using original:', err);
        return buf;
      }
    }

    /**
     * Detect MIME type from file magic bytes — server Content-Type headers are often wrong
     * (e.g. bodrumturunc.com sends PNG files with Content-Type: image/jpeg)
     */
    function detectMimeFromBytes(buf: Buffer): string {
      if (buf.length < 4) return 'image/jpeg';
      // PNG: 89 50 4E 47
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
      // JPEG: FF D8 FF
      if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
      // WebP: RIFF????WEBP
      if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return 'image/webp';
      // GIF: GIF87a or GIF89a
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
      return 'image/jpeg'; // fallback
    }

    async function fetchAsBase64(url: string, label: string): Promise<string | undefined> {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(18_000),
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'image/jpeg,image/png,image/webp,image/gif,*/*;q=0.5',
          },
        });
        if (!res.ok) {
          console.warn(`[generate-reel] ${label} → HTTP ${res.status} ${res.statusText}`);
          return undefined;
        }
        let buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length) {
          console.warn(`[generate-reel] ${label} → empty body`);
          return undefined;
        }
        // Detect real MIME from magic bytes — do NOT trust Content-Type header
        const trueMime = detectMimeFromBytes(buf);
        const headerMime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
        if (headerMime && headerMime !== trueMime) {
          console.log(`[generate-reel] ${label} → MIME mismatch: header="${headerMime}" actual="${trueMime}" — using magic bytes`);
        }
        // Auto-crop panoramic images that exceed Runway's 2.358 ratio
        buf = Buffer.from(await cropToRunwayAspectRatio(buf, trueMime));
        // Skip base64 for large images after crop
        if (buf.length > RUNWAY_MAX_BYTES) {
          console.warn(`[generate-reel] ${label} → too large after crop (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
          return undefined;
        }
        console.log(`[generate-reel] ${label} → OK (${trueMime}, ${(buf.length / 1024).toFixed(0)} KB)`);
        return `data:${trueMime};base64,${buf.toString('base64')}`;
      } catch (err) {
        console.warn(`[generate-reel] ${label} → fetch error: ${err}`);
        return undefined;
      }
    }

    /**
     * Fetch an HTTPS image URL, check its aspect ratio, and return a data URI.
     * For landscape panoramics (ratio > 2.358), crops before returning.
     * Used for the HTTPS URL path which normally passes URLs directly to Runway.
     */
    async function fetchAndNormalizeHttpsImage(url: string): Promise<string | undefined> {
      return fetchAsBase64(url, `https-normalize`);
    }

    // Validate and normalize promptImage to a Runway-supported format.
    //
    // Strategy:
    // - HTTPS URL → pass directly to Runway (SDK accepts HTTPS URLs natively)
    // - data URI → pass directly (Runway accepts base64 data URIs)
    // - /api/media?key=... or relative URL → fetch and pass as HTTPS URL via media-proxy
    //
    // Do NOT convert HTTPS URLs to base64: Runway rejects some base64-encoded PNGs
    // that are served with wrong Content-Type, but accepts the URL directly.
    if (input.promptImage && typeof input.promptImage === 'string') {
      if (input.promptImage.startsWith('data:image/')) {
        const mime = input.promptImage.split(';')[0]!.replace('data:', '').toLowerCase();
        if (!RUNWAY_SUPPORTED.includes(mime)) {
          console.warn(`[generate-reel] Unsupported data URI mime: ${mime}`);
          input.promptImage = undefined;
        } else {
          console.log(`[generate-reel] Using base64 data URI (${mime})`);
        }
      } else if (input.promptImage.startsWith('https://')) {
        // HTTPS URL → fetch, check aspect ratio, crop if panoramic, return as base64
        // We must fetch because Runway validates ratio server-side and rejects > 2.358
        console.log(`[generate-reel] Fetching HTTPS URL for ratio check: ${input.promptImage.slice(0, 80)}`);
        const normalized = await fetchAndNormalizeHttpsImage(input.promptImage);
        if (normalized) {
          input.promptImage = normalized;
        } else {
          // Fetch failed — try passing the URL directly as a last resort
          console.warn(`[generate-reel] HTTPS fetch failed, trying URL directly: ${input.promptImage.slice(0, 80)}`);
          // Keep input.promptImage as-is — Runway may still accept it if ratio is fine
        }
      } else if (input.promptImage.startsWith('http://')) {
        // HTTP (not HTTPS) → Runway requires HTTPS; fetch via media-proxy and re-serve or convert
        const originalUrl = input.promptImage;
        const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const proxyUrl = `${origin}/api/media-proxy?url=${encodeURIComponent(originalUrl)}`;
        const normalized = await fetchAsBase64(proxyUrl, 'http→proxy');
        if (normalized) {
          input.promptImage = normalized;
        } else {
          console.error(`[generate-reel] Could not proxy HTTP URL: ${originalUrl.slice(0, 100)}`);
          input.promptImage = undefined;
        }
      } else if (input.promptImage.startsWith('/api/media')) {
        // Internal media API path → fetch as base64 (it's already on our server)
        const origin = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const fullUrl = `${origin}${input.promptImage}`;
        const normalized = await fetchAsBase64(fullUrl, 'internal-media');
        if (normalized) {
          input.promptImage = normalized;
        } else {
          console.error(`[generate-reel] Could not fetch internal media: ${input.promptImage.slice(0, 100)}`);
          input.promptImage = undefined;
        }
      } else {
        console.warn(`[generate-reel] promptImage format not recognized — clearing`);
        input.promptImage = undefined;
      }
    }

    // Multi-reference mode: promptImages[] bypasses single promptImage requirement
    // Runway gen4_turbo accepts Array<{position:'first', uri: string}> — all HTTPS URLs
    const hasMultiRef = Array.isArray((input as any).promptImages) && (input as any).promptImages.length >= 2;

    // No accessible image — stop here, never fall back to AI generation
    // We ONLY do image-to-video (animate a real venue photo), never text-to-video
    if (!input.promptImage && !hasMultiRef) {
      return NextResponse.json(
        {
          success: false,
          error: 'Görsel Runway\'e iletilemedi. Fotoğraf URL\'si süresi dolmuş olabilir. '
            + 'Çözüm: önce "📸 Fotoğraf Seç" veya "✦ Ajans Tasarımı" ile bir görsel üretin, '
            + 'ardından "▶ Bu Görseli Reel\'e Dönüştür" butonuna basın.',
          hint: 'Brand galeri fotoğrafları Instagram CDN\'de süresi dolarsa erişilemez hale gelir. '
            + 'Brand Hub → Galeri → "Markayı Yeniden Analiz Et" ile güncel fotoğrafları çekin.',
          outputUrls: [],
        },
        { status: 422 },
      );
    }

    if (hasMultiRef) {
      // Multi-reference mode: pass URLs directly (Runway accepts HTTPS URLs in array form)
      // No need to convert to base64 for multi-ref — array mode uses URI strings
      console.log(`[generate-reel] Multi-reference mode: ${(input as any).promptImages.length} photos`);
    }

    // ── AI Director Prompt (senior creative director level) ────────────────
    // Uses GPT-4o to generate a shot-by-shot cinematic prompt using brand DNA,
    // gallery photo description, and content-specific cinematography templates.
    // This replaces the generic template-based buildReelPrompt() for all Reels.
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && !input.promptText) {
      try {
        const reelInput = input as ReelGenerationInput;
        // Use the actual Instagram caption (content brief) for visual narrative.
        // `input.caption` carries the real written caption from CrewAI ideas.
        // `input.concept` is a secondary vibe/creative-direction string.
        const captionBrief = (reelInput.caption || input.concept || '').slice(0, 350);

        const sceneMeta = input.sceneMetadata ?? {};
        const contentKind = inferContentKind({
          headline: input.title ?? '',
          caption: captionBrief,
          photoDescription: reelInput.photoDescription,
          photoSceneMoment: reelInput.photoSceneMoment,
          photoTags: reelInput.photoTags,
          contentType: input.contentType,
          businessType: String(sceneMeta.businessType ?? sceneMeta.sector ?? ''),
          productType: String(sceneMeta.productType ?? ''),
        });

        const agentVisualDirection = String(
          reelInput.agentVisualDirection
            ?? input.sceneMetadata?.agentVisualDirection
            ?? '',
        ).trim().slice(0, 400) || undefined;

        const directorPrompt = await buildDirectorPromptWithAI(
          {
            headline: input.title ?? '',
            caption: captionBrief,
            contentKind,
            brandName: String(input.sceneMetadata?.brandName ?? ''),
            brandLocation: String(input.sceneMetadata?.location ?? input.sceneMetadata?.brandLocation ?? ''),
            businessType: String(sceneMeta.businessType ?? sceneMeta.sector ?? ''),
            productType: String(sceneMeta.productType ?? ''),
            strategicPurpose: String(sceneMeta.strategicPurpose ?? ''),
            missionBrief: String(sceneMeta.missionBrief ?? ''),
            photoDescription: reelInput.photoDescription,
            photoSceneMoment: reelInput.photoSceneMoment,
            photoMicroMotions: reelInput.photoMicroMotions,
            photoMood: reelInput.photoMood,
            photoUsageContext: reelInput.photoUsageContext,
            photoPairingKeywords: reelInput.photoPairingKeywords,
            photoTags: reelInput.photoTags,
            vibeProfile: reelInput.vibeProfile,
            brandThemeGrading: reelInput.brandThemeGrading,
            mood: reelInput.photoMood ?? input.visualStyle ?? input.brandTone ?? '',
            agentVisualDirection,
          },
          openaiKey,
        );

        if (directorPrompt) {
          // Runway gen4_turbo promptText limit: 1000 UTF-16 code units
          // Truncate at sentence boundary to avoid mid-word cuts
          const RUNWAY_PROMPT_LIMIT = 950; // conservative margin
          const fidelityPrompt = applyFidelityToDirectorPrompt(directorPrompt);
          const safePrompt = fidelityPrompt.length > RUNWAY_PROMPT_LIMIT
            ? fidelityPrompt.slice(0, RUNWAY_PROMPT_LIMIT).replace(/\. [^.]*$/, '.').slice(0, RUNWAY_PROMPT_LIMIT)
            : fidelityPrompt;
          // Director prompt is already English — skip translation step
          input.promptText = safePrompt;
          console.log('[generate-reel] AI director prompt (GPT-4o):', safePrompt.slice(0, 120) + '…');
        } else {
          // GPT-4o unavailable — use template director prompt (still uses brand DNA)
          const templatePrompt = buildDirectorPromptTemplate({
            headline: input.title ?? '',
            caption: captionBrief,
            contentKind,
            brandName: String(input.sceneMetadata?.brandName ?? ''),
            brandLocation: String(input.sceneMetadata?.location ?? input.sceneMetadata?.brandLocation ?? ''),
            photoDescription: reelInput.photoDescription,
            photoSceneMoment: reelInput.photoSceneMoment,
            photoMicroMotions: reelInput.photoMicroMotions,
            photoMood: reelInput.photoMood,
            photoUsageContext: reelInput.photoUsageContext,
            photoPairingKeywords: reelInput.photoPairingKeywords,
            photoTags: reelInput.photoTags,
            vibeProfile: reelInput.vibeProfile,
            brandThemeGrading: reelInput.brandThemeGrading,
            mood: reelInput.photoMood ?? input.visualStyle ?? input.brandTone ?? '',
            agentVisualDirection: String(
              reelInput.agentVisualDirection ?? input.sceneMetadata?.agentVisualDirection ?? '',
            ).trim().slice(0, 400) || undefined,
          });
          input.promptText = applyFidelityToDirectorPrompt(templatePrompt).slice(0, 950);
          console.log('[generate-reel] Template director prompt:', templatePrompt.slice(0, 120) + '…');
        }
      } catch (err) {
        console.warn('[generate-reel] Director prompt failed, falling back to template:', err);
        // Final fallback: use the template
        try {
          const reelInput = input as ReelGenerationInput;
          const captionFallback = (reelInput.caption || input.concept || '').slice(0, 300);
          const templatePrompt = buildDirectorPromptTemplate({
            headline: input.title ?? '',
            caption: captionFallback,
            contentKind: inferContentKind({
              headline: input.title ?? '',
              caption: captionFallback,
              photoDescription: reelInput.photoDescription,
              photoSceneMoment: reelInput.photoSceneMoment,
              photoTags: reelInput.photoTags,
              contentType: input.contentType,
            }),
            brandName: String(input.sceneMetadata?.brandName ?? ''),
            brandLocation: String(input.sceneMetadata?.location ?? ''),
            photoDescription: reelInput.photoDescription,
            photoTags: reelInput.photoTags,
            vibeProfile: reelInput.vibeProfile,
            brandThemeGrading: reelInput.brandThemeGrading,
          });
          input.promptText = templatePrompt.slice(0, 950);
        } catch { /* keep original prompt */ }
      }
    }

    // Translate non-English prompt fields to English — only needed when NOT using director prompt
    // (director prompt is always generated in English by GPT-4o)
    if (openaiKey && !input.promptText) {
      const translated = await translateToEnglishIfNeeded(
        { title: input.title, concept: input.concept },
        openaiKey,
      );
      if (translated.title) input.title = translated.title;
      if (translated.concept) input.concept = translated.concept;
    }

    // Runway rejects prompts containing non-ASCII characters (Turkish ç, ğ, ü etc.)
    // with INTERNAL.BAD_OUTPUT.CODE01. Normalize everything to ASCII before submission.
    const CHAR_MAP: Record<string, string> = {
      'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U',
      'ş': 's', 'Ş': 'S', 'ö': 'o', 'Ö': 'O', 'ı': 'i', 'İ': 'I',
      'â': 'a', 'Â': 'A', 'î': 'i', 'Î': 'I', 'û': 'u', 'Û': 'U',
      '\u2014': ' - ', // em dash → hyphen
      '\u2013': ' - ', // en dash → hyphen
      '\u2018': "'", '\u2019': "'", // smart quotes
      '\u201C': '"', '\u201D': '"', // smart double quotes
      '\u2026': '...', // ellipsis
      '\u00B7': '.', // middle dot
    };
    const sanitizeForRunway = (text: string): string =>
      text.replace(/[^\x00-\x7F]/g, (ch) => CHAR_MAP[ch] ?? ' ').replace(/\s{2,}/g, ' ').trim();

    if (input.promptText) input.promptText = sanitizeForRunway(input.promptText);
    if (input.title) input.title = sanitizeForRunway(input.title);
    if (input.concept) input.concept = sanitizeForRunway(input.concept);

    // Execute with 1 automatic retry on Runway task failure or timeout
    // (INTERNAL.BAD_OUTPUT is transient ~40% of the time; timeouts may be temporary overload)
    let result = await service.generateReelVideo(input as ReelGenerationInput);
    const isRetryable = (err?: string) =>
      !!err && (err.includes('Runway task failed') || err.includes('Task timed out') || err.includes('timed out'));
    if (!result.success && isRetryable(result.error)) {
      console.log('[generate-reel] Runway failed/timed out — retrying once…');
      result = await service.generateReelVideo(input as ReelGenerationInput);
    }

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error ?? 'Generation failed',
          taskId: result.taskId,
          status: result.status,
          model: result.model,
          promptText: result.promptText,
          outputUrls: [],
          metadata: result.metadata,
        },
        { status: 422 },
      );
    }

    // ── Persist as OutputArtifact in the .NET API ──────────────────────
    // Fire-and-forget: we don't block the response on this,
    // but we do log failures for debugging.
    let videoUrl = result.outputUrls[0] ?? null;

    // Upload video to R2 for permanent storage (Runway URLs expire)
    if (videoUrl) {
      try {
        const { isR2Configured, generateStorageKey, uploadImageFromUrl } = await import('@/lib/r2-storage');
        if (isR2Configured()) {
          const brandName = typeof input.sceneMetadata?.brandName === 'string' ? input.sceneMetadata.brandName : 'shared';
          const key = generateStorageKey(brandName, 'reel', 'mp4');
          const r2Result = await uploadImageFromUrl(videoUrl, key);
          if (r2Result) {
            videoUrl = r2Result.url;
            result.outputUrls[0] = videoUrl;
            console.log('[generate-reel] Video uploaded to R2:', videoUrl);
          }
        }
      } catch (err) {
        console.warn('[generate-reel] R2 upload failed, using Runway URL:', err);
      }

      persistReelArtifact({
        title: input.title,
        videoUrl,
        promptText: result.promptText,
        taskId: result.taskId,
        model: result.model,
        duration: result.metadata.duration,
        ratio: result.metadata.ratio,
      }).catch((err) => {
        console.error('[/api/generate-reel] Failed to persist artifact:', err);
      });
    }

    // Add `videoUrl` as a convenience alias for `outputUrls[0]` so
    // frontend can check both `data.videoUrl` and `data.outputUrls`.
    return NextResponse.json(
      { ...result, videoUrl: result.outputUrls[0] ?? null },
      { status: 200 },
    );
  } catch (error) {
    const isConfigError =
      error instanceof Error && error.message.includes('RUNWAY_API_SECRET');

    if (isConfigError) {
      return NextResponse.json(
        {
          error: 'Runway API is not configured. Set RUNWAY_API_SECRET in your environment.',
        },
        { status: 503 },
      );
    }

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    console.error('[/api/generate-reel] Unexpected error:', error);

    return NextResponse.json(
      { error: 'Internal server error', detail: message },
      { status: 500 },
    );
  }
}

// ── Artifact persistence ───────────────────────────────────────────────────

/**
 * Calls the .NET API to save the generated reel as an OutputArtifact.
 * Uses the /api/artifacts/video endpoint (created below in .NET).
 * This is fire-and-forget; failures don't affect the Runway response.
 */
async function persistReelArtifact(data: {
  title: string;
  videoUrl: string;
  promptText: string;
  taskId: string;
  model: string;
  duration: number;
  ratio: string;
}): Promise<void> {
  const endpoint = `${API_BASE_URL}/api/artifacts/video`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title,
      contentUrl: data.videoUrl,
      content: data.promptText,
      artifactType: 'VideoEdit',
      metadata: {
        runwayTaskId: data.taskId,
        model: data.model,
        duration: data.duration,
        ratio: data.ratio,
        source: 'runway',
        generatedAt: new Date().toISOString(),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Artifact persist failed (${res.status}): ${body}`);
  }
}

// ── Method not allowed ─────────────────────────────────────────────────────
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      endpoint: 'POST /api/generate-reel',
      description: 'Generate an Instagram Reel video using Runway Gen 4.5',
      requiredFields: ['title', 'concept OR promptText', 'platform: "instagram"'],
      optionalFields: [
        'promptImage (HTTPS URL | data URI | base64)',
        'contentType',
        'duration (5 | 10)',
        'ratio ("9:16" | "720:1280")',
        'visualStyle',
        'cameraMotion',
        'brandTone',
        'targetAudience',
        'cta',
        'tags',
        'sceneMetadata',
      ],
    },
    { status: 200 },
  );
}

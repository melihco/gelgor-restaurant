/**
 * POST /api/generate-event-card
 *
 * Produces an agency-grade event announcement card:
 *  1. Fetch the venue/atmosphere gallery photo
 *  2. Optional vibe-enhance with GPT-image-1 (premium, off by default)
 *  3. Sharp + SVG: composite overlay from announcement template library
 *
 * Default template `luxury_bottom` preserves the original event story design.
 */

import { NextRequest, NextResponse } from 'next/server';
import sharp from '@/lib/sharp-runtime';
import OpenAI from 'openai';
import { shouldPreserveVenuePhotos } from '@/lib/venue-photo-policy';
import {
  fetchTenantAnnouncementBrandKit,
  mergeBrandKit,
  resolveAnnouncementBrandKit,
  type AnnouncementBrandKit,
} from '@/lib/announcement-brand-kit';
import {
  type AnnouncementContentFormat,
  type AnnouncementTemplateId,
  buildAnnouncementOverlaySvg,
  resolveFormatDimensions,
  resolveTemplateLayout,
} from '@/lib/announcement-template-library';
import { renderAsync } from '@resvg/resvg-js';
import { loadFontFiles, primaryFamily } from '@/lib/svg-font-loader';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Rasterise the announcement SVG overlay to a transparent PNG using resvg-js
 * with the brand's REAL fonts embedded. Falls back to null on any failure so
 * the caller can use Sharp's (system-font) librsvg path.
 */
async function rasterizeOverlayWithFonts(
  svg: string,
  width: number,
  brandKit: AnnouncementBrandKit,
): Promise<Buffer | null> {
  try {
    const families = [
      primaryFamily(brandKit.headingFontStack),
      primaryFamily(brandKit.bodyFontStack),
      'Playfair Display',
      'Inter',
      // Load display fonts so force_display families (nightlife, DJ, concert, festival) render correctly.
      'Anton',
      'Oswald',
    ].filter(Boolean);
    const fontFiles = await loadFontFiles(families);
    if (fontFiles.length === 0) return null;
    // renderAsync runs rasterization on a worker thread — identical output to
    // the sync API, but the event loop stays free (health checks keep passing
    // while production posters render on a 1 vCPU container).
    const rendered = await renderAsync(svg, {
      fitTo: { mode: 'width', value: width },
      font: {
        fontFiles,
        loadSystemFonts: true,
        defaultFontFamily: primaryFamily(brandKit.bodyFontStack) || 'Inter',
      },
    });
    return Buffer.from(rendered.asPng());
  } catch {
    return null;
  }
}

export interface EventCardInput {
  photoUrl: string;
  contentType?: AnnouncementContentFormat | 'story' | 'post';
  templateId?: AnnouncementTemplateId;
  brandName?: string;
  location?: string;
  workspaceId?: string;
  artistName?: string;
  eventName?: string;
  date?: string;
  time?: string;
  venueArea?: string;
  tagline?: string;
  enhancePhoto?: boolean;
  /** GPT text-in-photo: render text as visual element instead of SVG overlay. */
  gptTextStyle?: GptTextStyle;
  /**
   * Run the Grafiker Agent (GPT-4o vision) after first render.
   * If the score is < 7 or a critical issue is found, auto-rerender with fixes.
   */
  grafikerReview?: boolean;
  brandKit?: Partial<AnnouncementBrandKit>;
  vibeProfile?: {
    grading?: { look?: string; lut_directive?: string };
    palette?: { primary?: string; accent?: string; neutral?: string };
    typography?: { heading_personality?: string; body_personality?: string; headline_font?: string; headline_style?: string };
  };
}

function buildEnhancePromptForEvent(opts: EventCardInput): string {
  const grading = opts.vibeProfile?.grading ?? {};
  const palette = opts.vibeProfile?.palette ?? {};
  const look = grading.look ?? 'golden_hour';
  const lut = grading.lut_directive ?? 'lift shadows +10, warm highlights';
  const primary = palette.primary ?? '#1A2B4A';
  const accent = palette.accent ?? '#E8C87A';

  return [
    `This is a real venue photo for ${opts.brandName ?? 'a luxury beach club'}${opts.location ? ' in ' + opts.location : ''}.`,
    `Apply ONLY color grade and atmospheric enhancement — do NOT alter the scene, add text, or add graphic elements.`,
    `Color grading: ${look} look. ${lut}.`,
    `Target palette tones: ${primary} (primary), ${accent} (accent warmth).`,
    `Keep the sky, sea, people, and architecture exactly as they are.`,
    `Result: the same photo, beautifully color-graded for an agency-grade Instagram event post.`,
  ].join(' ');
}

/**
 * Grafiker Agent — GPT-4o vision design review.
 *
 * Examines a rendered card and returns structured feedback: design score,
 * specific issues, and parameter adjustments to re-render with. Enables
 * automatic single-pass quality improvement without manual intervention.
 */
interface GrafikerIssue {
  type: 'whitespace' | 'overflow' | 'contrast' | 'logo' | 'hierarchy' | 'balance';
  severity: 'critical' | 'warn' | 'note';
  description: string;
}
interface GrafikerReview {
  score: number;            // 1–10
  issues: GrafikerIssue[];
  adjustments: {
    heroScale?: number;
    gradientStart?: number;
    gradientEnd?: number;
    colorBlockSize?: number;
    showTagline?: boolean;
  };
  pass: boolean;            // true → card is good enough, no re-render needed
}

const GRAFIKER_SYSTEM = `You are a senior graphic designer reviewing social-media event cards.
Evaluate the image for: text overflow, excessive whitespace, contrast, typography hierarchy,
logo placement, and visual balance.

Respond ONLY with valid JSON (no markdown):
{
  "score": 1-10,
  "issues": [{"type": "whitespace|overflow|contrast|logo|hierarchy|balance", "severity": "critical|warn|note", "description": "..."}],
  "adjustments": {
    "heroScale": 0.7-1.8 or null,
    "gradientStart": 0.3-0.85 or null,
    "colorBlockSize": 0.25-0.55 or null,
    "showTagline": true/false or null
  },
  "pass": true/false
}
Rules:
- pass=true if score >= 7 AND no "critical" issues.
- Suggest heroScale DOWN if text is too large or overflowing; UP if whitespace is large.
- Suggest colorBlockSize DOWN (to 0.28) if color panel has too much empty space.
- Be strict: do not suggest re-render for minor notes.`;

async function runGrafikerReview(
  cardBuffer: Buffer,
  apiKey: string,
): Promise<GrafikerReview | null> {
  try {
    const openai = new OpenAI({ apiKey });
    const b64 = cardBuffer.toString('base64');
    const resp = await openai.chat.completions.create({
      model: serverConfig.ai.chatModel('creative'),
      max_tokens: 400,
      temperature: 0.1,
      messages: [
        { role: 'system', content: GRAFIKER_SYSTEM },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Review this social-media event card design:' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'low' } },
          ],
        },
      ],
    });
    const raw = resp.choices[0]?.message?.content?.trim() ?? '{}';
    const m = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m?.[0] ?? raw) as GrafikerReview;
  } catch {
    return null;
  }
}

/**
 * GPT text-in-photo renderer — 4 visual styles (Katman 2+3).
 * Text is rendered INTO the image by GPT-image-1 images.edit.
 */
export type GptTextStyle = 'bold_display' | 'script_whisper' | '3d_bubble' | 'editorial_block';

function buildGptTextPrompt(opts: EventCardInput, style: GptTextStyle, brandKit: AnnouncementBrandKit): string {
  const headline = (opts.eventName ?? opts.artistName ?? 'EVENT').toUpperCase();
  const sub = [opts.date, opts.time, opts.venueArea].filter(Boolean).join('  ·  ');
  const brand = opts.brandName ?? brandKit.brandName ?? 'Brand';
  const accent = brandKit.accentColor ?? '#E8C87A';
  const text = brandKit.textColor ?? '#FFFFFF';

  switch (style) {
    case 'bold_display':
      return [
        `Real brand venue photo for ${brand}${opts.location ? ' in ' + opts.location : ''}.`,
        `Add bold display text: headline "${headline}" — large uppercase condensed bold sans-serif (like Anton/Bebas),`,
        `placed at the top-left, text bleeds close to edge. Color: bright ${text}.`,
        `Below headline, smaller: "${sub}".`,
        `Keep the photo vibrant and dominant — no heavy dark overlay.`,
        `Style: modern Instagram brand post, Pinterest bold flush-edge type aesthetic.`,
      ].join(' ');

    case 'script_whisper':
      return [
        `Real lifestyle photo for ${brand}.`,
        `Add elegant handwritten script text centered mid-image: "${headline}"`,
        `Style: thin flowing cursive (Brush Script style), white/cream, soft drop shadow for legibility.`,
        `Photo fully visible and dominant — no overlay, no darkening.`,
        `Aesthetic: "This and a really good playlist" editorial effortless vibe.`,
      ].join(' ');

    case '3d_bubble':
      return [
        `Real venue photo for ${brand}.`,
        `Add bold 3D inflatable/balloon-style text: "${headline}"`,
        `Style: chunky 3D rounded letters, inflated balloon look,`,
        `bright vivid color (${accent}, yellow, coral or fuchsia) — make it pop.`,
        `Glossy inflatable sheen, soft 3D shadows. Center of image, large scale.`,
        `Think: FIZZ THE RULES inflatable pool float letters, Guess Jeans pool 3D letters.`,
      ].join(' ');

    case 'editorial_block':
      return [
        `Real venue photo for ${brand}.`,
        `Split: left = original photo, right = solid ${accent} color block.`,
        `On color block: bold large text "${headline}", below smaller "${sub}".`,
        `Bold modern serif or thick sans-serif, strong contrast.`,
        `Style: "Wanna know?" Dribbble color-block typography poster. Brand "${brand}" at bottom.`,
      ].join(' ');

    default:
      return buildEnhancePromptForEvent(opts);
  }
}

async function renderGptText(
  photoBuffer: Buffer,
  opts: EventCardInput,
  style: GptTextStyle,
  brandKit: AnnouncementBrandKit,
  apiKey: string,
): Promise<Buffer | null> {
  try {
    const openai = new OpenAI({ apiKey });
    const prompt = buildGptTextPrompt(opts, style, brandKit);
    const { Blob: NodeBlob } = await import('buffer');
    const blob = new NodeBlob([photoBuffer], { type: 'image/png' }) as unknown as File;
    const response = await openai.images.edit({
      model: serverConfig.imageGen.editModel,
      image: blob,
      prompt,
      size: '1024x1536',
    });
    const data = (response as { data?: { b64_json?: string; url?: string }[] }).data?.[0];
    if (data?.b64_json) return Buffer.from(data.b64_json, 'base64');
    if (data?.url) {
      const r = await fetch(data.url, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    }
    return null;
  } catch {
    return null;
  }
}

type LogoPlacement = 'top_center' | 'top_left' | 'top_right' | 'bottom_center' | 'bottom_right' | 'bottom_left';

/**
 * Per-family logo placement — where the brand logo should sit relative to the
 * template's layout so it never collides with copy or bleeds into photo safe-zones.
 */
function resolveLogoPlacement(templateId: string): LogoPlacement {
  const id = templateId.toLowerCase();
  // Poster footer families: logo above the footer bar (bottom-center)
  if (['concert_lineup', 'festival_poster', 'dj_night'].some((f) => id.includes(f))) return 'top_center';
  // Left-panel families: logo in upper-left (inside panel)
  if (id.includes('flush_type_02') || id.includes('flush_type_03') || id.includes('flush_type_05')) return 'top_left';
  // Luxury / gala / frame: top-center (text is at the bottom)
  if (['luxury_bottom', 'gala_invite', 'frame_classic', 'top_masthead'].some((f) => id.includes(f))) return 'top_center';
  // Neon / impact: top-center (duotone overlay → logo on clear top area)
  if (['neon_night', 'impact_vignette'].some((f) => id.includes(f))) return 'top_center';
  // Bold caption: bottom-center inside the info bar
  if (id.includes('bold_caption')) return 'bottom_center';
  // Script / minimal: bottom-right corner (discreet)
  if (['script_caption', 'minimal_whisper'].some((f) => id.includes(f))) return 'bottom_right';
  // Campaign / promo / magazine: top-center
  if (['campaign_badge', 'promo_banner', 'magazine_date', 'corner_stamp'].some((f) => id.includes(f))) return 'top_center';
  // Editorial left: top-left (left-aligned design)
  if (['editorial_left', 'diagonal_split'].some((f) => id.includes(f))) return 'top_left';
  // Flush right panel: top-right (inside panel)
  if (id.includes('flush_type')) return 'top_right';
  // Default: top-right corner (universal safe zone)
  return 'top_right';
}

async function compositeBrandLogo(
  base: Buffer,
  logoUrl: string,
  width: number,
  height: number,
  templateId?: string,
): Promise<Buffer> {
  try {
    const res = await fetch(logoUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
    });
    if (!res.ok) return base;
    const logoBuf = Buffer.from(await res.arrayBuffer());

    const placement = resolveLogoPlacement(templateId ?? '');

    // Size: minimal vs prominent — minimal for script/minimal, prominent for poster tops
    const isMinimal = placement === 'bottom_right' || templateId?.includes('script') || templateId?.includes('minimal');
    const maxW = Math.round(width * (isMinimal ? 0.12 : 0.16));
    const maxH = Math.round(maxW * 0.55);

    const resized = await sharp(logoBuf)
      .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(resized).metadata();
    const lw = meta.width ?? maxW;
    const lh = meta.height ?? Math.round(maxW * 0.35);

    const pad = Math.round(width * 0.06);
    const padTop = Math.round(height * 0.04);
    const padBot = Math.round(height * 0.05);

    let left: number;
    let top: number;

    switch (placement) {
      case 'top_center':
        left = Math.round((width - lw) / 2);
        top = padTop;
        break;
      case 'top_left':
        left = pad;
        top = padTop;
        break;
      case 'top_right':
        left = width - lw - pad;
        top = padTop;
        break;
      case 'bottom_center':
        left = Math.round((width - lw) / 2);
        top = height - padBot - lh;
        break;
      case 'bottom_left':
        left = pad;
        top = height - padBot - lh;
        break;
      case 'bottom_right':
      default:
        left = width - lw - pad;
        top = height - padBot - lh;
        break;
    }

    return sharp(base)
      .composite([{ input: resized, top: Math.max(4, top), left: Math.max(4, left) }])
      .png({ quality: 95 })
      .toBuffer();
  } catch {
    return base;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let input: EventCardInput;
  try {
    input = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!input.photoUrl) {
    return NextResponse.json({ error: 'photoUrl is required' }, { status: 400 });
  }

  const contentType: AnnouncementContentFormat =
    input.contentType === 'square' ? 'square'
    : input.contentType === 'post' ? 'post'
    : 'story';
  const templateId: AnnouncementTemplateId = input.templateId ?? 'luxury_bottom';

  let brandKit: AnnouncementBrandKit = resolveAnnouncementBrandKit({
    brandContext: {},
    companyProfile: {},
    vibeProfile: input.vibeProfile as Record<string, unknown> | undefined,
    overrides: {
      brandName: input.brandName,
      ...(input.brandKit ?? {}),
    },
  });

  if (input.workspaceId) {
    const fetched = await fetchTenantAnnouncementBrandKit(input.workspaceId);
    brandKit = mergeBrandKit(fetched, {
      ...input.brandKit,
      brandName: input.brandName || fetched.brandName,
    });
  }

  const accentColor = brandKit.accentColor;
  const textColor = brandKit.textColor;

  let photoBuffer: Buffer;
  try {
    const res = await fetch(input.photoUrl, {
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
    });
    if (!res.ok) throw new Error(`Photo fetch failed: ${res.status}`);
    photoBuffer = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not fetch source photo', detail: String(err) },
      { status: 422 },
    );
  }

  let enhancedBuffer: Buffer = photoBuffer;
  const wantEnhance = input.enhancePhoto === true && !shouldPreserveVenuePhotos();

  if (wantEnhance) {
    try {
      const openai = new OpenAI({ apiKey: serverConfig.openai.requireApiKey() });
      const { toFile } = await import('openai/uploads');
      const jpegInput = await sharp(photoBuffer).jpeg({ quality: 90 }).toBuffer();
      const file = await toFile(jpegInput, 'venue.jpg', { type: 'image/jpeg' });
      const enhancePrompt = buildEnhancePromptForEvent(input);

      const editRes = await openai.images.edit({
        model: serverConfig.imageGen.editModel,
        image: file,
        prompt: enhancePrompt,
        size: '1024x1024',
        quality: (process.env.SMART_AGENCY_IMAGE_QUALITY ?? 'medium') as 'low' | 'medium' | 'high' | 'auto',
      } as Parameters<typeof openai.images.edit>[0]);

      const data = editRes as { data?: Array<{ b64_json?: string }> };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error('No data returned');
      enhancedBuffer = Buffer.from(b64, 'base64');
      console.log('[generate-event-card] GPT-image-1 enhance OK');
    } catch (err) {
      console.warn('[generate-event-card] GPT enhance failed, using original:', err);
      enhancedBuffer = photoBuffer;
    }
  } else {
    console.log(`[generate-event-card] Sharp+SVG mode template=${templateId}`);
  }

  const { width: targetW, height: targetH } = resolveFormatDimensions(contentType);

  const resized = await sharp(enhancedBuffer)
    .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const svgBuf = buildAnnouncementOverlaySvg({
    width: targetW,
    height: targetH,
    contentType,
    templateId,
    artistName: input.artistName,
    eventName: input.eventName,
    date: input.date,
    time: input.time,
    venueArea: input.venueArea,
    brandName: input.brandName || brandKit.brandName,
    tagline: input.tagline,
    accentColor,
    textColor,
    brandKit,
    vibeTypography: input.vibeProfile?.typography,
  });

  // GPT text-in-photo path: render text as part of the image via images.edit.
  // Returns early with the GPT-generated result (no SVG overlay needed).
  const openaiApiKey = serverConfig.openai.apiKey ?? '';
  if (input.gptTextStyle && openaiApiKey) {
    const gptResult = await renderGptText(resized, input, input.gptTextStyle, brandKit, openaiApiKey);
    if (gptResult) {
      let gptFinal = gptResult;
      if (brandKit.logoUrl) {
        gptFinal = await compositeBrandLogo(gptFinal, brandKit.logoUrl, targetW, targetH, `gpt_text_${input.gptTextStyle}`);
      }
      try {
        const { isR2Configured, generateStorageKey, uploadToR2, getPresignedUrl } = await import('@/lib/r2-storage');
        if (isR2Configured()) {
          const key = generateStorageKey(input.brandName ?? 'brand', 'image', 'png');
          const r2 = await uploadToR2(gptFinal, key, 'image/png');
          let url: string;
          try { url = await getPresignedUrl(r2.key, 24 * 3600); } catch { url = r2.url; }
          return NextResponse.json({ success: true, imageUrl: url, r2Key: r2.key, contentType: input.contentType, templateId: `gpt_text_${input.gptTextStyle}`, brandKit });
        }
      } catch { /* R2 not configured */ }
      const b64 = `data:image/png;base64,${gptFinal.toString('base64')}`;
      return NextResponse.json({ success: true, imageUrl: b64, contentType: input.contentType, templateId: `gpt_text_${input.gptTextStyle}`, brandKit });
    }
    // GPT failed → fall through to SVG overlay as backup
  }

  // Render the overlay with REAL embedded fonts (resvg) for agency-grade
  // typography; fall back to Sharp's system-font path if font loading fails.
  const overlayPng = await rasterizeOverlayWithFonts(svgBuf.toString('utf-8'), targetW, brandKit);
  const overlayInput = overlayPng ?? svgBuf;

  let finalBuffer = await sharp(resized)
    .composite([{ input: overlayInput, top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  if (brandKit.logoUrl) {
    finalBuffer = await compositeBrandLogo(finalBuffer, brandKit.logoUrl, targetW, targetH, templateId);
  }

  // ── Grafiker Agent: vision review + single auto-rerender pass ──────────────
  let grafikerResult: GrafikerReview | null = null;
  if (input.grafikerReview && openaiApiKey) {
    grafikerResult = await runGrafikerReview(finalBuffer, openaiApiKey);
    if (grafikerResult && !grafikerResult.pass) {
      const adj = grafikerResult.adjustments ?? {};
      const revisedLayout = resolveTemplateLayout(templateId);
      if (typeof adj.heroScale === 'number') revisedLayout.heroScale = adj.heroScale;
      if (typeof adj.gradientStart === 'number') revisedLayout.gradientStart = adj.gradientStart;
      if (typeof adj.colorBlockSize === 'number') revisedLayout.colorBlockSize = adj.colorBlockSize;
      if (typeof adj.showTagline === 'boolean') revisedLayout.showTagline = adj.showTagline;
      const revisedSvg = buildAnnouncementOverlaySvg({
        width: targetW, height: targetH, contentType, templateId, layout: revisedLayout,
        artistName: input.artistName, eventName: input.eventName,
        date: input.date, time: input.time, venueArea: input.venueArea,
        brandName: input.brandName || brandKit.brandName, tagline: input.tagline,
        accentColor, textColor, brandKit, vibeTypography: input.vibeProfile?.typography,
      });
      const revisedOverlay = await rasterizeOverlayWithFonts(revisedSvg.toString('utf-8'), targetW, brandKit) ?? revisedSvg;
      let revisedBuffer = await sharp(resized)
        .composite([{ input: revisedOverlay, top: 0, left: 0 }])
        .png({ quality: 95 })
        .toBuffer();
      if (brandKit.logoUrl) {
        revisedBuffer = await compositeBrandLogo(revisedBuffer, brandKit.logoUrl, targetW, targetH, templateId);
      }
      finalBuffer = revisedBuffer;
    }
  }

  try {
    const { isR2Configured, generateStorageKey, uploadToR2, getPresignedUrl } = await import('@/lib/r2-storage');
    if (isR2Configured()) {
      const key = generateStorageKey(input.brandName ?? 'brand', 'event', 'png');
      const r2 = await uploadToR2(finalBuffer, key, 'image/png');
      let url: string;
      try { url = await getPresignedUrl(r2.key, 24 * 3600); } catch { url = r2.url; }
      return NextResponse.json({
        success: true,
        imageUrl: url,
        r2Key: r2.key,
        contentType,
        templateId,
        brandKit: { accentColor: brandKit.accentColor, themeSource: brandKit.themeSource, hasLogo: Boolean(brandKit.logoUrl) },
      });
    }
  } catch (err) {
    console.warn('[generate-event-card] R2 upload failed:', err);
  }

  const b64 = finalBuffer.toString('base64');
  return NextResponse.json({
    success: true,
    imageUrl: `data:image/png;base64,${b64}`,
    contentType,
    templateId,
    brandKit: { accentColor: brandKit.accentColor, themeSource: brandKit.themeSource, hasLogo: Boolean(brandKit.logoUrl) },
  });
}

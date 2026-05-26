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
import sharp from 'sharp';
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
} from '@/lib/announcement-template-library';

export const runtime = 'nodejs';
export const maxDuration = 120;

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

async function compositeBrandLogo(
  base: Buffer,
  logoUrl: string,
  width: number,
  height: number,
): Promise<Buffer> {
  try {
    const res = await fetch(logoUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'image/*' },
    });
    if (!res.ok) return base;
    const logoBuf = Buffer.from(await res.arrayBuffer());
    const maxW = Math.round(width * 0.16);
    const resized = await sharp(logoBuf)
      .resize(maxW, Math.round(maxW * 0.45), { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(resized).metadata();
    const lw = meta.width ?? maxW;
    const lh = meta.height ?? Math.round(maxW * 0.35);
    const left = Math.round((width - lw) / 2);
    const top = height - Math.round(height * 0.055) - lh - Math.round(height * 0.085);
    return sharp(base)
      .composite([{ input: resized, top: Math.max(8, top), left }])
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
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      const { toFile } = await import('openai/uploads');
      const jpegInput = await sharp(photoBuffer).jpeg({ quality: 90 }).toBuffer();
      const file = await toFile(jpegInput, 'venue.jpg', { type: 'image/jpeg' });
      const enhancePrompt = buildEnhancePromptForEvent(input);

      const editRes = await openai.images.edit({
        model: 'gpt-image-1',
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

  let finalBuffer = await sharp(resized)
    .composite([{ input: svgBuf, top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  if (brandKit.logoUrl) {
    finalBuffer = await compositeBrandLogo(finalBuffer, brandKit.logoUrl, targetW, targetH);
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

/**
 * Post-GPT finish: optional original logo only.
 * Design / art direction comes from the GPT-image Layer-4 prompt — not Satori panels.
 */

import sharp from '@/lib/sharp-runtime';
import { persistImageBuffer } from '@/lib/persist-enhanced-images';
import { resolveMediaFetchUrl } from '@/lib/logo-compositor';
import type { LayoutSpecification, TextLayoutResult } from './types';

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:image/')) {
      const b64 = url.split(',')[1];
      return b64 ? Buffer.from(b64, 'base64') : null;
    }
    const fetchUrl = await resolveMediaFetchUrl(url);
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export interface ComposeFinalResult {
  finalImageUrl: string;
  logoApplied: boolean;
  textRendered: boolean;
  satoriFamily: null;
}

/**
 * Final asset = GPT visual (+ optional real logo). No Satori / panel design layer.
 */
export async function composeFinalEditorialImage(opts: {
  backgroundImageUrl: string;
  backgroundBuffer?: Buffer | null;
  layout: LayoutSpecification;
  textLayout: TextLayoutResult;
  logoUrl?: string | null;
  addTextOverlay?: boolean;
  addLogoOverlay: boolean;
  workspaceId: string;
  brandName?: string | null;
  brandColors?: { primary: string; accent: string } | null;
  vibe?: unknown;
}): Promise<ComposeFinalResult> {
  // Text is intentionally not rendered here — the GPT compiled prompt owns the visual.
  // Callers that need baked type should use a separate GPT typography pass later.
  void opts.addTextOverlay;
  void opts.textLayout;
  void opts.brandName;
  void opts.brandColors;
  void opts.vibe;

  const baseBuf = opts.backgroundBuffer && opts.backgroundBuffer.length >= 200
    ? opts.backgroundBuffer
    : await fetchBuffer(opts.backgroundImageUrl);
  if (!baseBuf) {
    throw new Error('Background image could not be loaded for composition');
  }

  const { width, height } = opts.layout.canvas;
  let outBuf = await sharp(baseBuf)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: 94 })
    .toBuffer();

  let logoApplied = false;
  if (opts.addLogoOverlay && opts.logoUrl?.trim()) {
    const logoBuf = await fetchBuffer(opts.logoUrl.trim());
    if (logoBuf) {
      const lz = opts.layout.logoZone;
      const logoW = Math.max(56, Math.round(lz.width * width));
      const logoH = Math.max(40, Math.round(lz.height * height * 1.6));
      const resized = await sharp(logoBuf)
        .resize(logoW, logoH, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      const meta = await sharp(resized).metadata();
      const top = Math.round(lz.y * height);
      const left = Math.round(lz.x * width);
      outBuf = await sharp(outBuf)
        .composite([{
          input: resized,
          top: Math.min(height - (meta.height ?? logoH), Math.max(0, top)),
          left: Math.min(width - (meta.width ?? logoW), Math.max(0, left)),
        }])
        .jpeg({ quality: 94 })
        .toBuffer();
      logoApplied = true;
    }
  }

  const url = await persistImageBuffer(outBuf, opts.workspaceId, 'image/jpeg');
  const finalImageUrl = url
    && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/api/media'))
    ? url
    : `data:image/jpeg;base64,${outBuf.toString('base64')}`;

  return {
    finalImageUrl,
    logoApplied,
    textRendered: false,
    satoriFamily: null,
  };
}

/** Kept for tests that imported the mapper — maps unused after Satori removal. */
export function mapEditorialToSatoriFamily(): null {
  return null;
}

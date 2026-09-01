/**
 * GPT-image generation for Premium Editorial — venue-grounded social design.
 *
 * Default path: images.edit on the brand gallery/venue photo + Layer-4 design prompt.
 * From-scratch generate is fallback only when no usable gallery reference exists.
 */

import OpenAI from 'openai';
import { toFile } from 'openai';
import { serverConfig } from '@/lib/server-config';
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';
import { persistImageBuffer } from '@/lib/persist-enhanced-images';
import { resolveMediaFetchUrl } from '@/lib/logo-compositor';
import type { PremiumEditorialAspectRatio } from './types';

export interface BackgroundGenerationResult {
  imageUrl: string;
  imageBuffer: Buffer;
  modelName: string;
  provider: 'openai';
  usedReference: boolean;
  mode: 'generate' | 'edit';
}

function sizeFor(aspect: PremiumEditorialAspectRatio): '1024x1024' | '1024x1536' | '1536x1024' {
  if (aspect === '9:16') return '1024x1536';
  if (aspect === '1:1') return '1024x1024';
  return '1024x1536';
}

function promptLimit(model: string): number {
  return /gpt-image-2/i.test(model) ? 12_000 : 4_000;
}

async function fetchAsUpload(url: string): Promise<Awaited<ReturnType<typeof toFile>> | null> {
  try {
    const fetchUrl = await resolveMediaFetchUrl(url);
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null;
    const mime = res.headers.get('content-type') || 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    return toFile(buf, `ref.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

async function downloadImageBytes(imageUrl: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (imageUrl.startsWith('data:image/')) {
    const mime = imageUrl.slice(5, imageUrl.indexOf(';')) || 'image/png';
    const b64 = imageUrl.split(',')[1] ?? '';
    if (!b64) return null;
    return { buf: Buffer.from(b64, 'base64'), mime };
  }
  try {
    const fetchUrl = imageUrl.startsWith('/')
      ? await resolveMediaFetchUrl(imageUrl)
      : imageUrl;
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null;
    const mime = res.headers.get('content-type') || 'image/png';
    return { buf, mime };
  } catch {
    return null;
  }
}

async function materializeImage(
  imageUrl: string,
  workspaceId: string,
): Promise<{ imageUrl: string; imageBuffer: Buffer }> {
  const downloaded = await downloadImageBytes(imageUrl);
  if (!downloaded) {
    throw new Error('Generated image could not be downloaded for persistence');
  }
  const mime = downloaded.mime.includes('jpeg')
    ? 'image/jpeg'
    : downloaded.mime.includes('webp')
      ? 'image/webp'
      : 'image/png';
  const dataUrl = `data:${mime};base64,${downloaded.buf.toString('base64')}`;
  const persisted = await persistImageBuffer(downloaded.buf, workspaceId, mime);
  const usablePersist = persisted
    && (persisted.startsWith('http://') || persisted.startsWith('https://'))
    && !persisted.includes('/api/media?');
  return {
    imageUrl: usablePersist ? persisted : (persisted?.startsWith('/api/media') ? persisted : dataUrl),
    imageBuffer: downloaded.buf,
  };
}

/**
 * Venue-grounded GPT social design (default).
 */
export async function generateEditorialBackground(opts: {
  compiledPrompt: string;
  aspectRatio: PremiumEditorialAspectRatio;
  referenceUrls?: string[];
  workspaceId: string;
  signal?: AbortSignal;
  /**
   * true (default): require gallery edit when a usable photo exists.
   * false: allow from-scratch generate (discouraged for this slot).
   */
  preferGalleryGrounding?: boolean;
}): Promise<BackgroundGenerationResult> {
  const apiKey = serverConfig.openai.apiKey;
  if (!apiKey) {
    throw new Error('OpenAI image generation is not configured. Set OPENAI_API_KEY.');
  }
  if (opts.signal?.aborted) {
    throw new Error('Generation cancelled');
  }

  const openai = new OpenAI({ apiKey });
  const model = serverConfig.imageGen.model;
  const quality = (serverConfig.imageGen.quality === 'low' ? 'medium' : 'high') as 'high' | 'medium';
  const size = sizeFor(opts.aspectRatio);
  const limit = promptLimit(model);
  const preferGallery = opts.preferGalleryGrounding !== false;

  const designPrompt = [
    opts.compiledPrompt.trim(),
    '',
    '═══ ABSOLUTE TEXT FIDELITY ═══',
    'If an ON-CANVAS TEXT CONTRACT is present, render ONLY those strings.',
    'Keep that corner calm — the background continues as-is; paint no plate or placeholder for the logo composite.',
  ].join('\n').slice(0, limit);

  const refs = (opts.referenceUrls ?? [])
    .map((u) => String(u).trim())
    .filter((u) => isUsableGalleryPhotoUrl(u));

  if (preferGallery && refs[0] && !model.toLowerCase().includes('dall-e')) {
    const file = await fetchAsUpload(refs[0]!);
    if (file) {
      try {
        const editPrompt = [
          '═══ VENUE-GROUNDED SOCIAL DESIGN ═══',
          'IMAGE 1 is a REAL photograph from the brand\'s venue/gallery.',
          'Design a premium Instagram social frame ON this photo.',
          'Keep the venue recognizable. Add restrained editorial design + contracted typography.',
          'Do not invent a different location.',
          '',
          designPrompt,
        ].join('\n').slice(0, limit);

        const supportsInputFidelity = /^gpt-image(?!-2)/i.test(model);
        const editedRaw = await openai.images.edit({
          model,
          image: file,
          prompt: editPrompt,
          n: 1,
          size,
          quality,
          ...(supportsInputFidelity ? { input_fidelity: 'high' as const } : {}),
        } as Parameters<typeof openai.images.edit>[0]);

        const edited = editedRaw as { data?: Array<{ url?: string; b64_json?: string }> };
        const ed = edited.data?.[0];
        const raw = ed?.url ?? (ed?.b64_json ? `data:image/png;base64,${ed.b64_json}` : undefined);
        if (raw) {
          const materialized = await materializeImage(raw, opts.workspaceId);
          return {
            ...materialized,
            modelName: model,
            provider: 'openai',
            usedReference: true,
            mode: 'edit',
          };
        }
      } catch (err) {
        console.warn('[premium-editorial] venue edit failed, falling back:', err);
      }
    }
  }

  if (preferGallery && !refs[0]) {
    console.warn('[premium-editorial] no gallery reference — falling back to generate (not ideal for this slot)');
  }

  const generatedRaw = await openai.images.generate({
    model,
    prompt: designPrompt,
    n: 1,
    size,
    quality,
    output_format: 'webp',
  } as Parameters<typeof openai.images.generate>[0]);

  const generated = generatedRaw as { data?: Array<{ url?: string; b64_json?: string }> };
  const data = generated.data?.[0];
  const raw = data?.url ?? (data?.b64_json ? `data:image/webp;base64,${data.b64_json}` : undefined);
  if (!raw) throw new Error('OpenAI image generation returned no image');

  const materialized = await materializeImage(raw, opts.workspaceId);
  return {
    ...materialized,
    modelName: model,
    provider: 'openai',
    usedReference: false,
    mode: 'generate',
  };
}

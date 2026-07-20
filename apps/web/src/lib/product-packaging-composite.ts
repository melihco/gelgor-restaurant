/**
 * Pixel-safe product staging: cut out the real SKU, composite onto a new plate.
 * Never runs generative edit on packaging pixels (labels/logos stay source-true).
 */
import sharp from '@/lib/sharp-runtime';
import { serverConfig } from '@/lib/server-config';
import { getSectorBackgroundScenePrompt } from '@/lib/sector-production-profile';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';

const FAL_RUN = 'https://fal.run';
const BIREFNET = 'fal-ai/birefnet/v2';

export type PackagingCompositeInput = {
  /** HTTPS URL of the real product photo (we fetch + send as data URI — fal often cannot pull brand CDNs). */
  productImageUrl: string;
  /** Optional pre-fetched bytes (skips re-download). */
  productImageBuffer?: Buffer;
  businessType?: string;
  brandName?: string;
  productType?: string;
  backgroundConcept?: string;
  /** Canvas size (square). */
  size?: number;
};

export type PackagingCompositeResult = {
  buffer: Buffer;
  stages: string[];
  cutoutUrl: string;
  plateUrl?: string;
};

async function falPost<T>(model: string, body: Record<string, unknown>): Promise<T> {
  const key = serverConfig.fal.apiKey;
  if (!key) throw new Error('FAL_API_KEY not configured');
  const res = await fetch(`${FAL_RUN}/${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    throw new Error(`fal ${model} failed (${res.status}): ${JSON.stringify(json).slice(0, 280)}`);
  }
  return json as T;
}

/** Transparent PNG cutout — product pixels unchanged from source. */
export async function removeProductBackground(
  imageDataUriOrUrl: string,
): Promise<{ pngUrl: string; stages: string[] }> {
  const data = await falPost<{
    image?: { url?: string };
  }>(BIREFNET, {
    image_url: imageDataUriOrUrl,
    model: 'General Use (Heavy)',
    operating_resolution: '1024x1024',
    output_format: 'png',
    // refine_foreground can soften/alter label pixels — keep source-true
    refine_foreground: false,
  });
  const pngUrl = data.image?.url;
  if (!pngUrl) throw new Error('birefnet returned no image url');
  return { pngUrl, stages: ['fal_birefnet_cutout'] };
}

function toJpegDataUri(buffer: Buffer): string {
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

/** Procedural empty plate — never invents jars/labels (unlike generative BGs). */
export async function buildProceduralEmptyPlate(size = 1024): Promise<Buffer> {
  // Soft warm studio gradient — packaging-safe (no generative props/text).
  const svg = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stop-color="#f3e7d4"/>
          <stop offset="55%" stop-color="#d9c0a0"/>
          <stop offset="100%" stop-color="#b8956e"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`,
  );
  return sharp(svg).jpeg({ quality: 92 }).toBuffer();
}

/** Empty lifestyle plate — generative only as optional upgrade; must stay product-free. */
export async function generateEmptyProductPlate(input: {
  businessType?: string;
  brandName?: string;
  productType?: string;
  backgroundConcept?: string;
}): Promise<{ plateBuf: Buffer; plateUrl?: string; stages: string[] }> {
  const model = serverConfig.imageGen.falModel;
  const sectorBg = getSectorBackgroundScenePrompt(input.businessType);
  const concept = (input.backgroundConcept || sectorBg || 'warm wooden table, soft window light').slice(0, 220);
  const prompt = [
    'EMPTY BACKGROUND PLATE for product photography compositing.',
    'Show ONLY an empty table/surface and soft out-of-focus room atmosphere.',
    `Surface mood: ${concept}.`,
    'CRITICAL: ZERO products — no jar, bottle, bowl of food, package, fruit pile as hero, plate of food.',
    'ZERO text, logos, labels, watermarks, people, hands, animals.',
    'Clean negative space in the center for a product cutout. Soft window light, shallow DOF.',
  ].join(' ');

  try {
    const data = await falPost<{
      images?: Array<{ url?: string }>;
      image?: { url?: string };
    }>(model, {
      prompt,
      aspect_ratio: '1:1',
      raw: true,
      output_format: 'jpeg',
      num_images: 1,
      safety_tolerance: 2,
    });
    const plateUrl = data.images?.[0]?.url ?? data.image?.url;
    if (!plateUrl) throw new Error('empty plate generation returned no url');
    const plateBuf = await fetchBuf(plateUrl);
    return { plateBuf, plateUrl, stages: [`fal_empty_plate:${model}`] };
  } catch (err) {
    console.warn('[product-packaging-composite] fal plate failed — procedural plate', err);
    const plateBuf = await buildProceduralEmptyPlate(1024);
    return { plateBuf, stages: ['procedural_empty_plate'] };
  }
}

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`fetch ${url.slice(0, 80)} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Composite cutout PNG onto plate — packaging pixels never regenerated. */
export async function compositeProductOnPlate(
  cutoutPng: Buffer,
  plateJpeg: Buffer,
  size = 1024,
): Promise<Buffer> {
  const plate = await sharp(plateJpeg)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92 })
    .toBuffer();

  const maxH = Math.round(size * 0.72);
  const maxW = Math.round(size * 0.62);
  const cutout = await sharp(cutoutPng)
    .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();

  const meta = await sharp(cutout).metadata();
  const cw = meta.width ?? maxW;
  const ch = meta.height ?? maxH;
  const left = Math.max(0, Math.round((size - cw) / 2));
  const top = Math.max(0, Math.round((size - ch) / 2 + size * 0.02));

  // Soft contact shadow under the cutout (does not touch label pixels).
  const shadow = await sharp({
    create: {
      width: Math.max(8, cw - 20),
      height: Math.max(8, Math.round(ch * 0.08)),
      channels: 4,
      background: { r: 40, g: 28, b: 16, alpha: 0.35 },
    },
  })
    .blur(12)
    .png()
    .toBuffer();
  const shadowLeft = left + 10;
  const shadowTop = Math.min(size - 8, top + ch - Math.round(ch * 0.04));

  return sharp(plate)
    .composite([
      { input: shadow, left: shadowLeft, top: shadowTop },
      { input: cutout, left, top },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * Full packaging-safe staging pipeline.
 * Returns null when fal is unavailable or any stage fails (caller may fall back).
 */
export async function stageProductPackagingSafe(
  input: PackagingCompositeInput,
): Promise<PackagingCompositeResult | null> {
  if (!serverConfig.fal.configured) return null;
  if (!input.productImageBuffer && !/^https?:\/\//i.test(input.productImageUrl)) {
    return null;
  }

  const stages: string[] = [];
  try {
    const sourceBuf = input.productImageBuffer
      ?? (await fetchExternalImageBuffer(input.productImageUrl, 30_000));
    if (!sourceBuf?.length) {
      throw new Error('could not fetch product source for cutout');
    }
    stages.push('source_fetched');

    // Brand CDNs often block fal's crawler — send bytes as data URI instead.
    const cut = await removeProductBackground(toJpegDataUri(sourceBuf));
    stages.push(...cut.stages);
    // Prefer procedural plate for packaging fidelity — generative plates often sneak jars in.
    const useGenerativePlate = process.env.PRODUCT_PACKAGING_GENERATIVE_PLATE === '1';
    let plateBuf: Buffer;
    let plateUrl: string | undefined;
    if (useGenerativePlate) {
      const plate = await generateEmptyProductPlate({
        businessType: input.businessType,
        brandName: input.brandName,
        productType: input.productType,
        backgroundConcept: input.backgroundConcept,
      });
      stages.push(...plate.stages);
      plateBuf = plate.plateBuf;
      plateUrl = plate.plateUrl;
    } else {
      plateBuf = await buildProceduralEmptyPlate(input.size ?? 1024);
      stages.push('procedural_empty_plate');
    }

    const cutoutBuf = await fetchBuf(cut.pngUrl);
    const buffer = await compositeProductOnPlate(
      cutoutBuf,
      plateBuf,
      input.size ?? 1024,
    );
    stages.push('sharp_product_composite');
    return {
      buffer,
      stages,
      cutoutUrl: cut.pngUrl,
      plateUrl,
    };
  } catch (err) {
    console.warn('[product-packaging-composite] staging failed:', err);
    return null;
  }
}

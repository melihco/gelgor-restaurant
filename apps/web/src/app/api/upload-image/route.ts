/**
 * Accepts a base64 data URL or blob and uploads to R2.
 * Returns the permanent R2 public URL.
 * Used by MissionContentFactory canvas compositor before saving to Outputs.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { dataUrl, mimeType = 'image/jpeg' } = await req.json() as {
      dataUrl: string;
      mimeType?: string;
    };

    if (!dataUrl?.startsWith('data:image/')) {
      return NextResponse.json({ error: 'dataUrl must be a base64 image' }, { status: 400 });
    }

    const { isR2Configured, generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');

    if (!isR2Configured()) {
      // R2 not configured — return original data URL (browser can still display it)
      return NextResponse.json({ imageUrl: dataUrl });
    }

    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
    const key = generateStorageKey('brand-canvas', 'image', ext);
    const result = await uploadToR2(dataUrl, key, mimeType);

    return NextResponse.json({ imageUrl: result.url });
  } catch (err) {
    console.error('[upload-image]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isR2Configured, generateStorageKey, uploadToR2 } from '@/lib/r2-storage';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: 'R2 storage not configured' }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const tenantId = form.get('tenantId') as string ?? 'shared';
    const typeHint = form.get('type') as string ?? 'image';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 50 MB limit
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'Dosya 50 MB sınırını aşıyor' }, { status: 400 });
    }

    const mime = file.type || 'application/octet-stream';
    const isVideo = mime.startsWith('video/') || typeHint === 'video';
    const ext = mime.includes('png') ? 'png'
              : mime.includes('webp') ? 'webp'
              : mime.includes('gif') ? 'gif'
              : mime.includes('mp4') ? 'mp4'
              : mime.includes('quicktime') ? 'mp4'
              : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg'
              : 'bin';

    const key = generateStorageKey(tenantId, isVideo ? 'video' : 'image', ext);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToR2(buffer, key, mime);

    return NextResponse.json({ url: result.url, key: result.key, size: result.size });
  } catch (err) {
    console.error('[/api/media/upload]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    );
  }
}

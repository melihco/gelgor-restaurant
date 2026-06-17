/**
 * GPT enhance returns R2 URLs when configured; otherwise data:image/jpeg.
 * Feed/Nexus need http(s) — persist data URIs before auto-produce continues.
 */
import { isPersistableEnhanceUrl } from '@/lib/gallery-photo-enhance-api';

export async function persistEnhancedImageUrls(
  urls: string[],
  workspaceId: string,
): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (!url?.trim()) continue;
    if (isPersistableEnhanceUrl(url)) {
      out.push(url);
      continue;
    }
    if (!url.startsWith('data:image/')) {
      continue;
    }
    const persisted = await uploadDataImageUrl(url, workspaceId);
    if (persisted) out.push(persisted);
  }
  return out;
}

async function uploadDataImageUrl(
  dataUrl: string,
  workspaceId: string,
): Promise<string | null> {
  try {
    const { isR2Configured, generateStorageKey, uploadToR2 } = await import('@/lib/r2-storage');
    if (isR2Configured()) {
      const key = generateStorageKey(workspaceId || 'shared', 'image', 'jpg');
      const result = await uploadToR2(dataUrl, key, 'image/jpeg');
      return result.url;
    }
    const base = process.env.NEXTJS_INTERNAL_URL || 'http://127.0.0.1:3000';
    const res = await fetch(`${base}/api/upload-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, mimeType: 'image/jpeg' }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { imageUrl?: string };
    const imageUrl = data.imageUrl?.trim();
    return imageUrl && isPersistableEnhanceUrl(imageUrl) ? imageUrl : null;
  } catch (err) {
    console.warn(
      '[persist-enhanced-images] upload failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

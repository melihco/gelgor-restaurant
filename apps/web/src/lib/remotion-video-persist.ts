/**
 * Remotion MP4 çıktısını kalıcı URL'ye çevirir (R2 → local serve).
 * auto-produce / retry-render bundle attach için.
 */
import { mediaUrlForKey } from '@/lib/media-url';

export interface RemotionVideoRenderPayload {
  videoUrl?: string | null;
  videoBase64?: string | null;
  compositionId?: string;
  bytes?: number;
}

export async function persistRemotionVideoOutput(
  workspaceId: string,
  data: RemotionVideoRenderPayload,
): Promise<string | null> {
  const direct = String(data.videoUrl ?? '').trim();
  if (direct) return direct;

  const b64 = String(data.videoBase64 ?? '').trim();
  if (!b64) return null;

  const buffer = Buffer.from(b64, 'base64');
  const slug = `${workspaceId.slice(0, 8)}-${String(data.compositionId ?? 'story').toLowerCase()}-${Date.now()}`;

  if (process.env.R2_BUCKET_NAME) {
    try {
      const { uploadToR2 } = await import('@/lib/r2-storage');
      const key = `${workspaceId}/stories/${slug}.mp4`;
      await uploadToR2(buffer, key, 'video/mp4');
      return mediaUrlForKey(key);
    } catch {
      /* fall through */
    }
  }

  try {
    const fs = await import('fs');
    const serveDir = '/tmp/remotion-serve';
    if (!fs.default.existsSync(serveDir)) {
      fs.default.mkdirSync(serveDir, { recursive: true });
    }
    const serveFile = `${serveDir}/${slug}.mp4`;
    fs.default.writeFileSync(serveFile, buffer);
    return `/api/remotion/video/${slug}.mp4`;
  } catch {
    return null;
  }
}

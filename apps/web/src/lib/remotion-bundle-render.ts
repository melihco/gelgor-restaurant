/**
 * Remotion render invocation with safe-overlay retry for mission bundles.
 */
import { persistRemotionVideoOutput } from '@/lib/remotion-video-persist';
import { normalizePhotoUrlForRemotionRender, probeMediaUrl } from '@/lib/media-url';
import { GRAFIKER_HARD_FLOOR, GRAFIKER_PASS_THRESHOLD } from '@/lib/remotion-quality';
import { buildInternalProductionHeaders } from '@/lib/tenant-production-guard';

export interface RemotionRenderApiResult {
  ok: boolean;
  status: number;
  videoUrl?: string;
  videoBase64?: string;
  imageUrl?: string;
  compositionId?: string;
  templateId?: string;
  grafikerScore?: number | null;
  grafikerPass?: boolean;
  durationMs?: number;
  bytes?: number;
  error?: string;
}

export async function callRemotionRenderApi(
  baseUrl: string,
  body: Record<string, unknown>,
  timeoutMs = 360_000,
  workspaceId?: string,
): Promise<RemotionRenderApiResult> {
  const tenantId = String(workspaceId ?? body.workspaceId ?? '').trim();
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/remotion/render`, {
      method: 'POST',
      headers: buildInternalProductionHeaders(tenantId || undefined),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json().catch(() => ({})) as RemotionRenderApiResult;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      status: res.status,
      videoUrl: data.videoUrl,
      videoBase64: data.videoBase64,
      imageUrl: data.imageUrl,
      compositionId: data.compositionId,
      templateId: data.templateId,
      grafikerScore: data.grafikerScore,
      grafikerPass: data.grafikerPass,
      durationMs: data.durationMs,
      bytes: data.bytes,
      error: data.error,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function ensureRemotionPhotoUrl(photoUrl: string): string {
  return normalizePhotoUrlForRemotionRender(photoUrl);
}

export function grafikerAcceptsRender(score: number | null | undefined): boolean {
  if (score == null) return true;
  if (score < GRAFIKER_HARD_FLOOR) return false;
  return score >= GRAFIKER_PASS_THRESHOLD || score >= GRAFIKER_HARD_FLOOR;
}

export async function persistStoryVideo(
  workspaceId: string,
  data: RemotionRenderApiResult,
  compositionId: string,
): Promise<string | null> {
  return persistRemotionVideoOutput(workspaceId, {
    videoUrl: data.videoUrl,
    videoBase64: data.videoBase64,
    compositionId: data.compositionId ?? compositionId,
    bytes: data.bytes,
  });
}

export async function verifyPersistedVideo(url: string): Promise<boolean> {
  if (!url) return false;
  return probeMediaUrl(url);
}

/** Build a safer second-pass render payload when luxury/full-bleed fails. */
export function buildSafeOverlayRetryProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...props,
    preferSafeOverlay: true,
    photoUrl: ensureRemotionPhotoUrl(String(props.photoUrl ?? '')),
    ...(Array.isArray(props.galleryPhotoUrls)
      ? {
          galleryPhotoUrls: (props.galleryPhotoUrls as string[]).map(ensureRemotionPhotoUrl),
        }
      : {}),
  };
}

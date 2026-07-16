/**
 * Nexus HTTP client for auto-produce artifact operations.
 *
 * All Nexus API calls from the production pipeline go through here.
 * Centralises the NEXUS_API / INTERNAL_KEY config so no other file
 * needs to declare those constants independently.
 */

export interface NexusClientConfig {
  nexusApi: string;
  internalKey: string;
}

export function createNexusClient(config: NexusClientConfig) {
  const { nexusApi, internalKey } = config;

  async function saveArtifact(
    workspaceId: string,
    params: {
      title: string;
      contentUrl: string;
      content: string;
      platform: string;
      contentType: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ id?: string; error?: string }> {
    try {
      const res = await fetch(`${nexusApi}/api/artifacts/creative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': workspaceId,
          'X-Internal-Api-Key': internalKey,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { error: `Nexus ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = await res.json();
      return { id: data.id };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  async function attachPoster(opts: {
    workspaceId: string;
    artifactId: string;
    imageUrl: string;
    referencePhotoUrl: string;
    compositionId: string;
    posterTemplateId: string;
    renderMs?: number;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${nexusApi}/api/artifacts/${opts.artifactId}/attach-image`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': opts.workspaceId,
          'X-Internal-Api-Key': internalKey,
        },
        body: JSON.stringify({
          imageUrl: opts.imageUrl,
          contentType: 'instagram_post',
          productionBundle: true,
          compositionId: opts.compositionId,
          posterTemplateId: opts.posterTemplateId,
          referencePhotoUrl: opts.referencePhotoUrl,
          renderMs: opts.renderMs ?? null,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `Nexus ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  async function attachVideo(opts: {
    workspaceId: string;
    artifactId: string;
    videoUrl: string;
    posterUrl: string;
    compositionId: string;
    grafikerScore: number | null;
    grafikerPass: boolean;
    renderMs?: number;
    /** Optional quality metadata forwarded to the artifact record. */
    extraMeta?: Record<string, unknown>;
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`${nexusApi}/api/artifacts/${opts.artifactId}/attach-video`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': opts.workspaceId,
          'X-Internal-Api-Key': internalKey,
        },
        body: JSON.stringify({
          videoUrl: opts.videoUrl,
          posterUrl: opts.posterUrl,
          compositionId: opts.compositionId,
          grafikerScore: opts.grafikerScore,
          grafikerPass: opts.grafikerPass,
          renderMs: opts.renderMs ?? null,
          ...(opts.extraMeta ?? {}),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, error: `Nexus ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }

  async function markBundleFailed(opts: {
    workspaceId: string;
    artifactId: string;
    error: string;
    posterUrl?: string | null;
    contentType?: string;
    attachGalleryStill?: boolean;
    pipeline?: string;
    slotRole?: string;
    /** Injected to avoid importing media-url here */
    toFeedPreviewUrl?: (url: string) => string | null;
    probeMediaUrl?: (url: string) => Promise<boolean>;
  }): Promise<void> {
    try {
      await fetch(`${nexusApi}/api/artifacts/${opts.artifactId}/bundle-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': opts.workspaceId,
          'X-Internal-Api-Key': internalKey,
        },
        body: JSON.stringify({ status: 'failed', error: opts.error.slice(0, 300) }),
      });
    } catch {
      /* best-effort */
    }

    const attachStill = opts.attachGalleryStill ?? !(
      opts.slotRole === 'designed_post'
      || (opts.slotRole ?? '').includes('story_motion')
    );
    if (!attachStill) return;

    const rawPoster = opts.posterUrl?.trim();
    if (!rawPoster) return;

    const preview = opts.toFeedPreviewUrl
      ? (opts.toFeedPreviewUrl(rawPoster) ?? rawPoster)
      : rawPoster;

    if (opts.probeMediaUrl && !(await opts.probeMediaUrl(preview))) return;

    try {
      const res = await fetch(`${nexusApi}/api/artifacts/${opts.artifactId}/attach-image`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': opts.workspaceId,
          'X-Internal-Api-Key': internalKey,
        },
        body: JSON.stringify({
          imageUrl: preview,
          contentType: opts.contentType ?? 'instagram_story',
          productionBundle: true,
          referencePhotoUrl: rawPoster,
        }),
      });
      if (res.ok) {
        console.log(`[auto-produce] Failed bundle → gallery still: ${opts.artifactId.slice(0, 8)}`);
      }
    } catch {
      /* best-effort */
    }
  }

  return { saveArtifact, attachPoster, attachVideo, markBundleFailed };
}

import { resolveServerApiBaseUrl } from '@/lib/backend-origin';
import { serverConfig } from '@/lib/server-config';

export type NexusClient = ReturnType<typeof createNexusClient>;

// Runtime Nexus base URL (Render: NEXUS_API_URL / BACKEND_ORIGIN — not build-time NEXT_PUBLIC).
export const NEXUS_API = resolveServerApiBaseUrl();
export const INTERNAL_KEY = serverConfig.internal.apiKey;

export function createDefaultNexusClient(): NexusClient {
  return createNexusClient({ nexusApi: NEXUS_API, internalKey: INTERNAL_KEY });
}

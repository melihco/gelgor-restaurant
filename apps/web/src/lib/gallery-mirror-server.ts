/**
 * Server-only gallery mirror helpers (R2 / external fetch).
 * Kept separate from media-url.ts so client bundles never load @aws-sdk.
 */

import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { serverConfig } from '@/lib/server-config';
import {
  generateStorageKey,
  isR2Configured,
  listTenantImageStorageUrls,
  uploadToR2,
} from '@/lib/r2-storage';
import { isR2StorageKeyPath, unwrapMediaProxyUrl } from '@/lib/media-url';
import { galleryUrlIdentityKey } from '@/lib/gallery-display-url';

function extractMediaKeyFromUrl(url: string): string | null {
  const keyMatch = url.match(/[?&]key=([^&]+)/);
  return keyMatch ? decodeURIComponent(keyMatch[1]!) : null;
}

async function probeLocalMediaUrl(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const target = url.startsWith('http') ? url : `${getNextjsInternalOrigin()}${url}`;
    const res = await fetch(target, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return true;
    const getRes = await fetch(target, { signal: AbortSignal.timeout(timeoutMs) });
    const ct = getRes.headers.get('content-type') ?? '';
    return getRes.ok && ct.startsWith('image/');
  } catch {
    return false;
  }
}

async function probeMediaUrlReliableLocal(
  url: string,
  opts?: { timeoutMs?: number; retries?: number },
): Promise<boolean> {
  const retries = opts?.retries ?? (url.includes('/api/media') ? 4 : 1);
  for (let attempt = 0; attempt < retries; attempt++) {
    if (await probeLocalMediaUrl(url, opts?.timeoutMs ?? 8_000)) return true;
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return false;
}

function isTenantStoredMediaPath(url: string, workspaceId: string): boolean {
  const trimmed = url.trim();
  const key = extractMediaKeyFromUrl(trimmed)
    ?? (isR2StorageKeyPath(trimmed) ? trimmed.replace(/^\//, '') : null);
  if (key?.toLowerCase().startsWith(`${workspaceId.toLowerCase()}/`)) return true;
  return trimmed.includes(`${workspaceId}/`);
}

export function prioritizeTenantStoredGalleryUrls(
  urls: string[],
  workspaceId: string,
): string[] {
  const tenant: string[] = [];
  const other: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!u) continue;
    const dedupKey = galleryUrlIdentityKey(u);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    if (isTenantStoredMediaPath(u, workspaceId) || u.startsWith('/api/media')) {
      tenant.push(u);
    } else {
      other.push(u);
    }
  }
  return [...tenant, ...other];
}

export async function mirrorGalleryPhotoToTenantStorageServer(
  workspaceId: string,
  sourceUrl: string,
): Promise<string> {
  if (!isR2Configured()) {
    throw new Error('R2 not configured — cannot mirror gallery photo');
  }

  const trimmed = sourceUrl.trim();
  const unwrapped = unwrapMediaProxyUrl(trimmed) ?? trimmed;
  let fetchUrl = unwrapped;
  if (fetchUrl.startsWith('/')) {
    fetchUrl = `${getNextjsInternalOrigin()}${fetchUrl}`;
  } else if (!fetchUrl.startsWith('http')) {
    throw new Error(`Unsupported gallery URL for mirror: ${trimmed.slice(0, 120)}`);
  }

  const buffer = await fetchExternalImageBuffer(fetchUrl, 45_000);
  if (!buffer || buffer.length < 100) {
    throw new Error(`Gallery fetch failed: ${unwrapped.slice(0, 120)}`);
  }

  const ext =
    unwrapped.match(/\.(jpe?g|png|webp|gif)(\?|$)/i)?.[1]?.toLowerCase().replace('jpeg', 'jpg')
    ?? 'jpg';
  const key = generateStorageKey(workspaceId, 'image', ext);
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  await uploadToR2(buffer, key, contentType);
  return `/api/media?key=${encodeURIComponent(key)}`;
}

export async function ensureTenantStoredGalleryUrl(
  workspaceId: string,
  photoUrl: string,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const trimmed = photoUrl.trim();
  if (!trimmed || !workspaceId) return null;
  const timeoutMs = opts?.timeoutMs ?? 12_000;

  if (isTenantStoredMediaPath(trimmed, workspaceId) || trimmed.startsWith('/api/media')) {
    const localUrl = trimmed.startsWith('/api/media')
      ? trimmed
      : `/api/media?key=${encodeURIComponent(extractMediaKeyFromUrl(trimmed) ?? trimmed.replace(/^\//, ''))}`;
    if (await probeMediaUrlReliableLocal(localUrl, { timeoutMs, retries: 2 })) {
      return localUrl;
    }
  }
  return null;
}

export async function ensureProductionGalleryPhotoUrlServer(
  workspaceId: string,
  photoUrl: string,
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const trimmed = photoUrl.trim();
  if (!trimmed || !workspaceId) return null;
  const timeoutMs = opts?.timeoutMs ?? 12_000;

  const tenantLocal = await ensureTenantStoredGalleryUrl(workspaceId, trimmed, { timeoutMs });
  if (tenantLocal) return tenantLocal;

  const unwrapped = unwrapMediaProxyUrl(trimmed) ?? trimmed;
  const externalTarget = unwrapped.startsWith('http') ? unwrapped : null;

  if (externalTarget?.startsWith('https://') && serverConfig.r2.configured) {
    try {
      const mirrored = await mirrorGalleryPhotoToTenantStorageServer(workspaceId, externalTarget);
      if (await probeMediaUrlReliableLocal(mirrored, { timeoutMs, retries: 2 })) {
        return mirrored;
      }
      console.warn('[gallery-mirror] mirrored gallery not readable locally:', mirrored.slice(0, 90));
    } catch (mirrorErr) {
      console.warn(
        '[gallery-mirror] production gallery mirror failed:',
        externalTarget.slice(0, 90),
        mirrorErr instanceof Error ? mirrorErr.message : mirrorErr,
      );
    }
  }

  return null;
}

export async function resolveTenantGalleryFallbackUrls(
  workspaceId: string,
  opts?: { maxKeys?: number },
): Promise<string[]> {
  if (!isR2Configured() || !workspaceId.trim()) return [];
  try {
    return await listTenantImageStorageUrls(workspaceId, opts);
  } catch (err) {
    console.warn(
      '[gallery-mirror] tenant R2 inventory failed:',
      workspaceId.slice(0, 8),
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export async function pickReachableProductionGalleryUrl(
  workspaceId: string,
  primaryUrl: string,
  candidateUrls: string[],
  opts?: { timeoutMs?: number },
): Promise<{ url: string; fallbackFrom?: string } | null> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const r2Inventory = await resolveTenantGalleryFallbackUrls(workspaceId, { maxKeys: 100 });
  const ordered = prioritizeTenantStoredGalleryUrls(
    [primaryUrl, ...candidateUrls.filter((u) => u !== primaryUrl), ...r2Inventory],
    workspaceId,
  );

  for (const candidate of ordered) {
    const ensured = await ensureProductionGalleryPhotoUrlServer(workspaceId, candidate, { timeoutMs });
    if (ensured) {
      return {
        url: ensured,
        fallbackFrom: candidate !== primaryUrl ? candidate : undefined,
      };
    }
  }
  return null;
}

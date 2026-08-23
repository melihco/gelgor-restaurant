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

/**
 * Order the mission photo pool for visual_source_mode.
 * gallery_only / gallery_enhanced: brand-site crawl (e.g. /galeri) first;
 * tenant /api/media (often prior designed cards) last so Atmosfer-style bakes
 * cannot steal DJ/product mission picks.
 */
export function orderGalleryUrlsForVisualSource(
  urls: string[],
  opts: {
    visualSourceMode?: 'gallery_only' | 'gallery_enhanced' | 'ai_generated' | null;
    brandDomain?: string | null;
    workspaceId: string;
  },
): string[] {
  const mode = opts.visualSourceMode ?? 'gallery_only';
  if (mode === 'ai_generated') {
    return prioritizeTenantStoredGalleryUrls(urls, opts.workspaceId);
  }

  const brandDomain = String(opts.brandDomain ?? '').replace(/^www\./, '').toLowerCase();
  const isBrandDomainUrl = (u: string) => {
    if (!brandDomain) return false;
    try {
      return new URL(u).hostname.replace(/^www\./, '').toLowerCase() === brandDomain;
    } catch {
      return false;
    }
  };
  const isTenantMedia = (u: string) =>
    isTenantStoredMediaPath(u, opts.workspaceId) || u.includes('/api/media');

  const brandRaw: string[] = [];
  const otherExternal: string[] = [];
  const tenantMedia: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    const u = raw.trim();
    if (!u) continue;
    const dedupKey = galleryUrlIdentityKey(u);
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    if (isTenantMedia(u)) tenantMedia.push(u);
    else if (isBrandDomainUrl(u)) brandRaw.push(u);
    else otherExternal.push(u);
  }
  return [...brandRaw, ...otherExternal, ...tenantMedia];
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

async function externalGalleryUrlIsReachable(
  externalTarget: string,
  timeoutMs: number,
): Promise<boolean> {
  try {
    const buffer = await fetchExternalImageBuffer(externalTarget, timeoutMs);
    if (buffer && buffer.length >= 100) return true;
  } catch {
    /* fall through to HEAD/GET probe */
  }
  return probeMediaUrlReliableLocal(externalTarget, { timeoutMs, retries: 1 });
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

  // Brand-site galleries (WordPress, etc.) are often reachable even when R2 mirror
  // or local /api/media probe fails. Prefer a live external URL over starving the slot
  // with a false "expired URL" — fal / media-proxy can still fetch https origins.
  if (externalTarget?.startsWith('https://')) {
    if (await externalGalleryUrlIsReachable(externalTarget, timeoutMs)) {
      return externalTarget;
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

/**
 * Resolve a renderable URL for the photo the matcher chose, degrading only when
 * that photo cannot be fetched.
 *
 * Order matters for coherence, not just availability: `primaryUrl` is the
 * caption-matched photo, so it is probed before anything else. Tenant R2
 * ordering applies to *fallbacks* only — it also holds previously produced
 * cards, so promoting it ahead of the match would let storage layout, not the
 * caption, decide what the post shows.
 */
export async function pickReachableProductionGalleryUrl(
  workspaceId: string,
  primaryUrl: string,
  candidateUrls: string[],
  opts?: { timeoutMs?: number },
): Promise<{ url: string; fallbackFrom?: string; fromTenantInventory?: boolean } | null> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const primary = primaryUrl.trim();
  if (primary) {
    const ensured = await ensureProductionGalleryPhotoUrlServer(workspaceId, primary, { timeoutMs });
    if (ensured) return { url: ensured };
  }

  const primaryKey = primary ? galleryUrlIdentityKey(primary) : '';
  const fallbacks = prioritizeTenantStoredGalleryUrls(
    candidateUrls.filter((u) => u.trim() && galleryUrlIdentityKey(u) !== primaryKey),
    workspaceId,
  );
  for (const candidate of fallbacks) {
    const ensured = await ensureProductionGalleryPhotoUrlServer(workspaceId, candidate, { timeoutMs });
    if (ensured) return { url: ensured, fallbackFrom: candidate };
  }

  // Raw tenant storage is not the brand gallery — it has no caption relevance and
  // no photo analysis behind it, so it is only worth trying once the whole
  // matched pool proved unreachable.
  const inventory = await resolveTenantGalleryFallbackUrls(workspaceId, { maxKeys: 100 });
  const known = new Set([primaryKey, ...fallbacks.map(galleryUrlIdentityKey)]);
  for (const candidate of inventory) {
    if (known.has(galleryUrlIdentityKey(candidate))) continue;
    const ensured = await ensureProductionGalleryPhotoUrlServer(workspaceId, candidate, { timeoutMs });
    if (ensured) {
      console.warn(
        '[gallery-mirror] gallery pool unreachable — falling back to tenant storage object '
        + `(no caption match): ${ensured.slice(0, 90)}`,
      );
      return { url: ensured, fallbackFrom: candidate, fromTenantInventory: true };
    }
  }
  return null;
}

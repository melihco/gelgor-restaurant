/**
 * Production-volume gate: one unique brand photo per gallery-consuming slot.
 *
 * Rotation already prefers the least-used photo when the pool is saturated.
 * That still ships the same hero again. This gate withholds the overflow
 * instead, so a week with eight usable photos cannot enqueue sixteen
 * gallery slots, and the customer is asked for a new shoot.
 *
 * Capacity reroutes (subject missing → fal_only) do not consume a photo
 * and are left alone. Sector-agnostic: demand is the gallery-consuming
 * slot count, supply is unique usable brand URLs.
 */

import { assignmentUsesGalleryPhoto, missionGallerySlotKey } from '@/lib/auto-produce/gallery-orchestrator';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';
import { isStockGalleryPhotoUrl, isUsableGalleryPhotoUrl } from '@/lib/media-url';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';

export const GALLERY_VOLUME_SHORTFALL_CODE = 'gallery_volume_shortfall';

export function galleryVolumeShortfallMessage(): string {
  return 'Galeride yeterli farklı marka fotoğrafı yok — bu slot için yeni çekim yükleyin';
}

export function countUniqueUsableBrandPhotos(urls: readonly string[]): number {
  const seen = new Set<string>();
  for (const raw of urls) {
    const url = String(raw ?? '').trim();
    if (!url || !isUsableGalleryPhotoUrl(url) || isStockGalleryPhotoUrl(url)) continue;
    seen.add(normalizeGalleryUrl(url));
  }
  return seen.size;
}

export function resolveQueueGalleryVolumeWithholds(input: {
  productionLoop: ManifestProductionQueueItem[];
  galleryPhotos: readonly string[];
  hasRealBrandPhotos: boolean;
  assignments?: ReadonlyMap<string, { url?: string | null } | null>;
  capacityReroutes?: ReadonlyMap<string, string>;
}): Set<string> {
  const out = new Set<string>();
  if (!input.hasRealBrandPhotos) return out;

  const unique = countUniqueUsableBrandPhotos(input.galleryPhotos);
  const galleryKeys: string[] = [];
  for (const item of input.productionLoop) {
    const key = missionGallerySlotKey(item.ideaIndex, String(item.assignment.slot_role));
    if (input.capacityReroutes?.has(key)) continue;
    if (!assignmentUsesGalleryPhoto(item.assignment)) continue;
    galleryKeys.push(key);
  }
  if (unique >= galleryKeys.length) return out;

  const claimed = new Set<string>();
  for (const key of galleryKeys) {
    const url = String(input.assignments?.get(key)?.url ?? '').trim();
    const base = url ? normalizeGalleryUrl(url) : '';
    if (base && !claimed.has(base)) {
      claimed.add(base);
      continue;
    }
    out.add(key);
  }
  return out;
}

/**
 * Gallery Context — workspace-scoped gallery data for content production.
 *
 * Fetches used gallery images, applies health checks, enriches metadata,
 * and determines whether the brand has real uploaded photos vs sector seeds.
 *
 * Tenant isolation: all data is scoped to exactly one workspaceId via
 * X-Tenant-Id header on every Nexus request.
 */

import {
  type PostTypeBucket,
  fetchUsedGalleryImages,
  type UsedGalleryUsage,
} from '@/lib/gallery-usage-tracker';
import {
  enrichGalleryAnalysis,
  type GalleryPhotoMeta,
} from '@/lib/gallery-photo-matcher';
import {
  filterReachableGalleryUrls,
  filterUsableGalleryPhotoUrls,
  isUsableGalleryPhotoUrl,
} from '@/lib/media-url';
import { mergeSectorGallerySeed, SYNTHETIC_GALLERY_MIN } from '@/lib/sector-gallery-seed';
import { fetchRecentTemplateIds } from '@/lib/template-usage-tracker';

const GALLERY_EXCLUDE_PATTERNS = [
  'logo', 'icon', 'banner', 'footer', 'menu.', 'harita', 'map', 'franchise',
];

export interface GalleryContext {
  /** Workspace this context belongs to. */
  readonly workspaceId: string;

  /** Final candidate photo URLs (brand uploads + sector seed fill if needed). */
  readonly photos: string[];

  /** Enriched metadata map keyed by URL. */
  readonly meta: Record<string, GalleryPhotoMeta>;

  /** True when brand has real uploaded photos (not just sector seeds). */
  readonly hasRealPhotos: boolean;

  /** True when photos.length > 0 after health check. */
  readonly hasPhotos: boolean;

  /** Which photos are already used per post type (from existing artifacts). */
  readonly usage: UsedGalleryUsage;

  /** Template IDs recently used — for rotation / deduplication. */
  readonly recentTemplateIds: string[];

  /** Per-batch used URL tracker — local to this request, not persisted. */
  batchUsedByType: Record<PostTypeBucket, string[]>;
}

/**
 * Build the GalleryContext for a workspace.
 *
 * - Fetches used gallery images and recent template IDs in parallel
 * - Runs health checks on candidate URLs (removes broken ones)
 * - Enriches metadata with NLP tags
 * - Fills with sector seeds when real gallery is small
 */
export async function fetchGalleryContext(
  workspaceId: string,
  brandCtxRaw: Record<string, unknown>,
  galleryAnalysisInput: Record<string, unknown> | null | undefined,
  brandBusinessType: string,
): Promise<GalleryContext> {
  // ── Parse brand gallery photos ─────────────────────────────────────────
  const metaRaw = (galleryAnalysisInput ?? {}) as Record<string, GalleryPhotoMeta>;
  let refs: string[] = [];
  const raw = brandCtxRaw.reference_image_urls;
  if (Array.isArray(raw)) {
    refs = raw.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        refs = parsed.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
      }
    } catch { /* ignore */ }
  }

  const analysisKeys = Object.keys(metaRaw).filter(
    (u) => u.startsWith('http') && isUsableGalleryPhotoUrl(u),
  );
  let candidates = refs.length > 0 ? refs : analysisKeys;

  // Remove known non-photo patterns (logos, maps, etc.)
  candidates = filterUsableGalleryPhotoUrls(
    candidates.filter(
      (u) => !GALLERY_EXCLUDE_PATTERNS.some((p) => u.toLowerCase().includes(p)),
    ),
  );

  // Track whether brand has REAL uploaded photos
  const hasRealPhotos =
    (Array.isArray(brandCtxRaw.reference_image_urls) &&
      (brandCtxRaw.reference_image_urls as string[]).length > 0) ||
    Object.keys(metaRaw).length > 0;

  // Fill with sector seeds when gallery is small
  if (candidates.length < SYNTHETIC_GALLERY_MIN) {
    const { urls } = mergeSectorGallerySeed(candidates, brandBusinessType, SYNTHETIC_GALLERY_MIN);
    candidates = urls;
  }

  // ── Parallel: health check + usage + template history ──────────────────
  const [health, usage, recentTemplateIds] = await Promise.all([
    candidates.length > 0
      ? filterReachableGalleryUrls(candidates, { maxProbe: 40, concurrency: 8 })
      : Promise.resolve({ urls: candidates, rejected: [] }),
    fetchUsedGalleryImages(workspaceId),
    fetchRecentTemplateIds(workspaceId),
  ]);

  if (health.rejected.length > 0) {
    console.warn(
      `[gallery-context:${workspaceId}] ${health.rejected.length} unreachable URLs removed` +
      ` (sample: ${health.rejected[0]?.url.slice(0, 80) ?? 'n/a'})`,
    );
  }

  const photos = health.urls;

  // ── Enrich metadata (sector-agnostic NLP tag derivation) ──────────────
  const meta = enrichGalleryAnalysis(metaRaw);

  return {
    workspaceId,
    photos,
    meta,
    hasRealPhotos,
    hasPhotos: photos.length > 0,
    usage,
    recentTemplateIds,
    batchUsedByType: { feed: [], story: [], reel: [], carousel: [] },
  };
}

/** Trigger background gallery analysis (fire-and-forget, non-blocking). */
export function triggerGalleryAnalysisIfNeeded(
  workspaceId: string,
  galleryContext: GalleryContext,
  galleryAnalysisInput: Record<string, unknown> | null | undefined,
): void {
  const analysisCount = Object.keys(galleryAnalysisInput ?? {}).length;
  if (galleryContext.photos.length === 0 || analysisCount > 0) return;

  const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
  const internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
  fetch(`${baseUrl}/api/gallery-intelligence/${workspaceId}/analyze-coverage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Api-Key': internalKey,
      'X-Tenant-Id': workspaceId,
    },
    body: JSON.stringify({ tier: 'standard', maxImages: 20 }),
    signal: AbortSignal.timeout(5_000),
  }).catch(() => { /* fire-and-forget, errors suppressed */ });
}

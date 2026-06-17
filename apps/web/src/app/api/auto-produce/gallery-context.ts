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
  isStockGalleryPhotoUrl,
  isUsableGalleryPhotoUrl,
} from '@/lib/media-url';
import { mergeSectorGallerySeed, SYNTHETIC_GALLERY_MIN } from '@/lib/sector-gallery-seed';
import { fetchRecentTemplateIds } from '@/lib/template-usage-tracker';
import { GIS_PROPOSE_THRESHOLD } from '@/lib/gallery-intelligence';

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
function parseBrandReferenceUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((u) => String(u).trim())
      .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((u) => String(u).trim())
          .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
      }
    } catch { /* ignore */ }
  }
  return [];
}

export async function fetchGalleryContext(
  workspaceId: string,
  brandCtxRaw: Record<string, unknown>,
  galleryAnalysisInput: Record<string, unknown> | null | undefined,
  brandBusinessType: string,
  opts?: { gisScore?: number | null },
): Promise<GalleryContext> {
  // ── Parse brand gallery photos ─────────────────────────────────────────
  const metaRaw = (galleryAnalysisInput ?? {}) as Record<string, GalleryPhotoMeta>;
  let refs: string[] = parseBrandReferenceUrls(brandCtxRaw.reference_image_urls);

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

  const refsBeforeSeed = [...refs];
  const analysisBeforeSeed = [...analysisKeys];
  const brandCrawlPhotos = candidates.filter((u) => !isStockGalleryPhotoUrl(u));
  const hasRealPhotos =
    refsBeforeSeed.some((u) => !isStockGalleryPhotoUrl(u))
    || analysisBeforeSeed.some((u) => !isStockGalleryPhotoUrl(u));
  const gisHigh =
    opts?.gisScore != null && opts.gisScore >= GIS_PROPOSE_THRESHOLD;

  // GIS ≥ 70 + brand crawl photos → never pad with Unsplash sector seeds.
  if (gisHigh && brandCrawlPhotos.length > 0) {
    candidates = brandCrawlPhotos;
  } else if (candidates.length < SYNTHETIC_GALLERY_MIN) {
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

  let photos = health.urls;

  // Real venue uploads win — never mix Unsplash seeds when brand has own gallery.
  if (hasRealPhotos) {
    const realOnly = photos.filter((u) => !isStockGalleryPhotoUrl(u));
    if (realOnly.length) photos = realOnly;
  }

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

/**
 * Mission production gate — require vision tags/descriptions before semantic matching.
 * Runs analyze-coverage synchronously when coverage is insufficient.
 */
export async function ensureGalleryAnalysisForProduction(
  workspaceId: string,
  photos: string[],
  meta: Record<string, GalleryPhotoMeta>,
  hasRealPhotos: boolean,
  galleryAnalysisInput: Record<string, unknown> | null | undefined,
): Promise<{ meta: Record<string, GalleryPhotoMeta>; blocked?: string }> {
  if (!hasRealPhotos || photos.length === 0) {
    return { meta };
  }

  const { galleryAnalysisCoverageStats, enrichGalleryAnalysis } = await import(
    '@/lib/gallery-photo-matcher'
  );
  let enriched = meta;
  let stats = galleryAnalysisCoverageStats(photos, enriched);
  if (stats.sufficient) {
    return { meta: enriched };
  }

  const baseUrl = process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
  const internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

  try {
    console.log(
      `[gallery-context:${workspaceId}] analysis coverage ${stats.analyzed}/${stats.total} — running analyze-coverage`,
    );
    const res = await fetch(`${baseUrl}/api/gallery-intelligence/${workspaceId}/analyze-coverage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': internalKey,
        'X-Tenant-Id': workspaceId,
      },
      body: JSON.stringify({ tier: 'standard', maxImages: 30 }),
      signal: AbortSignal.timeout(240_000),
    });
    if (!res.ok) {
      return {
        meta: enriched,
        blocked: 'Galeri analizi tamamlanamadı — caption eşleşmesi için önce galeriyi analiz edin',
      };
    }
    const data = (await res.json()) as { analysis?: Record<string, GalleryPhotoMeta> };
    const merged = {
      ...((galleryAnalysisInput ?? {}) as Record<string, GalleryPhotoMeta>),
      ...(data.analysis ?? {}),
    };
    enriched = enrichGalleryAnalysis(merged);
    stats = galleryAnalysisCoverageStats(photos, enriched);
    if (!stats.sufficient) {
      return {
        meta: enriched,
        blocked:
          `Galeri analizi yetersiz (${stats.analyzed}/${stats.total} foto etiketli). ` +
          'Marka → Galeri Analizi çalıştırın, sonra tekrar üretin.',
      };
    }
    return { meta: enriched };
  } catch (err) {
    console.warn(`[gallery-context:${workspaceId}] analyze-coverage failed`, err);
    return {
      meta: enriched,
      blocked: 'Galeri analizi zaman aşımı — caption eşleşmesi için analiz gerekli',
    };
  }
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

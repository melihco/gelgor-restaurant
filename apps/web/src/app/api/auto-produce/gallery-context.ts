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
  stripStockGalleryUrls,
} from '@/lib/media-url';
import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { fetchRecentTemplateIds } from '@/lib/template-usage-tracker';
import {
  filterGalleryAnalysisKeys,
  parseBrandReferenceUrls,
} from '@/lib/gallery-upload';

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
  opts?: { gisScore?: number | null },
): Promise<GalleryContext> {
  // ── Parse brand gallery photos ─────────────────────────────────────────
  const metaRaw = (galleryAnalysisInput ?? {}) as Record<string, GalleryPhotoMeta>;
  let refs: string[] = parseBrandReferenceUrls(brandCtxRaw.reference_image_urls);

  const analysisKeys = filterGalleryAnalysisKeys(metaRaw as Record<string, unknown>);
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

  // Never pad with Unsplash — only crawl + manual uploads.
  if (brandCrawlPhotos.length > 0) {
    candidates = brandCrawlPhotos;
  } else {
    candidates = stripStockGalleryUrls(candidates);
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
async function fetchPersistedGalleryAnalysis(
  workspaceId: string,
): Promise<Record<string, GalleryPhotoMeta>> {
  const res = await fetchCrewBackendJson<Record<string, GalleryPhotoMeta>>(
    `/api/v1/brand-context/${workspaceId}/gallery-analysis`,
    { workspaceId, timeoutMs: 20_000 },
  );
  if (!res.ok || !res.data || typeof res.data !== 'object') {
    return {};
  }
  return res.data;
}

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

  const baseUrl = getNextjsInternalOrigin();
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
    const data = (await res.json()) as {
      analysis?: Record<string, GalleryPhotoMeta>;
      newlyAnalyzed?: number;
      complete?: boolean;
    };
    const persisted = await fetchPersistedGalleryAnalysis(workspaceId);
    const merged = {
      ...((galleryAnalysisInput ?? {}) as Record<string, GalleryPhotoMeta>),
      ...persisted,
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

  const baseUrl = getNextjsInternalOrigin();
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

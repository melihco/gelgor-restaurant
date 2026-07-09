/**
 * Tracks which brand gallery photos are already used per Instagram post type.
 * Source of truth: Nexus OutputArtifacts (pending + approved, not rejected).
 */
import { isUsableGalleryPhotoUrl } from '@/lib/media-url';

export type PostTypeBucket = 'feed' | 'story' | 'reel' | 'carousel';

export interface UsedGalleryUsage {
  byType: Record<PostTypeBucket, string[]>;
  /** Real cross-mission usage frequency per normalized gallery URL. */
  countsByUrl?: Record<string, number>;
}

const EMPTY_USAGE: UsedGalleryUsage = {
  byType: { feed: [], story: [], reel: [], carousel: [] },
  countsByUrl: {},
};

/** Per prior-use penalty in semantic ranking — higher spreads gallery diversity. */
export const GALLERY_USAGE_COUNT_PENALTY = 12;

/** Cross post-type usage counts — drives matcher diversity (multi-tenant). */
export function buildGlobalGalleryUsageCounts(
  usage: UsedGalleryUsage,
): ReadonlyMap<string, number> {
  if (usage.countsByUrl && Object.keys(usage.countsByUrl).length > 0) {
    return new Map(
      Object.entries(usage.countsByUrl).map(([url, count]) => [
        normalizeGalleryUrl(url),
        Number.isFinite(count) ? Number(count) : 0,
      ]),
    );
  }
  const counts = new Map<string, number>();
  for (const bucket of Object.values(usage.byType)) {
    for (const url of bucket) {
      const base = normalizeGalleryUrl(url);
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
  }
  return counts;
}

export function getGlobalGalleryUsageCount(
  counts: ReadonlyMap<string, number> | undefined,
  url: string,
): number {
  if (!counts || !url) return 0;
  return counts.get(normalizeGalleryUrl(url)) ?? 0;
}

export function normalizeGalleryUrl(url: string): string {
  return (url.split('?')[0] ?? url).trim();
}

export function kindToPostType(kind: string): PostTypeBucket {
  const k = kind.toLowerCase();
  if (k.includes('carousel')) return 'carousel';
  if (k.includes('reel')) return 'reel';
  if (k.includes('story') || k.includes('canvas') || k.includes('event') || k.includes('announcement')) {
    return 'story';
  }
  return 'feed';
}

export function contentTypeToPostType(contentType: string): PostTypeBucket {
  const ct = contentType.toLowerCase();
  if (ct.includes('carousel')) return 'carousel';
  if (ct.includes('reel')) return 'reel';
  if (ct.includes('story') || ct.includes('canvas')) return 'story';
  return 'feed';
}

function isRejectedReviewStatus(status: unknown): boolean {
  const s = String(status ?? '').toLowerCase();
  return s === '2' || s === 'rejected' || s === '3' || s.includes('revision');
}

function parseJsonRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function pushUrl(set: Set<string>, url: unknown): void {
  if (typeof url !== 'string' || !isUsableGalleryPhotoUrl(url)) return;
  set.add(normalizeGalleryUrl(url));
}

function resolvePostType(meta: Record<string, unknown>, content: Record<string, unknown>): PostTypeBucket {
  const kind = String(meta.kind ?? content.kind ?? '');
  if (kind) return kindToPostType(kind);
  const ct = String(meta.contentType ?? content.contentType ?? content.content_type ?? 'feed');
  return contentTypeToPostType(ct);
}

/** Returns true for URLs that are clearly AI-generated/external — not a venue gallery photo. */
function looksGenerated(url: string): boolean {
  return (
    url.includes('oaidalleapiprodscus') ||  // OpenAI DALL-E CDN
    url.includes('r2.dev') ||               // Cloudflare R2 (enhanced outputs)
    url.includes('cdn.creatomate') ||
    url.includes('storage.googleapis.com') ||
    url.includes('blob.core.windows.net') ||
    url.includes('runway') ||
    url.includes('fal.ai')
  );
}

/** Extract source gallery URLs (not enhanced R2 outputs) from a Nexus artifact. */
export function extractGalleryUrlsFromArtifact(
  artifact: Record<string, unknown>,
): { postType: PostTypeBucket; urls: string[] } | null {
  if (isRejectedReviewStatus(artifact.reviewStatus ?? artifact.ReviewStatus)) {
    return null;
  }

  const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
  const content = parseJsonRecord(artifact.content ?? artifact.Content);
  const postType = resolvePostType(meta, content);

  const urls = new Set<string>();

  // Primary: explicit gallery source fields (always safe to track)
  pushUrl(urls, meta.reference_photo_url);
  pushUrl(urls, content.reference_photo_url);
  pushUrl(urls, meta.selected_gallery_url);
  pushUrl(urls, content.selected_gallery_url);

  const vps = parseJsonRecord(meta.visual_production_spec ?? content.visual_production_spec);
  pushUrl(urls, vps.selected_gallery_url);

  const galleryList = meta.gallery_photo_urls ?? content.gallery_photo_urls;
  if (Array.isArray(galleryList)) {
    for (const u of galleryList) pushUrl(urls, u);
  }

  const carouselUrls = meta.carousel_urls ?? content.carousel_urls;
  if (Array.isArray(carouselUrls)) {
    for (const u of carouselUrls) pushUrl(urls, u);
  }

  // Secondary: imageUrl / contentUrl — only track if they look like real venue photos.
  // Skip AI-generated / CDN URLs to avoid over-excluding the gallery.
  const imageUrlCandidate = String(meta.imageUrl ?? content.imageUrl ?? artifact.contentUrl ?? '');
  if (imageUrlCandidate && !looksGenerated(imageUrlCandidate)) {
    pushUrl(urls, imageUrlCandidate);
  }

  if (urls.size === 0) return null;
  return { postType, urls: [...urls] };
}

export function buildGalleryUsageFromArtifacts(
  artifacts: Record<string, unknown>[],
): UsedGalleryUsage {
  const byType: Record<PostTypeBucket, Set<string>> = {
    feed: new Set(),
    story: new Set(),
    reel: new Set(),
    carousel: new Set(),
  };
  const countsByUrl = new Map<string, number>();

  for (const artifact of artifacts) {
    const extracted = extractGalleryUrlsFromArtifact(artifact);
    if (!extracted) continue;
    for (const url of extracted.urls) {
      const base = normalizeGalleryUrl(url);
      byType[extracted.postType].add(base);
      countsByUrl.set(base, (countsByUrl.get(base) ?? 0) + 1);
    }
  }

  return {
    byType: {
      feed: [...byType.feed],
      story: [...byType.story],
      reel: [...byType.reel],
      carousel: [...byType.carousel],
    },
    countsByUrl: Object.fromEntries(countsByUrl.entries()),
  };
}

export function isGalleryUrlUsedForPostType(
  usage: UsedGalleryUsage,
  url: string,
  postType: PostTypeBucket,
): boolean {
  const base = normalizeGalleryUrl(url);
  return usage.byType[postType].some(u => normalizeGalleryUrl(u) === base);
}

export function getExcludeUrlsForPostType(
  usage: UsedGalleryUsage,
  postType: PostTypeBucket,
  batchUsed: string[] = [],
): string[] {
  const seen = new Set<string>();
  for (const u of usage.byType[postType]) seen.add(normalizeGalleryUrl(u));
  for (const u of batchUsed) seen.add(normalizeGalleryUrl(u));
  return [...seen];
}

/** All gallery URLs already used in this mission run or prior artifacts (any format). */
export function getMissionWideExcludeUrls(
  usage: UsedGalleryUsage,
  batchUsedByType: Record<PostTypeBucket, string[]>,
  batchUsedMission: Iterable<string> = [],
): string[] {
  const seen = new Set<string>();
  for (const bucket of Object.values(usage.byType)) {
    for (const u of bucket) seen.add(normalizeGalleryUrl(u));
  }
  for (const bucket of Object.values(batchUsedByType)) {
    for (const u of bucket) seen.add(normalizeGalleryUrl(u));
  }
  for (const u of batchUsedMission) seen.add(normalizeGalleryUrl(u));
  return [...seen];
}

export function isGalleryUrlUsedInMission(
  usage: UsedGalleryUsage,
  batchUsedByType: Record<PostTypeBucket, string[]>,
  batchUsedMission: Iterable<string>,
  url: string,
): boolean {
  const base = normalizeGalleryUrl(url);
  for (const u of batchUsedMission) {
    if (normalizeGalleryUrl(u) === base) return true;
  }
  for (const type of ['feed', 'story', 'reel', 'carousel'] as PostTypeBucket[]) {
    if (isGalleryUrlUsedForPostType(usage, url, type)) return true;
    if (batchUsedByType[type].some((u) => normalizeGalleryUrl(u) === base)) return true;
  }
  return false;
}

export function markGalleryUrlUsedForPostType(
  usage: UsedGalleryUsage,
  url: string,
  postType: PostTypeBucket,
): void {
  if (!isUsableGalleryPhotoUrl(url)) return;
  const base = normalizeGalleryUrl(url);
  const bucket = usage.byType[postType];
  if (!bucket.some(u => normalizeGalleryUrl(u) === base)) {
    bucket.push(url);
  }
}

/** Seed in-flight batch tracker from persisted artifact usage (same mission re-runs). */
export function seedBatchUsedByTypeFromUsage(
  usage: UsedGalleryUsage,
  batchUsedByType: Record<PostTypeBucket, string[]>,
): void {
  for (const type of ['feed', 'story', 'reel', 'carousel'] as PostTypeBucket[]) {
    for (const url of usage.byType[type]) {
      const base = normalizeGalleryUrl(url);
      if (!batchUsedByType[type].some((u) => normalizeGalleryUrl(u) === base)) {
        batchUsedByType[type].push(url);
      }
    }
  }
}

export function isGalleryUrlUsedInBatch(
  usage: UsedGalleryUsage,
  batchUsedByType: Record<PostTypeBucket, string[]>,
  url: string,
  postType: PostTypeBucket,
): boolean {
  const base = normalizeGalleryUrl(url);
  if (isGalleryUrlUsedForPostType(usage, url, postType)) return true;
  return batchUsedByType[postType].some((u) => normalizeGalleryUrl(u) === base);
}

function artifactMissionId(artifact: Record<string, unknown>): string {
  const meta = parseJsonRecord(artifact.metadata ?? artifact.Metadata);
  const content = parseJsonRecord(artifact.content ?? artifact.Content);
  return String(
    meta.mission_id ?? meta.missionId ?? content.mission_id ?? content.missionId ?? '',
  ).trim();
}

/** Gallery source URLs already used by artifacts in one mission (sibling slot dedup). */
export function collectMissionGalleryUrls(
  artifacts: Record<string, unknown>[],
  missionId: string,
): string[] {
  const mid = missionId.trim();
  if (!mid) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const artifact of artifacts) {
    if (artifactMissionId(artifact) !== mid) continue;
    const extracted = extractGalleryUrlsFromArtifact(artifact);
    if (!extracted) continue;
    for (const url of extracted.urls) {
      const base = normalizeGalleryUrl(url);
      if (seen.has(base)) continue;
      seen.add(base);
      out.push(url);
    }
  }
  return out;
}

export async function fetchWorkspaceArtifacts(
  workspaceId: string,
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${nexusApi}/api/artifacts`, {
      headers: {
        'X-Tenant-Id': workspaceId,
        'X-Internal-Api-Key': internalKey,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const artifacts = (await res.json()) as Record<string, unknown>[];
    return Array.isArray(artifacts) ? artifacts : [];
  } catch {
    return [];
  }
}

export async function fetchUsedGalleryImages(
  workspaceId: string,
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<UsedGalleryUsage> {
  const artifacts = await fetchWorkspaceArtifacts(workspaceId, nexusApi, internalKey);
  return buildGalleryUsageFromArtifacts(artifacts);
}

export async function fetchGalleryProductionUsage(
  workspaceId: string,
  missionId?: string | null,
  nexusApi = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5050').replace(/\/$/, ''),
  internalKey = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key',
): Promise<{ usage: UsedGalleryUsage; missionSiblingUrls: string[] }> {
  const artifacts = await fetchWorkspaceArtifacts(workspaceId, nexusApi, internalKey);
  const usage = buildGalleryUsageFromArtifacts(artifacts);
  const missionSiblingUrls = missionId?.trim()
    ? collectMissionGalleryUrls(artifacts, missionId.trim())
    : [];
  return { usage, missionSiblingUrls };
}

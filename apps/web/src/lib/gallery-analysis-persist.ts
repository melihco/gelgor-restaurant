/**
 * Persist rule-enriched gallery analysis to the Python brand-context store.
 * Zero OpenAI cost — derives tags from existing descriptions.
 */
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { enrichGalleryAnalysis } from '@/lib/gallery-photo-matcher';
import { serverConfig } from '@/lib/server-config';

const PYTHON_BASE = serverConfig.crewBackend.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

export function galleryAnalysisNeedsTagPersist(
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): boolean {
  return Object.values(galleryAnalysis).some((meta) => {
    const desc = String(meta.description ?? '').trim();
    if (!desc) return false;
    const tagCount = (meta.contentTags ?? []).length;
    const bestForCount = (meta.bestFor ?? []).length;
    return tagCount <= 2 || bestForCount === 0;
  });
}

export async function persistEnrichedGalleryAnalysis(
  workspaceId: string,
  galleryAnalysis: Record<string, GalleryPhotoMeta>,
): Promise<{ saved: number; enriched: number }> {
  const enriched = enrichGalleryAnalysis(galleryAnalysis);
  let enrichedCount = 0;
  for (const url of Object.keys(enriched)) {
    const orig = galleryAnalysis[url];
    const upd = enriched[url];
    if (
      (upd?.contentTags as string[])?.length !== (orig?.contentTags as string[])?.length
      || (upd?.bestFor as string[])?.length !== (orig?.bestFor as string[])?.length
    ) {
      enrichedCount += 1;
    }
  }
  if (enrichedCount === 0) {
    return { saved: 0, enriched: 0 };
  }

  const results = Object.entries(enriched).map(([url, meta]) => ({
    url,
    description: meta.description ?? '',
    contentTags: meta.contentTags ?? [],
    bestFor: meta.bestFor ?? [],
    notGoodFor: meta.notGoodFor ?? [],
    mood: meta.mood ?? '',
    hasPeople: meta.hasPeople ?? false,
    hasText: meta.hasText ?? false,
    isLogo: meta.isLogo ?? false,
    suggestedAssetType: meta.suggestedAssetType ?? 'venue_reference',
    usageContext: meta.usageContext ?? '',
    qualityScore: meta.qualityScore ?? null,
    analyzedAt: meta.analyzedAt ?? null,
  }));

  const saveRes = await fetch(
    `${PYTHON_BASE}/api/v1/brand-context/${workspaceId}/gallery-analysis`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify({ results }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!saveRes.ok) {
    const errText = await saveRes.text().catch(() => '');
    throw new Error(`gallery-analysis persist failed ${saveRes.status}: ${errText.slice(0, 200)}`);
  }

  return { saved: results.length, enriched: enrichedCount };
}

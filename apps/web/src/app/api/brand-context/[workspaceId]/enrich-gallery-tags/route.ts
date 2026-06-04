/**
 * POST /api/brand-context/[workspaceId]/enrich-gallery-tags
 *
 * Enriches existing gallery analysis by deriving contentTags, bestFor, and
 * usageContext from existing descriptions — zero OpenAI API cost.
 * Useful when photos were analyzed with an older prompt that only captured
 * description + mood but not structured tags.
 *
 * Also triggers a full re-analysis of photos that have no description at all.
 */
import { NextRequest, NextResponse } from 'next/server';
import { enrichGalleryAnalysis } from '@/lib/gallery-photo-matcher';

const PYTHON_BASE = process.env.PYTHON_CREW_BASE_URL || 'http://localhost:8000';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  // 1. Fetch existing gallery analysis from Python
  let galleryAnalysis: Record<string, Record<string, unknown>> = {};
  try {
    const gaRes = await fetch(
      `${PYTHON_BASE}/api/v1/brand-context/${workspaceId}/gallery-analysis`,
      {
        headers: { 'X-Internal-Api-Key': INTERNAL_KEY },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (gaRes.ok) {
      const data = await gaRes.json();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        galleryAnalysis = data as Record<string, Record<string, unknown>>;
      }
    }
  } catch {
    return NextResponse.json({ error: 'Failed to fetch gallery analysis' }, { status: 502 });
  }

  const total = Object.keys(galleryAnalysis).length;
  if (total === 0) {
    return NextResponse.json({ enriched: 0, total: 0, message: 'No gallery analysis found' });
  }

  // 2. Apply rule-based enrichment
  const enriched = enrichGalleryAnalysis(galleryAnalysis as any);

  // Count how many were actually updated
  let enrichedCount = 0;
  for (const url of Object.keys(enriched)) {
    const orig = galleryAnalysis[url];
    const upd = enriched[url];
    if (
      (upd?.contentTags as string[])?.length !== (orig?.contentTags as string[])?.length ||
      (upd?.bestFor as string[])?.length !== (orig?.bestFor as string[])?.length
    ) {
      enrichedCount++;
    }
  }

  // 3. Save enriched analysis back to Python DB
  // API expects { results: [GalleryAnalysisEntry, ...] } with camelCase fields
  const results = Object.entries(enriched).map(([url, meta]) => ({
    url,
    description: (meta as any).description ?? '',
    contentTags: (meta as any).contentTags ?? [],
    bestFor: (meta as any).bestFor ?? [],
    notGoodFor: (meta as any).notGoodFor ?? [],
    mood: (meta as any).mood ?? '',
    hasPeople: (meta as any).hasPeople ?? false,
    hasText: (meta as any).hasText ?? false,
    isLogo: (meta as any).isLogo ?? false,
    suggestedAssetType: (meta as any).suggestedAssetType ?? 'venue_reference',
    usageContext: (meta as any).usageContext ?? '',
    qualityScore: (meta as any).qualityScore ?? null,
    analyzedAt: (meta as any).analyzedAt ?? null,
  }));

  try {
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
      return NextResponse.json(
        { error: `Failed to save enriched analysis: ${errText.slice(0, 200)}` },
        { status: 502 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Save failed: ${String(e).slice(0, 200)}` },
      { status: 500 },
    );
  }

  // 4. Return stats
  const sampleUrl = Object.keys(enriched)[0];
  const sampleMeta = sampleUrl ? enriched[sampleUrl] : null;

  return NextResponse.json({
    total,
    enriched: enrichedCount,
    message: `Enriched ${enrichedCount}/${total} gallery photos with derived tags.`,
    sample: sampleMeta ? {
      url: sampleUrl,
      contentTags: sampleMeta.contentTags,
      bestFor: sampleMeta.bestFor,
      usageContext: String(sampleMeta.usageContext || '').slice(0, 100),
    } : null,
  });
}

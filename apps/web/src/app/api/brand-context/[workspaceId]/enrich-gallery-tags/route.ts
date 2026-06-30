/**
 * POST /api/brand-context/[workspaceId]/enrich-gallery-tags
 *
 * Enriches existing gallery analysis by deriving contentTags, bestFor, and
 * usageContext from existing descriptions — zero OpenAI API cost.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { enrichGalleryAnalysis } from '@/lib/gallery-photo-matcher';
import {
  galleryAnalysisNeedsTagPersist,
  persistEnrichedGalleryAnalysis,
} from '@/lib/gallery-analysis-persist';
import { serverConfig } from '@/lib/server-config';

const PYTHON_BASE = serverConfig.crewBackend.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;

  let galleryAnalysis: Record<string, GalleryPhotoMeta> = {};
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
        galleryAnalysis = data as Record<string, GalleryPhotoMeta>;
      }
    }
  } catch {
    return NextResponse.json({ error: 'Failed to fetch gallery analysis' }, { status: 502 });
  }

  const total = Object.keys(galleryAnalysis).length;
  if (total === 0) {
    return NextResponse.json({ enriched: 0, total: 0, message: 'No gallery analysis found' });
  }

  if (!galleryAnalysisNeedsTagPersist(galleryAnalysis)) {
    const enriched = enrichGalleryAnalysis(galleryAnalysis);
    const sampleUrl = Object.keys(enriched)[0];
    const sampleMeta = sampleUrl ? enriched[sampleUrl] : null;
    return NextResponse.json({
      total,
      enriched: 0,
      message: 'Gallery tags already sufficient — no persist needed.',
      sample: sampleMeta ? {
        url: sampleUrl,
        contentTags: sampleMeta.contentTags,
        bestFor: sampleMeta.bestFor,
      } : null,
    });
  }

  try {
    const { saved, enriched } = await persistEnrichedGalleryAnalysis(workspaceId, galleryAnalysis);
    const sampleEnriched = enrichGalleryAnalysis(galleryAnalysis);
    const sampleUrl = Object.keys(sampleEnriched)[0];
    const sampleMeta = sampleUrl ? sampleEnriched[sampleUrl] : null;
    return NextResponse.json({
      total: saved,
      enriched,
      message: `Enriched ${enriched}/${total} gallery photos with derived tags.`,
      sample: sampleMeta ? {
        url: sampleUrl,
        contentTags: sampleMeta.contentTags,
        bestFor: sampleMeta.bestFor,
        usageContext: String(sampleMeta.usageContext || '').slice(0, 100),
      } : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Save failed: ${String(e).slice(0, 200)}` },
      { status: 500 },
    );
  }
}

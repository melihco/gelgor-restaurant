import { NextRequest, NextResponse } from 'next/server';
import {
  type GalleryPhotoMeta,
  MIN_ACCEPT_SCORE,
  rankPhotosForContent,
  buildGalleryLookup,
} from '@/lib/gallery-photo-matcher';
import { normalizeGalleryUrl } from '@/lib/gallery-usage-tracker';

export const runtime = 'nodejs';
export const maxDuration = 15;

interface MatchRequest {
  caption: string;
  headline?: string;
  mood?: string;
  contentType?: string;
  visualDirection?: string;
  templateUseCase?: string;
  excludeUrls?: string[];
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  /** When set, only rank photos whose display URL is in this list */
  candidateUrls?: string[];
  minScore?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: MatchRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    caption,
    headline,
    mood,
    contentType,
    visualDirection,
    templateUseCase,
    excludeUrls,
    galleryAnalysis,
    candidateUrls,
    minScore,
  } = body;

  if (!caption && !headline) {
    return NextResponse.json({ error: 'caption or headline required' }, { status: 400 });
  }
  if (!galleryAnalysis || Object.keys(galleryAnalysis).length === 0) {
    return NextResponse.json({ matches: [], fallback: true }, { status: 200 });
  }

  const excludeBases = new Set((excludeUrls ?? []).map(u => normalizeGalleryUrl(u)));

  const pool = candidateUrls?.length
    ? candidateUrls.filter(u => !excludeBases.has(normalizeGalleryUrl(u)))
    : Object.keys(galleryAnalysis).filter(u => !excludeBases.has(normalizeGalleryUrl(u)));

  if (pool.length === 0) {
    return NextResponse.json({ matches: [], fallback: true }, { status: 200 });
  }

  const lookup = buildGalleryLookup(galleryAnalysis, pool);
  const matches = rankPhotosForContent(
    {
      caption: caption ?? '',
      headline,
      mood,
      contentType,
      visualDirection,
      templateUseCase,
    },
    pool,
    lookup,
    excludeBases,
    galleryAnalysis,
  );

  const threshold = minScore ?? MIN_ACCEPT_SCORE;
  const accepted = matches.filter(m => m.score >= threshold);

  return NextResponse.json({
    matches: accepted.length > 0 ? accepted : matches.slice(0, 5),
    method: 'deterministic',
    minScore: threshold,
  });
}

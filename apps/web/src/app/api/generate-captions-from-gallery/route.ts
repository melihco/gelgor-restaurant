import { NextRequest, NextResponse } from 'next/server';
import type { GalleryPhotoMeta } from '@/lib/gallery-photo-matcher';
import { generateGalleryCaptionsWithGpt } from '@/lib/gallery-caption-generator';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface CaptionGenRequest {
  unusedPhotoUrls: string[];
  galleryAnalysis: Record<string, GalleryPhotoMeta>;
  brandName?: string;
  brandDescription?: string;
  industry?: string;
  existingCaptions?: string[];
  language?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 });
  }

  let body: CaptionGenRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    unusedPhotoUrls, galleryAnalysis,
    brandName, brandDescription, industry,
    existingCaptions, language = 'Turkish',
  } = body;

  if (!unusedPhotoUrls?.length) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
  if (!galleryAnalysis || Object.keys(galleryAnalysis).length === 0) {
    return NextResponse.json({ suggestions: [], error: 'No gallery analysis data' }, { status: 200 });
  }

  const suggestions = await generateGalleryCaptionsWithGpt({
    photoUrls: unusedPhotoUrls,
    galleryAnalysis,
    brandName,
    brandDescription,
    industry,
    existingCaptions,
    language,
  });

  return NextResponse.json({ suggestions });
}

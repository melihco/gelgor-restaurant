/**
 * GET /api/music-tracks?mood=cinematic
 *
 * Returns a royalty-free music track URL for the given mood.
 *
 * Strategy:
 *  1. If PIXABAY_API_KEY is set → query Pixabay Music API for a random track in the right category
 *  2. Otherwise → return a curated static track from the catalog
 *
 * Pixabay tracks are CC0 — free for commercial use, no attribution required.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  MUSIC_CATALOG,
  getMusicTrack,
  type MusicMood,
} from '@/lib/music-catalog';
import { serverConfig } from '@/lib/server-config';

const PIXABAY_MUSIC_API = 'https://pixabay.com/api/videos/music/';

async function fetchPixabayTrack(
  category: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const url = new URL(PIXABAY_MUSIC_API);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('category', category);
    url.searchParams.set('per_page', '5');

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { hits?: { audio?: string }[] };

    const hits = data.hits ?? [];
    if (hits.length === 0) return null;

    // Pick a random track from the results for variety
    const pick = hits[Math.floor(Math.random() * hits.length)];
    return pick?.audio ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const mood = (req.nextUrl.searchParams.get('mood') ?? 'cinematic') as MusicMood;

  // First try Pixabay API if configured
  const pixabayKey = serverConfig.pixabay.apiKey;
  if (pixabayKey) {
    const catalogEntry = getMusicTrack(mood);
    const category = catalogEntry?.pixabayCategory ?? 'cinematic';
    const pixabayUrl = await fetchPixabayTrack(category, pixabayKey);
    if (pixabayUrl) {
      return NextResponse.json({
        mood,
        url: pixabayUrl,
        source: 'pixabay-live',
        bpm: catalogEntry?.bpm ?? 90,
      });
    }
  }

  // Fallback to static catalog
  const track = getMusicTrack(mood);
  if (!track) {
    return NextResponse.json({ mood: 'none', url: null, source: 'none' });
  }

  return NextResponse.json({
    mood,
    url: track.url,
    source: 'catalog',
    bpm: track.bpm,
  });
}

/** List all available moods */
export async function OPTIONS() {
  return NextResponse.json({
    moods: MUSIC_CATALOG.map((t) => ({
      mood: t.mood,
      label: t.label,
      emoji: t.emoji,
    })),
  });
}

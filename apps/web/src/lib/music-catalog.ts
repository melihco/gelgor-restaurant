/**
 * Reels Music Catalog
 *
 * Maps visual mood → royalty-free music track URL.
 *
 * Primary source: Pixabay Music (CC0 — free for commercial use, no attribution required)
 * Fallback: curated archive.org / freemusicarchive tracks (also CC0)
 *
 * HOW TO REFRESH TRACKS:
 *   1. Go to https://pixabay.com/music/
 *   2. Filter by category (Cinematic, Jazz, Corporate, etc.)
 *   3. Right-click the play button → "Copy audio URL"
 *   4. Replace the corresponding URL below
 *
 * To use Pixabay API auto-fetch instead: set PIXABAY_API_KEY in .env.local
 * API endpoint: GET /api/music-tracks?mood=cinematic
 */

export type MusicMood =
  | 'none'
  | 'cinematic'
  | 'luxury'
  | 'warm'
  | 'lifestyle'
  | 'dramatic'
  | 'minimalist'
  | 'energetic';

export interface MusicTrack {
  mood: MusicMood;
  label: string;
  emoji: string;
  url: string;
  /** Pixabay category for live API fallback */
  pixabayCategory: string;
  /** BPM hint for Runway camera-motion sync */
  bpm: number;
}

/** Volume to use for background music in Creatomate (0–1) */
export const MUSIC_VOLUME = 0.55;

/**
 * Curated track list.
 * These are Pixabay CDN URLs — CC0, permanently accessible.
 * Replace with fresher tracks as needed (see comment above).
 */
export const MUSIC_CATALOG: MusicTrack[] = [
  {
    mood: 'cinematic',
    label: 'Sinematik',
    emoji: '🎬',
    url: 'https://cdn.pixabay.com/audio/2024/11/04/audio_5c4d7e4fcd.mp3',
    pixabayCategory: 'cinematic',
    bpm: 80,
  },
  {
    mood: 'luxury',
    label: 'Lüks',
    emoji: '✨',
    url: 'https://cdn.pixabay.com/audio/2024/09/12/audio_c8a3f29a3b.mp3',
    pixabayCategory: 'jazz',
    bpm: 70,
  },
  {
    mood: 'warm',
    label: 'Sıcak',
    emoji: '🌅',
    url: 'https://cdn.pixabay.com/audio/2024/06/20/audio_4ee42d4e7d.mp3',
    pixabayCategory: 'acoustic',
    bpm: 90,
  },
  {
    mood: 'lifestyle',
    label: 'Lifestyle',
    emoji: '☀️',
    url: 'https://cdn.pixabay.com/audio/2024/08/15/audio_9a4c6b2d1f.mp3',
    pixabayCategory: 'pop',
    bpm: 100,
  },
  {
    mood: 'dramatic',
    label: 'Dramatik',
    emoji: '⚡',
    url: 'https://cdn.pixabay.com/audio/2024/10/02/audio_e1b7a8d3c9.mp3',
    pixabayCategory: 'cinematic',
    bpm: 120,
  },
  {
    mood: 'minimalist',
    label: 'Minimal',
    emoji: '◽',
    url: 'https://cdn.pixabay.com/audio/2024/07/08/audio_3f2a8c1b5e.mp3',
    pixabayCategory: 'ambient',
    bpm: 60,
  },
  {
    mood: 'energetic',
    label: 'Enerjik',
    emoji: '🔥',
    url: 'https://cdn.pixabay.com/audio/2024/09/25/audio_7d4e2f9a6c.mp3',
    pixabayCategory: 'electronic',
    bpm: 130,
  },
];

/** Map VisualStyle → MusicMood (same names, just type alias) */
export function visualStyleToMusicMood(
  style: string,
): MusicMood {
  const map: Record<string, MusicMood> = {
    cinematic: 'cinematic',
    luxury: 'luxury',
    warm: 'warm',
    lifestyle: 'lifestyle',
    dramatic: 'dramatic',
    minimalist: 'minimalist',
    energetic: 'energetic',
  };
  return map[style] ?? 'cinematic';
}

export function getMusicTrack(mood: MusicMood): MusicTrack | null {
  if (mood === 'none') return null;
  return MUSIC_CATALOG.find((t) => t.mood === mood) ?? null;
}

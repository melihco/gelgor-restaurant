import {
  STORY_MUSIC_CATEGORY_LABELS,
  STORY_MUSIC_TRACKS,
  type StoryMusicCategory,
  type StoryMusicTrack,
} from './story-music-tracks.generated';

export interface StoryMusicOption {
  id: string;
  label: string;
  /** Remotion / local static file path */
  file?: string;
  /** External royalty-free URL */
  url?: string;
  category: StoryMusicCategory;
  categoryLabel: string;
  /** Browser preview — proxied through Next for CORS */
  previewPath: string;
}

/** Legacy local files (fallback + backward compat) */
const LEGACY_LOCAL: Record<string, { file: string; label: string; category: StoryMusicCategory }> = {
  'deep house': { file: 'audio/deep-house.mp3', label: 'Deep House', category: 'dance' },
  'lounge jazz': { file: 'audio/lounge-jazz.mp3', label: 'Lounge Jazz', category: 'chill' },
  'beach pop': { file: 'audio/beach-pop.mp3', label: 'Beach Pop', category: 'summer' },
  'ambient chill': { file: 'audio/ambient-chill.mp3', label: 'Ambient Chill', category: 'chill' },
  'acoustic folk': { file: 'audio/acoustic-folk.mp3', label: 'Acoustic Folk', category: 'chill' },
  'upbeat commercial': { file: 'audio/upbeat.mp3', label: 'Upbeat Commercial', category: 'pop' },
  'latin tropical': { file: 'audio/beach-pop.mp3', label: 'Latin Tropical', category: 'summer' },
};

const TRACK_BY_ID = new Map<string, StoryMusicTrack>(
  STORY_MUSIC_TRACKS.map((t) => [t.id, t]),
);

export const STORY_MUSIC_CATALOG: Record<string, { file?: string; url?: string; label: string; category: StoryMusicCategory }> = {
  ...Object.fromEntries(
    STORY_MUSIC_TRACKS.map((t) => [t.id, { url: t.url, label: t.label, category: t.category }]),
  ),
  ...Object.fromEntries(
    Object.entries(LEGACY_LOCAL).map(([id, v]) => [id, v]),
  ),
};

/** Marka ayarları UI — 100 modern / eğlenceli alternatif */
export const STORY_MUSIC_OPTIONS: StoryMusicOption[] = STORY_MUSIC_TRACKS.map((t) => ({
  id: t.id,
  label: t.label,
  url: t.url,
  category: t.category,
  categoryLabel: t.categoryLabel,
  previewPath: `/api/story-music/${encodeURIComponent(t.id)}`,
}));

export const STORY_MUSIC_CATEGORIES = (
  Object.keys(STORY_MUSIC_CATEGORY_LABELS) as StoryMusicCategory[]
).map((id) => ({ id, label: STORY_MUSIC_CATEGORY_LABELS[id] }));

const DEFAULT_TRACK_ID = STORY_MUSIC_TRACKS[0]?.id ?? 'mixaund-upbeat';

function storyMusicServeBaseUrl(): string {
  // Remotion headless render runs on a separate bundle port (3001+); never use window.origin.
  return (process.env.NEXTJS_INTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** Proxy URL — free-stock-music doğrudan link HTML döndürür; Remotion + tarayıcı proxy kullanır. */
export function storyMusicProxyUrl(trackId: string): string {
  return `${storyMusicServeBaseUrl()}/api/story-music/${encodeURIComponent(trackId)}`;
}

export function storyMusicPreviewPath(trackId: string): string {
  return `/api/story-music/${encodeURIComponent(trackId)}`;
}

function proxyUrlForTrack(track: StoryMusicTrack): string {
  return storyMusicProxyUrl(track.id);
}

export function findStoryMusicTrack(id: string | undefined | null): StoryMusicTrack | null {
  const key = String(id ?? '').trim();
  if (!key) return null;
  return TRACK_BY_ID.get(key) ?? TRACK_BY_ID.get(key.toLowerCase()) ?? null;
}

export interface StoryMusicLocalTrack {
  id: string;
  label: string;
  relativePath: string;
  category: StoryMusicCategory;
}

export type StoryMusicResolvedSource =
  | { type: 'remote'; track: StoryMusicTrack }
  | { type: 'local'; track: StoryMusicLocalTrack };

/** Preview/proxy route — remote catalog track or bundled legacy MP3 under public/. */
export function resolveStoryMusicSource(id: string | undefined | null): StoryMusicResolvedSource | null {
  const raw = String(id ?? '').trim();
  if (!raw) return null;

  const remote = TRACK_BY_ID.get(raw) ?? TRACK_BY_ID.get(raw.toLowerCase());
  if (remote?.url) return { type: 'remote', track: remote };

  const legacyKey = raw.toLowerCase();
  const legacy = LEGACY_LOCAL[legacyKey];
  if (legacy?.file) {
    return {
      type: 'local',
      track: {
        id: legacyKey,
        label: legacy.label,
        relativePath: legacy.file,
        category: legacy.category,
      },
    };
  }

  return null;
}

export function storyMusicLabel(moodId: string | undefined | null): string {
  const key = String(moodId ?? '').trim().toLowerCase();
  if (!key) return STORY_MUSIC_TRACKS[0]?.label ?? 'Story Music';

  const track = TRACK_BY_ID.get(key) ?? TRACK_BY_ID.get(moodId ?? '');
  if (track) return track.label;

  const legacy = LEGACY_LOCAL[key];
  if (legacy) return legacy.label;

  const catalog = STORY_MUSIC_CATALOG[key];
  if (catalog) return catalog.label;

  const partial = Object.entries(STORY_MUSIC_CATALOG).find(
    ([k]) => key.includes(k) || k.includes(key),
  );
  return partial?.[1].label ?? moodId ?? STORY_MUSIC_TRACKS[0]?.label ?? 'Story Music';
}

function publicStaticFile(relativePath: string): string {
  const base = storyMusicServeBaseUrl();
  return `${base}/${relativePath.replace(/^\//, '')}`;
}

function resolveLocalFile(key: string): string | null {
  const legacy = LEGACY_LOCAL[key];
  if (legacy) return publicStaticFile(legacy.file);

  const catalog = STORY_MUSIC_CATALOG[key];
  if (catalog?.file) return publicStaticFile(catalog.file);

  return null;
}

export function resolveStoryMusicUrl(audioMood: string | undefined | null): string | null {
  const raw = String(audioMood ?? '').trim();
  const key = raw.toLowerCase();

  if (!key) {
    const first = STORY_MUSIC_TRACKS[0];
    return first ? proxyUrlForTrack(first) : resolveLocalFile('ambient chill');
  }

  const track = TRACK_BY_ID.get(raw) ?? TRACK_BY_ID.get(key);
  if (track?.url) return proxyUrlForTrack(track);

  const catalog = STORY_MUSIC_CATALOG[key];
  if (catalog?.url) {
    const byId = TRACK_BY_ID.get(key) ?? TRACK_BY_ID.get(raw);
    if (byId) return proxyUrlForTrack(byId);
  }

  const local = resolveLocalFile(key);
  if (local) return local;

  const partialKey = Object.keys(STORY_MUSIC_CATALOG).find(
    (k) => key.includes(k) || k.includes(key),
  );
  if (partialKey) {
    const entry = STORY_MUSIC_CATALOG[partialKey]!;
    const partialTrack = TRACK_BY_ID.get(partialKey);
    if (partialTrack?.url) return proxyUrlForTrack(partialTrack);
    if (entry.file) return publicStaticFile(entry.file);
  }

  // Heuristic fallback → category-appropriate modern track
  if (/party|night|club|dj|dance|festival|house|edm/.test(key)) {
    const t = TRACK_BY_ID.get('peyruis-dancefloor') ?? STORY_MUSIC_TRACKS[0];
    return t ? proxyUrlForTrack(t) : null;
  }
  if (/beach|sea|summer|tropical|yaz|island/.test(key)) {
    const t = TRACK_BY_ID.get('surf-house-productions-island-breeze') ?? STORY_MUSIC_TRACKS[0];
    return t ? proxyUrlForTrack(t) : null;
  }
  if (/chill|relax|calm|peaceful|ambient|jazz|lounge/.test(key)) {
    return resolveLocalFile('ambient chill');
  }
  if (/commercial|corporate|upbeat|energetic|pop|fun/.test(key)) {
    const t = TRACK_BY_ID.get('mixaund-upbeat') ?? STORY_MUSIC_TRACKS[0];
    return t ? proxyUrlForTrack(t) : null;
  }
  if (/synth|cyber|neon|retro/.test(key)) {
    const t = TRACK_BY_ID.get('punch-deck-neon-drive') ?? STORY_MUSIC_TRACKS[0];
    return t ? proxyUrlForTrack(t) : null;
  }

  const fallback = STORY_MUSIC_TRACKS[0];
  return fallback ? proxyUrlForTrack(fallback) : resolveLocalFile('ambient chill');
}

export function normalizeStoryMusicId(raw: string | undefined | null): string {
  const key = String(raw ?? '').trim();
  if (!key) return DEFAULT_TRACK_ID;
  if (TRACK_BY_ID.has(key)) return key;
  if (LEGACY_LOCAL[key.toLowerCase()]) return key.toLowerCase();
  return DEFAULT_TRACK_ID;
}

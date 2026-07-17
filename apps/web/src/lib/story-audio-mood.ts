import { STORY_MUSIC_TRACKS } from './story-music-tracks.generated';

const DEFAULT_STORY_MUSIC_ID = STORY_MUSIC_TRACKS[0]?.id ?? 'surf-house-productions-island-breeze';

/** Max tracks kept in brand `audioMoodPool` (mission stories rotate through these). */
export const STORY_AUDIO_POOL_MAX = 8;

/**
 * Build the rotation pool: selected track first, then remaining pool entries.
 * Dedupes while preserving order.
 */
export function buildStoryAudioPool(input: {
  selected?: string | null;
  pool?: string[] | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const id = String(raw ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  push(input.selected);
  for (const id of input.pool ?? []) push(id);
  return out.slice(0, STORY_AUDIO_POOL_MAX);
}

/**
 * Resolve story/reel BGM track id.
 *
 * Priority:
 * 1. Per-artifact explicit stamp (`story_audio_mood` written at produce time)
 * 2. Brand pool rotation by `slotIndex` (selected is seed #0, not a hard lock)
 * 3. Sector heuristic / catalog default
 */
export function resolveStoryAudioMood(input: {
  explicit?: string | null;
  /** Marka ayarlarından seçilen birincil müzik (havuzun ilk üyesi) */
  selected?: string | null;
  pool?: string[];
  /** Mission story/reel index — rotates across the brand pool */
  slotIndex?: number;
  sector?: string;
}): string {
  const explicit = String(input.explicit ?? '').trim();
  if (explicit) return explicit;

  const pool = buildStoryAudioPool({
    selected: input.selected,
    pool: input.pool,
  });

  if (pool.length === 1) return pool[0]!;
  if (pool.length > 1) {
    const idx = Math.max(0, Math.floor(input.slotIndex ?? 0));
    return pool[idx % pool.length]!;
  }

  const sector = String(input.sector ?? '').toLowerCase();
  if (/logistics|nakliyat|transport|freight|lojistik|kargo|taşıma/.test(sector)) {
    return 'mixaund-upbeat';
  }
  if (/beach|hotel|restaurant|cafe|nightclub|music/.test(sector)) {
    return 'surf-house-productions-island-breeze';
  }

  return DEFAULT_STORY_MUSIC_ID;
}

/** Stable fallback index from an artifact id when idea_index is missing. */
export function storyAudioSlotIndexFromId(id: string | null | undefined): number {
  const s = String(id ?? '');
  if (!s) return 0;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

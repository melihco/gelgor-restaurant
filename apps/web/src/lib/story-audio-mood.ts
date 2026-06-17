import { STORY_MUSIC_TRACKS } from './story-music-tracks.generated';

const DEFAULT_STORY_MUSIC_ID = STORY_MUSIC_TRACKS[0]?.id ?? 'surf-house-productions-island-breeze';

export function resolveStoryAudioMood(input: {
  explicit?: string | null;
  /** Marka ayarlarından seçilen birincil müzik */
  selected?: string | null;
  pool?: string[];
  slotIndex?: number;
  sector?: string;
}): string {
  const explicit = String(input.explicit ?? '').trim();
  if (explicit) return explicit;

  const selected = String(input.selected ?? '').trim();
  if (selected) return selected;

  const pool = input.pool?.filter(Boolean) ?? [];
  if (pool.length === 1) return pool[0]!;
  if (pool.length > 1) {
    const idx = Math.max(0, input.slotIndex ?? 0);
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

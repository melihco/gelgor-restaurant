import { describe, expect, it } from 'vitest';
import {
  buildStoryAudioPool,
  resolveStoryAudioMood,
  storyAudioSlotIndexFromId,
} from '../story-audio-mood';

describe('buildStoryAudioPool', () => {
  it('puts selected first and dedupes pool', () => {
    expect(buildStoryAudioPool({
      selected: 'b',
      pool: ['a', 'b', 'c'],
    })).toEqual(['b', 'a', 'c']);
  });
});

describe('resolveStoryAudioMood', () => {
  const pool = [
    'surf-house-productions-island-breeze',
    'mixaund-upbeat',
    'peyruis-dancefloor',
    'punch-deck-neon-drive',
  ];

  it('honours explicit artifact stamp over selected', () => {
    expect(resolveStoryAudioMood({
      explicit: 'peyruis-dancefloor',
      selected: pool[0],
      pool,
      slotIndex: 0,
    })).toBe('peyruis-dancefloor');
  });

  it('rotates pool by slotIndex even when selected is set', () => {
    expect(resolveStoryAudioMood({
      selected: pool[0],
      pool,
      slotIndex: 0,
    })).toBe(pool[0]);
    expect(resolveStoryAudioMood({
      selected: pool[0],
      pool,
      slotIndex: 1,
    })).toBe(pool[1]);
    expect(resolveStoryAudioMood({
      selected: pool[0],
      pool,
      slotIndex: 2,
    })).toBe(pool[2]);
    expect(resolveStoryAudioMood({
      selected: pool[0],
      pool,
      slotIndex: 4,
    })).toBe(pool[0]);
  });

  it('gives different tracks across a mission of stories', () => {
    const tracks = [0, 1, 2, 3].map((slotIndex) => resolveStoryAudioMood({
      selected: pool[0],
      pool,
      slotIndex,
    }));
    expect(new Set(tracks).size).toBe(4);
  });
});

describe('storyAudioSlotIndexFromId', () => {
  it('is stable for the same id', () => {
    expect(storyAudioSlotIndexFromId('abc')).toBe(storyAudioSlotIndexFromId('abc'));
  });
});

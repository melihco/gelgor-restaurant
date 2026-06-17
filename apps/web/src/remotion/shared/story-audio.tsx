'use client';

import React from 'react';
import {
  Audio,
  Sequence,
  getInputProps,
  interpolate,
  useVideoConfig,
} from 'remotion';
import { resolveStoryMusicUrl } from '../../lib/story-audio-catalog';
import type { StoryProps } from '../types';

export function StoryAudioLayer({
  audioMood,
  storyMusicUrl,
  voiceoverUrl,
}: {
  audioMood?: string;
  storyMusicUrl?: string;
  voiceoverUrl?: string;
}) {
  const { durationInFrames, fps } = useVideoConfig();
  const inputProps = getInputProps() as unknown as StoryProps;
  const musicUrl = storyMusicUrl ?? inputProps.storyMusicUrl ?? resolveStoryMusicUrl(audioMood ?? inputProps.audioMood);
  const voiceDelayFrames = Math.round(fps * 0.55);

  if (!musicUrl && !voiceoverUrl) return null;

  return (
    <>
      {musicUrl ? (
        <Audio
          src={musicUrl}
          loop
          volume={(f) => {
            const fadeIn = interpolate(f, [0, 28], [0, 0.5], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const fadeOut = interpolate(
              f,
              [durationInFrames - 28, durationInFrames],
              [0.5, 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );
            const base = Math.min(fadeIn, fadeOut);
            const voiceActive =
              Boolean(voiceoverUrl)
              && f >= voiceDelayFrames
              && f < durationInFrames - Math.round(fps * 0.8);
            return voiceActive ? base * 0.22 : base;
          }}
        />
      ) : null}

      {voiceoverUrl ? (
        <Sequence from={voiceDelayFrames} layout="none">
          <Audio
            src={voiceoverUrl}
            volume={(f) => {
              const fadeInFrames = Math.round(fps * 0.35);
              const fadeOutFrames = Math.round(fps * 0.45);
              const holdEnd = Math.max(fadeInFrames + 8, durationInFrames - voiceDelayFrames - fadeOutFrames);
              return interpolate(
                f,
                [0, fadeInFrames, holdEnd, holdEnd + fadeOutFrames],
                [0, 0.88, 0.88, 0],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
              );
            }}
          />
        </Sequence>
      ) : null}
    </>
  );
}

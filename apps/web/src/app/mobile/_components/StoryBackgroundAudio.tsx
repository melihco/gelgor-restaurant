'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Loops brand-selected story background music while the container is in view.
 * Pauses when scrolled away (Instagram-style feed behaviour).
 */
export function useStoryBackgroundAudio({
  src,
  enabled = true,
  volume = 0.42,
  containerRef,
}: {
  src: string;
  enabled?: boolean;
  volume?: number;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needsUserTap, setNeedsUserTap] = useState(false);

  useEffect(() => {
    if (!enabled || !src) {
      setNeedsUserTap(false);
      return;
    }

    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;

    const tryPlay = async () => {
      try {
        await audio.play();
        setNeedsUserTap(false);
      } catch {
        setNeedsUserTap(true);
      }
    };

    const pause = () => {
      audio.pause();
    };

    const el = containerRef.current;
    if (!el) {
      void tryPlay();
      return () => {
        pause();
        audioRef.current = null;
      };
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && entry.intersectionRatio >= 0.12) {
          void tryPlay();
        } else {
          pause();
        }
      },
      { threshold: [0, 0.12, 0.25] },
    );
    obs.observe(el);

    return () => {
      obs.disconnect();
      pause();
      audioRef.current = null;
    };
  }, [src, enabled, volume, containerRef]);

  const enableSound = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.volume = volume;
      await audio.play();
      setNeedsUserTap(false);
    } catch {
      setNeedsUserTap(true);
    }
  };

  return { needsUserTap, enableSound, audioRef };
}

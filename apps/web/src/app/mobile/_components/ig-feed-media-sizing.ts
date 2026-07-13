'use client';

import { useEffect, useState } from 'react';

/** Instagram feed — en dar portre (4:5). width / height */
export const IG_FEED_PORTRAIT_RATIO = 4 / 5;

/** Instagram feed — en geniş yatay (1.91:1). width / height */
export const IG_FEED_LANDSCAPE_RATIO = 1.91;

/** Reels in home feed scroll — 4:5 crop. */
export const IG_FEED_REEL_RATIO = 4 / 5;

export const IG_FEED_DEFAULT_RATIO = IG_FEED_PORTRAIT_RATIO;

export function clampIgFeedAspectRatio(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return IG_FEED_DEFAULT_RATIO;
  }
  const ratio = width / height;
  return Math.min(IG_FEED_LANDSCAPE_RATIO, Math.max(IG_FEED_PORTRAIT_RATIO, ratio));
}

export function useIgFeedMediaAspectRatio(imageUrl: string | null, fallback = IG_FEED_DEFAULT_RATIO): number {
  const [ratio, setRatio] = useState(fallback);

  useEffect(() => {
    if (!imageUrl) {
      setRatio(fallback);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setRatio(clampIgFeedAspectRatio(img.naturalWidth, img.naturalHeight));
      }
    };
    img.onerror = () => {
      if (!cancelled) setRatio(fallback);
    };
    img.referrerPolicy = 'no-referrer';
    img.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl, fallback]);

  return ratio;
}

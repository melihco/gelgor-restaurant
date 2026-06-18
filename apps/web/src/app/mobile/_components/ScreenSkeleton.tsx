'use client';

import { FeedLoadingSkeleton } from './FeedLoadingSkeleton';

/** Lightweight placeholder while lazy-loaded mobile screens load. */
export function ScreenSkeleton() {
  return <FeedLoadingSkeleton includeHeader message="Sayfa yükleniyor…" />;
}

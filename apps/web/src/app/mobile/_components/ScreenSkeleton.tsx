'use client';

import { BrandLoadingScreen } from './BrandLoadingScreen';

/** Lightweight placeholder while lazy-loaded mobile screens load. */
export function ScreenSkeleton() {
  return <BrandLoadingScreen compact fillViewport={false} />;
}

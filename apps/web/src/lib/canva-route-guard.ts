/**
 * Canva API guard — product policy: Canva is not used (enterprise).
 * Routes return 410 unless CANVA_ENABLED=true (dev-only override).
 */
import { NextResponse } from 'next/server';
import { isCanvaEnabled } from './canva-config';

export const CANVA_DISABLED_MESSAGE =
  'Canva entegrasyonu kapalı. Üretim Remotion (story) + ajans SVG poster motoru ile yapılır.';

export function canvaDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: CANVA_DISABLED_MESSAGE,
      code: 'canva_disabled',
      productionEngine: 'remotion',
    },
    { status: 410 },
  );
}

/** Returns a 410 response when Canva is off; null when allowed. */
export function assertCanvaRouteEnabled(): NextResponse | null {
  if (!isCanvaEnabled()) return canvaDisabledResponse();
  return null;
}

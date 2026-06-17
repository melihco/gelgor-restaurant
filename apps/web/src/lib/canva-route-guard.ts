import { NextResponse } from 'next/server';

export const CANVA_DISABLED_MESSAGE =
  'Canva entegrasyonu kaldırıldı. Görsel üretim Remotion + ajans poster motoru ile yapılır.';

export function canvaDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: CANVA_DISABLED_MESSAGE,
      code: 'canva_removed',
      productionEngine: 'remotion',
    },
    { status: 410 },
  );
}

export function assertCanvaRouteEnabled(): NextResponse | null {
  return canvaDisabledResponse();
}

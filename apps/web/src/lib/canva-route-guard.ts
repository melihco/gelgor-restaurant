import { NextResponse } from 'next/server';

export const CANVA_DISABLED_MESSAGE =
  'Canva entegrasyonu kaldırıldı. Görsel üretim fal.ai + ajans tasarım motoru ile yapılır.';

export function canvaDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: CANVA_DISABLED_MESSAGE,
      code: 'canva_removed',
      productionEngine: 'fal_design',
    },
    { status: 410 },
  );
}

export function assertCanvaRouteEnabled(): NextResponse | null {
  return canvaDisabledResponse();
}

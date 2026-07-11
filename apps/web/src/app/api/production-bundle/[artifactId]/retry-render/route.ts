/**
 * POST /api/production-bundle/{artifactId}/retry-render
 * Legacy Remotion retry — disabled after Remotion removal.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  _ctx: { params: Promise<{ artifactId: string }> },
) {
  return NextResponse.json(
    {
      error: 'Remotion render retry is no longer available. Re-run auto-produce or use fal pipelines.',
      code: 'remotion_removed',
    },
    { status: 410 },
  );
}

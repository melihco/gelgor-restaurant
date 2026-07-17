import { NextResponse } from 'next/server';
import { isPaytrConfigured, isPaytrEnabled, getPaytrConfig } from '@/lib/paytr/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Public: whether PayTR checkout is available (no secrets). */
export async function GET() {
  const enabled = isPaytrEnabled();
  let testMode = false;
  if (enabled && isPaytrConfigured()) {
    try {
      testMode = getPaytrConfig().testMode;
    } catch {
      /* ignore */
    }
  }
  return NextResponse.json({
    enabled,
    configured: isPaytrConfigured(),
    testMode,
  });
}

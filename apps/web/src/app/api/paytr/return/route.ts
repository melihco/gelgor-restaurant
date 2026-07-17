import { NextRequest, NextResponse } from 'next/server';
import { getPaytrConfig } from '@/lib/paytr/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Browser return after PayTR iframe (merchant_ok_url / merchant_fail_url).
 * Fulfillment is done on /api/paytr/callback — this only redirects into the app.
 */
export async function GET(req: NextRequest) {
  const result = req.nextUrl.searchParams.get('result') === 'ok' ? 'ok' : 'fail';
  let base = 'http://127.0.0.1:3000';
  try {
    base = getPaytrConfig().publicBaseUrl;
  } catch {
    base = process.env.WEB_BASE_URL?.replace(/\/$/, '')
      || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
      || base;
  }
  const target = new URL('/mobile', base);
  target.searchParams.set('billing', result);
  return NextResponse.redirect(target.toString());
}

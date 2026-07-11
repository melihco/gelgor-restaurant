/**
 * Liveness probe for Render / load balancers.
 * Must stay lightweight — no DB or upstream calls.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'smartagency-web',
      check: 'live',
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}

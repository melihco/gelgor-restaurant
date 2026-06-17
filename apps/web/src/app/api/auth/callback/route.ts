import { NextResponse } from 'next/server';

/** Canva OAuth callback endpoint removed — return 410 Gone. */
export const runtime = 'edge';
export function GET() {
  return NextResponse.json({ error: 'Canva integration removed' }, { status: 410 });
}

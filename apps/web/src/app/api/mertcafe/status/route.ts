import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BASE_URL = process.env.MERTCAFE_BASE_URL ?? 'https://web-production-02d278.up.railway.app';
const API_KEY = process.env.MERTCAFE_API_KEY ?? '';

export async function GET(): Promise<NextResponse> {
  if (!API_KEY) return NextResponse.json({ error: 'MERTCAFE_API_KEY is not configured' }, { status: 500 });
  try {
    const res = await fetch(`${BASE_URL}/api/status?api_key=${encodeURIComponent(API_KEY)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { message?: string; error?: string }).message || (data as { message?: string; error?: string }).error || 'Status check failed' },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Status check failed' }, { status: 503 });
  }
}

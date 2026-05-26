import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BASE_URL = process.env.MERTCAFE_BASE_URL ?? 'https://web-production-02d278.up.railway.app';
const API_KEY = process.env.MERTCAFE_API_KEY ?? '';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!API_KEY) return NextResponse.json({ error: 'MERTCAFE_API_KEY is not configured' }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { ads_account_id?: string } | null;
  const adsAccountId = body?.ads_account_id?.trim();
  if (!adsAccountId) return NextResponse.json({ error: 'ads_account_id is required' }, { status: 400 });

  try {
    const res = await fetch(`${BASE_URL}/api/connect/meta-ads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: API_KEY, ads_account_id: adsAccountId }),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { message?: string; error?: string }).message || (data as { message?: string; error?: string }).error || 'Meta Ads connect failed' },
        { status: res.status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Meta Ads connect failed' }, { status: 503 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { mertcafePost } from '@/lib/mertcafe-api';
import { requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** POST — Mertcafe collection §4b: Meta Ads hesabı bağla */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as {
    ads_account_id?: string;
    workspaceId?: string;
  } | null;
  const adsAccountId = body?.ads_account_id?.trim();
  if (!adsAccountId) {
    return NextResponse.json({ error: 'ads_account_id is required' }, { status: 400 });
  }

  const wsCheck = requireMertcafeWorkspaceId(body?.workspaceId);
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }

  try {
    const { ok, status, data } = await mertcafePost(
      '/api/connect/meta-ads',
      { ads_account_id: adsAccountId },
      wsCheck.workspaceId,
      { includeAccount: false },
    );
    if (!ok) {
      return NextResponse.json(
        { error: String(data.error || data.message || 'Meta Ads connect failed') },
        { status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Meta Ads connect failed' },
      { status: 503 },
    );
  }
}

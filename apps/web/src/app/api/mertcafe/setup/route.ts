import { NextRequest, NextResponse } from 'next/server';
import { loadMertcafeWorkspaceConfig, mertcafePost } from '@/lib/mertcafe-api';
import { assertTenantHasApiKey, requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

export const runtime = 'nodejs';
export const maxDuration = 30;

type SetupBody = {
  workspaceId?: string;
  business_name?: string;
  menu?: string;
  hours?: string;
  address?: string;
  phone?: string;
  price_range?: string;
  notes?: string;
};

/** POST — Mertcafe collection §2: işletme bilgilerini kaydet (chatbot + publish context) */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as SetupBody | null;
  if (!body?.business_name?.trim() || !body?.menu?.trim() || !body?.hours?.trim()) {
    return NextResponse.json(
      { error: 'business_name, menu ve hours zorunludur' },
      { status: 400 },
    );
  }

  const wsCheck = requireMertcafeWorkspaceId(body.workspaceId);
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }

  const tenant = await loadMertcafeWorkspaceConfig(wsCheck.workspaceId);
  const apiReady = assertTenantHasApiKey(tenant);
  if (!apiReady.ok) {
    return NextResponse.json({ error: apiReady.error, code: apiReady.code }, { status: 422 });
  }

  try {
    const { ok, status, data } = await mertcafePost(
      '/api/setup',
      {
        business_name: body.business_name.trim(),
        menu: body.menu.trim(),
        hours: body.hours.trim(),
        address: body.address?.trim() ?? '',
        phone: body.phone?.trim() ?? '',
        price_range: body.price_range?.trim() ?? '',
        notes: body.notes?.trim() ?? '',
      },
      wsCheck.workspaceId,
      { includeAccount: false },
    );
    if (!ok) {
      return NextResponse.json(
        { error: String(data.error || data.message || 'Setup failed') },
        { status },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Setup failed' },
      { status: 503 },
    );
  }
}

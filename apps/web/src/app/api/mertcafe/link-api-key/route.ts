import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  extractMertcafeOAuthAccountId,
  mertcafeGet,
} from '@/lib/mertcafe-api';
import { requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

export const runtime = 'nodejs';

type Body = {
  workspaceId?: string;
  apiKey?: string;
};

/** POST — Link an existing Mertcafe API key to this tenant (no new Mertcafe registration). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wsCheck = requireMertcafeWorkspaceId(body.workspaceId);
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }
  const workspaceId = wsCheck.workspaceId;
  const apiKey = String(body.apiKey ?? '').trim();
  if (!apiKey || apiKey.length < 8) {
    return NextResponse.json({ error: 'Geçerli bir Mertcafe API anahtarı girin.' }, { status: 400 });
  }

  const probe = await mertcafeGet('/api/status', apiKey);
  if (!probe.ok) {
    return NextResponse.json(
      {
        error: String(probe.data.error || probe.data.message || 'API anahtarı doğrulanamadı'),
        code: 'INVALID_API_KEY',
      },
      { status: probe.status >= 400 ? probe.status : 401 },
    );
  }

  const instagramConnected = Boolean(probe.data.instagram_connected);
  const oauthAccountId = extractMertcafeOAuthAccountId(probe.data);

  const patch: Record<string, unknown> = { mertcafe_api_key: apiKey };
  if (instagramConnected) {
    patch.mertcafe_use_oauth_account = true;
    if (oauthAccountId) {
      patch.mertcafe_instagram_account_id = oauthAccountId;
    }
  }

  const patchRes = await fetchCrewBackendJson<{ theme?: Record<string, unknown> | null }>(
    `/api/v1/brand-context/${workspaceId}/theme/ai-settings`,
    {
      method: 'PATCH',
      body: patch,
      timeoutMs: 15_000,
    },
  );

  if (!patchRes.ok) {
    const errBody = (patchRes.data ?? {}) as Record<string, unknown>;
    const detail = errBody.detail ?? errBody.error;
    return NextResponse.json(
      { error: typeof detail === 'string' ? detail : 'API anahtarı kaydedilemedi' },
      { status: patchRes.status || 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    instagram_connected: instagramConnected,
    oauth_account_id: oauthAccountId ?? null,
    theme: patchRes.data?.theme ?? null,
    message: instagramConnected
      ? 'Mevcut Mertcafe hesabınız bağlandı. Instagram OAuth zaten aktif — Feed’den paylaşabilirsiniz.'
      : 'API anahtarı kaydedildi. Instagram’ı bağlamak için OAuth ile giriş yapın.',
  });
}

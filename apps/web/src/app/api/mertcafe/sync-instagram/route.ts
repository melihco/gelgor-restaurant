import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  extractAccountIdFromPostResponse,
  extractMertcafeOAuthAccountId,
  loadMertcafeWorkspaceConfig,
  mertcafeGet,
} from '@/lib/mertcafe-api';
import { requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

export const runtime = 'nodejs';

/**
 * POST — OAuth sonrası: bağlı Instagram hesabını tenant tema kaydına senkronize et.
 * Eski manuel account_id'yi temizler; OAuth varsayılan hesabını kullanır.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { workspaceId?: string } = {};
  try {
    body = (await request.json()) as { workspaceId?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const wsCheck = requireMertcafeWorkspaceId(body.workspaceId);
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }
  const workspaceId = wsCheck.workspaceId;

  const tenant = await loadMertcafeWorkspaceConfig(workspaceId);
  if (!tenant.hasApiKey) {
    return NextResponse.json(
      { error: 'Bu tenant için Mertcafe API anahtarı yok.', code: 'MISSING_API_KEY' },
      { status: 422 },
    );
  }

  const { ok, status, data } = await mertcafeGet('/api/status', tenant.apiKey);
  if (!ok) {
    return NextResponse.json(
      { error: String(data.error || data.message || 'Status check failed') },
      { status },
    );
  }

  const instagramConnected = Boolean(data.instagram_connected);
  const oauthAccountId = extractMertcafeOAuthAccountId(data);
  const instagramUsername = String(
    data.instagram_username ?? data.username ?? data.ig_username ?? '',
  ).trim();

  if (!instagramConnected) {
    return NextResponse.json({
      ok: false,
      instagram_connected: false,
      workspace_id: workspaceId,
      message:
        'Instagram henüz bu API anahtarına bağlı görünmüyor. OAuth\'u aynı tenant anahtarı ile tamamlayıp tekrar deneyin.',
    });
  }

  const patch: Record<string, unknown> = {
    mertcafe_use_oauth_account: true,
  };
  if (oauthAccountId) {
    patch.mertcafe_instagram_account_id = oauthAccountId;
  } else {
    patch.mertcafe_instagram_account_id = '';
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
    const detailMsg =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object'
          ? JSON.stringify(detail)
          : '';
    return NextResponse.json(
      { error: detailMsg || 'Theme sync failed' },
      { status: patchRes.status || 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    instagram_connected: true,
    workspace_id: workspaceId,
    oauth_account_id: oauthAccountId ?? null,
    instagram_username: instagramUsername || null,
    publish_account_id: oauthAccountId ?? null,
    use_oauth_account: true,
    theme: patchRes.data?.theme ?? null,
    message: oauthAccountId
      ? 'OAuth hesabı tenant kaydına yazıldı.'
      : 'OAuth bağlı — yayınlar bağlanan Instagram hesabına gidecek (account_id gönderilmeden).',
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  loadMertcafeWorkspaceConfig,
  mertcafeGetInstagramConnectUrl,
  mertcafeRegister,
} from '@/lib/mertcafe-api';
import { requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

export const runtime = 'nodejs';

/** POST — Create a dedicated Mertcafe api_key for this tenant (collection §1). */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { workspaceId?: string; force?: boolean } = {};
  try {
    body = (await request.json()) as { workspaceId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const force = body.force === true;

  const wsCheck = requireMertcafeWorkspaceId(body.workspaceId);
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }
  const workspaceId = wsCheck.workspaceId;

  const existing = await loadMertcafeWorkspaceConfig(workspaceId);
  if (existing.hasApiKey && existing.apiKeySource === 'theme' && !force) {
    return NextResponse.json({
      ok: true,
      workspace_id: workspaceId,
      message: 'Bu tenant zaten bir Mertcafe API anahtarına sahip.',
      api_key: `${existing.apiKey.slice(0, 8)}…`,
    });
  }

  const reg = await mertcafeRegister();
  if (!reg.ok || !reg.apiKey) {
    return NextResponse.json(
      { error: String(reg.data.error || reg.data.message || 'Mertcafe kayıt başarısız') },
      { status: reg.status || 502 },
    );
  }

  const themePatch: Record<string, unknown> = { mertcafe_api_key: reg.apiKey };
  if (force) {
    themePatch.mertcafe_instagram_account_id = '';
    themePatch.mertcafe_use_oauth_account = false;
    themePatch.mertcafe_instagram_accounts = [];
  }

  const patchRes = await fetchCrewBackendJson<{ theme?: Record<string, unknown> | null }>(
    `/api/v1/brand-context/${workspaceId}/theme/ai-settings`,
    {
      method: 'PATCH',
      workspaceId,
      body: themePatch,
      timeoutMs: 15_000,
    },
  );

  if (!patchRes.ok) {
    const errBody = (patchRes.data ?? {}) as Record<string, unknown>;
    const detail = errBody.detail ?? errBody.error;
    const errMsg =
      typeof detail === 'string'
        ? detail
        : detail != null
          ? JSON.stringify(detail)
          : 'API anahtarı tenant tema kaydına yazılamadı';
    return NextResponse.json({ error: errMsg }, { status: patchRes.status || 502 });
  }

  const connectProbe = await mertcafeGetInstagramConnectUrl(reg.apiKey);
  const replaced = force || (existing.hasApiKey && existing.apiKeySource === 'theme');

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    api_key: reg.apiKey,
    connect_ready: connectProbe.ok,
    auth_url_works: connectProbe.ok,
    auth_url: connectProbe.authUrl ?? null,
    replaced,
    theme: patchRes.data?.theme ?? null,
    message: force
      ? connectProbe.ok
        ? 'API anahtarı yenilendi. Instagram OAuth URL hazır — şimdi bağlanın.'
        : 'API anahtarı yenilendi ancak OAuth URL alınamadı. Mertcafe servisini kontrol edin.'
      : connectProbe.ok
        ? 'Mertcafe kaydı oluşturuldu. Şimdi Instagram OAuth ile bağlanın.'
        : 'Mertcafe kaydı oluşturuldu ancak OAuth URL alınamadı.',
  });
}

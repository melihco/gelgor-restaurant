import { NextRequest, NextResponse } from 'next/server';
import {
  extractMertcafeOAuthAccountId,
  loadMertcafeWorkspaceConfig,
  mertcafeGet,
} from '@/lib/mertcafe-api';
import { resolveMertcafePublishReadiness } from '@/lib/mertcafe-publish-auth';
import { requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** GET — Mertcafe §4 + per-tenant binding (API key + publish account). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const wsCheck = requireMertcafeWorkspaceId(request.nextUrl.searchParams.get('workspaceId'));
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }
  const workspaceId = wsCheck.workspaceId;

  const tenant = await loadMertcafeWorkspaceConfig(workspaceId);
  if (!tenant.hasApiKey) {
    return NextResponse.json({
      instagram_connected: false,
      meta_ads_connected: false,
      instagram_account_id: tenant.publishAccountId ?? null,
      publish_account_id: tenant.publishAccountId ?? null,
      oauth_account_id: null,
      saved_accounts: tenant.savedAccounts,
      workspace_id: workspaceId,
      has_tenant_api_key: false,
      has_publish_account: tenant.hasPublishAccount,
      is_tenant_ready: false,
      api_key_source: tenant.apiKeySource,
      account_source: tenant.accountSource,
      error: 'Bu tenant için Mertcafe API anahtarı tanımlı değil.',
      code: 'MISSING_API_KEY',
    });
  }

  try {
    const { ok, status, data } = await mertcafeGet('/api/status', tenant.apiKey);
    if (!ok) {
      return NextResponse.json(
        { error: String(data.error || data.message || 'Status check failed'), code: 'MERTCAFE_STATUS_FAILED' },
        { status },
      );
    }
    const oauthAccountId = extractMertcafeOAuthAccountId(data);
    const instagramConnected = Boolean(data.instagram_connected);
    const manualPublishId = String(tenant.publishAccountId ?? '').trim();
    // Manuel hesap seçildiyse OAuth bayrağını ezme; aksi halde IG bağlıysa OAuth varsayılan.
    const useOAuth = tenant.useOAuthAccount
      ? true
      : manualPublishId
        ? false
        : instagramConnected;

    const instagramUsername = String(
      data.instagram_username ?? data.username ?? data.ig_username ?? '',
    ).trim();

    const publishGate = resolveMertcafePublishReadiness({
      has_tenant_api_key: true,
      instagram_connected: instagramConnected,
      use_oauth_account: useOAuth,
      publish_account_id: tenant.publishAccountId ?? oauthAccountId ?? null,
      oauth_account_id: oauthAccountId ?? null,
    });

    return NextResponse.json({
      api_key: typeof data.api_key === 'string' ? data.api_key : undefined,
      instagram_connected: instagramConnected,
      meta_ads_connected: Boolean(data.meta_ads_connected),
      instagram_account_id: useOAuth
        ? (oauthAccountId ?? null)
        : (tenant.publishAccountId ?? oauthAccountId ?? null),
      publish_account_id: useOAuth
        ? null
        : (tenant.publishAccountId ?? oauthAccountId ?? null),
      oauth_account_id: oauthAccountId ?? null,
      instagram_username: instagramUsername || null,
      use_oauth_account: useOAuth,
      saved_accounts: tenant.savedAccounts,
      workspace_id: workspaceId,
      has_tenant_api_key: true,
      has_publish_account: tenant.hasPublishAccount || instagramConnected,
      is_tenant_ready: publishGate.ready,
      publish_ready: publishGate.ready,
      publish_blocker: publishGate.blocker ?? null,
      api_key_source: tenant.apiKeySource,
      account_source: tenant.accountSource,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Status check failed' },
      { status: 503 },
    );
  }
}

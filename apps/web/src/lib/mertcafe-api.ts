/**
 * Server-side Mertcafe (Zernio legacy) API helpers.
 * @see apps/web/docs/mertcafe-bot-api.collection.json
 */
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  appendMertcafeAccountToPayload,
  resolveMertcafeApiKey,
  resolveMertcafeEnvAccountId,
  resolveMertcafeEnvApiKey,
  resolveMertcafeInstagramAccountId,
} from '@/lib/mertcafe-config';
import {
  parseMertcafeSavedAccounts,
  type MertcafeSavedAccount,
} from '@/lib/mertcafe-accounts';
import {
  assertTenantMertcafeReady,
  normalizeMertcafeWorkspaceId,
  type MertcafeTenantConfig,
} from '@/lib/mertcafe-tenant';

export const MERTCAFE_BASE_URL =
  process.env.MERTCAFE_BASE_URL ?? 'https://web-production-02d278.up.railway.app';

export type MertcafeWorkspaceConfig = MertcafeTenantConfig;

export async function loadMertcafeWorkspaceConfig(
  workspaceId?: string,
): Promise<MertcafeTenantConfig> {
  const ws = normalizeMertcafeWorkspaceId(workspaceId);
  if (!ws) {
    return {
      workspaceId: '',
      apiKey: '',
      savedAccounts: [],
      apiKeySource: 'none',
      accountSource: 'none',
      hasApiKey: false,
      hasPublishAccount: false,
      isTenantReady: false,
    };
  }

  let themeApiKey = '';
  let themeAccountId = '';
  let useOAuthAccount = false;
  let savedAccounts: MertcafeSavedAccount[] = [];

  const res = await fetchCrewBackendJson<{ theme?: Record<string, unknown> | null }>(
    `/api/v1/brand-context/${ws}/theme`,
    { timeoutMs: 12_000 },
  );
  if (res.ok && res.data?.theme && typeof res.data.theme === 'object') {
    const theme = res.data.theme;
    themeApiKey = String(theme.mertcafe_api_key ?? theme.mertcafeApiKey ?? '').trim();
    themeAccountId = String(
      theme.mertcafe_instagram_account_id ?? theme.mertcafeInstagramAccountId ?? '',
    ).trim();
    useOAuthAccount = Boolean(
      theme.mertcafe_use_oauth_account ?? theme.mertcafeUseOauthAccount ?? theme.mertcafeUseOAuthAccount,
    );
    savedAccounts = parseMertcafeSavedAccounts(
      theme.mertcafe_instagram_accounts ?? theme.mertcafeInstagramAccounts,
    );
  }

  const envApiKey = resolveMertcafeEnvApiKey(ws);
  const envAccountId = resolveMertcafeEnvAccountId(ws);
  const apiKey = resolveMertcafeApiKey(ws, themeApiKey);
  const publishAccountId = useOAuthAccount
    ? undefined
    : resolveMertcafeInstagramAccountId(ws, undefined, themeAccountId);

  let apiKeySource: MertcafeTenantConfig['apiKeySource'] = 'none';
  if (themeApiKey) apiKeySource = 'theme';
  else if (envApiKey && apiKey === envApiKey) apiKeySource = 'env_map';
  else if (apiKey) apiKeySource = 'global_fallback';

  let accountSource: MertcafeTenantConfig['accountSource'] = 'none';
  if (themeAccountId) accountSource = 'theme';
  else if (envAccountId && publishAccountId === envAccountId) accountSource = 'env_map';

  const mergedAccounts =
    publishAccountId && !savedAccounts.some((a) => a.id === publishAccountId)
      ? [{ id: publishAccountId, label: 'Aktif' }, ...savedAccounts]
      : savedAccounts;

  return {
    workspaceId: ws,
    apiKey,
    publishAccountId,
    useOAuthAccount,
    savedAccounts: mergedAccounts,
    apiKeySource,
    accountSource,
    hasApiKey: Boolean(apiKey),
    hasPublishAccount: Boolean(publishAccountId) || useOAuthAccount,
    isTenantReady: Boolean(apiKey && (publishAccountId || useOAuthAccount)),
  };
}

export function extractMertcafeOAuthAccountId(data: Record<string, unknown>): string | undefined {
  const direct =
    data.instagram_account_id ??
    data.account_id ??
    data.ig_account_id ??
    data.instagramAccountId;
  const id = String(direct ?? '').trim();
  if (id) return id;

  const accounts = data.accounts ?? data.instagram_accounts;
  if (Array.isArray(accounts) && accounts.length > 0) {
    const first = accounts[0] as Record<string, unknown>;
    const nested = String(first._id ?? first.id ?? first.account_id ?? '').trim();
    if (nested) return nested;
  }
  return undefined;
}

export function extractAccountIdFromPostResponse(data: Record<string, unknown>): string | undefined {
  const post = (data.post ?? data.data) as Record<string, unknown> | undefined;
  if (!post || typeof post !== 'object') return undefined;
  const platforms = post.platforms;
  if (!Array.isArray(platforms) || platforms.length === 0) return undefined;
  const platform = platforms[0] as Record<string, unknown>;
  const accountId = platform.accountId;
  if (accountId && typeof accountId === 'object') {
    const rec = accountId as Record<string, unknown>;
    return String(rec._id ?? rec.id ?? '').trim() || undefined;
  }
  return String(platform.account_id ?? '').trim() || undefined;
}

export function parseMertcafeErrorBody(data: Record<string, unknown>): string {
  const raw = String(data.detail || data.error || data.message || data.raw || '');
  if (!raw) return '';
  try {
    const nested = JSON.parse(raw) as { error?: string; message?: string };
    return String(nested.error || nested.message || raw);
  } catch {
    return raw;
  }
}

export async function mertcafeGet(
  path: string,
  apiKey: string,
  query: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const qs = new URLSearchParams({ api_key: apiKey, ...query });
  const res = await fetch(`${MERTCAFE_BASE_URL}${path}?${qs}`, {
    method: 'GET',
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

export async function mertcafePost(
  path: string,
  body: Record<string, unknown>,
  workspaceId?: string,
  options?: { includeAccount?: boolean },
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const config = await loadMertcafeWorkspaceConfig(workspaceId);
  const ready = assertTenantMertcafeReady(config);
  if (!ready.ok) {
    return { ok: false, status: 422, data: { error: ready.error, code: ready.code } };
  }

  const payload: Record<string, unknown> = { api_key: config.apiKey, ...body };
  if (options?.includeAccount !== false) {
    appendMertcafeAccountToPayload(
      payload,
      workspaceId,
      typeof body.account_id === 'string' ? body.account_id : undefined,
      config.publishAccountId,
    );
  }

  const res = await fetch(`${MERTCAFE_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(110_000),
  });

  const rawText = await res.text();
  let data: Record<string, unknown> = {};
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>;
    } catch {
      data = { raw: rawText };
    }
  }

  return { ok: res.ok, status: res.status, data };
}

/** Register a new Mertcafe business and return api_key (collection §1). */
export async function mertcafeRegister(): Promise<{
  ok: boolean;
  status: number;
  apiKey?: string;
  data: Record<string, unknown>;
}> {
  const res = await fetch(`${MERTCAFE_BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const apiKey = String(data.api_key ?? data.apiKey ?? '').trim();
  return { ok: res.ok && Boolean(apiKey), status: res.status, apiKey: apiKey || undefined, data };
}

/** Collection §3 — Instagram OAuth URL (requires valid Mertcafe-registered api_key). */
export async function mertcafeGetInstagramConnectUrl(apiKey: string): Promise<{
  ok: boolean;
  status: number;
  authUrl?: string;
  data: Record<string, unknown>;
}> {
  const { ok, status, data } = await mertcafeGet('/api/connect/instagram', apiKey);
  const authUrl = String(data.auth_url ?? data.authUrl ?? '').trim();
  const hasUrl = authUrl.startsWith('http');
  return {
    ok: ok && hasUrl,
    status: hasUrl ? status : status >= 400 ? status : 502,
    authUrl: hasUrl ? authUrl : undefined,
    data,
  };
}

export function mertcafeConnectErrorMessage(data: Record<string, unknown>): string {
  const raw = String(data.error ?? data.message ?? '').trim();
  if (/authUrl alınamadı/i.test(raw)) {
    return (
      'Bu Mertcafe API anahtarı Instagram OAuth için hazır değil (Zernio profili eksik). ' +
      'Marka → Ayarlar → "API anahtarını yenile" ile yeni kayıt oluşturun veya Mertcafe\'den geçerli anahtar isteyin.'
    );
  }
  return raw || 'Instagram bağlantı URL\'si alınamadı';
}

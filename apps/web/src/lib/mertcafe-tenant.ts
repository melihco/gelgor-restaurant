/**
 * Per-tenant Mertcafe binding — each workspace (Nexus tenant UUID) has its own
 * API key + publish account id. Global env is dev-only fallback.
 */
import type { MertcafeSavedAccount } from '@/lib/mertcafe-accounts';

export type MertcafeApiKeySource = 'theme' | 'env_map' | 'global_fallback' | 'none';
export type MertcafeAccountSource = 'theme' | 'env_map' | 'none';

export type MertcafeTenantConfig = {
  workspaceId: string;
  apiKey: string;
  publishAccountId?: string;
  /** When true, publish omits account_id — Mertcafe uses OAuth-linked IG account. */
  useOAuthAccount?: boolean;
  savedAccounts: MertcafeSavedAccount[];
  apiKeySource: MertcafeApiKeySource;
  accountSource: MertcafeAccountSource;
  hasApiKey: boolean;
  hasPublishAccount: boolean;
  isTenantReady: boolean;
};

export type MertcafeTenantErrorCode =
  | 'MISSING_WORKSPACE'
  | 'MISSING_API_KEY'
  | 'MISSING_PUBLISH_ACCOUNT';

export function normalizeMertcafeWorkspaceId(raw: string | undefined | null): string {
  return String(raw ?? '').trim();
}

export function requireMertcafeWorkspaceId(
  raw: string | undefined | null,
): { ok: true; workspaceId: string } | { ok: false; error: string; code: MertcafeTenantErrorCode } {
  const workspaceId = normalizeMertcafeWorkspaceId(raw);
  if (!workspaceId) {
    return {
      ok: false,
      code: 'MISSING_WORKSPACE',
      error: 'workspaceId (tenant) zorunlu — Mertcafe ayarları tenant bazında çalışır.',
    };
  }
  return { ok: true, workspaceId };
}

export function buildTenantMertcafeConfig(params: {
  workspaceId: string;
  themeApiKey?: string;
  themeAccountId?: string;
  envApiKey?: string;
  envAccountId?: string;
  savedAccounts?: MertcafeSavedAccount[];
}): MertcafeTenantConfig {
  const workspaceId = normalizeMertcafeWorkspaceId(params.workspaceId);
  const themeApiKey = params.themeApiKey?.trim() ?? '';
  const themeAccountId = params.themeAccountId?.trim() ?? '';
  const envApiKey = params.envApiKey?.trim() ?? '';
  const envAccountId = params.envAccountId?.trim() ?? '';

  let apiKeySource: MertcafeApiKeySource = 'none';
  let apiKey = '';
  if (themeApiKey) {
    apiKey = themeApiKey;
    apiKeySource = 'theme';
  } else if (envApiKey) {
    apiKey = envApiKey;
    apiKeySource = 'env_map';
  }

  let accountSource: MertcafeAccountSource = 'none';
  let publishAccountId: string | undefined;
  if (themeAccountId) {
    publishAccountId = themeAccountId;
    accountSource = 'theme';
  } else if (envAccountId) {
    publishAccountId = envAccountId;
    accountSource = 'env_map';
  }

  const savedAccounts = params.savedAccounts ?? [];
  const hasApiKey = Boolean(apiKey);
  const hasPublishAccount = Boolean(publishAccountId);
  const isTenantReady = hasApiKey && hasPublishAccount;

  return {
    workspaceId,
    apiKey,
    publishAccountId,
    savedAccounts,
    apiKeySource,
    accountSource,
    hasApiKey,
    hasPublishAccount,
    isTenantReady,
  };
}

export function assertTenantHasApiKey(
  config: MertcafeTenantConfig,
): { ok: true } | { ok: false; error: string; code: MertcafeTenantErrorCode } {
  return assertTenantMertcafeReady(config, { requirePublishAccount: false });
}

export function assertTenantMertcafeReady(
  config: MertcafeTenantConfig,
  options?: { requirePublishAccount?: boolean },
): { ok: true } | { ok: false; error: string; code: MertcafeTenantErrorCode } {
  const requireAccount = options?.requirePublishAccount !== false;

  if (!config.workspaceId) {
    return {
      ok: false,
      code: 'MISSING_WORKSPACE',
      error: 'Tenant (workspaceId) belirtilmedi.',
    };
  }
  if (!config.hasApiKey) {
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      error:
        `Bu tenant (${config.workspaceId.slice(0, 8)}…) için Mertcafe API anahtarı yok. ` +
        'Marka → Ayarlar → Mertcafe bölümünden kayıt oluşturun veya API anahtarını kaydedin.',
    };
  }
  if (requireAccount && !config.hasPublishAccount) {
    return {
      ok: false,
      code: 'MISSING_PUBLISH_ACCOUNT',
      error:
        'Bu tenant için yayın hesap ID tanımlı değil. OAuth tamamlayın veya kayıtlı hesaplardan birini seçin.',
    };
  }
  return { ok: true };
}

export function tenantMertcafeErrorMessage(code: MertcafeTenantErrorCode): string {
  switch (code) {
    case 'MISSING_WORKSPACE':
      return 'Tenant seçili değil.';
    case 'MISSING_API_KEY':
      return 'Bu tenant için Mertcafe API anahtarı yapılandırılmamış.';
    case 'MISSING_PUBLISH_ACCOUNT':
      return 'Bu tenant için Instagram yayın hesap ID seçilmemiş.';
    default:
      return 'Mertcafe tenant yapılandırması eksik.';
  }
}

/**
 * Mertcafe (Zernio legacy) publish config — per-tenant API key + Instagram account.
 * Global env vars are dev-only (MERTCAFE_ALLOW_GLOBAL_FALLBACK=true).
 */

function parseJsonMap(raw: string | undefined): Record<string, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && typeof v === 'string' && v.trim()) {
        out[k.trim().toLowerCase()] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

const workspaceApiKeys = parseJsonMap(process.env.MERTCAFE_WORKSPACE_API_KEYS);
const workspaceInstagramAccounts = parseJsonMap(process.env.MERTCAFE_WORKSPACE_INSTAGRAM_ACCOUNTS);

function allowGlobalFallback(): boolean {
  return process.env.MERTCAFE_ALLOW_GLOBAL_FALLBACK === 'true';
}

function workspaceKey(workspaceId?: string): string {
  return workspaceId?.trim().toLowerCase() ?? '';
}

/** Per-tenant API key from env map only (not global). */
export function resolveMertcafeEnvApiKey(workspaceId: string): string {
  return workspaceApiKeys[workspaceKey(workspaceId)] ?? '';
}

/** Per-tenant account id from env map only (not global). */
export function resolveMertcafeEnvAccountId(workspaceId: string): string {
  return workspaceInstagramAccounts[workspaceKey(workspaceId)] ?? '';
}

/**
 * Resolve API key: theme caller passes theme value first.
 * Without workspaceId: global key (scripts). With workspaceId: theme → env map → optional global.
 */
export function resolveMertcafeApiKey(workspaceId?: string, themeApiKey?: string): string {
  const fromTheme = themeApiKey?.trim() ?? '';
  if (fromTheme) return fromTheme;

  const ws = workspaceKey(workspaceId);
  if (ws) {
    const perWs = workspaceApiKeys[ws];
    if (perWs) return perWs;
    if (allowGlobalFallback()) {
      return (process.env.MERTCAFE_API_KEY ?? '').trim();
    }
    return '';
  }

  return (process.env.MERTCAFE_API_KEY ?? '').trim();
}

/**
 * Resolve publish account id for a tenant. Never uses global MERTCAFE_INSTAGRAM_ACCOUNT_ID
 * when workspaceId is set (prevents cross-tenant bleed).
 */
export function resolveMertcafeInstagramAccountId(
  workspaceId?: string,
  bodyAccountId?: string,
  themeAccountId?: string,
): string | undefined {
  const fromBody = bodyAccountId?.trim();
  if (fromBody) return fromBody;

  const fromTheme = themeAccountId?.trim();
  if (fromTheme) return fromTheme;

  const ws = workspaceKey(workspaceId);
  if (ws) {
    const perWs = workspaceInstagramAccounts[ws];
    if (perWs) return perWs;
    return undefined;
  }

  const global = (process.env.MERTCAFE_INSTAGRAM_ACCOUNT_ID ?? '').trim();
  return global || undefined;
}

export function appendMertcafeAccountToPayload(
  payload: Record<string, unknown>,
  workspaceId: string | undefined,
  bodyAccountId?: string,
  tenantAccountId?: string,
): void {
  const accountId = resolveMertcafeInstagramAccountId(
    workspaceId,
    bodyAccountId,
    tenantAccountId,
  );
  if (!accountId) return;
  payload.account_id = accountId;
  payload.platform = 'instagram';
}

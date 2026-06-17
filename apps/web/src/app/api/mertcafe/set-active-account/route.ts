import { NextRequest, NextResponse } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';
import {
  mergeMertcafeSavedAccounts,
  normalizeMertcafeAccountId,
  parseMertcafeSavedAccounts,
} from '@/lib/mertcafe-accounts';

export const runtime = 'nodejs';

type Body = {
  workspaceId?: string;
  accountId?: string;
  label?: string;
  remember?: boolean;
};

function formatUpstreamError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return '';
        const rec = item as Record<string, unknown>;
        const loc = Array.isArray(rec.loc) ? rec.loc.join('.') : '';
        const msg = String(rec.msg ?? rec.message ?? '').trim();
        return loc && msg ? `${loc}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join('; ');
  }
  if (detail && typeof detail === 'object') {
    const msg = String((detail as Record<string, unknown>).message ?? '').trim();
    if (msg) return msg;
  }
  return fallback;
}

/** POST — set active Mertcafe publish account (brand_theme). */
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
  const accountId = normalizeMertcafeAccountId(body.accountId);
  if (!accountId) {
    return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
  }

  const themeRes = await fetchCrewBackendJson<{ theme?: Record<string, unknown> | null }>(
    `/api/v1/brand-context/${workspaceId}/theme`,
    { timeoutMs: 12_000 },
  );
  const theme =
    themeRes.ok && themeRes.data?.theme && typeof themeRes.data.theme === 'object'
      ? { ...themeRes.data.theme }
      : {};

  const existing = parseMertcafeSavedAccounts(
    theme.mertcafe_instagram_accounts ?? theme.mertcafeInstagramAccounts,
  );
  const label = body.label?.trim() || undefined;
  const remember = body.remember !== false;

  const patch: Record<string, unknown> = {
    mertcafe_instagram_account_id: accountId,
  };
  if (remember) {
    patch.mertcafe_instagram_accounts = mergeMertcafeSavedAccounts(existing, {
      id: accountId,
      label,
    });
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
    return NextResponse.json(
      {
        error: formatUpstreamError(
          errBody.detail ?? errBody.error,
          'Failed to save account',
        ),
      },
      { status: patchRes.status || 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    instagram_account_id: accountId,
    theme: patchRes.data?.theme ?? null,
  });
}

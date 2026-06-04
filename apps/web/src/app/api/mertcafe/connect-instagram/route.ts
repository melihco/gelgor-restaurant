import { NextRequest, NextResponse } from 'next/server';
import {
  loadMertcafeWorkspaceConfig,
  mertcafeConnectErrorMessage,
  mertcafeGetInstagramConnectUrl,
} from '@/lib/mertcafe-api';
import { requireMertcafeWorkspaceId } from '@/lib/mertcafe-tenant';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** GET — Mertcafe collection §3: Instagram OAuth bağlama URL'i */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const wsCheck = requireMertcafeWorkspaceId(request.nextUrl.searchParams.get('workspaceId'));
  if (!wsCheck.ok) {
    return NextResponse.json({ error: wsCheck.error, code: wsCheck.code }, { status: 400 });
  }
  const workspaceId = wsCheck.workspaceId;

  const tenant = await loadMertcafeWorkspaceConfig(workspaceId);
  if (!tenant.hasApiKey) {
    return NextResponse.json(
      {
        error: 'Bu tenant için Mertcafe API anahtarı yok. Önce "Mertcafe kaydı oluştur" ile anahtar üretin.',
        code: 'MISSING_API_KEY',
      },
      { status: 422 },
    );
  }

  try {
    const result = await mertcafeGetInstagramConnectUrl(tenant.apiKey);
    if (!result.ok || !result.authUrl) {
      return NextResponse.json(
        {
          error: mertcafeConnectErrorMessage(result.data),
          code: 'AUTH_URL_UNAVAILABLE',
          upstream_status: result.status,
        },
        { status: result.status >= 400 ? result.status : 502 },
      );
    }
    return NextResponse.json({ auth_url: result.authUrl, workspaceId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Instagram connect failed' },
      { status: 503 },
    );
  }
}

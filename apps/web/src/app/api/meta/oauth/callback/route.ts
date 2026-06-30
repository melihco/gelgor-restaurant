import { NextRequest, NextResponse } from 'next/server';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';

const CREW_API = serverConfig.crewBackend.baseUrl;
const INTERNAL_KEY = serverConfig.internal.apiKey;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${origin}/?meta_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/?meta_error=missing_params`);
  }

  // Validate state cookie
  const savedState = request.cookies.get('meta_oauth_state')?.value;
  if (savedState !== state) {
    return NextResponse.redirect(`${origin}/?meta_error=state_mismatch`);
  }

  let workspaceId = '';
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
    workspaceId = decoded.workspaceId ?? '';
  } catch {
    return NextResponse.redirect(`${origin}/?meta_error=invalid_state`);
  }

  const redirectUri = `${origin}/api/meta/oauth/callback`;

  // Exchange code via Python backend
  try {
    const res = await fetch(`${CREW_API}/api/v1/social/meta/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
      },
      body: JSON.stringify({ code, workspace_id: workspaceId, redirect_uri: redirectUri }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.redirect(
        `${origin}/?meta_error=${encodeURIComponent(data.detail ?? 'connect_failed')}`
      );
    }

    const response = NextResponse.redirect(
      `${origin}/?meta_connected=1&ig_username=${encodeURIComponent(data.ig_username ?? '')}`
    );
    response.cookies.delete('meta_oauth_state');
    return response;

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.redirect(`${origin}/?meta_error=${encodeURIComponent(msg)}`);
  }
}

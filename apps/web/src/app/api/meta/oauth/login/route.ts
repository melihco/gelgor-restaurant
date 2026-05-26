import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SCOPES = [
  'instagram_basic',
  'instagram_manage_insights',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'ads_management',
  'ads_read',
  'business_management',
].join(',');

export async function GET(request: NextRequest): Promise<NextResponse> {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: 'META_APP_ID is not configured' }, { status: 503 });
  }

  const workspaceId = request.nextUrl.searchParams.get('workspaceId') ?? '';
  // Use NEXT_PUBLIC_SITE_URL if set (e.g. ngrok for local dev) — Meta requires HTTPS
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || request.nextUrl.origin;
  const redirectUri = `${origin}/api/meta/oauth/callback`;

  const state = Buffer.from(JSON.stringify({ workspaceId, ts: Date.now() })).toString('base64');

  const oauthUrl = new URL('https://www.facebook.com/dialog/oauth');
  oauthUrl.searchParams.set('client_id', appId);
  oauthUrl.searchParams.set('redirect_uri', redirectUri);
  oauthUrl.searchParams.set('scope', SCOPES);
  oauthUrl.searchParams.set('state', state);
  oauthUrl.searchParams.set('response_type', 'code');

  const response = NextResponse.redirect(oauthUrl.toString());
  response.cookies.set('meta_oauth_state', state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: '/',
    sameSite: 'lax',
  });

  return response;
}

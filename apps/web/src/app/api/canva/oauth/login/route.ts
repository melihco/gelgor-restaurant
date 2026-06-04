import { NextRequest, NextResponse } from 'next/server';
import {
  buildCanvaAuthorizeUrl,
  createCanvaOAuthState,
  getCanvaOAuthConfig,
} from '@/lib/canva-oauth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const canvaBlocked = (await import('@/lib/canva-route-guard')).assertCanvaRouteEnabled();
    if (canvaBlocked) return canvaBlocked;

    const origin = request.nextUrl.origin;
    const config = getCanvaOAuthConfig(origin);
    const { codeVerifier, codeChallenge, state } = createCanvaOAuthState();
    const response = NextResponse.redirect(buildCanvaAuthorizeUrl(config, state, codeChallenge));

    response.cookies.set('canva_oauth_state', state, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
    response.cookies.set('canva_code_verifier', codeVerifier, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Canva OAuth login failed.' },
      { status: 500 },
    );
  }
}

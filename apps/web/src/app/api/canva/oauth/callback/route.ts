import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCanvaCodeForToken,
  getCanvaAppOrigin,
  getCanvaOAuthConfig,
  saveCanvaToken,
} from '@/lib/canva-oauth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const canvaBlocked = (await import('@/lib/canva-route-guard')).assertCanvaRouteEnabled();
  if (canvaBlocked) return canvaBlocked;

  const error = request.nextUrl.searchParams.get('error');
  if (error) {
    const description = request.nextUrl.searchParams.get('error_description') ?? error;
    return redirectWithStatus(request, 'error', description);
  }

  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get('canva_oauth_state')?.value;
  const codeVerifier = request.cookies.get('canva_code_verifier')?.value;

  if (!code || !state || !expectedState || !codeVerifier || state !== expectedState) {
    return redirectWithStatus(request, 'error', 'Invalid Canva OAuth callback state.');
  }

  try {
    const token = await exchangeCanvaCodeForToken(code, codeVerifier, getCanvaOAuthConfig(request.nextUrl.origin));
    await saveCanvaToken(token);

    const response = redirectWithStatus(request, 'connected', 'Canva connected successfully.');
    response.cookies.delete('canva_oauth_state');
    response.cookies.delete('canva_code_verifier');
    return response;
  } catch (exchangeError) {
    return redirectWithStatus(
      request,
      'error',
      exchangeError instanceof Error ? exchangeError.message : 'Canva token exchange failed.',
    );
  }
}

function redirectWithStatus(request: NextRequest, status: 'connected' | 'error', message: string) {
  const url = new URL('/', getCanvaAppOrigin(request.nextUrl.origin));
  url.searchParams.set('canva', status);
  url.searchParams.set('message', message);
  return NextResponse.redirect(url);
}

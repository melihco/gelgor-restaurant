import { NextRequest, NextResponse } from 'next/server';
import { getCanvaAccessToken } from '@/lib/canva-oauth';
import { loadCanvaTemplates } from '@/lib/canva-template-catalog';
import { getCanvaTenantId } from '@/lib/canva-template-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const tenantId = getCanvaTenantId(request.nextUrl.searchParams.get('tenantId'));
    const officeId = request.nextUrl.searchParams.get('officeId');
    const token = await getCanvaAccessToken();
    if (!token) {
      return NextResponse.json({
        tenantId,
        connected: false,
        templateCount: 0,
        templates: [],
        connectUrl: '/api/canva/oauth/login',
      });
    }

    let templates: Awaited<ReturnType<typeof loadCanvaTemplates>> = [];
    let templatesError: string | undefined;
    try {
      templates = await loadCanvaTemplates(token, undefined, tenantId, officeId);
    } catch (err) {
      templatesError = err instanceof Error ? err.message : 'Canva template list failed.';
    }
    return NextResponse.json({
      tenantId,
      connected: true,
      templateCount: templates.length,
      templates: templates.slice(0, 12),
      connectUrl: '/api/canva/oauth/login',
      ...(templatesError ? { templatesError } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        tenantId: getCanvaTenantId(request.nextUrl.searchParams.get('tenantId')),
        templateCount: 0,
        templates: [],
        connectUrl: '/api/canva/oauth/login',
        error: error instanceof Error ? error.message : 'Canva status check failed.',
      },
      { status: 502 },
    );
  }
}

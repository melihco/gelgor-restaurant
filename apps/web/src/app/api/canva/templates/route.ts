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
      return NextResponse.json(
        { tenantId, error: 'Canva is not connected.', connectUrl: '/api/canva/oauth/login', templates: [] },
        { status: 401 },
      );
    }

    const templates = await loadCanvaTemplates(token, undefined, tenantId, officeId);
    return NextResponse.json({ tenantId, templates, count: templates.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Canva template fetch failed.', templates: [] },
      { status: 502 },
    );
  }
}

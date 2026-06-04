import { NextRequest, NextResponse } from 'next/server';
import { getCanvaTenantId, upsertCanvaTemplateRegistryEntry } from '@/lib/canva-template-registry';
import type { CanvaContentKind, CanvaAspectRatio } from '@/lib/canva-template-selection';

export const runtime = 'nodejs';

/**
 * PATCH /api/canva/template-meta
 * Saves manual metadata overrides (type, aspectRatio, etc.) to the template registry.
 */
export async function PATCH(request: NextRequest) {
  try {
    const canvaBlocked = (await import('@/lib/canva-route-guard')).assertCanvaRouteEnabled();
    if (canvaBlocked) return canvaBlocked;

    const body = await request.json() as {
      tenantId?: string;
      templateId?: string;
      contentKinds?: CanvaContentKind[];
      aspectRatio?: CanvaAspectRatio;
      title?: string;
      notes?: string;
    };

    const tenantId = getCanvaTenantId(body.tenantId ?? request.nextUrl.searchParams.get('tenantId'));

    if (!body.templateId) {
      return NextResponse.json({ error: 'templateId is required.' }, { status: 400 });
    }

    const entry = await upsertCanvaTemplateRegistryEntry({
      tenantId,
      templateId: body.templateId,
      ...(body.contentKinds !== undefined && { contentKinds: body.contentKinds }),
      ...(body.aspectRatio  !== undefined && { aspectRatio:  body.aspectRatio }),
      ...(body.title        !== undefined && { title:        body.title }),
      ...(body.notes        !== undefined && { notes:        body.notes }),
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Registry update failed.' }, { status: 500 });
  }
}

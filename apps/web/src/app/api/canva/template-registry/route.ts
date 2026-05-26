import { NextRequest, NextResponse } from 'next/server';
import {
  getCanvaTenantId,
  readCanvaTemplateRegistry,
  upsertCanvaTemplateRegistryEntry,
  type CanvaRegistryFieldContract,
  type CanvaTemplateRegistryEntry,
} from '@/lib/canva-template-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const tenantId = getCanvaTenantId(request.nextUrl.searchParams.get('tenantId'));
  const entries = await readCanvaTemplateRegistry(tenantId);
  return NextResponse.json({ tenantId, entries });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json() as Partial<CanvaTemplateRegistryEntry> & { fieldContracts?: CanvaRegistryFieldContract[] };
    if (!body.templateId) {
      return NextResponse.json({ error: 'templateId is required.' }, { status: 400 });
    }

    const entry = await upsertCanvaTemplateRegistryEntry({
      templateId: body.templateId,
      tenantId: getCanvaTenantId(body.tenantId),
      title: body.title,
      enabled: body.enabled,
      contentKinds: body.contentKinds,
      aspectRatio: body.aspectRatio,
      objectives: body.objectives,
      tones: body.tones,
      industries: body.industries,
      useCases: body.useCases,
      templateFamilyId: body.templateFamilyId,
      allowedIntents: body.allowedIntents,
      allowedChannels: body.allowedChannels,
      requiredAssetIntents: body.requiredAssetIntents,
      riskTier: body.riskTier,
      status: body.status,
      manualApprovalRequired: body.manualApprovalRequired,
      locale: body.locale,
      brandFit: body.brandFit,
      priority: body.priority,
      tags: body.tags,
      notes: body.notes,
      fieldContracts: body.fieldContracts,
      previewUrl: body.previewUrl,
      previewUpdatedAt: body.previewUpdatedAt,
      previewStale: body.previewStale,
      previewRendererProvider: body.previewRendererProvider,
      previewDesignId: body.previewDesignId,
      previewJobId: body.previewJobId,
      previewHash: body.previewHash,
      previewFormat: body.previewFormat,
      previewMimeType: body.previewMimeType,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Canva template registry update failed.' },
      { status: 500 },
    );
  }
}

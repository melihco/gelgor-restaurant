/**
 * GET /api/remotion/showcase/diversify
 * Simüle tenant kütüphaneleri + çeşitlilik skoru (aynı sektör çakışma analizi).
 */
import { NextRequest, NextResponse } from 'next/server';
import { AGENCY_BRAND_KITS } from '@/lib/agency-brand-kits';
import {
  scoreLibraryDiversity,
  simulateTenantLibraries,
} from '@/lib/brand-template-diversification';
import { deriveBrandTemplateLibrary } from '@/lib/brand-template-library';
import { buildBrandFingerprint } from '@/lib/tenant-template-seed';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const sector = url.searchParams.get('sector') ?? 'moving_logistics';
  const kitId = url.searchParams.get('kitId') ?? undefined;
  const count = Math.min(Number(url.searchParams.get('count') ?? 10) || 10, 24);
  const workspaceId = url.searchParams.get('workspace') ?? url.searchParams.get('workspaceId');

  const libraries = simulateTenantLibraries({ sector, kitId, count });

  if (workspaceId?.trim()) {
    const kit = AGENCY_BRAND_KITS.find((k) => k.id === kitId)
      ?? AGENCY_BRAND_KITS.find((k) => k.sector === sector);
    const fingerprint = buildBrandFingerprint({
      tenantId: workspaceId,
      brandName: kit?.name,
      primaryColor: kit?.primaryColor,
      accentColor: kit?.accentColor,
      headingFont: kit?.headingFont,
      motionStyle: kit?.motionStyle,
    });
    libraries[0] = deriveBrandTemplateLibrary({
      kitId: kit?.id ?? kitId,
      sector,
      tenantId: workspaceId,
      brandFingerprint: fingerprint,
    });
  }

  const report = scoreLibraryDiversity(libraries);

  return NextResponse.json({
    sector,
    kitId: kitId ?? libraries[0]?.kitId,
    report,
    libraries: libraries.map((lib) => ({
      tenantId: lib.tenantId,
      kitId: lib.kitId,
      slots: lib.slots.map((s) => ({
        key: s.key,
        labelTr: s.labelTr,
        storyTemplateId: s.storyTemplateId,
        posterTemplateId: s.posterTemplateId,
      })),
    })),
  });
}

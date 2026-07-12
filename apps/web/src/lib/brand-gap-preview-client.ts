import { fetchTenantBff } from '@/lib/bff-fetch';
import { getTenantBffHeaders } from '@/lib/runtime-config';
import {
  buildBrandGapAnalysisInput,
  mergeBrandGapLists,
  type BrandGapItem,
} from '@/lib/brand-gap-analysis';
import type { BrandReadinessCheck } from '@/lib/brand-readiness';

export interface BrandGapPreviewResult {
  gaps: BrandGapItem[];
  mergedGaps: BrandGapItem[];
  ctx: Record<string, unknown> | null;
}

/** Load gap preview with the same data sources as /api/brand-readiness (avoids false 0/x counts). */
export async function fetchBrandGapPreview(tenantId: string): Promise<BrandGapPreviewResult> {
  const headers = getTenantBffHeaders(tenantId);
  const [gapRes, ctxRes, galleryRes, briefsRes, readinessRes] = await Promise.all([
    fetchTenantBff(`/api/brand-context/${tenantId}/complete-gaps`, tenantId, { headers }),
    fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, { headers }),
    fetchTenantBff(`/api/brand-context/${tenantId}/gallery-analysis`, tenantId, { headers }),
    fetchTenantBff(`/api/brand-context/${tenantId}/all-briefs`, tenantId, { headers }),
    fetchTenantBff(`/api/brand-readiness/${tenantId}`, tenantId, { headers }),
  ]);

  const gaps = gapRes.ok
    ? ((await gapRes.json()) as { gaps?: BrandGapItem[] }).gaps ?? []
    : [];
  const ctx = ctxRes.ok
    ? ((await ctxRes.json()) as Record<string, unknown>)
    : null;
  const galleryAnalysis = galleryRes.ok
    ? ((await galleryRes.json()) as Record<string, unknown>)
    : null;
  const briefs = briefsRes.ok
    ? ((await briefsRes.json()) as { brand_dna?: unknown; visual_dna?: unknown })
    : null;
  const readiness = readinessRes.ok
    ? ((await readinessRes.json()) as {
      inputs?: {
        discoveryConfidence?: number;
        usablePhotoCount?: number;
        analyzedPhotoCount?: number;
        contentPillarCount?: number;
        defaultCtaCount?: number;
        hasBrandDna?: boolean;
      };
      missing?: BrandReadinessCheck[];
      productionProfile?: { missing?: Array<{ id: string; label: string }> };
    })
    : null;

  const gapInput = buildBrandGapAnalysisInput({
    ctx,
    briefs,
    galleryAnalysis,
    readiness,
  });
  const mergedGaps = gapInput ? mergeBrandGapLists(gaps, gapInput) : gaps;

  return { gaps, mergedGaps, ctx };
}

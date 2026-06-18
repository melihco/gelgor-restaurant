import type {
  BrandProfileSnapshot,
  ProductionBrandContextSnapshot,
  ProductionGalleryAnalysisEntry,
  ProductionVisualContext,
} from '@smartagency/contracts';
import { parseBrandReferenceUrls } from '@/lib/gallery-upload';

function parseStringList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeGalleryAnalysis(
  raw: unknown,
): Record<string, ProductionGalleryAnalysisEntry> {
  const parsed = (() => {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        const json = JSON.parse(raw) as unknown;
        return json && typeof json === 'object' ? json : {};
      } catch {
        return {};
      }
    }
    return raw && typeof raw === 'object' ? raw : {};
  })() as Record<string, Record<string, unknown>>;

  return Object.fromEntries(
    Object.entries(parsed).map(([url, meta]) => [
      url,
      {
        url,
        contentTags: Array.isArray(meta.contentTags) ? meta.contentTags.map(String) : undefined,
        description: typeof meta.description === 'string' ? meta.description : undefined,
        usageContext: typeof meta.usageContext === 'string' ? meta.usageContext : undefined,
        mood: typeof meta.mood === 'string' ? meta.mood : undefined,
        bestFor: Array.isArray(meta.bestFor) ? meta.bestFor.map(String) : undefined,
        notGoodFor: Array.isArray(meta.notGoodFor) ? meta.notGoodFor.map(String) : undefined,
        suggestedAssetType: typeof meta.suggestedAssetType === 'string' ? meta.suggestedAssetType : undefined,
        isLogo: typeof meta.isLogo === 'boolean' ? meta.isLogo : undefined,
        captionHooks: Array.isArray(meta.captionHooks) ? meta.captionHooks.map(String) : undefined,
        pairingKeywords: Array.isArray(meta.pairingKeywords) ? meta.pairingKeywords.map(String) : undefined,
      } satisfies ProductionGalleryAnalysisEntry,
    ]),
  );
}

export function mergeProductionBrandContextSnapshot(input: {
  workspaceId: string;
  brand: BrandProfileSnapshot;
  brandContext: Record<string, unknown>;
}): ProductionBrandContextSnapshot {
  const brand = (input.brand ?? {}) as BrandProfileSnapshot;
  const brandContext = input.brandContext ?? {};
  const gallery = Array.isArray(brand.gallery) ? brand.gallery : [];
  const generatedAt = new Date().toISOString();
  const visualContext: ProductionVisualContext = {
    businessName: String(brandContext.business_name ?? brand.brandName ?? ''),
    businessType: String(brandContext.business_type ?? brand.businessType ?? ''),
    description: String(brandContext.description ?? brand.description ?? ''),
    brandTone: String(brandContext.brand_tone ?? brand.brandTone ?? ''),
    visualStyle: String(brandContext.visual_style ?? ''),
    targetAudience: String(brandContext.target_audience ?? brand.targetAudience ?? ''),
    location: String(brandContext.location ?? brand.location ?? ''),
    websiteSummary: String(brandContext.website_summary ?? brand.websiteSummary ?? ''),
    instagramBio: String(brandContext.instagram_bio ?? brand.instagramBio ?? ''),
    brandDna: (brandContext.brand_dna ?? brand.brandDna) as string | Record<string, unknown> | undefined,
    visualDna: String(brandContext.visual_dna ?? brand.visualDna ?? ''),
    logoUrl: String(
      brandContext.logo_url
      ?? gallery.find((item) => item.kind === 'logo')?.url
      ?? '',
    ) || undefined,
    brandVibeProfile: brandContext.brand_vibe_profile as Record<string, unknown> | undefined,
    websiteIntelligence: (brandContext.website_intelligence ?? null) as
      Record<string, unknown> | string | null,
    contentPillars: parseStringList(brandContext.content_pillars),
    defaultCtas: parseStringList(brandContext.default_ctas),
    customRules: String(brandContext.custom_rules ?? ''),
    referenceImageUrls: parseBrandReferenceUrls(brandContext.reference_image_urls),
  };
  return {
    workspaceId: input.workspaceId,
    tenantId: brand.tenantId ?? input.workspaceId,
    brand: { ...brand, gallery },
    visualContext,
    galleryAnalysis: normalizeGalleryAnalysis(brandContext.gallery_analysis),
    source: 'brand_profile_snapshot+brand_context',
    snapshotVersion: 1,
    generatedAt,
    createdAt: generatedAt,
  };
}

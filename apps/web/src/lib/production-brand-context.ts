import type {
  BrandProfileSnapshot,
  ProductionBrandContextSnapshot,
  ProductionGalleryAnalysisEntry,
  ProductionVisualContext,
} from '@smartagency/contracts';

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
  const generatedAt = new Date().toISOString();
  const visualContext: ProductionVisualContext = {
    businessName: String(input.brandContext.business_name ?? input.brand.brandName ?? ''),
    businessType: String(input.brandContext.business_type ?? input.brand.businessType ?? ''),
    description: String(input.brandContext.description ?? input.brand.description ?? ''),
    brandTone: String(input.brandContext.brand_tone ?? input.brand.brandTone ?? ''),
    visualStyle: String(input.brandContext.visual_style ?? ''),
    targetAudience: String(input.brandContext.target_audience ?? input.brand.targetAudience ?? ''),
    location: String(input.brandContext.location ?? input.brand.location ?? ''),
    websiteSummary: String(input.brandContext.website_summary ?? input.brand.websiteSummary ?? ''),
    instagramBio: String(input.brandContext.instagram_bio ?? input.brand.instagramBio ?? ''),
    brandDna: (input.brandContext.brand_dna ?? input.brand.brandDna) as string | Record<string, unknown> | undefined,
    visualDna: String(input.brandContext.visual_dna ?? input.brand.visualDna ?? ''),
    logoUrl: String(
      input.brandContext.logo_url
      ?? input.brand.gallery.find((item) => item.kind === 'logo')?.url
      ?? '',
    ) || undefined,
    brandVibeProfile: input.brandContext.brand_vibe_profile as Record<string, unknown> | undefined,
    websiteIntelligence: (input.brandContext.website_intelligence ?? null) as
      Record<string, unknown> | string | null,
    contentPillars: parseStringList(input.brandContext.content_pillars),
    defaultCtas: parseStringList(input.brandContext.default_ctas),
    customRules: String(input.brandContext.custom_rules ?? ''),
    referenceImageUrls: parseStringList(input.brandContext.reference_image_urls)
      .filter((url) => typeof url === 'string' && url.startsWith('http')),
  };
  return {
    workspaceId: input.workspaceId,
    tenantId: input.brand.tenantId,
    brand: input.brand,
    visualContext,
    galleryAnalysis: normalizeGalleryAnalysis(input.brandContext.gallery_analysis),
    source: 'brand_profile_snapshot+brand_context',
    snapshotVersion: 1,
    generatedAt,
    createdAt: generatedAt,
  };
}

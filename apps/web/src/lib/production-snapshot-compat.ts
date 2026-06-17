import type { ProductionBrandContextSnapshot } from '@smartagency/contracts';

export interface LegacyBrandContextLike {
  business_name: string;
  business_type: string;
  industry: string;
  description: string;
  brand_tone: string;
  visual_style: string;
  target_audience: string;
  location: string;
  website_summary: string;
  instagram_bio: string;
  brand_dna: string | Record<string, unknown>;
  visual_dna: string;
  logo_url: string;
  brand_vibe_profile?: Record<string, unknown>;
  website_intelligence?: Record<string, unknown> | string | null;
  content_pillars: string[];
  default_ctas: string[];
  custom_rules: string;
  reference_image_urls: string[];
  languages: string[];
  instagram_handle: string;
  brand_primary_color: string;
  brand_accent_color: string;
}

export function productionSnapshotToLegacyBrandContext(
  snapshot: ProductionBrandContextSnapshot | null | undefined,
): LegacyBrandContextLike | undefined {
  if (!snapshot) return undefined;
  const visual = snapshot.visualContext ?? ({} as ProductionBrandContextSnapshot['visualContext']);
  const brand = snapshot.brand ?? ({} as ProductionBrandContextSnapshot['brand']);
  const gallery = Array.isArray(brand.gallery) ? brand.gallery : [];
  const logoUrl = visual.logoUrl ?? gallery.find((item) => item.kind === 'logo')?.url ?? '';
  return {
    business_name: visual.businessName || brand.brandName || '',
    business_type: visual.businessType || brand.businessType || '',
    industry: visual.businessType || brand.businessType || '',
    description: visual.description || brand.description || '',
    brand_tone: visual.brandTone || brand.brandTone || '',
    visual_style: visual.visualStyle || '',
    target_audience: visual.targetAudience || brand.targetAudience || '',
    location: visual.location || brand.location || '',
    website_summary: visual.websiteSummary || brand.websiteSummary || '',
    instagram_bio: visual.instagramBio || brand.instagramBio || '',
    brand_dna: visual.brandDna ?? brand.brandDna ?? '',
    visual_dna: visual.visualDna || brand.visualDna || '',
    logo_url: logoUrl,
    brand_vibe_profile: visual.brandVibeProfile,
    website_intelligence: visual.websiteIntelligence,
    content_pillars: visual.contentPillars ?? [],
    default_ctas: visual.defaultCtas ?? [],
    custom_rules: visual.customRules ?? '',
    reference_image_urls: visual.referenceImageUrls ?? [],
    languages: brand.languages ?? [],
    instagram_handle: '',
    brand_primary_color: '',
    brand_accent_color: '',
  };
}

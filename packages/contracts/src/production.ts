import type { AuditStamp, ISODateString, UUID } from './common';
import type { BrandProfileSnapshot } from './brand';

export interface ProductionGalleryAnalysisEntry {
  url: string;
  contentTags?: string[];
  description?: string;
  usageContext?: string;
  mood?: string;
  bestFor?: string[];
  notGoodFor?: string[];
  suggestedAssetType?: string;
  isLogo?: boolean;
  captionHooks?: string[];
  pairingKeywords?: string[];
}

export interface ProductionVisualContext {
  businessName: string;
  businessType: string;
  description: string;
  brandTone: string;
  visualStyle: string;
  targetAudience: string;
  location: string;
  websiteSummary: string;
  instagramBio: string;
  brandDna?: string | Record<string, unknown>;
  visualDna?: string;
  logoUrl?: string;
  brandVibeProfile?: Record<string, unknown>;
  websiteIntelligence?: Record<string, unknown> | string | null;
  contentPillars: string[];
  defaultCtas: string[];
  customRules: string;
  referenceImageUrls: string[];
}

export interface ProductionBrandContextSnapshot extends AuditStamp {
  workspaceId: UUID;
  tenantId: UUID;
  brand: BrandProfileSnapshot;
  visualContext: ProductionVisualContext;
  galleryAnalysis: Record<string, ProductionGalleryAnalysisEntry>;
  source: 'brand_profile_snapshot+brand_context';
  snapshotVersion: number;
  generatedAt: ISODateString;
}

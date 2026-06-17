import type { AuditStamp, ISODateString, UUID } from './common';

export interface BrandThemeAiSettings {
  aiPhotoEnhance: boolean;
  aiPhotoEnhanceLevel: 'subtle' | 'moderate' | 'full';
  aiEnhanceGallerySelected: boolean;
  aiUseBrandIdentity: boolean;
  aiBriefDrivesScene: boolean;
  aiEmbedLogo: boolean;
  aiEnhanceFormats: Array<'post' | 'story' | 'carousel' | 'reel'>;
  aiVisualSubject: 'auto' | 'venue_ambiance' | 'product_hero';
  aiAdaptiveScene: boolean;
  aiAdaptiveSceneMode: 'auto' | 'venue_context' | 'product_showcase' | 'lifestyle_composite';
}

export interface BrandGalleryAsset extends AuditStamp {
  id: UUID;
  url: string;
  kind: 'logo' | 'hero' | 'gallery' | 'reference';
  caption?: string | null;
  tags?: string[];
  width?: number | null;
  height?: number | null;
}

export interface BrandProfileSnapshot extends AuditStamp {
  workspaceId: UUID;
  tenantId: UUID;
  brandName: string;
  businessType?: string | null;
  description?: string | null;
  targetAudience?: string | null;
  brandTone?: string | null;
  visualDna?: string | null;
  brandDna?: string | null;
  websiteSummary?: string | null;
  instagramBio?: string | null;
  location?: string | null;
  languages?: string[];
  gallery: BrandGalleryAsset[];
  themeAi: BrandThemeAiSettings;
  source: 'nexus' | 'crew' | 'merged';
  snapshotVersion: number;
  generatedAt: ISODateString;
}

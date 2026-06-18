import type { BrandProfileSnapshot } from '@smartagency/contracts';
import { parseBrandReferenceUrls } from '@/lib/gallery-upload';

type BrandProfileCoreSnapshot = {
  tenantId?: string;
  brandName?: string;
  industry?: string;
  location?: string;
  brandTone?: string;
  targetAudience?: string;
  visualStyle?: string;
  campaignGoals?: string;
  languages?: string[];
  logoUrl?: string;
  websiteUrl?: string;
  description?: string;
  instagramHandle?: string;
  googleBusinessUrl?: string;
  brandImageUrls?: string[];
  primaryFont?: string;
  secondaryFont?: string;
  brandColors?: string[];
  accentColors?: string[];
  customerVisibleSummary?: string;
  systemIntelligence?: string;
  discoveryConfidence?: number | null;
  creativeProfileConfirmedAt?: string | null;
};

function parseReferenceImageUrlList(raw: unknown): string[] {
  return parseBrandReferenceUrls(raw);
}

type BrandContextIntelligenceSnapshot = {
  workspace_id?: string;
  business_name?: string;
  business_type?: string;
  description?: string;
  target_audience?: string;
  brand_tone?: string;
  visual_style?: string;
  visual_dna?: string;
  brand_dna?: string | Record<string, unknown>;
  website_summary?: string;
  instagram_bio?: string;
  location?: string;
  languages?: string[];
  reference_image_urls?: string[];
  logo_url?: string;
  brand_theme?: Record<string, unknown>;
  brand_constitution_confirmed_at?: string | null;
};

export function mergeBrandProfileSnapshot(input: {
  workspaceId: string;
  core: BrandProfileCoreSnapshot;
  intelligence: BrandContextIntelligenceSnapshot;
}): BrandProfileSnapshot {
  const core = input.core ?? {};
  const intelligence = input.intelligence ?? {};
  const themeAi = (intelligence.brand_theme ?? {}) as Record<string, unknown>;
  const fromIntelligence = parseReferenceImageUrlList(intelligence.reference_image_urls);
  const fromCore = parseReferenceImageUrlList(core.brandImageUrls);
  const galleryUrls = fromIntelligence.length ? fromIntelligence : fromCore;
  const logoUrl = String(core.logoUrl || intelligence.logo_url || '').trim();

  const gallery = galleryUrls.map((url, index) => ({
    id: `${input.workspaceId}-gallery-${index + 1}`,
    url: String(url),
    kind: (String(url) === logoUrl ? 'logo' : 'reference') as 'logo' | 'reference',
    createdAt: new Date().toISOString(),
  }));
  if (logoUrl && !gallery.some((item) => item.kind === 'logo')) {
    gallery.unshift({
      id: `${input.workspaceId}-logo`,
      url: logoUrl,
      kind: 'logo',
      createdAt: new Date().toISOString(),
    });
  }

  return {
    workspaceId: input.workspaceId,
    tenantId: String(core.tenantId || input.workspaceId),
    brandName: String(core.brandName || intelligence.business_name || 'Unknown Brand'),
    businessType: String(intelligence.business_type || core.industry || ''),
    description: String(intelligence.description || core.description || ''),
    targetAudience: String(intelligence.target_audience || core.targetAudience || ''),
    brandTone: String(intelligence.brand_tone || core.brandTone || ''),
    visualDna: String(intelligence.visual_dna || ''),
    brandDna: typeof intelligence.brand_dna === 'string'
      ? intelligence.brand_dna
      : JSON.stringify(intelligence.brand_dna ?? ''),
    websiteSummary: String(intelligence.website_summary || core.customerVisibleSummary || ''),
    instagramBio: String(intelligence.instagram_bio || ''),
    location: String(intelligence.location || core.location || ''),
    languages: Array.isArray(intelligence.languages) && intelligence.languages.length
      ? intelligence.languages.map((item) => String(item))
      : Array.isArray(core.languages)
        ? core.languages.map((item) => String(item))
        : [],
    gallery,
    themeAi: {
      aiPhotoEnhance: Boolean(themeAi.ai_photo_enhance ?? themeAi.aiPhotoEnhance),
      aiPhotoEnhanceLevel: (String(themeAi.ai_photo_enhance_level ?? themeAi.aiPhotoEnhanceLevel ?? 'moderate') as 'subtle' | 'moderate' | 'full'),
      aiEnhanceGallerySelected: themeAi.ai_enhance_gallery_selected !== false && themeAi.aiEnhanceGallerySelected !== false,
      aiUseBrandIdentity: themeAi.ai_use_brand_identity !== false && themeAi.aiUseBrandIdentity !== false,
      aiBriefDrivesScene: themeAi.ai_brief_drives_scene !== false && themeAi.aiBriefDrivesScene !== false,
      aiEmbedLogo: themeAi.ai_embed_logo !== false && themeAi.aiEmbedLogo !== false,
      aiEnhanceFormats: Array.isArray(themeAi.ai_enhance_formats)
        ? themeAi.ai_enhance_formats.map((item) => String(item) as 'post' | 'story' | 'carousel' | 'reel')
        : ['post', 'story', 'carousel', 'reel'],
      aiVisualSubject: (String(themeAi.ai_visual_subject ?? themeAi.aiVisualSubject ?? 'auto') as 'auto' | 'venue_ambiance' | 'product_hero'),
      aiAdaptiveScene: Boolean(themeAi.ai_adaptive_scene ?? themeAi.aiAdaptiveScene),
      aiAdaptiveSceneMode: (String(themeAi.ai_adaptive_scene_mode ?? themeAi.aiAdaptiveSceneMode ?? 'auto') as 'auto' | 'venue_context' | 'product_showcase' | 'lifestyle_composite'),
    },
    source: 'merged',
    snapshotVersion: 1,
    generatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
}

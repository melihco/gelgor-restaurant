import { CREATIVE_VARIATION_KEYS } from './creative-direction';
import { EDITORIAL_LAYOUT_FAMILIES } from './layout-specification';
import {
  COPY_LIMITS,
  type CreativeVariationKey,
  type EditorialLayoutFamily,
  type PremiumEditorialCampaignRequest,
  type PremiumEditorialAspectRatio,
  type PremiumEditorialOutputType,
} from './types';

export interface RequestValidation {
  normalized: PremiumEditorialCampaignRequest;
  warnings: string[];
  errors: string[];
}

const ASPECTS = new Set<PremiumEditorialAspectRatio>(['4:5', '9:16', '1:1']);
const OUTPUTS = new Set<PremiumEditorialOutputType>(['post', 'story', 'square']);

export function validatePremiumEditorialRequest(
  raw: Partial<PremiumEditorialCampaignRequest> | Record<string, unknown>,
): RequestValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  const brandId = String(raw.brandId ?? '').trim();
  if (!brandId) errors.push('brandId is required');

  const contentTopic = String(raw.contentTopic ?? '').trim();
  if (!contentTopic) errors.push('contentTopic is required');

  const headline = String(raw.headline ?? contentTopic).trim();
  const subheadline = String(raw.subheadline ?? '').trim();
  const cta = String(raw.cta ?? '').trim();

  if (headline.length > COPY_LIMITS.headlineIdeal) {
    warnings.push(`Headline longer than ideal (${COPY_LIMITS.headlineIdeal} chars).`);
  }
  if (subheadline.length > COPY_LIMITS.subheadlineIdeal) {
    warnings.push(`Subheadline longer than ideal (${COPY_LIMITS.subheadlineIdeal} chars).`);
  }
  if (cta.length > COPY_LIMITS.ctaIdeal) {
    warnings.push(`CTA longer than ideal (${COPY_LIMITS.ctaIdeal} chars).`);
  }

  let numberOfVariations = Number(raw.numberOfVariations ?? 1);
  if (!Number.isFinite(numberOfVariations) || numberOfVariations < 1) numberOfVariations = 1;
  if (numberOfVariations > 4) {
    warnings.push('numberOfVariations capped at 4');
    numberOfVariations = 4;
  }

  const aspectRaw = raw.aspectRatio as string | undefined;
  const outputRaw = raw.outputType as string | undefined;
  const aspectRatio = (ASPECTS.has(aspectRaw as PremiumEditorialAspectRatio)
    ? aspectRaw
    : outputRaw === 'story'
      ? '9:16'
      : outputRaw === 'square'
        ? '1:1'
        : '4:5') as PremiumEditorialAspectRatio;

  const outputType = (OUTPUTS.has(outputRaw as PremiumEditorialOutputType)
    ? outputRaw
    : aspectRatio === '9:16'
      ? 'story'
      : aspectRatio === '1:1'
        ? 'square'
        : 'post') as PremiumEditorialOutputType;

  const preferredLayout = raw.preferredLayoutFamily as string | undefined;
  const preferredCreative = raw.preferredCreativeVariation as string | undefined;

  const normalized: PremiumEditorialCampaignRequest = {
    brandId,
    missionId: raw.missionId != null ? String(raw.missionId) : null,
    contentTopic,
    campaignGoal: raw.campaignGoal != null ? String(raw.campaignGoal) : null,
    headline,
    subheadline,
    cta,
    language: String(raw.language ?? 'tr'),
    outputType,
    aspectRatio,
    selectedGalleryAssetUrl: raw.selectedGalleryAssetUrl != null ? String(raw.selectedGalleryAssetUrl) : null,
    productAssetUrl: raw.productAssetUrl != null ? String(raw.productAssetUrl) : null,
    venueAssetUrl: raw.venueAssetUrl != null ? String(raw.venueAssetUrl) : null,
    logoAssetUrl: raw.logoAssetUrl != null ? String(raw.logoAssetUrl) : null,
    preferredLayoutFamily: EDITORIAL_LAYOUT_FAMILIES.includes(preferredLayout as EditorialLayoutFamily)
      ? (preferredLayout as EditorialLayoutFamily)
      : null,
    preferredCreativeVariation: (CREATIVE_VARIATION_KEYS as readonly string[]).includes(String(preferredCreative))
      ? (preferredCreative as CreativeVariationKey)
      : null,
    addTextOverlay: raw.addTextOverlay !== false,
    addLogoOverlay: raw.addLogoOverlay !== false,
    generateCaption: raw.generateCaption === true,
    generateHashtags: raw.generateHashtags === true,
    qualityPreset: 'PremiumMediterraneanEditorialV1',
    numberOfVariations,
    forceNewComposition: raw.forceNewComposition === true,
    recentVariationKeys: Array.isArray(raw.recentVariationKeys)
      ? (raw.recentVariationKeys as CreativeVariationKey[])
      : [],
    workspaceId: raw.workspaceId != null ? String(raw.workspaceId) : brandId,
    brandContext: (raw.brandContext as Record<string, unknown> | null | undefined) ?? null,
    brandTheme: (raw.brandTheme as Record<string, unknown> | null | undefined) ?? null,
    galleryAnalysis: (raw.galleryAnalysis as Record<string, unknown> | null | undefined) ?? null,
    brandReferenceImageUrls: Array.isArray(raw.brandReferenceImageUrls)
      ? (raw.brandReferenceImageUrls as unknown[]).map(String).filter(Boolean)
      : null,
    caption: raw.caption != null ? String(raw.caption) : null,
    mood: raw.mood != null ? String(raw.mood) : null,
    visualDirection: raw.visualDirection != null ? String(raw.visualDirection) : null,
  };

  return { normalized, warnings, errors };
}

/**
 * Premium Editorial Campaign — typed DTOs for the 5-layer prompt architecture.
 * PromptArchitectureVersion: premium-editorial-v1
 */

export const PREMIUM_EDITORIAL_PROMPT_VERSION = 'premium-editorial-v1' as const;
export const PREMIUM_EDITORIAL_SLOT_CODE = 'PREMIUM_EDITORIAL_CAMPAIGN' as const;
export const PREMIUM_EDITORIAL_QUALITY_PRESET = 'PremiumMediterraneanEditorialV1' as const;

export const MAX_IMAGE_GENERATION_ATTEMPTS = 3 as const;

export const COPY_LIMITS = {
  headlineIdeal: 55,
  subheadlineIdeal: 110,
  ctaIdeal: 24,
  headlineHard: 90,
  subheadlineHard: 160,
  ctaHard: 40,
} as const;

export type PremiumEditorialAspectRatio = '4:5' | '9:16' | '1:1';
export type PremiumEditorialOutputType = 'post' | 'story' | 'square';

export type CreativeVariationKey =
  | 'EditorialProductHero'
  | 'GoldenHourLifestyle'
  | 'DarkLuxuryStillLife'
  | 'MediterraneanTableScene'
  | 'ArchitecturalHospitality'
  | 'MinimalMaterialStudy'
  | 'SunsetDining'
  | 'CoastalRefreshment'
  | 'ChefCraft'
  | 'SeasonalEditorial';

export type EditorialLayoutFamily =
  | 'EditorialSplit'
  | 'AsymmetricHero'
  | 'SunsetForeground'
  | 'MaterialPanel'
  | 'CinematicNegativeSpace'
  | 'MagazineCover'
  | 'ProductRightTextLeft'
  | 'ProductLowerThird'
  | 'ImmersiveStory'
  | 'MinimalStillLife';

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrandVisualDNA {
  brandId: string;
  brandName: string;
  sector: string | null;
  subSector: string | null;
  location: string | null;
  city: string | null;
  country: string | null;
  venueType: string | null;
  productCategory: string | null;
  priceSegment: string | null;
  luxuryLevel: string | null;
  targetAudience: string | null;
  audienceAgeRange: string | null;
  customerMotivations: string[];
  brandPersonality: string | null;
  brandArchetype: string | null;
  brandTone: string | null;
  visualMood: string | null;
  emotionalKeywords: string[];
  primaryColors: string[];
  secondaryColors: string[];
  accentColors: string[];
  forbiddenColors: string[];
  preferredMaterials: string[];
  preferredTextures: string[];
  interiorStyle: string | null;
  architecturalStyle: string | null;
  photographyStyle: string | null;
  lightingStyle: string | null;
  shadowStyle: string | null;
  preferredCameraAngles: string[];
  preferredLensStyle: string | null;
  preferredDepthOfField: string | null;
  productPresentationStyle: string | null;
  foodStylingStyle: string | null;
  compositionPreferences: string[];
  preferredNegativeSpaceRatio: number | null;
  preferredLogoPosition: string | null;
  preferredTextAlignment: string | null;
  preferredTypographyCategory: string | null;
  headlineTone: string | null;
  ctaTone: string | null;
  preferredHeadlineLength: string | null;
  forbiddenVisualStyles: string[];
  competitorReferences: string[];
  inspirationReferences: string[];
  seasonalContext: string | null;
  localCulturalElements: string[];
  brandDistinctiveAssets: string[];
  logoAssetUrl: string | null;
  brandGalleryAssetIds: string[];
  existingSuccessfulContentReferences: string[];
  promptArchitectureVersion: typeof PREMIUM_EDITORIAL_PROMPT_VERSION;
}

export interface CreativeDirectionBrief {
  campaignConcept: string;
  creativeIdea: string;
  mainVisualStory: string;
  emotionalObjective: string;
  visualNarrative: string;
  heroSubject: string;
  supportingElements: string[];
  environment: string;
  timeOfDay: string;
  lightingDirection: string;
  lightingMood: string;
  colorTreatment: string;
  materialTreatment: string;
  photographyDirection: string;
  cameraAngle: string;
  lensDescription: string;
  depthOfField: string;
  productScale: string;
  productPlacement: string;
  humanPresencePolicy: string;
  stylingInstructions: string[];
  backgroundAtmosphere: string;
  negativeSpaceStrategy: string;
  visualHierarchy: string;
  distinctiveBrandElements: string[];
  forbiddenElements: string[];
  qualityKeywords: string[];
  outputFormat: PremiumEditorialOutputType;
  aspectRatio: PremiumEditorialAspectRatio;
  contentSafeArea: string;
  textWillBeRenderedSeparately: true;
  logoWillBeRenderedSeparately: true;
  creativeVariationKey: CreativeVariationKey;
  qualityPreset: typeof PREMIUM_EDITORIAL_QUALITY_PRESET;
  promptArchitectureVersion: typeof PREMIUM_EDITORIAL_PROMPT_VERSION;
}

export interface LayoutSpecification {
  family: EditorialLayoutFamily;
  canvas: {
    aspectRatio: PremiumEditorialAspectRatio;
    width: number;
    height: number;
  };
  safeArea: { top: number; right: number; bottom: number; left: number };
  heroZone: NormalizedRect;
  headlineZone: NormalizedRect;
  bodyZone: NormalizedRect;
  ctaZone: NormalizedRect;
  logoZone: NormalizedRect;
  negativeSpaceRatio: number;
  textContrastStrategy: 'light-on-dark' | 'dark-on-light' | 'mixed';
  visualBalance: 'asymmetric' | 'balanced' | 'centered';
  textBackgroundTreatment: string;
  promptArchitectureVersion: typeof PREMIUM_EDITORIAL_PROMPT_VERSION;
}

export interface TextLayoutInput {
  headline: string;
  subheadline: string;
  cta: string;
  disclaimer?: string;
  language: string;
  fontFamily: string;
  fontWeight: number;
  minFontSize: number;
  maxFontSize: number;
  maxHeadlineLines: number;
  maxSubheadlineLines: number;
  letterSpacing: number;
  lineHeight: number;
  alignment: 'left' | 'center' | 'right';
}

export interface TextLayoutResult {
  input: TextLayoutInput;
  fittedHeadline: string;
  fittedSubheadline: string;
  fittedCta: string;
  headlineLines: string[];
  subheadlineLines: string[];
  headlineFontSize: number;
  subheadlineFontSize: number;
  ctaFontSize: number;
  warnings: string[];
  selectedLayoutFamily: EditorialLayoutFamily;
}

export interface CompiledImagePrompt {
  finalPrompt: string;
  sections: Record<string, string>;
  modelName: string | null;
  promptArchitectureVersion: typeof PREMIUM_EDITORIAL_PROMPT_VERSION;
  qualityPreset: typeof PREMIUM_EDITORIAL_QUALITY_PRESET;
}

export interface VisualQualityAssessment {
  isApproved: boolean;
  overallScore: number;
  brandFitScore: number;
  compositionScore: number;
  photographyScore: number;
  textReadabilityScore: number;
  logoIntegrityScore: number;
  negativeSpaceScore: number;
  realismScore: number;
  productIntegrityScore: number;
  detectedText: string[];
  detectedBrandErrors: string[];
  detectedLayoutViolations: string[];
  detectedArtifacts: string[];
  regenerationInstructions: string[];
  failureReasonCodes: string[];
  stage: 'background' | 'final';
  promptArchitectureVersion: typeof PREMIUM_EDITORIAL_PROMPT_VERSION;
}

export interface GenerationAttemptRecord {
  attempt: number;
  compiledPrompt: string;
  layoutFamily: EditorialLayoutFamily;
  creativeVariationKey: CreativeVariationKey;
  backgroundImageUrl: string | null;
  qualityAssessment: VisualQualityAssessment | null;
  error: string | null;
  durationMs: number;
}

export interface PremiumEditorialCampaignRequest {
  brandId: string;
  missionId?: string | null;
  contentTopic: string;
  campaignGoal?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  cta?: string | null;
  language?: string | null;
  outputType?: PremiumEditorialOutputType | null;
  aspectRatio?: PremiumEditorialAspectRatio | null;
  selectedGalleryAssetUrl?: string | null;
  productAssetUrl?: string | null;
  venueAssetUrl?: string | null;
  logoAssetUrl?: string | null;
  preferredLayoutFamily?: EditorialLayoutFamily | null;
  preferredCreativeVariation?: CreativeVariationKey | null;
  addTextOverlay?: boolean;
  addLogoOverlay?: boolean;
  generateCaption?: boolean;
  generateHashtags?: boolean;
  qualityPreset?: typeof PREMIUM_EDITORIAL_QUALITY_PRESET | null;
  numberOfVariations?: number;
  forceNewComposition?: boolean;
  recentVariationKeys?: CreativeVariationKey[];
  workspaceId?: string | null;
  /** Brand context snapshot — avoids extra DB roundtrip when available. */
  brandContext?: Record<string, unknown> | null;
  brandTheme?: Record<string, unknown> | null;
  /** Gallery analysis map (url → meta) — used to match idea → photo. */
  galleryAnalysis?: Record<string, unknown> | null;
  /** Extra candidate gallery URLs (production-loop brand refs). */
  brandReferenceImageUrls?: string[] | null;
  /** Idea caption / mood for gallery matcher (mission path). */
  caption?: string | null;
  mood?: string | null;
  visualDirection?: string | null;
  signal?: AbortSignal;
}

export interface PremiumEditorialCampaignResult {
  slotId: typeof PREMIUM_EDITORIAL_SLOT_CODE;
  generationId: string;
  status: 'completed' | 'failed' | 'partial';
  backgroundImageUrl: string | null;
  finalImageUrl: string | null;
  thumbnailUrl: string | null;
  brandVisualDna: BrandVisualDNA;
  creativeDirection: CreativeDirectionBrief;
  layoutSpecification: LayoutSpecification;
  textLayout: TextLayoutResult;
  qualityAssessment: VisualQualityAssessment | null;
  generationAttempts: GenerationAttemptRecord[];
  warnings: string[];
  finalCompiledPrompt: string;
  promptVersion: typeof PREMIUM_EDITORIAL_PROMPT_VERSION;
  modelName: string | null;
  createdAt: string;
  generationDurationMs: number;
  costEstimateUsd: number | null;
  /** Gallery photo selected for this idea (SSOT matcher). */
  matchedGalleryUrl: string | null;
  matchedGalleryScore: number | null;
  matchedGalleryReason: string | null;
}

export interface QualityPresetValues {
  name: typeof PREMIUM_EDITORIAL_QUALITY_PRESET;
  photographicRealism: 'very_high';
  compositionSophistication: 'very_high';
  typographyNegativeSpaceReadiness: 'very_high';
  luxuryLevel: 'refined_not_flashy';
  saturation: 'controlled';
  contrast: 'cinematic';
  warmth: 'medium_high';
  textureRealism: 'high';
  depthOfField: 'shallow_to_medium';
  visualClutter: 'low';
  symmetry: 'low';
  negativeSpaceMin: number;
  negativeSpaceMax: number;
  artificialGraphics: 'minimal';
  genericTemplateScoreTarget: 'near_zero';
}

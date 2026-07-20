/**
 * Layer 2 — Creative Direction
 * Transforms Brand DNA + request into a structured CreativeDirectionBrief.
 */

import {
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  PREMIUM_EDITORIAL_QUALITY_PRESET,
  type BrandVisualDNA,
  type CreativeDirectionBrief,
  type CreativeVariationKey,
  type PremiumEditorialAspectRatio,
  type PremiumEditorialCampaignRequest,
  type PremiumEditorialOutputType,
} from './types';

export const CREATIVE_VARIATION_KEYS: readonly CreativeVariationKey[] = [
  'EditorialProductHero',
  'GoldenHourLifestyle',
  'DarkLuxuryStillLife',
  'MediterraneanTableScene',
  'ArchitecturalHospitality',
  'MinimalMaterialStudy',
  'SunsetDining',
  'CoastalRefreshment',
  'ChefCraft',
  'SeasonalEditorial',
] as const;

const VARIATION_SCENE: Record<CreativeVariationKey, {
  concept: string;
  hero: string;
  environment: string;
  timeOfDay: string;
  lighting: string;
  camera: string;
}> = {
  EditorialProductHero: {
    concept: 'Product as quiet protagonist',
    hero: 'signature product or plated item as editorial hero',
    environment: 'calm surface with soft architectural backdrop',
    timeOfDay: 'late afternoon',
    lighting: 'side golden light with soft falloff',
    camera: 'three-quarter close, shallow depth',
  },
  GoldenHourLifestyle: {
    concept: 'Golden-hour hospitality lifestyle',
    hero: 'lifestyle moment with refined hospitality cues',
    environment: 'open terrace or coastal edge with warm air',
    timeOfDay: 'golden hour',
    lighting: 'low warm sun, long soft shadows',
    camera: 'eye-level medium wide',
  },
  DarkLuxuryStillLife: {
    concept: 'Dark luxury still life',
    hero: 'still-life arrangement of brand materials',
    environment: 'deep moody interior with controlled highlights',
    timeOfDay: 'evening',
    lighting: 'single key light, cinematic contrast',
    camera: 'overhead-to-three-quarter still life',
  },
  MediterraneanTableScene: {
    concept: 'Mediterranean table editorial',
    hero: 'tablescape with natural textures and glassware',
    environment: 'sunlit dining table with linen and stone',
    timeOfDay: 'afternoon',
    lighting: 'diffused daylight through soft shade',
    camera: 'slight overhead, 35mm feel',
  },
  ArchitecturalHospitality: {
    concept: 'Architectural hospitality portrait',
    hero: 'venue architecture as brand character',
    environment: 'facade, corridor, or courtyard with strong geometry',
    timeOfDay: 'late day',
    lighting: 'directional sun carving stone and shadow',
    camera: 'wide architectural, careful verticals',
  },
  MinimalMaterialStudy: {
    concept: 'Minimal material study',
    hero: 'close material detail — ceramic, glass, linen, stone',
    environment: 'near-empty frame with tactile surfaces',
    timeOfDay: 'soft daylight',
    lighting: 'soft wrap light, low clutter',
    camera: 'macro-to-close still',
  },
  SunsetDining: {
    concept: 'Sunset dining atmosphere',
    hero: 'dining setting bathed in sunset warmth',
    environment: 'outdoor dining with horizon glow',
    timeOfDay: 'sunset',
    lighting: 'amber rim light + gentle fill',
    camera: 'medium, guest-eye perspective without faces',
  },
  CoastalRefreshment: {
    concept: 'Coastal refreshment editorial',
    hero: 'refreshing drink or coastal table detail',
    environment: 'coastal breeze, cool blues and warm neutrals',
    timeOfDay: 'midday to late afternoon',
    lighting: 'bright natural with controlled highlights',
    camera: 'close product with environmental blur',
  },
  ChefCraft: {
    concept: 'Chef craft intimacy',
    hero: 'hands-off craft cue — plated finish, tools at rest',
    environment: 'kitchen edge or pass with calm focus',
    timeOfDay: 'service light',
    lighting: 'practical warm key, soft shadows',
    camera: 'close craft angle, no identifiable faces',
  },
  SeasonalEditorial: {
    concept: 'Seasonal editorial campaign',
    hero: 'seasonal produce or seasonal table ritual',
    environment: 'season-tuned hospitality set',
    timeOfDay: 'seasonal daylight',
    lighting: 'natural seasonal color temperature',
    camera: 'editorial magazine framing',
  },
};

function resolveOutputType(
  req: PremiumEditorialCampaignRequest,
): { outputType: PremiumEditorialOutputType; aspectRatio: PremiumEditorialAspectRatio } {
  if (req.aspectRatio === '9:16' || req.outputType === 'story') {
    return { outputType: 'story', aspectRatio: '9:16' };
  }
  if (req.aspectRatio === '1:1' || req.outputType === 'square') {
    return { outputType: 'square', aspectRatio: '1:1' };
  }
  return { outputType: 'post', aspectRatio: req.aspectRatio ?? '4:5' };
}

/**
 * Pick a variation that is not in the recent history unless forced / preferred.
 */
export function selectCreativeVariation(opts: {
  preferred?: CreativeVariationKey | null;
  recent?: CreativeVariationKey[];
  forceNew?: boolean;
  seed?: string;
}): CreativeVariationKey {
  if (opts.preferred && (!opts.forceNew || !opts.recent?.includes(opts.preferred))) {
    return opts.preferred;
  }
  const recent = new Set(opts.recent ?? []);
  const available = CREATIVE_VARIATION_KEYS.filter((k) => !recent.has(k));
  const pool = available.length ? available : [...CREATIVE_VARIATION_KEYS];
  const seed = (opts.seed ?? Date.now().toString()).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[seed % pool.length]!;
}

export function buildCreativeDirection(opts: {
  dna: BrandVisualDNA;
  request: PremiumEditorialCampaignRequest;
  variationKey?: CreativeVariationKey;
}): CreativeDirectionBrief {
  const { dna, request } = opts;
  const { outputType, aspectRatio } = resolveOutputType(request);
  const variationKey = opts.variationKey
    ?? selectCreativeVariation({
      preferred: request.preferredCreativeVariation,
      recent: request.recentVariationKeys,
      forceNew: request.forceNewComposition === true,
      seed: `${dna.brandId}:${request.contentTopic}:${request.missionId ?? ''}`,
    });

  const scene = VARIATION_SCENE[variationKey];
  const topic = request.contentTopic.trim();
  const goal = (request.campaignGoal ?? 'premium brand awareness').trim();
  const materials = dna.preferredMaterials.slice(0, 4).join(', ') || 'natural stone, linen, glass';
  const colors = [...dna.primaryColors, ...dna.accentColors].slice(0, 4).join(', ')
    || 'warm neutrals with restrained accent';

  return {
    campaignConcept: `${scene.concept} — ${topic}`,
    creativeIdea: `${dna.brandName}: ${goal} through ${variationKey.replace(/([A-Z])/g, ' $1').trim().toLowerCase()}`,
    mainVisualStory: scene.hero,
    emotionalObjective: dna.visualMood ?? 'calm desire and refined belonging',
    visualNarrative: `${topic}. ${scene.environment}. Feels uniquely ${dna.brandName}, not generic hospitality stock.`,
    heroSubject: scene.hero,
    supportingElements: [
      ...dna.preferredTextures.slice(0, 2),
      ...dna.brandDistinctiveAssets.slice(0, 2),
    ].filter(Boolean).slice(0, 4),
    environment: scene.environment + (dna.location ? ` — inspired by ${dna.location}` : ''),
    timeOfDay: scene.timeOfDay,
    lightingDirection: scene.lighting,
    lightingMood: dna.lightingStyle ?? 'natural cinematic warmth',
    colorTreatment: `Controlled saturation; palette cues ${colors}; no neon cast`,
    materialTreatment: materials,
    photographyDirection: dna.photographyStyle ?? 'refined editorial photography',
    cameraAngle: scene.camera,
    lensDescription: dna.preferredLensStyle ?? '35mm editorial prime',
    depthOfField: dna.preferredDepthOfField ?? 'shallow to medium',
    productScale: 'hero-dominant without crowding negative space',
    productPlacement: 'inside planned hero zone; calm margins for typography',
    humanPresencePolicy: 'no identifiable faces; hands only if essential and anonymous',
    stylingInstructions: [
      'Restrained luxury — never flashy',
      'Authentic materials and natural imperfections',
      'Large negative space for later typography',
      ...(dna.forbiddenVisualStyles.slice(0, 3).map((f) => `Avoid: ${f}`)),
    ],
    backgroundAtmosphere: dna.visualMood ?? 'premium mediterranean calm',
    negativeSpaceStrategy: `Reserve ${(dna.preferredNegativeSpaceRatio ?? 0.35) * 100}% calm space for type zones`,
    visualHierarchy: 'Hero subject first, atmosphere second, empty type zones third',
    distinctiveBrandElements: dna.brandDistinctiveAssets.slice(0, 5),
    forbiddenElements: [
      'letters, words, logos, labels, captions, signage, watermarks, UI',
      'fake brand names',
      'Canva-like templates',
      'repeated diagonal triangle templates',
      'plastic food, malformed glassware, duplicated objects',
      ...dna.forbiddenVisualStyles.slice(0, 4),
    ],
    qualityKeywords: [
      'cinematic',
      'authentic',
      'premium',
      'restrained',
      'editorial',
      'photographic',
      'atmospheric',
      'commercially usable',
    ],
    outputFormat: outputType,
    aspectRatio,
    contentSafeArea: '7% margins on all sides',
    textWillBeRenderedSeparately: true,
    logoWillBeRenderedSeparately: true,
    creativeVariationKey: variationKey,
    qualityPreset: PREMIUM_EDITORIAL_QUALITY_PRESET,
    promptArchitectureVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
  };
}

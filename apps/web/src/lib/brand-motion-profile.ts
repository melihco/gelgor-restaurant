/**
 * Brand Motion Profile — per-tenant Remotion routing & media policy.
 *
 * Stored on brand_contexts.brand_theme.motion_profile (JSONB).
 * Consumed by auto-produce, Creative Director, and Brand Hub settings.
 */

import type { StoryCompositionId } from '@/remotion/types';
import { resolveTemplateId } from './remotion-template-registry';

export type MotionStyle = 'minimal' | 'editorial' | 'luxury' | 'bold' | 'playful';
export type TextDensity = 'minimal' | 'medium' | 'dense';
export type TextTransformPolicy = 'uppercase' | 'sentence' | 'none';
export type MediaFallback = 'brand_solid' | 'logo_hero' | 'block';

export type ContentIntent =
  | 'daily_moment'
  | 'product_spotlight'
  | 'campaign_offer'
  | 'announcement'
  | 'invitation'
  | 'event'
  | 'social_proof'
  | 'educational';

export type RemotionCompositionId =
  | StoryCompositionId
  | 'BrandedFeedPost'
  | 'BrandedFeedPortrait';

export interface CompositionWeights {
  EditorialStory?: number;
  LuxurySplitStory?: number;
  CinematicStory?: number;
  EventAnnouncementStory?: number;
  CampaignHeroStory?: number;
  MagazineCoverStory?: number;
  GallerySeriesStory?: number;
}

export interface MotionLearningHints {
  /** Boost composition weight (additive, e.g. 0.15) */
  compositionBoost?: Partial<CompositionWeights>;
  /** Penalty (subtractive) */
  compositionPenalty?: Partial<CompositionWeights>;
  blockedCompositions?: StoryCompositionId[];
}

export interface BrandMotionProfile {
  motionStyle: MotionStyle;
  locale: string;
  textDensity: TextDensity;
  textTransform: TextTransformPolicy;
  /** Target share of story ideas that stay pure_photo (no Remotion template) */
  preferPurePhotoStories: number;
  compositionWeights: CompositionWeights;
  blockedCompositions: StoryCompositionId[];
  allowedIntents: ContentIntent[];
  mediaPolicy: {
    requireGallery: boolean;
    fallback: MediaFallback;
    minMatchScore: number;
  };
  audioMoodPool: string[];
  /** Operator + future tenant-learning adjustments */
  learning?: MotionLearningHints;
  /** Set when operator overrides auto-derived defaults */
  operatorOverride?: boolean;
}

export const STORY_COMPOSITION_IDS: StoryCompositionId[] = [
  'EditorialStory',
  'LuxurySplitStory',
  'CinematicStory',
  'EventAnnouncementStory',
  'CampaignHeroStory',
  'MagazineCoverStory',
  'GallerySeriesStory',
];

const DEFAULT_WEIGHTS: CompositionWeights = {
  EditorialStory: 0.3,
  CinematicStory: 0.18,
  MagazineCoverStory: 0.14,
  EventAnnouncementStory: 0.14,
  CampaignHeroStory: 0.09,
  LuxurySplitStory: 0.05,
  GallerySeriesStory: 0.1,
};

const MOTION_STYLE_PRESETS: Record<
  MotionStyle,
  Pick<BrandMotionProfile, 'textDensity' | 'preferPurePhotoStories' | 'compositionWeights'>
> = {
  minimal: {
    textDensity: 'minimal',
    preferPurePhotoStories: 0.85,
    compositionWeights: {
      EditorialStory: 0.4,
      CinematicStory: 0.35,
      MagazineCoverStory: 0.1,
      EventAnnouncementStory: 0.1,
      CampaignHeroStory: 0.03,
      LuxurySplitStory: 0.02,
    },
  },
  editorial: {
    textDensity: 'medium',
    preferPurePhotoStories: 0.7,
    compositionWeights: { ...DEFAULT_WEIGHTS },
  },
  luxury: {
    textDensity: 'minimal',
    preferPurePhotoStories: 0.65,
    compositionWeights: {
      LuxurySplitStory: 0.25,
      GallerySeriesStory: 0.15,
      MagazineCoverStory: 0.2,
      EditorialStory: 0.2,
      CinematicStory: 0.15,
      EventAnnouncementStory: 0.05,
      CampaignHeroStory: 0.05,
    },
  },
  bold: {
    textDensity: 'dense',
    preferPurePhotoStories: 0.55,
    compositionWeights: {
      CampaignHeroStory: 0.25,
      MagazineCoverStory: 0.2,
      EditorialStory: 0.2,
      EventAnnouncementStory: 0.15,
      CinematicStory: 0.1,
      LuxurySplitStory: 0.1,
    },
  },
  playful: {
    textDensity: 'medium',
    preferPurePhotoStories: 0.6,
    compositionWeights: {
      CampaignHeroStory: 0.2,
      EditorialStory: 0.25,
      CinematicStory: 0.2,
      EventAnnouncementStory: 0.15,
      MagazineCoverStory: 0.1,
      LuxurySplitStory: 0.1,
    },
  },
};

/** Sector-keyed defaults — weights only; style from typography when possible */
const SECTOR_MOTION_STYLE: Record<string, MotionStyle> = {
  beach_club: 'bold',
  restaurant_cafe: 'editorial',
  beauty_wellness: 'minimal',
  healthcare_clinic: 'minimal',
  ecommerce_retail: 'bold',
  local_products_shop: 'editorial',
  real_estate: 'luxury',
  agency_services: 'minimal',
  hotel_resort: 'luxury',
};

const SECTOR_BLOCKED: Record<string, StoryCompositionId[]> = {
  healthcare_clinic: ['CampaignHeroStory'],
  agency_services: ['EventAnnouncementStory', 'CampaignHeroStory'],
};

const SECTOR_MEDIA: Record<string, BrandMotionProfile['mediaPolicy']> = {
  ecommerce_retail: { requireGallery: false, fallback: 'brand_solid', minMatchScore: 45 },
  agency_services: { requireGallery: false, fallback: 'logo_hero', minMatchScore: 40 },
  healthcare_clinic: { requireGallery: true, fallback: 'block', minMatchScore: 55 },
};

const DEFAULT_PROFILE: BrandMotionProfile = {
  motionStyle: 'editorial',
  locale: 'tr',
  textDensity: 'medium',
  textTransform: 'sentence',
  preferPurePhotoStories: 0.72,
  compositionWeights: { ...DEFAULT_WEIGHTS },
  blockedCompositions: [],
  allowedIntents: [
    'daily_moment',
    'product_spotlight',
    'campaign_offer',
    'announcement',
    'invitation',
    'event',
    'social_proof',
    'educational',
  ],
  mediaPolicy: {
    requireGallery: true,
    fallback: 'brand_solid',
    minMatchScore: 55,
  },
  audioMoodPool: ['ambient chill', 'lounge jazz', 'acoustic folk'],
};

function normalizeSector(sector: string): string {
  return sector.toLowerCase().replace(/[\s-]+/g, '_').trim();
}

function parseLocale(raw: string | undefined): string {
  if (!raw) return 'tr';
  return raw.split(',')[0]?.trim().toLowerCase() || 'tr';
}

function textTransformForLocale(locale: string): TextTransformPolicy {
  if (locale.startsWith('tr') || locale.startsWith('de')) return 'uppercase';
  return 'sentence';
}

export function deriveMotionProfile(options: {
  sector?: string;
  languages?: string;
  textOverlayDensity?: TextDensity;
  existing?: Partial<BrandMotionProfile> | null;
}): BrandMotionProfile {
  const sector = normalizeSector(options.sector || '');
  const existing = options.existing ?? null;

  if (existing?.operatorOverride) {
    return normalizeMotionProfile({ ...DEFAULT_PROFILE, ...existing });
  }

  const styleFromSector = SECTOR_MOTION_STYLE[sector] ?? 'editorial';
  const preset = MOTION_STYLE_PRESETS[styleFromSector];

  const density =
    options.textOverlayDensity
    ?? (existing?.textDensity as TextDensity | undefined)
    ?? preset.textDensity;

  const locale = existing?.locale ?? parseLocale(options.languages);

  const derived: BrandMotionProfile = {
    ...DEFAULT_PROFILE,
    motionStyle: (existing?.motionStyle as MotionStyle | undefined) ?? styleFromSector,
    locale,
    textDensity: density,
    textTransform: existing?.textTransform ?? textTransformForLocale(locale),
    preferPurePhotoStories: existing?.preferPurePhotoStories ?? preset.preferPurePhotoStories,
    compositionWeights: {
      ...preset.compositionWeights,
      ...(existing?.compositionWeights ?? {}),
    },
    blockedCompositions: [
      ...(SECTOR_BLOCKED[sector] ?? []),
      ...(existing?.blockedCompositions ?? []),
    ],
    allowedIntents: existing?.allowedIntents?.length
      ? existing.allowedIntents
      : DEFAULT_PROFILE.allowedIntents,
    mediaPolicy: {
      ...DEFAULT_PROFILE.mediaPolicy,
      ...(SECTOR_MEDIA[sector] ?? {}),
      ...(existing?.mediaPolicy ?? {}),
    },
    audioMoodPool: existing?.audioMoodPool?.length
      ? existing.audioMoodPool
      : DEFAULT_PROFILE.audioMoodPool,
    learning: existing?.learning,
    operatorOverride: Boolean(existing?.operatorOverride),
  };

  return normalizeMotionProfile(derived);
}

function parseRawMotionProfile(raw: Record<string, unknown> | null | undefined): Partial<BrandMotionProfile> | null {
  if (!raw || typeof raw !== 'object') return null;
  const weights = (raw.composition_weights ?? raw.compositionWeights) as CompositionWeights | undefined;
  const media = (raw.media_policy ?? raw.mediaPolicy) as Record<string, unknown> | undefined;
  const learning = raw.learning as MotionLearningHints | undefined;
  return {
    motionStyle: (raw.motion_style ?? raw.motionStyle) as MotionStyle | undefined,
    locale: raw.locale as string | undefined,
    textDensity: (raw.text_density ?? raw.textDensity) as TextDensity | undefined,
    textTransform: (raw.text_transform ?? raw.textTransform) as TextTransformPolicy | undefined,
    preferPurePhotoStories: Number(raw.prefer_pure_photo_stories ?? raw.preferPurePhotoStories) || undefined,
    compositionWeights: weights,
    blockedCompositions: (raw.blocked_compositions ?? raw.blockedCompositions) as StoryCompositionId[] | undefined,
    allowedIntents: (raw.allowed_intents ?? raw.allowedIntents) as ContentIntent[] | undefined,
    mediaPolicy: media
      ? {
          requireGallery: Boolean(media.require_gallery ?? media.requireGallery ?? true),
          fallback: String(media.fallback ?? 'brand_solid') as MediaFallback,
          minMatchScore: Number(media.min_match_score ?? media.minMatchScore ?? 55),
        }
      : undefined,
    audioMoodPool: (raw.audio_mood_pool ?? raw.audioMoodPool) as string[] | undefined,
    learning,
    operatorOverride: Boolean(raw.operator_override ?? raw.operatorOverride),
  };
}

export function parseMotionProfileFromTheme(
  theme: Record<string, unknown> | null | undefined,
  fallback?: { sector?: string; languages?: string; textOverlayDensity?: TextDensity },
): BrandMotionProfile {
  const rawRecord = (theme?.motion_profile ?? theme?.motionProfile) as Record<string, unknown> | undefined;
  const parsed = parseRawMotionProfile(rawRecord);
  return deriveMotionProfile({
    sector: fallback?.sector,
    languages: fallback?.languages,
    textOverlayDensity: fallback?.textOverlayDensity,
    existing: parsed,
  });
}

export function normalizeMotionProfile(profile: BrandMotionProfile): BrandMotionProfile {
  const blocked = new Set(profile.blockedCompositions ?? []);
  const weights = { ...profile.compositionWeights };
  const learning = profile.learning;

  for (const id of STORY_COMPOSITION_IDS) {
    let w = weights[id] ?? 0;
    if (learning?.compositionBoost?.[id]) w += learning.compositionBoost[id]!;
    if (learning?.compositionPenalty?.[id]) w -= learning.compositionPenalty[id]!;
    if (blocked.has(id) || learning?.blockedCompositions?.includes(id)) w = 0;
    weights[id] = Math.max(0, w);
  }

  return {
    ...profile,
    preferPurePhotoStories: Math.min(0.95, Math.max(0.4, profile.preferPurePhotoStories ?? 0.72)),
    compositionWeights: weights,
    blockedCompositions: [...blocked],
  };
}

export function applyMotionStylePreset(
  profile: BrandMotionProfile,
  style: MotionStyle,
): BrandMotionProfile {
  const preset = MOTION_STYLE_PRESETS[style];
  return normalizeMotionProfile({
    ...profile,
    motionStyle: style,
    textDensity: preset.textDensity,
    preferPurePhotoStories: preset.preferPurePhotoStories,
    compositionWeights: { ...preset.compositionWeights },
    operatorOverride: true,
  });
}

/** Map ideation fields → generic content intent */
export function resolveContentIntent(input: {
  treatment?: string;
  templateUseCase?: string;
  mood?: string;
  headline?: string;
  contentType?: string;
}): ContentIntent {
  const treatment = (input.treatment ?? '').toLowerCase();
  const useCase = (input.templateUseCase ?? '').toLowerCase();
  const mood = (input.mood ?? '').toLowerCase();
  const headline = (input.headline ?? '').toLowerCase();
  const blob = `${treatment} ${useCase} ${mood} ${headline}`;

  // Agent template_use_case / content pillars — direct mapping first
  if (/event_announcement|story_event|lineup|dj_set|live_night/.test(useCase)) return 'event';
  if (/social_proof|review|testimonial|ugc/.test(useCase)) return 'social_proof';
  if (/campaign_offer|promo|flash_sale/.test(useCase)) return 'campaign_offer';
  if (/behind_the_scenes|bts/.test(useCase)) return 'daily_moment';
  if (/menu_share|product_spotlight|menu_highlight/.test(useCase)) return 'product_spotlight';
  if (/educational_post|how_to|tips/.test(useCase)) return 'educational';
  if (/lead_generation|invitation|rsvp/.test(useCase)) return 'invitation';

  if (treatment === 'pure_photo' || useCase.includes('daily_story') || useCase.includes('daily')) {
    return 'daily_moment';
  }
  if (treatment === 'campaign_offer' || /offer|discount|promo|kampanya|indirim/.test(blob)) {
    return 'campaign_offer';
  }
  if (/invite|davet|rsvp|invitation/.test(blob)) return 'invitation';
  if (treatment === 'story_event' || treatment === 'event_announcement' || /event|etkinlik|dj|konser/.test(blob)) {
    return 'event';
  }
  if (/announcement|duyuru|launch|lansman/.test(blob)) return 'announcement';
  if (/review|testimonial|social_proof|müşteri yorum|guest|misafir|love us|yorumlar/.test(blob)) {
    return 'social_proof';
  }
  if (/education|ipucu|guide|nasıl|learn/.test(blob)) return 'educational';
  if (/product|ürün|menu|menü|highlight|koleksiyon/.test(blob)) return 'product_spotlight';

  return 'daily_moment';
}

const INTENT_COMPOSITION: Partial<Record<ContentIntent, StoryCompositionId>> = {
  daily_moment: 'EditorialStory',
  product_spotlight: 'EditorialStory',
  campaign_offer: 'CampaignHeroStory',
  announcement: 'MagazineCoverStory',
  invitation: 'EventAnnouncementStory',
  event: 'EventAnnouncementStory',
  social_proof: 'GallerySeriesStory',
  educational: 'MagazineCoverStory',
};

export type GallerySeriesLayout = 'dual' | 'triple' | 'sequence';

export function resolveGallerySeriesLayout(photoCount: number, seed = 0): GallerySeriesLayout {
  if (photoCount >= 3) return seed % 2 === 0 ? 'triple' : 'sequence';
  return 'dual';
}

export function shouldUseGallerySeriesStory(input: {
  profile: BrandMotionProfile;
  intent: ContentIntent;
  galleryPhotoCount: number;
  treatment?: string;
}): boolean {
  if (input.galleryPhotoCount < 2) return false;
  const t = (input.treatment ?? '').toLowerCase();
  if (t === 'story_event' || t === 'event_announcement' || t === 'pure_photo') return false;
  if (input.intent === 'event' || input.intent === 'invitation') return false;
  if (input.profile.blockedCompositions.includes('GallerySeriesStory')) return false;
  return (
    input.intent === 'social_proof'
    || input.intent === 'product_spotlight'
    || input.intent === 'daily_moment'
    || input.intent === 'educational'
  );
}

export interface CompositionSelectInput {
  profile: BrandMotionProfile;
  intent: ContentIntent;
  treatment?: string;
  mood?: string;
  ideaIndex?: number;
  usedCompositions?: StoryCompositionId[];
  galleryPhotoCount?: number;
}

/** Weighted composition pick — profile + intent + diversity */
export function selectRemotionComposition(input: CompositionSelectInput): StoryCompositionId {
  const {
    profile,
    intent,
    treatment,
    mood,
    ideaIndex = 0,
    usedCompositions = [],
    galleryPhotoCount = 1,
  } = input;
  const treatmentLower = (treatment ?? '').toLowerCase();
  const moodLower = (mood ?? '').toLowerCase();

  if (
    shouldUseGallerySeriesStory({ profile, intent, galleryPhotoCount, treatment: treatmentLower })
  ) {
    return pickWeighted(profile, 'GallerySeriesStory', usedCompositions);
  }

  if (treatmentLower === 'story_event' || treatmentLower === 'event') {
    return pickWeighted(profile, 'EventAnnouncementStory', usedCompositions);
  }
  if (treatmentLower === 'event_announcement' || intent === 'invitation') {
    return pickWeighted(profile, 'EventAnnouncementStory', usedCompositions);
  }
  if (treatmentLower === 'campaign_offer' || intent === 'campaign_offer') {
    return pickWeighted(profile, 'CampaignHeroStory', usedCompositions);
  }
  if (intent === 'announcement' || /feature|editorial|spotlight|chef/.test(treatmentLower)) {
    return pickWeighted(profile, 'MagazineCoverStory', usedCompositions);
  }
  if (/sunset|beach|sea|nature|atmosfer|golden|dusk|dawn|horizon/.test(moodLower)) {
    return pickWeighted(profile, 'CinematicStory', usedCompositions);
  }
  if (/premium|luxury|fine.?dining|hotel/.test(moodLower + treatmentLower) || profile.motionStyle === 'luxury') {
    return pickWeighted(profile, 'LuxurySplitStory', usedCompositions);
  }

  const intentDefault = INTENT_COMPOSITION[intent];
  if (intentDefault) {
    return pickWeighted(profile, intentDefault, usedCompositions);
  }

  return pickWeighted(profile, weightedRandom(profile, ideaIndex), usedCompositions);
}

function pickWeighted(
  profile: BrandMotionProfile,
  preferred: StoryCompositionId,
  used: StoryCompositionId[],
): StoryCompositionId {
  const blocked = new Set(profile.blockedCompositions);
  if (!blocked.has(preferred) && !used.includes(preferred)) {
    const w = profile.compositionWeights[preferred] ?? 0;
    if (w > 0) return preferred;
  }
  const alt = weightedRandom(profile, used.length, used);
  return alt;
}

function weightedRandom(
  profile: BrandMotionProfile,
  seed: number,
  exclude: StoryCompositionId[] = [],
): StoryCompositionId {
  const blocked = new Set([...profile.blockedCompositions, ...exclude]);
  const entries = STORY_COMPOSITION_IDS
    .filter((id) => !blocked.has(id))
    .map((id) => ({ id, w: profile.compositionWeights[id] ?? 0 }))
    .filter((e) => e.w > 0);

  if (!entries.length) return 'EditorialStory';

  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = (seed * 17 + 31) % 1000 / 1000 * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return entries[entries.length - 1]!.id;
}

export function shouldSkipRemotionTemplate(
  profile: BrandMotionProfile,
  treatment: string | undefined,
): boolean {
  const t = (treatment ?? '').toLowerCase();
  if (t === 'pure_photo') return true;
  if (t === 'feed_text_overlay') return true;
  return false;
}

export function selectRemotionTemplate(
  input: CompositionSelectInput & { kitId?: string },
): string {
  const compositionId = selectRemotionComposition(input);
  return resolveTemplateId({
    compositionId,
    intent: input.intent,
    kitId: input.kitId,
    seed: input.ideaIndex,
  });
}

export function allowedCompositionsForDirector(profile: BrandMotionProfile): StoryCompositionId[] {
  const blocked = new Set(profile.blockedCompositions);
  return STORY_COMPOSITION_IDS.filter((id) => {
    if (blocked.has(id)) return false;
    return (profile.compositionWeights[id] ?? 0) > 0;
  });
}

/** Remotion render + Creative Director — Marka Anayasası motion_profile + template_library. */
export function resolveBrandRemotionRenderPolicy(
  theme: Record<string, unknown> | null | undefined,
  fallback?: { sector?: string; languages?: string; textOverlayDensity?: TextDensity },
): {
  motionProfile: BrandMotionProfile;
  brandTemplateLocked: boolean;
  motionStyle: MotionStyle;
  locale: string;
  textDensity: TextDensity;
  allowedCompositions: StoryCompositionId[];
} {
  const motionProfile = parseMotionProfileFromTheme(theme, fallback);
  const libraryRaw = (theme?.template_library ?? theme?.templateLibrary) as { locked?: boolean } | undefined;
  return {
    motionProfile,
    brandTemplateLocked: Boolean(libraryRaw?.locked),
    motionStyle: motionProfile.motionStyle,
    locale: motionProfile.locale,
    textDensity: motionProfile.textDensity,
    allowedCompositions: allowedCompositionsForDirector(motionProfile),
  };
}

export const MOTION_STYLE_OPTIONS: { id: MotionStyle; label: string; desc: string }[] = [
  { id: 'minimal', label: 'Minimal', desc: 'Çoğunlukla saf fotoğraf, az şablon' },
  { id: 'editorial', label: 'Editorial', desc: 'Dengeli story şablonları' },
  { id: 'luxury', label: 'Luxury', desc: 'Split panel ve magazine ağırlıklı' },
  { id: 'bold', label: 'Bold', desc: 'Kampanya ve hero ağırlıklı' },
  { id: 'playful', label: 'Playful', desc: 'Enerjik, çeşitli şablon mix' },
];

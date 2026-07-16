/**
 * Remotion story template library — types for 100+ parametric layouts.
 * Mirrors announcement-template-types pattern: one engine, many spec patches.
 */

import type { ContentIntent } from './brand-motion-profile';
import type { StoryCompositionId } from './story-composition-types';

export type StoryLayoutFamily =
  | 'editorial_bottom'
  | 'editorial_left'
  | 'split_panel'
  | 'magazine_cover'
  | 'cinematic_center'
  | 'campaign_hero'
  | 'gallery_series'
  | 'frosted_glass'
  | 'bold_impact'
  | 'noir_editorial'
  | 'event_ticket'
  | 'diptych_collage'
  | 'minimal_luxury'
  | 'mosaic_pinterest'
  | 'asymmetric_editorial'
  | 'polaroid_single'
  | 'polaroid_stack'
  | 'vibe_fullscreen'
  | 'bento_story'
  | 'neon_night'
  | 'quote_card'
  | 'location_pin'
  | 'luxury_kinetic_type'
  | 'glassmorphism_showcase'
  | 'editorial_product_stage';

export type StoryTextZone =
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right'
  | 'center'
  | 'top_center'
  | 'split_panel';

export type StoryAccentLine = 'none' | 'above' | 'left_bar' | 'both' | 'underline';

export type StoryFrameStyle = 'none' | 'thin' | 'double' | 'inset';

export type StoryCollection =
  | 'Luxury'
  | 'Editorial'
  | 'Magazine'
  | 'Campaign'
  | 'Cinematic'
  | 'Gallery'
  | 'Modern'
  | 'Nightlife'
  | 'Minimal'
  | 'Noir'
  | 'Agency';

export type FontPersonality =
  | 'brand'
  | 'serif_editorial'
  | 'sans_modern'
  | 'display_bold'
  | 'poster_display'
  | 'script'
  | 'graphic_pop'
  | 'neo_grotesk'
  | 'luxury_serif'
  | 'fashion_editorial';

export type HeadlineTreatment = 'flat' | 'bubble' | 'sticker';

export type BackgroundMode = 'photo_full' | 'split_panel' | 'duotone_wash' | 'solid_panel';

export type TemplateColorToken = 'primary' | 'accent' | 'text' | 'headline' | 'overlay';

export interface TemplateColorPolicy {
  headline?: TemplateColorToken;
  subtitle?: TemplateColorToken;
  category?: TemplateColorToken;
  overlay?: Extract<TemplateColorToken, 'primary' | 'accent' | 'overlay'>;
  /** Poster body/detail copy */
  text?: Extract<TemplateColorToken, 'primary' | 'accent' | 'text' | 'headline'>;
}

/** Parametric layout knobs — consumed by StoryLayoutEngine */
export interface StoryLayoutSpec {
  family: StoryLayoutFamily;
  collection: StoryCollection;

  // ── Font ──────────────────────────────────────────────────────
  fontPersonality: FontPersonality;
  /** Graphic designer headline wrap — bubble pills or tilted stickers */
  headlineTreatment?: HeadlineTreatment;
  heroWeight: 300 | 400 | 600 | 700 | 800 | 900;
  heroUppercase: boolean;
  heroTracking: number;
  heroScale: number;
  subtitleItalic: boolean;
  categoryTracking: number;

  // ── Background / photo ────────────────────────────────────────
  backgroundMode: BackgroundMode;
  gradientStart: number;
  gradientEnd: number;
  overlayOpacity: number;
  panelRatio: number;
  kenBurnsOrigin: string;
  kenBurnsScale: number;
  vignette: 'none' | 'radial' | 'noir' | 'soft';
  duotoneWash: 'none' | 'primary' | 'accent' | 'warm' | 'cool';
  duotoneOpacity: number;

  // ── Design / layout ───────────────────────────────────────────
  textZone: StoryTextZone;
  align: 'left' | 'center' | 'right';
  accentLine: StoryAccentLine;
  accentLineWidth: number;
  frame: StoryFrameStyle;
  frostedCard: boolean;
  frostedY: number;
  sideBar: 'none' | 'left' | 'right';
  showLocation: boolean;
  showCtaPill: boolean;
  categoryVertical: boolean;

  // ── Color usage ───────────────────────────────────────────────
  panelUsesPrimary: boolean;
  accentOnCategory: boolean;
  textOnPhoto: boolean;
  colorPolicy?: TemplateColorPolicy;
}

export interface StoryTemplateDefinition {
  id: string;
  family: StoryLayoutFamily;
  collection: StoryCollection;
  variantIndex: number;
  nameTr: string;
  nameEn: string;
  descTr: string;
  tags: string[];
  bestFor: ContentIntent[];
  /** Legacy composition fallback for routing */
  legacyComposition: StoryCompositionId;
  spec: StoryLayoutSpec;
  /** Recommended brand kit sectors */
  sectors: string[];
  status: 'active' | 'beta' | 'deprecated';
}

export interface AgencyBrandKit {
  id: string;
  name: string;
  sector: string;
  locale: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  motionStyle: 'minimal' | 'editorial' | 'luxury' | 'bold' | 'playful';
  /** Curated template IDs for this kit */
  templateIds: string[];
  showcaseHeadline: string;
  showcaseSubtitle: string;
  showcaseCategory: string;
}

export interface StoryShowcaseJob {
  templateId: string;
  kitId: string;
  headline: string;
  subtitle: string;
  categoryLabel: string;
  photoUrl: string;
  galleryPhotoUrls?: string[];
}

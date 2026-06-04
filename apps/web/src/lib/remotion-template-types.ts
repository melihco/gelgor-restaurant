/**
 * Remotion story template library — types for 100+ parametric layouts.
 * Mirrors announcement-template-types pattern: one engine, many spec patches.
 */

import type { ContentIntent } from './brand-motion-profile';
import type { StoryCompositionId } from '@/remotion/types';

export type RemotionLayoutFamily =
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
  | 'polaroid_stack'
  | 'vibe_fullscreen'
  | 'bento_story'
  | 'neon_night'
  | 'quote_card'
  | 'location_pin';

export type RemotionTextZone =
  | 'bottom_left'
  | 'bottom_center'
  | 'bottom_right'
  | 'center'
  | 'top_center'
  | 'split_panel';

export type RemotionAccentLine = 'none' | 'above' | 'left_bar' | 'both' | 'underline';

export type RemotionFrameStyle = 'none' | 'thin' | 'double' | 'inset';

export type RemotionCollection =
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

export type FontPersonality = 'brand' | 'serif_editorial' | 'sans_modern' | 'display_bold' | 'script';

export type BackgroundMode = 'photo_full' | 'split_panel' | 'duotone_wash' | 'solid_panel';

/** Parametric layout knobs — consumed by StoryLayoutEngine */
export interface RemotionLayoutSpec {
  family: RemotionLayoutFamily;
  collection: RemotionCollection;

  // ── Font ──────────────────────────────────────────────────────
  fontPersonality: FontPersonality;
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
  textZone: RemotionTextZone;
  align: 'left' | 'center' | 'right';
  accentLine: RemotionAccentLine;
  accentLineWidth: number;
  frame: RemotionFrameStyle;
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
}

export interface RemotionTemplateDefinition {
  id: string;
  family: RemotionLayoutFamily;
  collection: RemotionCollection;
  variantIndex: number;
  nameTr: string;
  nameEn: string;
  descTr: string;
  tags: string[];
  bestFor: ContentIntent[];
  /** Legacy composition fallback for routing */
  legacyComposition: StoryCompositionId;
  spec: RemotionLayoutSpec;
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

export interface RemotionShowcaseJob {
  templateId: string;
  kitId: string;
  headline: string;
  subtitle: string;
  categoryLabel: string;
  photoUrl: string;
  galleryPhotoUrls?: string[];
}

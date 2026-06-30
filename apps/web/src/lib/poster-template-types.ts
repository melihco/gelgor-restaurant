/**
 * Agency poster template types — static + motion posters (9:16, 1:1, 4:5).
 */

import type { StoryCompositionId } from '@/remotion/types';
import type { TemplateColorPolicy } from './remotion-template-types';

export type PosterLayoutFamily =
  | 'lineup_tiered'
  | 'festival_grid'
  | 'dj_night'
  | 'promo_split'
  | 'gala_invite'
  | 'editorial_date'
  | 'event_masthead'
  | 'restaurant_feature'
  | 'neon_club'
  | 'art_deco';

export type PosterMode =
  | 'lineup_tiered'
  | 'lineup_stack'
  | 'festival_grid'
  | 'gala_centered'
  | 'dj_set'
  | 'promo_split'
  | 'editorial_date'
  | 'masthead';

export type PosterHeader = 'none' | 'accent_bar' | 'outline_bar' | 'knockout_bar';
export type PosterFooter = 'none' | 'solid_bar' | 'transparent_bar' | 'pill_row';
export type PosterFormat = 'story' | 'post' | 'portrait';

export type PosterCollection =
  | 'Agency'
  | 'Event'
  | 'Festival'
  | 'Nightlife'
  | 'Campaign'
  | 'Luxury'
  | 'Editorial'
  | 'Hospitality'
  | 'Poster';

export interface PosterLayoutSpec {
  family: PosterLayoutFamily;
  collection: PosterCollection;
  posterMode: PosterMode;
  posterHeader: PosterHeader;
  posterFooter: PosterFooter;
  fontPersonality: 'brand' | 'serif_editorial' | 'sans_modern' | 'display_bold' | 'script';
  heroWeight: 300 | 400 | 600 | 700 | 800 | 900;
  heroUppercase: boolean;
  heroTracking: number;
  heroScale: number;
  photoRatio: number;
  gradientStart: number;
  gradientEnd: number;
  overlayOpacity: number;
  duotoneWash: 'none' | 'primary' | 'accent' | 'warm' | 'cool';
  duotoneOpacity: number;
  neonGlow: boolean;
  vignette: 'none' | 'radial' | 'noir';
  align: 'left' | 'center' | 'right';
  accentLine: 'none' | 'above' | 'both' | 'underline';
  frame: 'none' | 'thin' | 'double';
  showDateBadge: boolean;
  showCta: boolean;
  panelUsesPrimary: boolean;
  colorPolicy?: TemplateColorPolicy;
}

export interface PosterTemplateDefinition {
  id: string;
  family: PosterLayoutFamily;
  collection: PosterCollection;
  variantIndex: number;
  nameTr: string;
  nameEn: string;
  descTr: string;
  tags: string[];
  formats: PosterFormat[];
  spec: PosterLayoutSpec;
  sectors: string[];
  status: 'active' | 'beta';
  legacyComposition?: StoryCompositionId;
}

export interface PosterShowcaseJob {
  templateId: string;
  kitId: string;
  format: PosterFormat;
  headline: string;
  subtitle: string;
  categoryLabel: string;
  photoUrl: string;
  eventDate?: string;
  eventTime?: string;
  lineupArtists?: string[];
}

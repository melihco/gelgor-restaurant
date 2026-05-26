/**
 * Shared types for the agency announcement template library (200 layouts across 20 families).
 */

import type { AnnouncementBrandKit } from '@/lib/announcement-brand-kit';

export type AnnouncementContentFormat = 'story' | 'post' | 'square';
export type AnnouncementUseCase = 'event' | 'campaign' | 'announcement';

/** Any registered template id — legacy (6) or agency catalog (agency_{family}_{nn}) */
export type AnnouncementTemplateId = string;

export type LayoutFamily =
  | 'luxury_bottom'
  | 'editorial_left'
  | 'campaign_badge'
  | 'minimal_whisper'
  | 'impact_vignette'
  | 'offer_band'
  | 'diagonal_split'
  | 'frosted_panel'
  | 'frame_classic'
  | 'top_masthead'
  | 'color_split'
  | 'script_luxe'
  | 'neon_night'
  | 'magazine_date'
  | 'corner_stamp'
  | 'concert_lineup'
  | 'festival_poster'
  | 'gala_invite'
  | 'dj_night'
  | 'promo_banner';

export type PreviewHint =
  | 'bottom_center'
  | 'bottom_left'
  | 'bottom_right'
  | 'top_badge'
  | 'top_center'
  | 'minimal'
  | 'vignette'
  | 'accent_band'
  | 'diagonal'
  | 'frosted'
  | 'frame'
  | 'center'
  | 'color_split'
  | 'script'
  | 'neon'
  | 'magazine'
  | 'stamp'
  | 'lineup'
  | 'festival'
  | 'gala'
  | 'dj_set'
  | 'promo';

export type TemplateCollection =
  | 'Luxury'
  | 'Editorial'
  | 'Campaign'
  | 'Minimal'
  | 'Impact'
  | 'Nightlife'
  | 'Hospitality'
  | 'Modern'
  | 'Editorial Type'
  | 'Poster'
  | 'Lineup';

export type ColorBlockMode = 'none' | 'bottom_panel' | 'left_panel' | 'right_panel' | 'top_bar';
export type HeroStyleMode = 'display' | 'script' | 'outline' | 'knockout';
export type DuotoneWashMode = 'none' | 'accent' | 'primary';
export type CornerStampMode = 'none' | 'top_right' | 'top_left';
export type MagazineDateMode = 'none' | 'watermark' | 'stacked';

export interface TemplateLayoutSpec {
  family: LayoutFamily;
  gradientStart: number;
  gradientPeak: number;
  gradientEnd: number;
  textZone: 'bottom_center' | 'bottom_left' | 'bottom_right' | 'center' | 'top_center';
  align: 'center' | 'start' | 'end';
  heroScale: number;
  heroWeight: 'bold' | '600' | '500' | '300';
  heroUppercase: boolean;
  heroTracking: number;
  showVenueBadge: boolean;
  accentLine: 'none' | 'above' | 'below' | 'both';
  accentLineWidth: number;
  showBrand: boolean;
  showTagline: boolean;
  taglineItalic: boolean;
  dateBadge: 'none' | 'top_pill' | 'top_left_pill' | 'above_hero';
  stripOnly: boolean;
  stripOpacity: number;
  bandMode: 'none' | 'accent_bottom' | 'accent_bottom_rounded' | 'primary_bottom';
  bandHeight: number;
  frame: 'none' | 'inset' | 'double';
  diagonal: boolean;
  frostedCard: boolean;
  frostedY: number;
  sideBar: 'none' | 'left' | 'right';
  vignetteDeep: boolean;
  /** Solid brand-color panel (Orshot / Dribbble split layouts) */
  colorBlock: ColorBlockMode;
  colorBlockOpacity: number;
  colorBlockSize: number;
  /** Hero typography treatment */
  heroStyle: HeroStyleMode;
  /** Full-frame color wash */
  duotoneWash: DuotoneWashMode;
  duotoneOpacity: number;
  /** Circular date seal (invitation / Pinterest) */
  cornerStamp: CornerStampMode;
  /** Oversized date numeral (editorial fashion) */
  magazineDate: MagazineDateMode;
  /** Nightlife glow on hero type */
  neonGlow: boolean;
  /** Rotated vertical brand strip */
  sideVerticalLabel: 'none' | 'left' | 'right';
  /** Poster / lineup mode — renders lineup artists as stacked list */
  posterMode: 'none' | 'lineup_stack' | 'lineup_tiered' | 'festival_grid' | 'gala_centered' | 'dj_set' | 'promo_split';
  /** Ornamental line dividers between sections */
  ornamentDivider: 'none' | 'thin_rule' | 'diamond' | 'star_row' | 'double_rule' | 'art_deco';
  /** Top header bar with event title / venue name */
  posterHeader: 'none' | 'accent_bar' | 'outline_bar' | 'knockout_bar';
  /** Bottom info strip with venue/time/tickets */
  posterFooter: 'none' | 'solid_bar' | 'transparent_bar' | 'pill_row';
  /** Art deco corner decorations */
  cornerOrnament: boolean;
}

export interface AnnouncementTemplateDefinition {
  id: AnnouncementTemplateId;
  family: LayoutFamily;
  collection: TemplateCollection;
  name: string;
  nameTr: string;
  description: string;
  descriptionTr: string;
  icon: string;
  useCases: AnnouncementUseCase[];
  formats: AnnouncementContentFormat[];
  previewHint: PreviewHint;
  tags: string[];
  layout: TemplateLayoutSpec;
  /** Pinterest / Dribbble / editorial inspiration note */
  inspiration?: string;
}

export interface AnnouncementLibraryPreferences {
  event: AnnouncementTemplateId;
  campaign: AnnouncementTemplateId;
  announcement: AnnouncementTemplateId;
  defaultFormat: AnnouncementContentFormat;
}

export interface AnnouncementOverlayInput {
  width: number;
  height: number;
  contentType: AnnouncementContentFormat;
  templateId?: AnnouncementTemplateId;
  layout?: TemplateLayoutSpec;
  artistName?: string;
  eventName?: string;
  date?: string;
  time?: string;
  venueArea?: string;
  brandName?: string;
  tagline?: string;
  accentColor: string;
  textColor: string;
  brandKit?: AnnouncementBrandKit;
  vibeTypography?: {
    heading_personality?: string;
    body_personality?: string;
    headline_font?: string;
    headline_style?: string;
  };
  /** Lineup artists — rendered as stacked list in poster modes */
  lineupArtists?: string[];
  /** Ticket / CTA label */
  ticketLabel?: string;
}

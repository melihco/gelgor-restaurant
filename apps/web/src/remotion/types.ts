/**
 * Shared prop types for all Smart Agency Remotion story compositions.
 * Brand tokens come from brand_vibe_profile / brand_theme.
 */

export interface StoryProps {
  /** 9:16 background photo URL */
  photoUrl: string;
  /** Main headline — bold statement */
  headline: string;
  /** Optional subtitle / tagline */
  subtitle?: string;
  /** Small category label above headline (e.g. "KITCHEN", "SUNSET") */
  categoryLabel?: string;
  /** Brand name — shown at top */
  brandName: string;
  /** Location string — shown at bottom for cinematic */
  location?: string;

  // ── Brand tokens ──────────────────────────────────────────────
  /** Hex — primary brand color (used for panels, overlays) */
  primaryColor?: string;
  /** Hex — accent color (used for lines, labels, highlights) */
  accentColor?: string;
  /** Google Font — headline / display */
  fontFamily?: string;
  /** Google Font — body / caption */
  bodyFont?: string;
  /** Overlay headline color (brand_theme.palette.neutral / announcement kit) */
  headlineColor?: string;
  /** Subtitle / body on photo */
  subtitleColor?: string;
  /** Category label color — defaults to accent */
  categoryColor?: string;
  /** Gradient / scrim tint */
  overlayColor?: string;
  /** Vibe grading look description */
  gradingLook?: string;

  // ── Creative Director parameters (GPT-4o enhanced) ───────────
  /** Overlay opacity 0.0-0.80 — from Creative Director Agent */
  overlayOpacity?: number;
  /** Font weight override: 700 | 800 | 900 */
  headlineWeight?: number;
  /** Scale factor 0.75-1.35 applied to base headline font size */
  headlineScale?: number;

  // ── Event Announcement fields ─────────────────────────────────
  /** Event date string (e.g. "15 Haziran" or "15.06") */
  eventDate?: string;
  /** Event time string (e.g. "21:00") */
  eventTime?: string;
  /** Call to action text (e.g. "Bilet Al", "Rezervasyon") */
  cta?: string;
  /** CTA destination URL — shown below CTA button in story (e.g. brand website) */
  ctaUrl?: string;

  // ── Brand identity ────────────────────────────────────────────
  /** Brand logo URL — shown at top instead of text brandName when available */
  logoUrl?: string;

  // ── Audio ─────────────────────────────────────────────────────
  /** Audio mood key: "deep house" | "lounge jazz" | "beach pop" | "ambient chill" | "acoustic folk" | "upbeat commercial" */
  audioMood?: string;

  /** Extra gallery URLs for multi-photo layouts (GallerySeriesStory) */
  galleryPhotoUrls?: string[];
  /** dual | triple | sequence — auto from photo count if omitted */
  galleryLayout?: 'dual' | 'triple' | 'sequence';

  /** Catalog template id (SpecStory) — e.g. remotion_editorial_bottom_03 */
  templateId?: string;
  /** Agency brand kit id — e.g. kit_01_beach_club */
  kitId?: string;
  /** Content intent for template routing */
  contentIntent?: string;
  /** Creative Director layout spec patches merged onto catalog template */
  layoutSpecPatch?: Record<string, unknown>;

  /** Poster catalog id — poster_lineup_tiered_01 */
  posterTemplateId?: string;
  /** Event lineup artist names */
  lineupArtists?: string[];
}

export type StoryCompositionId =
  | 'EditorialStory'
  | 'LuxurySplitStory'
  | 'CinematicStory'
  | 'EventAnnouncementStory'
  | 'CampaignHeroStory'
  | 'MagazineCoverStory'
  | 'GallerySeriesStory'
  | 'SpecStory'
  | 'SpecPosterStory'
  | 'SpecPosterPost'
  | 'SpecPosterPortrait';

export type StoryTemplate =
  | 'editorial'
  | 'luxury_split'
  | 'cinematic'
  | 'campaign_hero'
  | 'magazine_cover'
  | 'event';

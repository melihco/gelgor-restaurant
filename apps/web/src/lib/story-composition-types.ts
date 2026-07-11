/**
 * Story / poster composition identifiers — legacy Remotion names retained for
 * template routing and metadata compatibility (no Remotion runtime).
 */

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
  | 'event_announcement'
  | 'campaign_hero'
  | 'magazine_cover'
  | 'gallery_series';

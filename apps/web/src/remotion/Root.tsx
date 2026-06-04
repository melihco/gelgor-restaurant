/**
 * Remotion Root — registers all Smart Agency story and post compositions.
 * This is the entry point used by @remotion/renderer for server-side rendering.
 *
 * Story duration: 8s @ 30fps = 240 frames (agency standard)
 * Post stills: 1 frame (rendered as PNG via renderStill)
 */
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { EditorialStory } from './EditorialStory';
import { LuxurySplitStory } from './LuxurySplitStory';
import { CinematicStory } from './CinematicStory';
import { EventAnnouncementStory } from './EventAnnouncementStory';
import { CampaignHeroStory } from './CampaignHeroStory';
import { MagazineCoverStory } from './MagazineCoverStory';
import { GallerySeriesStory } from './GallerySeriesStory';
import { SpecStory } from './SpecStory';
import { SpecPoster } from './SpecPoster';
import { BrandedFeedPost } from './BrandedFeedPost';
import type { StoryProps } from './types';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFC = React.FC<any>;

// 8 seconds at 30fps = 240 frames (more cinematic than 5s)
const STORY_FRAMES = 240;

const DEFAULT_PROPS: StoryProps = {
  photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1080',
  headline: 'Brand Story',
  subtitle: 'Crafting moments',
  categoryLabel: 'BRAND',
  brandName: 'SMART AGENCY',
  location: 'Bodrum',
  primaryColor: '#1a2b4a',
  accentColor: '#c9a96e',
  fontFamily: 'Cormorant Garamond',
  bodyFont: 'Sora',
};

const DEFAULT_POST_PROPS = {
  ...DEFAULT_PROPS,
  headline: 'Brand Story',
  subtitle: '',
  format: '1:1' as const,
};

const RemotionRoot: React.FC = () => (
  <>
    {/* ── 9:16 Story Compositions (8s HD) ── */}
    <Composition
      id="EditorialStory"
      component={EditorialStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={DEFAULT_PROPS}
    />
    <Composition
      id="LuxurySplitStory"
      component={LuxurySplitStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={DEFAULT_PROPS}
    />
    <Composition
      id="CinematicStory"
      component={CinematicStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={DEFAULT_PROPS}
    />
    <Composition
      id="EventAnnouncementStory"
      component={EventAnnouncementStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ ...DEFAULT_PROPS, categoryLabel: 'EVENT', eventDate: '', eventTime: '', cta: '', logoUrl: '' }}
    />
    <Composition
      id="CampaignHeroStory"
      component={CampaignHeroStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ ...DEFAULT_PROPS, categoryLabel: 'CAMPAIGN', cta: '', logoUrl: '' }}
    />
    <Composition
      id="MagazineCoverStory"
      component={MagazineCoverStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ ...DEFAULT_PROPS, categoryLabel: 'FEATURE', logoUrl: '' }}
    />
    <Composition
      id="GallerySeriesStory"
      component={GallerySeriesStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        ...DEFAULT_PROPS,
        categoryLabel: 'GALLERY',
        galleryPhotoUrls: [
          'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080',
          'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1080',
        ],
        galleryLayout: 'dual',
      }}
    />

    <Composition
      id="SpecStory"
      component={SpecStory as AnyFC}
      durationInFrames={STORY_FRAMES}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        ...DEFAULT_PROPS,
        templateId: 'remotion_editorial_bottom_01',
        kitId: 'kit_01_beach_club',
      }}
    />

    {/* ── Poster Compositions (PNG stills — event / lineup / promo) ── */}
    <Composition
      id="SpecPosterStory"
      component={SpecPoster as AnyFC}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        ...DEFAULT_PROPS,
        posterTemplateId: 'poster_lineup_tiered_01',
        kitId: 'kit_04_nightclub',
        format: 'story',
        headline: 'LIVE NIGHT',
        eventDate: '15 HAZİRAN',
        eventTime: '21:00',
        lineupArtists: ['Headliner DJ', 'Support Act'],
        cta: 'Bilet Al',
      }}
    />
    <Composition
      id="SpecPosterPost"
      component={SpecPoster as AnyFC}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={{
        ...DEFAULT_PROPS,
        posterTemplateId: 'poster_promo_split_01',
        format: 'post',
        headline: '%30 İNDİRİM',
        cta: 'Hemen Al',
      }}
    />
    <Composition
      id="SpecPosterPortrait"
      component={SpecPoster as AnyFC}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1350}
      defaultProps={{
        ...DEFAULT_PROPS,
        posterTemplateId: 'poster_gala_invite_01',
        format: 'portrait',
        headline: 'Gala Evening',
        eventDate: '20 Haziran',
      }}
    />

    {/* ── Feed Post Compositions (PNG stills via renderStill) ── */}
    <Composition
      id="BrandedFeedPost"
      component={BrandedFeedPost as AnyFC}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1080}
      defaultProps={DEFAULT_POST_PROPS}
    />
    <Composition
      id="BrandedFeedPortrait"
      component={BrandedFeedPost as AnyFC}
      durationInFrames={1}
      fps={30}
      width={1080}
      height={1350}
      defaultProps={{ ...DEFAULT_POST_PROPS, format: '4:5' as const }}
    />
  </>
);

// Required by @remotion/renderer — must be called in the entry point file
registerRoot(RemotionRoot);

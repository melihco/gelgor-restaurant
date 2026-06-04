/**
 * StoryLayoutEngine — single parametric renderer for 100+ Remotion template specs.
 */
'use client';

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import type { StoryProps } from './types';
import { StoryLogoTopCenter } from './StoryLogo';
import { GallerySeriesStory } from './GallerySeriesStory';
import {
  KenBurnsPhoto,
  trackingToLetterSpacing,
  HeadlineStack,
  headlineSize,
  resolveStoryTextColors,
  stableTextLayerStyle,
  stableTextOpacity,
  textShadowHeavy,
} from './shared/story-primitives';
import { StoryFontProvider, useStoryFonts } from './shared/useRemotionFonts';
import {
  AsymmetricEditorialLayout,
  DiptychCollageLayout,
  EventTicketLayout,
  MinimalLuxuryLayout,
  MosaicPinterestLayout,
  PolaroidStackLayout,
} from './AgencyStoryLayouts';
import {
  BoldImpactLayout,
  CinematicCenterLayout,
  EditorialLeftLayout,
  FlushCampaignLayout,
  MagazineCoverLayout,
  NoirEditorialLayout,
} from './ProStoryLayouts';
import {
  BentoStoryLayout,
  NeonNightLayout,
  VibeFullscreenLayout,
} from './VibeStoryLayouts';
import {
  LocationPinLayout,
  QuoteCardLayout,
} from './SocialStoryLayouts';

export interface StoryLayoutEngineProps extends StoryProps {
  layoutSpec: RemotionLayoutSpec;
}

export const StoryLayoutEngine: React.FC<StoryLayoutEngineProps> = (props) => {
  const { layoutSpec: spec } = props;

  const inner = (() => {
  if (spec.family === 'gallery_series') {
    return (
      <GallerySeriesStory
        {...props}
        galleryPhotoUrls={props.galleryPhotoUrls}
        galleryLayout={props.galleryLayout ?? 'dual'}
      />
    );
  }

  if (spec.backgroundMode === 'split_panel' || spec.textZone === 'split_panel') {
    return <SplitPanelLayout {...props} spec={spec} />;
  }

  switch (spec.family) {
    case 'event_ticket':
      return <EventTicketLayout {...props} layoutSpec={spec} />;
    case 'diptych_collage':
      return <DiptychCollageLayout {...props} layoutSpec={spec} />;
    case 'minimal_luxury':
      return <MinimalLuxuryLayout {...props} layoutSpec={spec} />;
    case 'mosaic_pinterest':
      return <MosaicPinterestLayout {...props} layoutSpec={spec} />;
    case 'asymmetric_editorial':
      return <AsymmetricEditorialLayout {...props} layoutSpec={spec} />;
    case 'polaroid_stack':
      return <PolaroidStackLayout {...props} layoutSpec={spec} />;
    case 'vibe_fullscreen':
      return <VibeFullscreenLayout {...props} layoutSpec={spec} />;
    case 'bento_story':
      return <BentoStoryLayout {...props} layoutSpec={spec} />;
    case 'neon_night':
      return <NeonNightLayout {...props} layoutSpec={spec} />;
    case 'quote_card':
      return <QuoteCardLayout {...props} layoutSpec={spec} />;
    case 'location_pin':
      return <LocationPinLayout {...props} layoutSpec={spec} />;
    case 'cinematic_center':
      return <CinematicCenterLayout {...props} spec={spec} />;
    case 'noir_editorial':
      return <NoirEditorialLayout {...props} spec={spec} />;
    case 'campaign_hero':
      return <FlushCampaignLayout {...props} spec={spec} />;
    case 'bold_impact':
      return <BoldImpactLayout {...props} spec={spec} />;
    case 'magazine_cover':
      return <MagazineCoverLayout {...props} spec={spec} />;
    case 'editorial_left':
      return <EditorialLeftLayout {...props} spec={spec} />;
    case 'frosted_glass':
      return <FrostedLayout {...props} spec={spec} />;
    default:
      return <EditorialBottomLayout {...props} spec={spec} />;
  }
  })();

  const brandHeading = props.fontFamily?.trim();
  return (
    <StoryFontProvider
      personality={brandHeading ? 'brand' : spec.fontPersonality}
      headingFont={props.fontFamily}
      bodyFont={props.bodyFont}
      honorExplicitBrand={Boolean(brandHeading)}
    >
      {inner}
    </StoryFontProvider>
  );
};

type LayoutProps = StoryLayoutEngineProps & { spec: RemotionLayoutSpec };

function DuotoneWash({ spec, primary, accent }: { spec: RemotionLayoutSpec; primary: string; accent: string }) {
  if (spec.duotoneWash === 'none') return null;
  const color = spec.duotoneWash === 'accent' ? accent
    : spec.duotoneWash === 'warm' ? '#ea580c'
    : spec.duotoneWash === 'cool' ? '#0284c7'
    : primary;
  return (
    <AbsoluteFill style={{
      background: color,
      opacity: spec.duotoneOpacity,
      mixBlendMode: 'multiply',
      pointerEvents: 'none',
    }} />
  );
}

function VignetteLayer({ spec }: { spec: RemotionLayoutSpec }) {
  if (spec.vignette === 'none') return null;
  const opacity = spec.vignette === 'noir' ? 0.85 : spec.vignette === 'radial' ? 0.65 : 0.4;
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,${opacity}) 100%)`,
      pointerEvents: 'none',
    }} />
  );
}

function FrameLayer({ spec, accent }: { spec: RemotionLayoutSpec; accent: string }) {
  if (spec.frame === 'none') return null;
  const border = spec.frame === 'double' ? `6px double ${accent}` : spec.frame === 'inset' ? `2px solid ${accent}66` : `3px solid ${accent}`;
  return (
    <AbsoluteFill style={{
      boxSizing: 'border-box',
      border,
      margin: spec.frame === 'inset' ? 24 : 16,
      pointerEvents: 'none',
    }} />
  );
}

function SplitPanelLayout({
  photoUrl, headline, subtitle = '', categoryLabel = '', brandName, location = '',
  primaryColor = '#1a2b4a', accentColor = '#c9a96e', fontFamily = 'Cormorant Garamond',
  headlineWeight, headlineScale = 1, logoUrl = '', cta = '', spec,
  headlineColor, subtitleColor, categoryColor,
}: LayoutProps) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const panelRatio = spec.panelRatio;
  const photoH = Math.round(height * (1 - panelRatio));
  const panelH = height - photoH;
  const panelBg = spec.panelUsesPrimary ? primaryColor : '#0a0a0f';
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ headlineColor, subtitleColor, categoryColor, accentColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.0);
  const panelIn = stableTextOpacity(frame, 0, 18);
  const headOp = stableTextOpacity(frame, 16, 34);

  return (
    <AbsoluteFill style={{ background: panelBg }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: photoH, overflow: 'hidden' }}>
        <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin={spec.kenBurnsOrigin} driftY={24} />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '20%',
          background: `linear-gradient(to bottom, transparent, ${panelBg})`,
        }} />
      </div>
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.9} />
      <div style={{
        position: 'absolute', top: photoH, left: 0, right: 0, height: panelH,
        background: panelBg, opacity: panelIn,
        display: 'flex', flexDirection: 'column', alignItems: spec.align === 'left' ? 'flex-start' : 'center',
        justifyContent: 'center', padding: '28px 48px', textAlign: spec.align,
      }}>
        {spec.accentLine === 'above' || spec.accentLine === 'both' ? (
          <div style={{ width: 48, height: 3, background: accentColor, marginBottom: 16 }} />
        ) : null}
        {categoryLabel ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 11, letterSpacing: trackingToLetterSpacing(spec.categoryTracking),
            textTransform: 'uppercase',             color: spec.accentOnCategory ? accentColor : textColors.category, marginBottom: 10,
          }}>
            {categoryLabel}
          </span>
        ) : null}
        <div style={{ maxWidth: '95%', ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? spec.heroWeight}
            fontSize={fontSize}
            color={textColors.headline}
            uppercase={spec.heroUppercase}
            tracking={spec.heroTracking}
            frame={frame}
            fps={fps}
            startFrame={16}
            lineGap={1.08}
          />
        </div>
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 20, fontStyle: spec.subtitleItalic ? 'italic' : 'normal',
            color: textColors.subtitle, marginTop: 12, opacity: headOp,
          }}>
            {subtitle}
          </span>
        ) : null}
        {spec.showCtaPill && cta ? (
          <span style={{
            marginTop: 16, padding: '10px 22px', borderRadius: 999, border: `1.5px solid ${accentColor}`,
            fontFamily: fonts.body, fontSize: 14, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: textColors.headline,
          }}>
            {cta}
          </span>
        ) : null}
        {spec.showLocation && location ? (
          <span style={{ fontFamily: fonts.body, fontSize: 13, color: textColors.location, marginTop: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
            {location}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

function EditorialBottomLayout(props: LayoutProps) {
  const {
    photoUrl, headline, subtitle = '', categoryLabel = '', brandName, location = '',
    accentColor = '#c9a96e', primaryColor = '#1a2b4a', fontFamily = 'Cormorant Garamond',
    headlineWeight, headlineScale = 1, logoUrl = '', spec, overlayOpacity,
    headlineColor, subtitleColor, categoryColor,
  } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ headlineColor, subtitleColor, categoryColor, accentColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale));
  const gradStart = Math.round(spec.gradientStart * 100);
  const gradEnd = Math.round(spec.gradientEnd * 100);
  const overlayOp = props.overlayOpacity ?? spec.overlayOpacity;
  const sidePad = spec.align === 'center' ? 48 : 52;
  const barH = interpolate(frame, [4, 22], [0, 100], { extrapolateRight: 'clamp' });
  const headOp = stableTextOpacity(frame, 22, 38);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin={spec.kenBurnsOrigin} driftY={12} />
      <DuotoneWash spec={spec} primary={primaryColor} accent={accentColor} />
      <VignetteLayer spec={spec} />
      <AbsoluteFill style={{
        background: `linear-gradient(to bottom, transparent ${gradStart}%, rgba(0,0,0,${overlayOp}) ${gradEnd}%)`,
      }} />
      <FrameLayer spec={spec} accent={accentColor} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.85} />

      {spec.accentLine === 'left_bar' || spec.accentLine === 'both' ? (
        <div style={{
          position: 'absolute', left: sidePad - 20, bottom: '14%', width: 4, height: `${barH * 0.55}%`,
          background: accentColor, borderRadius: 2,
        }} />
      ) : null}

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        alignItems: spec.align === 'center' ? 'center' : spec.align === 'right' ? 'flex-end' : 'flex-start',
        padding: `0 ${sidePad}px 10%`, textAlign: spec.align,
      }}>
        {categoryLabel ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 11, letterSpacing: trackingToLetterSpacing(spec.categoryTracking),
            textTransform: 'uppercase', color: spec.accentOnCategory ? accentColor : textColors.category,
            marginBottom: 10, textShadow: textShadowHeavy,
          }}>
            {categoryLabel}
          </span>
        ) : null}
        <div style={{ maxWidth: '95%', ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? spec.heroWeight}
            fontSize={fontSize}
            color={textColors.headline}
            uppercase={spec.heroUppercase}
            tracking={spec.heroTracking}
            frame={frame}
            fps={fps}
            startFrame={22}
            lineGap={1.08}
            textShadow={textShadowHeavy}
          />
        </div>
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 26, fontStyle: spec.subtitleItalic ? 'italic' : 'normal',
            color: textColors.subtitle, marginTop: 14, opacity: headOp, textShadow: textShadowHeavy,
            lineHeight: 1.48, maxWidth: '92%', display: 'block',
          }}>
            {subtitle}
          </span>
        ) : null}
        {spec.showLocation && location ? (
          <span style={{ fontFamily: fonts.body, fontSize: 15, color: textColors.location, marginTop: 16, letterSpacing: 2, textTransform: 'uppercase' }}>
            {location}
          </span>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function FrostedLayout(props: LayoutProps) {
  const {
    photoUrl, headline, subtitle = '', categoryLabel = '', brandName, accentColor = '#c9a96e',
    fontFamily = 'Cormorant Garamond', headlineWeight, headlineScale = 1, logoUrl = '', spec,
    overlayOpacity, headlineColor, subtitleColor,
  } = props;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ headlineColor, subtitleColor, accentColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.95);
  const overlayOp = overlayOpacity ?? spec.overlayOpacity;
  const cardOp = stableTextOpacity(frame, 12, 32);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin={spec.kenBurnsOrigin} driftY={20} />
      <VignetteLayer spec={spec} />
      <AbsoluteFill style={{
        background: `linear-gradient(to bottom, transparent ${Math.round(spec.gradientStart * 100)}%, rgba(0,0,0,${overlayOp}) 100%)`,
      }} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.88} />
      <AbsoluteFill style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: `0 40px ${Math.round((1 - spec.frostedY) * 100)}%`,
      }}>
        <div style={{
          width: '100%', maxWidth: 920, padding: '32px 36px', borderRadius: 20, opacity: cardOp,
          ...stableTextLayerStyle,
          background: spec.frostedCard ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.72)',
          border: `1px solid rgba(255,255,255,0.15)`,
          textAlign: spec.align,
        }}>
          {categoryLabel ? (
            <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 10, textTransform: 'uppercase', color: accentColor }}>
              {categoryLabel}
            </span>
          ) : null}
          <div style={{ marginTop: 10 }}>
            <HeadlineStack
              headline={headline}
              fontFamily={fonts.hero}
              fontWeight={headlineWeight ?? spec.heroWeight}
              fontSize={fontSize}
              color={textColors.headline}
              uppercase={spec.heroUppercase}
              tracking={spec.heroTracking}
              frame={frame}
              fps={fps}
              startFrame={24}
              lineGap={1.1}
            />
          </div>
          {subtitle ? (
            <span style={{ fontFamily: fonts.body, fontSize: 20, color: textColors.subtitle, marginTop: 10, display: 'block', fontStyle: spec.subtitleItalic ? 'italic' : 'normal' }}>
              {subtitle}
            </span>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

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
  textShadowEditorial,
  textShadowAmbient,
  FilmGrainOverlay,
} from './shared/story-primitives';
import { StoryFontProvider, useStoryFonts } from './shared/useRemotionFonts';
import {
  AsymmetricEditorialLayout,
  DiptychCollageLayout,
  EventTicketLayout,
  MinimalLuxuryLayout,
  MosaicPinterestLayout,
  PolaroidSingleLayout,
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
import { brandPanelGradientCss, cinematicScrimCss } from '../lib/brand-panel-gradient';

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
    case 'polaroid_single':
      return <PolaroidSingleLayout {...props} layoutSpec={spec} />;
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
  const useTemplateTypo = props.honorTemplateTypography === true;
  const personality = useTemplateTypo
    ? (props.fontPersonality ?? spec.fontPersonality)
    : brandHeading
      ? 'brand'
      : spec.fontPersonality;
  return (
    <StoryFontProvider
      personality={personality}
      headingFont={props.fontFamily}
      bodyFont={props.bodyFont}
      honorExplicitBrand={useTemplateTypo ? false : Boolean(brandHeading)}
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
  const panelH = Math.round(height * panelRatio);
  const blendExtra = Math.round(height * 0.14);
  const gradientH = panelH + blendExtra;
  const panelBg = spec.panelUsesPrimary ? primaryColor : '#0a0a0f';
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ headlineColor, subtitleColor, categoryColor, accentColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.0);
  const panelIn = stableTextOpacity(frame, 0, 18);
  const headOp = stableTextOpacity(frame, 16, 34);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin={spec.kenBurnsOrigin} driftY={24} />
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: gradientH,
        background: brandPanelGradientCss(panelBg, 0.96),
        opacity: panelIn,
        pointerEvents: 'none',
      }} />
      <FrameLayer spec={spec} accent={accentColor} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.9} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: panelH,
        display: 'flex', flexDirection: 'column', alignItems: spec.align === 'left' ? 'flex-start' : 'center',
        justifyContent: 'center', padding: '28px 48px', textAlign: spec.align,
        zIndex: 5,
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
            primaryColor={primaryColor}
            accentColor={accentColor}
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
          position: 'absolute', left: sidePad - 20, bottom: '14%', width: 4, height: `${Math.round(barH * 0.55)}%`,
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
            marginBottom: 12, textShadow: textShadowEditorial,
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
            primaryColor={primaryColor}
            accentColor={accentColor}
            uppercase={spec.heroUppercase}
            tracking={spec.heroTracking}
            frame={frame}
            fps={fps}
            startFrame={22}
            lineGap={1.06}
            textShadow={textShadowEditorial}
          />
        </div>
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 20, fontStyle: spec.subtitleItalic ? 'italic' : 'normal',
            color: textColors.subtitle, marginTop: 14, opacity: headOp, textShadow: textShadowAmbient,
            lineHeight: 1.52, maxWidth: '92%', display: 'block',
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
      {/* Upgraded: smooth cinematic scrim instead of hard gradient stop */}
      <AbsoluteFill style={{
        background: cinematicScrimCss(overlayOp, Math.round(spec.gradientStart * 100)),
      }} />
      <FilmGrainOverlay opacity={0.05} fine />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.86} />
      <AbsoluteFill style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: `0 40px ${Math.round((1 - spec.frostedY) * 100)}%`,
      }}>
        <div style={{
          width: '100%', maxWidth: 920, padding: '28px 32px 30px', borderRadius: 16, opacity: cardOp,
          ...stableTextLayerStyle,
          // Frosted: real backdrop-blur for glass effect; solid: refined dark card
          background: spec.frostedCard ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.60)',
          border: spec.frostedCard
            ? '1px solid rgba(255,255,255,0.28)'
            : '1px solid rgba(255,255,255,0.10)',
          backdropFilter: spec.frostedCard ? 'blur(12px)' : 'blur(4px)',
          WebkitBackdropFilter: spec.frostedCard ? 'blur(12px)' : 'blur(4px)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.06)',
          textAlign: spec.align,
        }}>
          {categoryLabel ? (
            <span style={{
              fontFamily: fonts.body, fontSize: 10, letterSpacing: 7, textTransform: 'uppercase',
              color: accentColor, display: 'block', marginBottom: 10,
            }}>
              {categoryLabel}
            </span>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <HeadlineStack
              headline={headline}
              fontFamily={fonts.hero}
              fontWeight={headlineWeight ?? spec.heroWeight}
              fontSize={fontSize}
              color={textColors.headline}
              primaryColor={props.primaryColor}
              accentColor={accentColor}
              uppercase={spec.heroUppercase}
              tracking={spec.heroTracking}
              frame={frame}
              fps={fps}
              startFrame={24}
              lineGap={1.08}
            />
          </div>
          {subtitle ? (
            <span style={{
              fontFamily: fonts.body, fontSize: 19, color: textColors.subtitle, marginTop: 12,
              display: 'block', fontStyle: spec.subtitleItalic ? 'italic' : 'normal', lineHeight: 1.5,
            }}>
              {subtitle}
            </span>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

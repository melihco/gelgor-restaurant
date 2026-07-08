'use client';

import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import type { StoryProps } from './types';
import { StoryLogoInline, StoryLogoMark, StoryLogoTopCenter } from './StoryLogo';
import {
  CinematicLightLayer,
  EditorialKicker,
  FilmGrainOverlay,
  HeadlineStack,
  KenBurnsPhoto,
  MeshGradientLayer,
  headlineSize,
  splitHeadlineLines,
  stableTextLayerStyle,
  stableTextOpacity,
  textShadowEditorial,
  textShadowHeavy,
  trackingToLetterSpacing,
  resolveStoryTextColors,
  resolveHeadlineLineHeight,
  headlineLineBoxStyle,
} from './shared/story-primitives';
import { useStoryFonts } from './shared/useRemotionFonts';

type PremiumLayoutProps = StoryProps & { layoutSpec: RemotionLayoutSpec };

/**
 * Premium motion background — uses fal.ai I2V video plate when available,
 * falls back to standard KenBurns photo.
 */
function PremiumMotionBackground({
  motionBackgroundUrl,
  photoUrl,
  spec,
  overlayOpacity,
}: {
  motionBackgroundUrl?: string;
  photoUrl: string;
  spec: RemotionLayoutSpec;
  overlayOpacity?: number;
}) {
  if (motionBackgroundUrl) {
    return (
      <AbsoluteFill>
        <OffthreadVideo
          src={motionBackgroundUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          muted
        />
        <AbsoluteFill style={{
          background: `linear-gradient(180deg, rgba(0,0,0,${(overlayOpacity ?? spec.overlayOpacity ?? 0.5) * 0.4}) 0%, rgba(0,0,0,${overlayOpacity ?? spec.overlayOpacity ?? 0.5}) 100%)`,
        }} />
      </AbsoluteFill>
    );
  }
  return (
    <KenBurnsPhoto
      photoUrl={photoUrl}
      scaleMax={spec.kenBurnsScale}
      origin={spec.kenBurnsOrigin}
    />
  );
}

function glassBg(accentColor: string, primaryColor: string): React.CSSProperties {
  return {
    background: `
      linear-gradient(135deg, rgba(255,255,255,0.22), rgba(255,255,255,0.08)),
      radial-gradient(ellipse 80% 60% at 15% 10%, ${accentColor}28, transparent 62%),
      linear-gradient(180deg, ${primaryColor}55, rgba(0,0,0,0.54))
    `,
    border: '1px solid rgba(255,255,255,0.26)',
    boxShadow: '0 28px 90px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.34)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };
}

function PremiumDepthHeadline({
  headline,
  fontFamily,
  fontWeight,
  fontSize,
  primaryColor,
  accentColor,
  color,
  uppercase,
  tracking,
  align,
  frame,
  startFrame = 16,
}: {
  headline: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  primaryColor: string;
  accentColor: string;
  color: string;
  uppercase: boolean;
  tracking: number;
  align: 'left' | 'center' | 'right';
  frame: number;
  startFrame?: number;
}) {
  const lines = splitHeadlineLines(headline, 3, 14);
  const opacity = stableTextOpacity(frame, startFrame, startFrame + 18);
  return (
    <div style={{ opacity, textAlign: align, ...stableTextLayerStyle }}>
      {lines.map((line, i) => {
        const size = Math.round(fontSize * (i === 0 ? 1 : i === 1 ? 0.9 : 0.78));
        const lineBox = headlineLineBoxStyle(i >= lines.length - 1);
        const base: React.CSSProperties = {
          display: 'block',
          position: 'relative',
          fontFamily,
          fontWeight,
          fontSize: size,
          lineHeight: resolveHeadlineLineHeight(1.08, fontWeight),
          letterSpacing: trackingToLetterSpacing(tracking),
          textTransform: uppercase ? 'uppercase' : 'none',
          color,
          textShadow: `0 3px 0 ${primaryColor}, 0 7px 0 ${accentColor}88, ${textShadowHeavy}`,
        };
        return (
          <span key={`${line}-${i}`} style={{ ...lineBox, ...base }}>
            <span
              style={{
                position: 'absolute',
                left: align === 'center' ? '50%' : 0,
                top: '0.1em',
                transform: align === 'center' ? 'translate3d(calc(-50% + 7px), 7px, 0)' : 'translate3d(7px, 7px, 0)',
                color: accentColor,
                opacity: 0.62,
                zIndex: -1,
                pointerEvents: 'none',
              }}
            >
              {line}
            </span>
            {line}
          </span>
        );
      })}
    </div>
  );
}

function PremiumCta({
  cta,
  accentColor,
  fontFamily,
  opacity,
}: {
  cta?: string;
  accentColor: string;
  fontFamily: string;
  opacity: number;
}) {
  if (!cta?.trim()) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 22,
        padding: '13px 28px',
        borderRadius: 999,
        background: '#fff',
        color: '#0b0b10',
        fontFamily,
        fontWeight: 900,
        fontSize: 12,
        letterSpacing: 3,
        textTransform: 'uppercase',
        opacity,
        boxShadow: `8px 8px 0 ${accentColor}, 0 18px 42px rgba(0,0,0,0.34)`,
        ...stableTextLayerStyle,
      }}
    >
      {cta}
    </span>
  );
}

export function LuxuryKineticTypeLayout({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  location = '',
  cta = '',
  primaryColor = '#101828',
  accentColor = '#d4a574',
  headlineColor,
  subtitleColor,
  categoryColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  motionBackgroundUrl,
  layoutSpec: spec,
}: PremiumLayoutProps) {
  const frame = useCurrentFrame();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ headlineColor, subtitleColor, categoryColor, accentColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.28, headlineWeight ?? spec.heroWeight);
  const metaOpacity = stableTextOpacity(frame, 28, 44);
  const glowOpacity = interpolate(frame, [0, 42], [0.48, 0.82], { extrapolateRight: 'clamp' });
  const align = spec.align === 'right' ? 'right' : spec.align === 'left' ? 'left' : 'center';

  return (
    <AbsoluteFill style={{ background: '#050508' }}>
      <PremiumMotionBackground motionBackgroundUrl={motionBackgroundUrl} photoUrl={photoUrl} spec={spec} overlayOpacity={spec.overlayOpacity} />
      <AbsoluteFill style={{ background: primaryColor, opacity: spec.overlayOpacity * 0.55, mixBlendMode: 'multiply' }} />
      <AbsoluteFill style={{ background: accentColor, opacity: spec.duotoneOpacity, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 46% at 50% 72%, ${accentColor}55, transparent 64%)`, opacity: glowOpacity }} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.72) 0%, transparent 28%, rgba(0,0,0,0.88) 100%)' }} />
      <CinematicLightLayer warmth="warm" intensity={0.9} origin="50% 4%" />
      <FilmGrainOverlay opacity={0.08} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} paddingTop="6.5%" />
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: spec.textZone === 'top_center' ? 'flex-start' : 'flex-end',
          alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
          padding: spec.textZone === 'top_center' ? '17% 44px 0' : '0 42px 12%',
          textAlign: align,
          zIndex: 8,
        }}
      >
        {categoryLabel ? (
          <div style={{ opacity: metaOpacity }}>
            <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align={align === 'center' ? 'center' : 'left'} />
          </div>
        ) : null}
        <PremiumDepthHeadline
          headline={headline}
          fontFamily={fonts.hero}
          fontWeight={headlineWeight ?? spec.heroWeight}
          fontSize={fontSize}
          primaryColor={primaryColor}
          accentColor={accentColor}
          color={textColors.headline}
          uppercase={spec.heroUppercase}
          tracking={spec.heroTracking}
          align={align}
          frame={frame}
        />
        {subtitle ? (
          <span style={{ maxWidth: 560, fontFamily: fonts.body, fontSize: 26, fontWeight: 600, lineHeight: 1.32, color: textColors.subtitle, marginTop: 18, opacity: metaOpacity, textShadow: textShadowEditorial }}>
            {subtitle.slice(0, 130)}
          </span>
        ) : null}
        {spec.showLocation && location ? (
          <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: textColors.location, marginTop: 16, opacity: metaOpacity }}>
            {location}
          </span>
        ) : null}
        {spec.showCtaPill ? <PremiumCta cta={cta} accentColor={accentColor} fontFamily={fonts.body} opacity={metaOpacity} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function GlassmorphismShowcaseLayout({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  location = '',
  cta = '',
  primaryColor = '#101828',
  accentColor = '#d4a574',
  headlineColor,
  subtitleColor,
  categoryColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  motionBackgroundUrl,
  layoutSpec: spec,
}: PremiumLayoutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ headlineColor, subtitleColor, categoryColor, accentColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.12, headlineWeight ?? spec.heroWeight);
  const cardOpacity = stableTextOpacity(frame, 12, 30);
  const textOpacity = stableTextOpacity(frame, 20, 38);
  const centered = spec.textZone === 'center';

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <PremiumMotionBackground motionBackgroundUrl={motionBackgroundUrl} photoUrl={photoUrl} spec={spec} overlayOpacity={spec.overlayOpacity} />
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.55} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.22), rgba(0,0,0,${spec.overlayOpacity}))` }} />
      <CinematicLightLayer warmth="cool" intensity={0.7} origin="50% 0%" />
      <FilmGrainOverlay opacity={0.05} />
      <div style={{ position: 'absolute', top: 112, left: 42, right: 42, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <StoryLogoInline logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} />
        {categoryLabel ? (
          <div style={{ marginBottom: -14 }}>
            <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align="left" />
          </div>
        ) : null}
      </div>
      <AbsoluteFill
        style={{
          display: 'flex',
          alignItems: centered ? 'center' : 'flex-end',
          justifyContent: centered ? 'center' : 'flex-end',
          padding: centered ? '0 44px' : '0 38px 9%',
          zIndex: 8,
        }}
      >
        <div
          style={{
            width: centered ? '88%' : '100%',
            borderRadius: 34,
            padding: centered ? '44px 38px' : '36px 34px',
            opacity: cardOpacity,
            textAlign: centered ? 'center' : spec.align,
            ...glassBg(accentColor, primaryColor),
          }}
        >
          <div style={{ opacity: textOpacity, ...stableTextLayerStyle }}>
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
              startFrame={20}
              lineGap={1.1}
              textShadow={textShadowEditorial}
              align={centered ? 'center' : spec.align}
              holdOpacity
            />
          </div>
          {subtitle ? (
            <span style={{ display: 'block', fontFamily: fonts.body, fontSize: 30, lineHeight: 1.45, color: textColors.subtitle, marginTop: 16, opacity: textOpacity }}>
              {subtitle.slice(0, 135)}
            </span>
          ) : null}
          {spec.showLocation && location ? (
            <span style={{ display: 'block', fontFamily: fonts.body, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: textColors.location, marginTop: 18, opacity: textOpacity }}>
              {location}
            </span>
          ) : null}
          {spec.showCtaPill ? <PremiumCta cta={cta} accentColor={accentColor} fontFamily={fonts.body} opacity={textOpacity} /> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function EditorialProductStageLayout({
  photoUrl,
  galleryPhotoUrls,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  location = '',
  cta = '',
  primaryColor = '#101828',
  accentColor = '#d4a574',
  headlineColor,
  subtitleColor,
  categoryColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  motionBackgroundUrl,
  layoutSpec: spec,
}: PremiumLayoutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ headlineColor, subtitleColor, categoryColor, accentColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.04, headlineWeight ?? spec.heroWeight);
  const reveal = stableTextOpacity(frame, 18, 36);
  const align = spec.align === 'right' ? 'right' : spec.align === 'center' ? 'center' : 'left';
  const side = align === 'right' ? 'left' : 'right';
  const secondaryPhoto = galleryPhotoUrls?.find((url) => url && url !== photoUrl);

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.74} />
      <div
        style={{
          position: 'absolute',
          top: 96,
          [side]: 28,
          width: '58%',
          height: '58%',
          borderRadius: 36,
          overflow: 'hidden',
          boxShadow: '0 36px 100px rgba(0,0,0,0.46)',
          border: `1px solid ${accentColor}66`,
          transform: 'translateZ(0)',
        }}
      >
        <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin={spec.kenBurnsOrigin} driftY={14} />
        {motionBackgroundUrl && (
          <AbsoluteFill>
            <OffthreadVideo
              src={motionBackgroundUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
            />
          </AbsoluteFill>
        )}
        <AbsoluteFill style={{ background: `linear-gradient(180deg, transparent 50%, rgba(0,0,0,${spec.overlayOpacity}) 100%)` }} />
      </div>
      {secondaryPhoto ? (
        <div
          style={{
            position: 'absolute',
            top: '52%',
            [side]: 76,
            width: 168,
            height: 218,
            borderRadius: 24,
            overflow: 'hidden',
            border: `3px solid ${accentColor}`,
            boxShadow: '0 24px 70px rgba(0,0,0,0.38)',
            transform: 'rotate(-3deg)',
          }}
        >
          <Img src={secondaryPhoto} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : null}
      <CinematicLightLayer warmth="warm" intensity={0.75} origin={`${side === 'right' ? '70%' : '30%'} 8%`} />
      <FilmGrainOverlay opacity={0.06} />
      <div style={{ position: 'absolute', top: 60, left: 42, right: 42, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} />
        {location ? (
          <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: textColors.location }}>
            {location}
          </span>
        ) : null}
      </div>
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
          padding: '0 44px 9%',
          textAlign: align,
          zIndex: 8,
        }}
      >
        <div style={{ maxWidth: align === 'center' ? '92%' : '64%', opacity: reveal, ...stableTextLayerStyle }}>
          {categoryLabel ? (
            <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align={align === 'center' ? 'center' : 'left'} />
          ) : null}
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
            startFrame={18}
            lineGap={1.08}
            textShadow={textShadowEditorial}
            align={align}
            holdOpacity
          />
          {subtitle ? (
            <span style={{ display: 'block', fontFamily: fonts.body, fontSize: 26, lineHeight: 1.42, color: textColors.subtitle, marginTop: 15 }}>
              {subtitle.slice(0, 130)}
            </span>
          ) : null}
          {spec.showCtaPill ? <PremiumCta cta={cta} accentColor={accentColor} fontFamily={fonts.body} opacity={1} /> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

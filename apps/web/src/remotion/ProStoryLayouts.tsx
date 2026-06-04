'use client';

import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import type { StoryProps } from './types';
import { StoryLogoMark, StoryLogoTopCenter } from './StoryLogo';
import {
  HeadlineStack, KenBurnsPhoto, headlineSize, staggerOpacity,
  stableTextLayerStyle, textShadowHeavy,
} from './shared/story-primitives';
import { useStoryFonts } from './shared/useRemotionFonts';

type Props = StoryProps & { spec: RemotionLayoutSpec };

export function EditorialLeftLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', brandName, primaryColor = '#1a2b4a',
    accentColor = '#c9a96e', headlineWeight, headlineScale = 1, logoUrl = '', location = '', spec } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.05);
  const panelIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '38%', background: primaryColor, opacity: panelIn, zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8% 6% 10% 7%' }}>
        <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} />
        {spec.categoryVertical && categoryLabel ? (
          <div style={{ position: 'absolute', left: 28, top: '28%', transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: 'left top', opacity: staggerOpacity(frame, 14, 30) }}>
            <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 14, textTransform: 'uppercase', color: accentColor, whiteSpace: 'nowrap' }}>{categoryLabel}</span>
          </div>
        ) : null}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 40 }}>
          {!spec.categoryVertical && categoryLabel ? (
            <span style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 12, textTransform: 'uppercase', color: accentColor, marginBottom: 16, opacity: staggerOpacity(frame, 18, 32) }}>{categoryLabel}</span>
          ) : null}
          <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? spec.heroWeight} fontSize={fontSize} color="#fff" uppercase={spec.heroUppercase} tracking={spec.heroTracking} frame={frame} fps={fps} startFrame={20} lineGap={0.92} />
          {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 18, color: 'rgba(255,255,255,0.65)', marginTop: 18, opacity: staggerOpacity(frame, 36, 50), display: 'block' }}>{subtitle}</span> : null}
        </div>
        {spec.showLocation && location ? <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>{location}</span> : null}
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, left: '38%', overflow: 'hidden' }}>
        <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.1} origin="65% 40%" driftY={28} driftX={-12} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right, ${primaryColor}, transparent)` }} />
      </div>
    </AbsoluteFill>
  );
}

export function MagazineCoverLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', brandName, accentColor = '#c9a96e', headlineWeight, headlineScale = 1, logoUrl = '', spec } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.15);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 30%" driftY={14} />
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, transparent 28%, rgba(0,0,0,0.55) 62%, rgba(0,0,0,0.92) 100%)' }} />
      <AbsoluteFill style={{ padding: '6% 7%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', opacity: staggerOpacity(frame, 0, 18) }}>
          <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.9} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ borderTop: `2px solid ${accentColor}`, paddingTop: 24 }}>
          {categoryLabel ? (
            <span style={{
              fontFamily: fonts.body, fontSize: 10, letterSpacing: 10, textTransform: 'uppercase',
              color: accentColor, marginBottom: 14, display: 'block',
              opacity: staggerOpacity(frame, 12, 26),
            }}>
              {categoryLabel}
            </span>
          ) : null}
          <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 900} fontSize={fontSize} color="#fff" uppercase={spec.heroUppercase} tracking={spec.heroTracking * 1.2} frame={frame} fps={fps} startFrame={16} lineGap={0.88} textShadow={textShadowHeavy} />
          {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 20, fontStyle: 'italic', color: 'rgba(255,255,255,0.78)', marginTop: 16, display: 'block', opacity: staggerOpacity(frame, 38, 52) }}>{subtitle}</span> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function FlushCampaignLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', brandName, primaryColor = '#1a2b4a', accentColor = '#c9a96e', headlineWeight, headlineScale = 1, logoUrl = '', cta = '', location = '', spec } = p;
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const fonts = useStoryFonts();
  const blockH = Math.round(height * 0.36);
  const photoH = height - blockH;
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.0);
  const blockIn = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const blockBg = primaryColor;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: photoH, overflow: 'hidden' }}>
        <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 42%" driftY={14} />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%',
          background: `linear-gradient(to bottom, transparent, ${blockBg})`,
        }} />
      </div>
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.88} paddingTop="5%" />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: blockH,
        background: blockBg, opacity: blockIn,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '32px 48px 8%',
        borderTop: `3px solid ${accentColor}`,
      }}>
        {categoryLabel ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 10, letterSpacing: 12, textTransform: 'uppercase',
            color: accentColor, marginBottom: 12, opacity: staggerOpacity(frame, 12, 28),
          }}>
            {categoryLabel}
          </span>
        ) : null}
        <HeadlineStack
          headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 900}
          fontSize={fontSize} color="#fff" uppercase tracking={0.06}
          frame={frame} fps={fps} startFrame={16} lineGap={0.92} textShadow={textShadowHeavy}
        />
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 18, fontStyle: 'italic',
            color: 'rgba(255,255,255,0.72)', marginTop: 14,
            opacity: staggerOpacity(frame, 30, 44),
          }}>
            {subtitle}
          </span>
        ) : null}
        {spec.showCtaPill && cta ? (
          <span style={{
            marginTop: 18, alignSelf: 'flex-start', padding: '10px 22px',
            border: `1.5px solid ${accentColor}`, color: '#fff',
            fontFamily: fonts.body, fontSize: 12, fontWeight: 700, letterSpacing: 2,
            textTransform: 'uppercase', opacity: staggerOpacity(frame, 36, 50),
          }}>
            {cta}
          </span>
        ) : null}
        {spec.showLocation && location ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 11, letterSpacing: 3,
            color: 'rgba(255,255,255,0.4)', marginTop: 12, textTransform: 'uppercase',
          }}>
            {location}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

export function BoldImpactLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', primaryColor = '#1a2b4a', accentColor = '#c9a96e', headlineWeight, headlineScale = 1, logoUrl = '', brandName, cta = '', spec } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.2);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.12} origin="50% 50%" driftY={8} />
      <AbsoluteFill style={{ background: primaryColor, opacity: 0.42, mixBlendMode: 'multiply' }} />
      <AbsoluteFill style={{ background: accentColor, opacity: 0.18, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.75) 100%)' }} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.85} paddingTop="5%" />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 40px', textAlign: 'center' }}>
        {categoryLabel ? <span style={{ fontFamily: fonts.body, fontSize: 12, letterSpacing: 16, textTransform: 'uppercase', color: accentColor, marginBottom: 20, opacity: staggerOpacity(frame, 10, 28) }}>{categoryLabel}</span> : null}
        <div style={stableTextLayerStyle}>
          <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 900} fontSize={fontSize} color="#fff" uppercase tracking={0.08} frame={frame} fps={fps} startFrame={12} lineGap={0.85} strokeColor="#fff" strokeWidth={2} textShadow={textShadowHeavy} />
        </div>
        {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 22, fontWeight: 600, color: '#fff', marginTop: 20, opacity: staggerOpacity(frame, 36, 50) }}>{subtitle}</span> : null}
        {spec.showCtaPill && cta ? <span style={{ marginTop: 24, padding: '14px 36px', border: `2px solid ${accentColor}`, fontFamily: fonts.body, fontSize: 14, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase', color: '#fff', opacity: staggerOpacity(frame, 42, 56) }}>{cta}</span> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function NoirEditorialLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', accentColor = '#c9a96e', headlineWeight, headlineScale = 1, logoUrl = '', brandName, location = '', spec } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.98);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.04} origin="50% 55%" driftY={10} />
      <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.88) 0%, transparent 35%, transparent 55%, rgba(0,0,0,0.92) 100%)' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.85) 100%)' }} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: spec.align === 'center' ? 'center' : 'flex-start', padding: '14% 52px 0', textAlign: spec.align }}>
        <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.88} />
        {categoryLabel ? <span style={{ fontFamily: fonts.body, fontSize: 10, letterSpacing: 14, textTransform: 'uppercase', color: accentColor, marginTop: 28, marginBottom: 14, opacity: staggerOpacity(frame, 12, 26) }}>{categoryLabel}</span> : null}
        <div style={{ width: 56, height: 1, background: accentColor, marginBottom: 20, opacity: staggerOpacity(frame, 16, 30) }} />
        <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 300} fontSize={fontSize} color="#fff" tracking={0.12} frame={frame} fps={fps} startFrame={18} lineGap={1.0} />
        {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 19, fontStyle: 'italic', color: 'rgba(255,255,255,0.55)', marginTop: 16, opacity: staggerOpacity(frame, 34, 48) }}>{subtitle}</span> : null}
        {spec.showLocation && location ? <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 5, color: 'rgba(255,255,255,0.35)', marginTop: 24, textTransform: 'uppercase' }}>{location}</span> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function CinematicCenterLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', accentColor = '#c9a96e', headlineWeight, headlineScale = 1, logoUrl = '', brandName, spec } = p;
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const fonts = useStoryFonts();
  const barH = Math.round(height * 0.12);
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.95);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <div style={{ position: 'absolute', top: barH, left: 0, right: 0, bottom: barH, overflow: 'hidden' }}>
        <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 50%" driftY={6} />
        <AbsoluteFill style={{ background: 'rgba(0,0,0,0.35)' }} />
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: barH, background: '#000', zIndex: 5 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: barH, background: '#000', zIndex: 5 }} />
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${barH + 20}px 48px`, textAlign: 'center', zIndex: 8 }}>
        {categoryLabel ? <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 18, textTransform: 'uppercase', color: accentColor, marginBottom: 16, opacity: staggerOpacity(frame, 20, 38) }}>{categoryLabel}</span> : null}
        <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 700} fontSize={fontSize} color="#fff" uppercase={spec.heroUppercase} tracking={spec.heroTracking * 2} frame={frame} fps={fps} startFrame={22} lineGap={0.95} textShadow={textShadowHeavy} />
        {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 18, color: 'rgba(255,255,255,0.65)', marginTop: 14, opacity: staggerOpacity(frame, 40, 54), letterSpacing: 2, textTransform: 'uppercase' }}>{subtitle}</span> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

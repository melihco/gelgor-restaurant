/**
 * CampaignHeroStory — Cinematic-grade campaign / offer hero.
 *
 * Awwwards-adjacent: logo top-center, centered mega type, offer pill, mood line.
 * Best for: promos, seasonal campaigns, limited offers, launch announcements.
 */
'use client';

import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Img,
} from 'remotion';
import type { StoryProps } from './types';
import { StoryLogoTopCenter } from './StoryLogo';
import { useRemotionFonts } from './shared/useRemotionFonts';
import {
  HeadlineStack,
  headlineSize,
  stableScale,
  stableTextOpacity,
  useStableTextReveal,
  cinematicGradeFilter,
  CinematicLightLayer,
  FilmGrainOverlay,
} from './shared/story-primitives';
import { StoryAudioLayer } from './shared/story-audio';

export const CampaignHeroStory: React.FC<StoryProps> = ({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = 'CAMPAIGN',
  brandName,
  accentColor = '#c9a96e',
  fontFamily = 'Syne',
  bodyFont,
  overlayOpacity = 0.72,
  headlineWeight = 900,
  headlineScale = 1.0,
  logoUrl = '',
  cta = '',
  audioMood,
  voiceoverUrl,
}) => {
  const { hero, body } = useRemotionFonts('sans_modern', fontFamily, bodyFont);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const photoScale = stableScale(interpolate(frame, [0, durationInFrames], [1.05, 1.0], { extrapolateRight: 'clamp' }));
  const dynamicOverlay = overlayOpacity ?? 0.72;

  const logoOp = stableTextOpacity(frame, 0, 18);
  const catOp = stableTextOpacity(frame, 12, 28);
  const lineOp = stableTextOpacity(frame, 18, 34);
  const headlineReveal = useStableTextReveal(frame, fps, 24);
  const pillOp = stableTextOpacity(frame, 44, 58);
  const subOp = stableTextOpacity(frame, 52, 68);

  const charCount = headline.length;
  const fontSize = headlineSize(headline, headlineScale ?? 1.0);
  const offerText = cta || subtitle.slice(0, 28);

  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <StoryAudioLayer audioMood={audioMood} voiceoverUrl={voiceoverUrl} />
      <AbsoluteFill style={{ transform: `scale(${photoScale})`, transformOrigin: 'center center' }}>
        <Img src={photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: cinematicGradeFilter('subtle') }} />
      </AbsoluteFill>

      <CinematicLightLayer warmth="warm" intensity={0.85} origin="50% 32%" />
      <AbsoluteFill style={{ background: `rgba(0,0,0,${dynamicOverlay * 0.55})` }} />
      <AbsoluteFill style={{
        background: `radial-gradient(ellipse at 50% 42%, rgba(0,0,0,${dynamicOverlay * 0.5}) 0%, transparent 68%)`,
      }} />
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at 50% 50%, transparent 28%, rgba(0,0,0,0.48) 100%)',
      }} />
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 18%, transparent 62%, rgba(0,0,0,0.65) 100%)',
      }} />

      <FilmGrainOverlay opacity={0.06} fine />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={hero} opacity={logoOp} />

      {/* Center hero stack */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        paddingTop: '12%', paddingLeft: '10%', paddingRight: '10%',
      }}>
        {categoryLabel && (
          <span style={{
            fontFamily: body, fontWeight: 500, fontSize: 13, letterSpacing: 16,
            color: accentColor, textTransform: 'uppercase', opacity: catOp, marginBottom: 16,
            textShadow: '0 2px 12px rgba(0,0,0,1)',
          }}>
            {categoryLabel}
          </span>
        )}

        <div style={{ width: '12%', height: 2, background: accentColor, opacity: lineOp, marginBottom: 28, borderRadius: 1 }} />

        <div style={{ ...headlineReveal.wrapperStyle, textAlign: 'center' }}>
          <HeadlineStack
            headline={charCount <= 20 ? headline.toUpperCase() : headline}
            fontFamily={hero}
            fontWeight={headlineWeight ?? 900}
            fontSize={fontSize}
            color="#fff"
            uppercase={false}
            tracking={charCount <= 10 ? 0.12 : 0.04}
            frame={frame}
            fps={fps}
            startFrame={24}
            lineGap={1.08}
            textShadow="0 2px 16px rgba(0,0,0,1), 0 8px 40px rgba(0,0,0,0.9)"
          />
        </div>

        {offerText && (
          <div style={{
            marginTop: 32, opacity: pillOp,
            padding: '14px 32px', borderRadius: 999,
            border: `2px solid ${accentColor}`,
            background: `linear-gradient(135deg, ${accentColor}44, rgba(0,0,0,0.72))`,
          }}>
            <span style={{
              fontFamily: body, fontWeight: 800, fontSize: 22, letterSpacing: 4,
              color: '#fff', textTransform: 'uppercase',
              textShadow: '0 2px 8px rgba(0,0,0,0.9)',
            }}>
              {offerText}
            </span>
          </div>
        )}

        {subtitle && !cta && (
          <span style={{
            marginTop: 24, fontFamily: hero, fontWeight: 300, fontStyle: 'italic', fontSize: 26,
            color: 'rgba(255,255,255,0.92)', letterSpacing: 1.5, textAlign: 'center',
            opacity: subOp, maxWidth: '72%',
            textShadow: '0 2px 12px rgba(0,0,0,0.95)',
          }}>
            {subtitle}
          </span>
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        paddingBottom: '3.5%', opacity: interpolate(frame, [60, 78], [0, 0.5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      }}>
        <div style={{ width: '14%', height: 2, borderRadius: 1, background: accentColor }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * StoryLogo — unified top-center brand mark for all story compositions.
 * Height is 80% larger than the original 120px baseline (→ 216px).
 */
'use client';

import React from 'react';
import { Img } from 'remotion';

/** 120px × 1.8 = 216px — agency standard across all story templates */
export const STORY_LOGO_HEIGHT = 216;
export const STORY_LOGO_MAX_WIDTH = 400;

/** Compact logo — location cards, quote footers */
export const STORY_LOGO_INLINE_HEIGHT = 72;
/** Watermark / background lockup */
export const STORY_LOGO_WATERMARK_HEIGHT = 320;

const LOGO_SHADOW = [
  'drop-shadow(0 2px 4px rgba(0,0,0,1))',
  'drop-shadow(0 6px 20px rgba(0,0,0,0.92))',
  'drop-shadow(0 0 56px rgba(0,0,0,0.78))',
].join(' ');

export interface StoryLogoProps {
  logoUrl?: string;
  brandName: string;
  fontFamily?: string;
  opacity?: number;
}

/** Inner mark only — wrap in AbsoluteFill at top center in each composition. */
export const StoryLogoMark: React.FC<StoryLogoProps> = ({
  logoUrl,
  brandName,
  fontFamily = 'Cormorant Garamond',
  opacity = 1,
}) => {
  if (logoUrl) {
    return (
      <Img
        src={logoUrl}
        style={{
          height: STORY_LOGO_HEIGHT,
          maxWidth: STORY_LOGO_MAX_WIDTH,
          objectFit: 'contain',
          opacity,
          filter: LOGO_SHADOW,
        }}
      />
    );
  }

  return (
    <span
      style={{
        fontFamily,
        fontWeight: 200,
        fontSize: 22,
        color: 'rgba(255,255,255,0.82)',
        letterSpacing: 14,
        textTransform: 'uppercase',
        textShadow: '0 2px 12px rgba(0,0,0,0.95), 0 0 40px rgba(0,0,0,0.6)',
        opacity,
      }}
    >
      {brandName}
    </span>
  );
};

/** Top-center logo zone — drop into any composition. */
export const StoryLogoTopCenter: React.FC<StoryLogoProps & { paddingTop?: string }> = ({
  paddingTop = '4.2%',
  ...props
}) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop,
      pointerEvents: 'none',
      zIndex: 20,
    }}
  >
    <StoryLogoMark {...props} />
  </div>
);

/** Inline logo for cards / pills — always visible at readable size */
export const StoryLogoInline: React.FC<StoryLogoProps & { height?: number }> = ({
  logoUrl,
  brandName,
  fontFamily = 'Cormorant Garamond',
  opacity = 1,
  height = STORY_LOGO_INLINE_HEIGHT,
}) => {
  if (logoUrl) {
    return (
      <Img
        src={logoUrl}
        style={{
          height,
          maxWidth: height * 2.8,
          objectFit: 'contain',
          opacity,
          filter: LOGO_SHADOW,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        fontFamily,
        fontWeight: 700,
        fontSize: Math.round(height * 0.22),
        color: '#fff',
        letterSpacing: 6,
        textTransform: 'uppercase',
        textShadow: '0 2px 12px rgba(0,0,0,0.95)',
        opacity,
        whiteSpace: 'nowrap',
      }}
    >
      {brandName}
    </span>
  );
};

/** Bottom branded lockup — logo + optional caption plate */
export const StoryLogoLockup: React.FC<
  StoryLogoProps & {
    primaryColor?: string;
    accentColor?: string;
    caption?: string;
    height?: number;
  }
> = ({
  logoUrl,
  brandName,
  fontFamily = 'Cormorant Garamond',
  opacity = 1,
  primaryColor = '#0a0a0f',
  accentColor = '#c9a96e',
  caption = 'Verified experience',
  height = STORY_LOGO_INLINE_HEIGHT,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 22px',
      borderRadius: 999,
      background: `${primaryColor}dd`,
      border: `1.5px solid ${accentColor}88`,
      boxShadow: `0 12px 40px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)`,
      opacity,
    }}
  >
    <StoryLogoInline logoUrl={logoUrl} brandName={brandName} fontFamily={fontFamily} height={height} opacity={1} />
    {caption ? (
      <span
        style={{
          fontFamily,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 4,
          textTransform: 'uppercase',
          color: accentColor,
          textShadow: '0 1px 8px rgba(0,0,0,0.8)',
        }}
      >
        {caption}
      </span>
    ) : null}
  </div>
);

/** Large faint watermark — reinforces brand without blocking content */
export const StoryLogoWatermark: React.FC<
  StoryLogoProps & { position?: 'center' | 'bottom-right'; height?: number }
> = ({
  logoUrl,
  brandName,
  fontFamily = 'Cormorant Garamond',
  opacity = 0.14,
  position = 'bottom-right',
  height = STORY_LOGO_WATERMARK_HEIGHT,
}) => (
  <div
    style={{
      position: 'absolute',
      ...(position === 'center'
        ? { inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }
        : { right: '-8%', bottom: '18%', transform: 'rotate(-12deg)' }),
      pointerEvents: 'none',
      zIndex: 5,
      opacity,
    }}
  >
    {logoUrl ? (
      <Img
        src={logoUrl}
        style={{
          height,
          maxWidth: height * 1.4,
          objectFit: 'contain',
          filter: 'blur(0.5px)',
        }}
      />
    ) : (
      <span
        style={{
          fontFamily,
          fontWeight: 200,
          fontSize: Math.round(height * 0.18),
          color: '#fff',
          letterSpacing: 20,
          textTransform: 'uppercase',
        }}
      >
        {brandName}
      </span>
    )}
  </div>
);

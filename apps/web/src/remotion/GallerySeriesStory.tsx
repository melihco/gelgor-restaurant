/**
 * GallerySeriesStory — multi-photo agency story layouts.
 *
 * Layouts (auto from photo count):
 *   dual    — 2 photos side-by-side top + typography panel bottom
 *   triple  — 3 horizontal strips top + panel bottom
 *   sequence — crossfade up to 4 photos top + panel bottom (8s → ~2s per slide)
 *
 * Typography never overlays photos — lives in bottom brand panel.
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
import { HeadlineStack, headlineSize, stableTextOpacity, cinematicGradeFilter, CinematicLightLayer } from './shared/story-primitives';
import { StoryAudioLayer } from './shared/story-audio';

const PHOTO_ZONE_RATIO = 0.54;
const PANEL_RATIO = 1 - PHOTO_ZONE_RATIO;

function uniquePhotos(primary: string, extras?: string[]): string[] {
  const out: string[] = [];
  for (const u of [primary, ...(extras ?? [])]) {
    if (u && !out.includes(u)) out.push(u);
  }
  return out.slice(0, 4);
}

export const GallerySeriesStory: React.FC<StoryProps> = ({
  photoUrl,
  galleryPhotoUrls = [],
  galleryLayout,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  location = '',
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  fontFamily = 'Syne',
  bodyFont,
  headlineWeight = 800,
  headlineScale = 1.0,
  logoUrl = '',
  cta = '',
  audioMood,
  voiceoverUrl,
}) => {
  const { hero, body } = useRemotionFonts('sans_modern', fontFamily, bodyFont);
  const frame = useCurrentFrame();
  const { fps, durationInFrames, height: frameHeight } = useVideoConfig();

  const photos = uniquePhotos(photoUrl, galleryPhotoUrls);
  const layout = galleryLayout
    ?? (photos.length >= 3 ? 'triple' : photos.length >= 2 ? 'dual' : 'dual');

  const photoZoneH = Math.round(frameHeight * PHOTO_ZONE_RATIO);
  const panelH = frameHeight - photoZoneH;
  const panelBg = primaryColor || '#1a2b4a';

  const panelIn = stableTextOpacity(frame, 0, 18);
  const subOp = stableTextOpacity(frame, 30, 46);

  const charCount = headline.length;
  const fontSize = headlineSize(headline, (headlineScale ?? 1.0) * 1.08);
  const subShort = subtitle.length > 110 ? `${subtitle.slice(0, 107)}…` : subtitle;

  const renderPhotoGrid = () => {
    if (layout === 'sequence' && photos.length >= 2) {
      const segment = Math.floor(durationInFrames / photos.length);
      return (
        <AbsoluteFill>
          {photos.map((url, i) => {
            const start = i * segment;
            const end = (i + 1) * segment;
            const opacity = interpolate(
              frame,
              [start, start + 12, end - 12, end],
              [0, 1, 1, i === photos.length - 1 ? 1 : 0],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            );
            const scale = interpolate(frame, [start, end], [1.06, 1.0], { extrapolateRight: 'clamp' });
            return (
              <AbsoluteFill key={url} style={{ opacity }}>
                <div style={{ transform: `scale(${scale})`, width: '100%', height: '100%' }}>
                  <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </AbsoluteFill>
            );
          })}
        </AbsoluteFill>
      );
    }

    if (layout === 'triple' && photos.length >= 3) {
      const gap = 4;
      const stripH = Math.floor((photoZoneH - gap * 2) / 3);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap, height: '100%' }}>
          {photos.slice(0, 3).map((url, i) => {
            const scale = interpolate(frame, [0, durationInFrames], [1.05 - i * 0.01, 1.0], { extrapolateRight: 'clamp' });
            return (
              <div key={url} style={{ height: stripH, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ transform: `scale(${scale})`, width: '100%', height: '100%' }}>
                  <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // dual — 2 columns
    const left = photos[0]!;
    const right = photos[1] ?? photos[0]!;
    const gap = 4;
    return (
      <div style={{ display: 'flex', gap, height: '100%' }}>
        {[left, right].map((url, i) => {
          const scale = interpolate(frame, [0, durationInFrames], [1.06, 1.0], { extrapolateRight: 'clamp' });
          return (
            <div key={`${url}-${i}`} style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ transform: `scale(${scale})`, width: '100%', height: '100%' }}>
                <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <AbsoluteFill style={{ background: panelBg, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: photoZoneH, overflow: 'hidden',
        filter: cinematicGradeFilter('subtle'),
      }}>
        {renderPhotoGrid()}
        <CinematicLightLayer warmth="neutral" intensity={0.55} origin="50% 10%" />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '18%',
          background: `linear-gradient(to bottom, transparent, ${panelBg})`,
          pointerEvents: 'none',
        }} />
      </div>

      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={hero} opacity={0.92} paddingTop="6.5%" />

      <div style={{
        position: 'absolute', top: photoZoneH, left: 0, right: 0, height: panelH,
        background: panelBg, opacity: panelIn,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '28px 48px 36px', boxSizing: 'border-box', textAlign: 'center',
      }}>
        <div style={{
          width: 48, height: 3, background: accentColor, borderRadius: 2, marginBottom: 18,
        }} />

        {categoryLabel ? (
          <span style={{
            fontFamily: hero, fontSize: 12, letterSpacing: 12, textTransform: 'uppercase',
            color: accentColor, fontWeight: 600, marginBottom: 12,
          }}>
            {categoryLabel}
          </span>
        ) : (
          <span style={{
            fontFamily: body, fontSize: 11, letterSpacing: 8, textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)', marginBottom: 10,
          }}>
            {photos.length} görselli seri
          </span>
        )}

        <div style={{ maxWidth: '100%' }}>
          <HeadlineStack
            headline={charCount <= 32 ? headline.toUpperCase() : headline}
            fontFamily={hero}
            fontWeight={headlineWeight ?? 800}
            fontSize={fontSize}
            color="#fff"
            uppercase={false}
            tracking={charCount <= 16 ? 0.12 : 0.02}
            frame={frame}
            fps={fps}
            startFrame={16}
            lineGap={1.1}
          />
        </div>

        {subShort ? (
          <span style={{
            fontFamily: body, fontWeight: 400, fontSize: 28, lineHeight: 1.45,
            color: 'rgba(255,255,255,0.82)', marginTop: 14, opacity: subOp,
            maxWidth: '92%', display: 'block',
          }}>
            {subShort}
          </span>
        ) : null}

        {cta ? (
          <span style={{
            marginTop: 18, padding: '10px 24px', borderRadius: 999,
            border: `1.5px solid ${accentColor}`, fontFamily: body, fontSize: 15,
            fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#fff',
            opacity: subOp,
          }}>
            {cta}
          </span>
        ) : null}

        {location ? (
          <span style={{
            fontFamily: body, fontSize: 14, color: 'rgba(255,255,255,0.38)',
            letterSpacing: 2, textTransform: 'uppercase', marginTop: 14, opacity: subOp,
          }}>
            {location}
          </span>
        ) : null}
      </div>
      <StoryAudioLayer audioMood={audioMood} voiceoverUrl={voiceoverUrl} />
    </AbsoluteFill>
  );
};

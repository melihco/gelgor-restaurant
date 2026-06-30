/**
 * Agency-grade story layouts — Dribbble / Pinterest / Envato editorial patterns.
 * Event ticket, multi-photo collage, minimal luxury, mosaic grid, asymmetric panel, polaroid stack.
 */
'use client';

import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import type { StoryProps } from './types';
import { StoryLogoInline, StoryLogoTopCenter, StoryLogoMark } from './StoryLogo';
import {
  KenBurnsPhoto,
  FilmGrainOverlay,
  HeadlineStack,
  MeshGradientLayer,
  CinematicLightLayer,
  EditorialKicker,
  headlineSize,
  stableTextLayerStyle,
  stableTextOpacity,
  textShadowHeavy,
  textShadowEditorial,
  textShadowAmbient,
  resolveStoryTextColors,
} from './shared/story-primitives';
import { useStoryFonts } from './shared/useRemotionFonts';
import { brandPanelGradientCss, cinematicScrimCss } from '../lib/brand-panel-gradient';

export type AgencyLayoutProps = StoryProps & { layoutSpec: RemotionLayoutSpec };

function galleryUrls(photoUrl: string, extras?: string[]): string[] {
  const out: string[] = [];
  for (const u of [photoUrl, ...(extras ?? [])]) {
    if (u && !out.includes(u)) out.push(u);
  }
  return out.slice(0, 3);
}

/** Kurumsal renklerle uyumlu story arka planı — polaroid / collage layout'ları */
function BrandStoryBackdrop({
  primaryColor,
  accentColor,
}: {
  primaryColor: string;
  accentColor: string;
}) {
  return (
    <>
      <AbsoluteFill style={{ background: primaryColor }} />
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.9} />
      <AbsoluteFill
        style={{
          background: `
            radial-gradient(ellipse 90% 55% at 50% 28%, ${accentColor}28 0%, transparent 58%),
            linear-gradient(180deg, ${accentColor}14 0%, transparent 32%, ${primaryColor} 72%)
          `,
        }}
      />
      <FilmGrainOverlay opacity={0.07} />
    </>
  );
}

function CtaPill({
  cta,
  accent,
  fonts,
  opacity = 1,
}: {
  cta: string;
  accent: string;
  fonts: { hero: string; body: string };
  opacity?: number;
}) {
  if (!cta.trim()) return null;
  return (
    <div
      style={{
        marginTop: 18,
        opacity,
        ...stableTextLayerStyle,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          padding: '14px 32px',
          borderRadius: 999,
          border: `2px solid ${accent}`,
          background: `${accent}22`,
          fontFamily: fonts.body,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 3,
          textTransform: 'uppercase',
          color: '#fff',
        }}
      >
        {cta}
      </span>
    </div>
  );
}

function EventMetaRow({
  eventDate,
  eventTime,
  primary,
  accent,
  fonts,
  opacity = 1,
}: {
  eventDate?: string;
  eventTime?: string;
  primary: string;
  accent: string;
  fonts: { hero: string; body: string };
  opacity?: number;
}) {
  if (!eventDate && !eventTime) return null;
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginTop: 16,
        opacity,
        ...stableTextLayerStyle,
      }}
    >
      <span
        style={{
          padding: '10px 18px',
          borderRadius: 10,
          background: primary,
          border: `1px solid ${accent}88`,
          fontFamily: fonts.body,
          fontSize: 15,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: 1,
        }}
      >
        {[eventDate, eventTime].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
}

/** Envato / Linearity event frame — logo, date badge, CTA, brand inset border */
export function EventTicketLayout({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  categoryColor,
  headlineColor,
  subtitleColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  eventDate,
  eventTime,
  cta = '',
  layoutSpec: spec,
}: AgencyLayoutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.05);
  const headOp = stableTextOpacity(frame, 18, 36);
  const metaOp = interpolate(frame, [32, 48], [0, 1], { extrapolateRight: 'clamp' });
  const borderOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.45} />
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin={spec.kenBurnsOrigin} driftY={18} />
      <CinematicLightLayer warmth="warm" intensity={0.65} />
      <AbsoluteFill style={{
        background: `linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 28%, rgba(0,0,0,${spec.overlayOpacity}) 100%)`,
      }} />
      <AbsoluteFill style={{
        boxSizing: 'border-box',
        margin: 28,
        border: `2px solid ${accentColor}`,
        opacity: borderOp,
        pointerEvents: 'none',
        boxShadow: `inset 0 0 0 6px ${primaryColor}, inset 0 0 0 8px ${accentColor}55`,
      }} />
      <FilmGrainOverlay opacity={0.06} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} paddingTop="6.5%" />
      <AbsoluteFill style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 56px 11%',
        textAlign: 'center',
        zIndex: 8,
        ...stableTextLayerStyle,
      }}>
        {categoryLabel ? (
          <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align="center" opacity={headOp} />
        ) : null}
        <div style={{ ...stableTextLayerStyle }}>
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
            lineGap={1.06}
            textShadow={textShadowHeavy}
          />
        </div>
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 28, color: textColors.subtitle, marginTop: 12,
            fontStyle: spec.subtitleItalic ? 'italic' : 'normal', opacity: metaOp,
          }}>
            {subtitle.slice(0, 120)}
          </span>
        ) : null}
        <EventMetaRow eventDate={eventDate} eventTime={eventTime} primary={primaryColor} accent={accentColor} fonts={fonts} opacity={metaOp} />
        {(spec.showCtaPill || cta) ? <CtaPill cta={cta} accent={accentColor} fonts={fonts} opacity={metaOp} /> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Side-by-side dual photo + brand panel — social proof / menu showcase */
export function DiptychCollageLayout({
  photoUrl,
  galleryPhotoUrls,
  headline,
  subtitle = '',
  brandName,
  primaryColor = '#1a2b4a',
  accentColor = '#c9a96e',
  categoryColor,
  headlineColor,
  subtitleColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  cta = '',
  location = '',
  layoutSpec: spec,
}: AgencyLayoutProps) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const photos = galleryUrls(photoUrl, galleryPhotoUrls);
  const photoH = Math.round(height * 0.56);
  const panelH = height - photoH;
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.92);
  const panelOp = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const headOp = stableTextOpacity(frame, 20, 38);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.35} />
      <FilmGrainOverlay opacity={0.05} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: photoH, display: 'flex', gap: 6, padding: 6, boxSizing: 'border-box', zIndex: 2 }}>
        {photos.slice(0, 2).map((url, i) => (
          <div key={url + i} style={{ flex: 1, overflow: 'hidden', borderRadius: 10, position: 'relative' }}>
            <KenBurnsPhoto photoUrl={url} scaleMax={1.06 + i * 0.01} origin={i === 0 ? '30% 50%' : '70% 50%'} driftY={12} />
            <CinematicLightLayer warmth="neutral" intensity={0.55} origin="50% 12%" />
          </div>
        ))}
      </div>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: panelH + Math.round(height * 0.12),
        background: brandPanelGradientCss(primaryColor, 0.94),
        opacity: panelOp,
        pointerEvents: 'none',
        zIndex: 4,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: panelH,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '24px 44px',
        zIndex: 8,
        ...stableTextLayerStyle,
      }}>
        <div style={{ position: 'absolute', top: 20, left: 44 }}>
          <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.9} />
        </div>
        <div style={{ opacity: headOp, marginTop: 48, ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? spec.heroWeight}
            fontSize={fontSize}
            color="#fff"
            primaryColor={primaryColor}
            accentColor={accentColor}
            uppercase={spec.heroUppercase}
            frame={frame}
            fps={fps}
            startFrame={20}
            lineGap={1.08}
            holdOpacity
          />
        </div>
        {subtitle ? (
          <span style={{ fontFamily: fonts.body, fontSize: 26, color: textColors.subtitle, marginTop: 10, opacity: headOp }}>
            {subtitle.slice(0, 120)}
          </span>
        ) : null}
        {spec.showLocation && location ? (
          <span style={{ fontFamily: fonts.body, fontSize: 12, letterSpacing: 3, textTransform: 'uppercase', color: textColors.category, marginTop: 12, opacity: headOp }}>
            {location}
          </span>
        ) : null}
        {spec.showCtaPill && cta ? <CtaPill cta={cta} accent={accentColor} fonts={fonts} opacity={headOp} /> : null}
      </div>
    </AbsoluteFill>
  );
}

/** Hotel / fine dining — double inset frame, serif hero, breathing room */
export function MinimalLuxuryLayout({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  categoryColor,
  headlineColor,
  subtitleColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  location = '',
  layoutSpec: spec,
}: AgencyLayoutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.1);
  const headOp = stableTextOpacity(frame, 24, 42);
  const frameOp = interpolate(frame, [0, 24], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.22} />
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.05} origin="50% 40%" driftY={16} />
      {/* Cinematic bottom scrim — eliminates harsh brand panel hard edge */}
      <AbsoluteFill style={{
        background: cinematicScrimCss(spec.overlayOpacity ?? 0.88, 38),
      }} />
      {/* Inset frame — luxury signature */}
      <AbsoluteFill style={{
        boxSizing: 'border-box',
        margin: '6.5%',
        border: `1px solid ${accentColor}88`,
        opacity: frameOp,
        pointerEvents: 'none',
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.08), 0 0 60px rgba(0,0,0,0.25)`,
      }} />
      <FilmGrainOverlay opacity={0.06} fine />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.85} paddingTop="8%" />
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        padding: '0 10% 11%', textAlign: spec.align,
        alignItems: spec.align === 'center' ? 'center' : 'flex-start',
      }}>
        {categoryLabel ? (
          <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align={spec.align === 'center' ? 'center' : 'left'} opacity={headOp} />
        ) : null}
        {/* Thinner, more refined hairline */}
        <div style={{ width: 40, height: 1, background: accentColor, marginBottom: 22, opacity: headOp }} />
        <div style={{ maxWidth: '92%', ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? 400}
            fontSize={fontSize}
            color={textColors.headline}
            primaryColor={primaryColor}
            accentColor={accentColor}
            uppercase={spec.heroUppercase}
            tracking={spec.heroTracking}
            frame={frame}
            fps={fps}
            startFrame={24}
            lineGap={1.05}
          />
        </div>
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 28, fontStyle: 'italic',
            color: textColors.subtitle, marginTop: 14, opacity: headOp,
          }}>
            {subtitle.slice(0, 120)}
          </span>
        ) : null}
        {spec.showLocation && location ? (
          <span style={{ fontFamily: fonts.body, fontSize: 12, letterSpacing: 4, color: textColors.category, marginTop: 18, opacity: headOp * 0.85 }}>
            {location.toUpperCase()}
          </span>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Pinterest Idea Pin — large tile + two stacked tiles, text on brand band */
export function MosaicPinterestLayout({
  photoUrl,
  galleryPhotoUrls,
  headline,
  subtitle = '',
  brandName,
  primaryColor = '#1a2b4a',
  accentColor = '#c9a96e',
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  cta = '',
  layoutSpec: spec,
}: AgencyLayoutProps) {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const fonts = useStoryFonts();
  const photos = galleryUrls(photoUrl, galleryPhotoUrls);
  const p0 = photos[0] ?? photoUrl;
  const p1 = photos[1] ?? photoUrl;
  const p2 = photos[2] ?? p1;
  const gridH = Math.round(height * 0.52);
  const bandH = Math.round(height * 0.28);
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.88);
  const headOp = stableTextOpacity(frame, 22, 40);

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.25} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: gridH, display: 'flex', gap: 6, padding: 6 }}>
        <div style={{ flex: '0 0 58%', overflow: 'hidden', borderRadius: 10 }}>
          <KenBurnsPhoto photoUrl={p0} scaleMax={1.07} origin="40% 50%" driftY={10} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ flex: 1, overflow: 'hidden', borderRadius: 10 }}>
            <KenBurnsPhoto photoUrl={p1} scaleMax={1.05} origin="center" driftY={8} />
          </div>
          <div style={{ flex: 1, overflow: 'hidden', borderRadius: 10 }}>
            <KenBurnsPhoto photoUrl={p2} scaleMax={1.05} origin="60% 40%" driftY={8} />
          </div>
        </div>
      </div>
      <CinematicLightLayer warmth="warm" intensity={0.55} origin="34% 14%" />
      <FilmGrainOverlay opacity={0.07} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: bandH + Math.round(height * 0.1),
        background: brandPanelGradientCss(primaryColor, 0.95),
        borderTop: `2px solid ${accentColor}55`,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: bandH,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 40px',
      }}>
        <div style={{ position: 'absolute', top: 16, right: 40, opacity: 0.85 }}>
          <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} />
        </div>
        <div style={{ ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? spec.heroWeight}
            fontSize={fontSize}
            color="#fff"
            primaryColor={primaryColor}
            accentColor={accentColor}
            frame={frame}
            fps={fps}
            startFrame={22}
            lineGap={1.08}
          />
        </div>
        {subtitle ? (
          <span style={{ fontFamily: fonts.body, fontSize: 26, color: 'rgba(255,255,255,0.78)', marginTop: 8, opacity: headOp }}>
            {subtitle.slice(0, 120)}
          </span>
        ) : null}
        {spec.showCtaPill && cta ? <CtaPill cta={cta} accent={accentColor} fonts={fonts} opacity={headOp} /> : null}
      </div>
    </AbsoluteFill>
  );
}

/** ORZA-style asymmetric color block over photo */
export function AsymmetricEditorialLayout({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  primaryColor = '#1a2b4a',
  accentColor = '#c9a96e',
  categoryColor,
  headlineColor,
  subtitleColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  layoutSpec: spec,
}: AgencyLayoutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale));
  const panelSlide = 0;
  const panelOp = interpolate(frame, [10, 28], [0, 1], { extrapolateRight: 'clamp' });
  const headOp = stableTextOpacity(frame, 24, 40);

  const duotoneColor = spec.duotoneWash === 'accent' ? accentColor
    : spec.duotoneWash === 'warm' ? '#ea580c'
      : spec.duotoneWash === 'cool' ? '#0284c7'
        : primaryColor;

  return (
    <AbsoluteFill style={{ background: '#0a0a0f' }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.12} />
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin="30% 50%" driftY={20} />
      {spec.duotoneWash !== 'none' && (
        <AbsoluteFill style={{
          background: duotoneColor,
          opacity: (spec.duotoneOpacity ?? 0.35) * 0.55,
          mixBlendMode: 'soft-light',
          pointerEvents: 'none',
        }} />
      )}
      {spec.vignette !== 'none' && (
        <AbsoluteFill style={{
          background: `radial-gradient(ellipse at 28% 48%, transparent 42%, rgba(0,0,0,${spec.vignette === 'noir' ? 0.5 : 0.32}) 100%)`,
          pointerEvents: 'none',
        }} />
      )}
      <AbsoluteFill style={{
        background: `linear-gradient(to bottom, transparent 58%, rgba(0,0,0,0.28) 100%)`,
        pointerEvents: 'none',
      }} />
      <AbsoluteFill style={{
        background: `linear-gradient(to right, transparent 38%, ${primaryColor}99 72%, ${primaryColor}dd 88%)`,
        opacity: panelOp,
        pointerEvents: 'none',
      }} />
      <FilmGrainOverlay opacity={0.06} />
      <div style={{ position: 'absolute', top: 48, left: 40, zIndex: 15 }}>
        <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.95} />
      </div>
      <div style={{
        position: 'absolute',
        right: 0,
        bottom: 0,
        width: '54%',
        minHeight: '42%',
        background: `linear-gradient(145deg, ${primaryColor}f2 0%, ${primaryColor} 62%, ${accentColor}18 100%)`,
        opacity: panelOp,
        transform: 'translateZ(0)',
        ...stableTextLayerStyle,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '36px 40px',
        borderLeft: `3px solid ${accentColor}88`,
        boxShadow: `-24px 0 48px ${primaryColor}55`,
      }}>
        {categoryLabel ? (
          <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} opacity={headOp} />
        ) : null}
        <div style={{ opacity: headOp, ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? spec.heroWeight}
            fontSize={fontSize}
            color={textColors.headline}
            primaryColor={primaryColor}
            accentColor={accentColor}
            uppercase={spec.heroUppercase}
            frame={frame}
            fps={fps}
            startFrame={24}
            lineGap={1.06}
          />
        </div>
        {subtitle ? (
          <span style={{ fontFamily: fonts.body, fontSize: 26, color: textColors.subtitle, marginTop: 12, opacity: headOp }}>
            {subtitle.slice(0, 120)}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

/** Single hero polaroid — venue photo in tactile frame, editorial headline below */
export function PolaroidSingleLayout({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  categoryColor,
  headlineColor,
  subtitleColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  layoutSpec: spec,
}: AgencyLayoutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.92);
  const headOp = stableTextOpacity(frame, 36, 52);
  const cardOp = interpolate(frame, [4, 28], [0, 1], { extrapolateRight: 'clamp' });
  const cardLift = Math.round(interpolate(frame, [4, 28], [28, 0], { extrapolateRight: 'clamp' }));
  const rot = interpolate(frame, [8, 40], [-4, -2.5], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <BrandStoryBackdrop primaryColor={primaryColor} accentColor={accentColor} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} paddingTop="6.5%" />
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: '50%',
          width: '62%',
          aspectRatio: '4/5',
          transform: `translateX(-50%) translateY(${cardLift}px) rotate(${rot}deg)`,
          background: '#faf8f5',
          padding: 12,
          paddingBottom: 44,
          boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
          opacity: cardOp,
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
          <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 42%" driftY={12} />
        </div>
      </div>
      <AbsoluteFill
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '0 40px 9%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.35) 38%, transparent 62%)',
        }}
      >
        {categoryLabel ? (
          <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} opacity={headOp} />
        ) : null}
        <div style={{ opacity: headOp, ...stableTextLayerStyle }}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? spec.heroWeight}
            fontSize={fontSize}
            color="#fff"
            primaryColor={primaryColor}
            accentColor={accentColor}
            uppercase={spec.heroUppercase}
            frame={frame}
            fps={fps}
            startFrame={32}
            lineGap={1.06}
          />
        </div>
        {subtitle ? (
          <span
            style={{
              fontFamily: fonts.body,
              fontSize: 17,
              color: textColors.subtitle,
              marginTop: 10,
              opacity: headOp,
            }}
          >
            {subtitle.slice(0, 120)}
          </span>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Staggered polaroid frames — tactile multi-photo editorial */
export function PolaroidStackLayout({
  photoUrl,
  galleryPhotoUrls,
  headline,
  subtitle = '',
  brandName,
  accentColor = '#c9a96e',
  primaryColor = '#1a2b4a',
  subtitleColor,
  headlineColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  layoutSpec: spec,
}: AgencyLayoutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ accentColor, headlineColor, subtitleColor });
  const photos = galleryUrls(photoUrl, galleryPhotoUrls);
  const count = Math.min(photos.length, 3);
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.85);
  const headOp = stableTextOpacity(frame, 30, 48);
  const logoOp = stableTextOpacity(frame, 18, 34);
  const hasCopy = Boolean(headline?.trim() || subtitle?.trim());

  /** Konumlar kolaj kutusuna göre — ekranın orta bandında dikey denge */
  const layout2 = [
    { url: photos[0], rot: -5, top: '10%', left: '4%', w: '48%', z: 2 },
    { url: photos[1]!, rot: 4, top: '6%', left: '50%', w: '46%', z: 3 },
  ];
  const layout3 = [
    { url: photos[0], rot: -6, top: '2%', left: '2%', w: '42%', z: 2 },
    { url: photos[1]!, rot: 5, top: '0%', left: '52%', w: '42%', z: 3 },
    { url: photos[2]!, rot: -2, top: '38%', left: '20%', w: '56%', z: 4 },
  ];
  const frames = count >= 3 ? layout3 : count === 2 ? layout2 : layout2.slice(0, 1);
  const polaroidShadow = `0 28px 64px ${primaryColor}aa, 0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px ${accentColor}44`;

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <BrandStoryBackdrop primaryColor={primaryColor} accentColor={accentColor} />

      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: '3%',
          right: '3%',
          height: '54%',
          zIndex: 5,
        }}
      >
        {frames.map((f, i) => {
          const polaroidOp = interpolate(frame, [i * 7, i * 7 + 22], [0, 1], { extrapolateRight: 'clamp' });
          const lift = Math.round(interpolate(frame, [i * 7, i * 7 + 22], [18, 0], { extrapolateRight: 'clamp' }));
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: f.top,
                left: f.left,
                width: f.w,
                aspectRatio: '4/5',
                background: '#faf8f5',
                padding: 10,
                paddingBottom: 38,
                boxShadow: polaroidShadow,
                transform: `rotate(${f.rot}deg) translateY(${lift}px)`,
                opacity: polaroidOp,
                boxSizing: 'border-box',
                zIndex: f.z,
              }}
            >
              <Img src={f.url ?? photoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          );
        })}
      </div>

      {/* Logo — polaroidların altında, kurumsal vurgu çizgisi ile */}
      <div
        style={{
          position: 'absolute',
          bottom: hasCopy ? '17%' : '11%',
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          zIndex: 25,
          opacity: logoOp,
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: 52, height: 2, background: accentColor, borderRadius: 1, opacity: 0.9 }} />
        <StoryLogoInline
          logoUrl={logoUrl}
          brandName={brandName}
          fontFamily={fonts.hero}
          height={logoUrl ? 96 : 44}
          opacity={1}
        />
      </div>

      {hasCopy ? (
        <AbsoluteFill
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '0 44px 8%',
            background: `linear-gradient(to top, ${primaryColor}f2 0%, ${primaryColor}88 28%, transparent 52%)`,
            zIndex: 12,
          }}
        >
          <div style={{ ...stableTextLayerStyle }}>
            <HeadlineStack
              headline={headline}
              fontFamily={fonts.hero}
              fontWeight={headlineWeight ?? spec.heroWeight}
              fontSize={fontSize}
              color="#fff"
              primaryColor={primaryColor}
              accentColor={accentColor}
              frame={frame}
              fps={fps}
              startFrame={30}
              lineGap={1.08}
            />
          </div>
          {subtitle ? (
            <span style={{ fontFamily: fonts.body, fontSize: 26, color: textColors.subtitle, marginTop: 10, opacity: headOp }}>
              {subtitle.slice(0, 120)}
            </span>
          ) : null}
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
}

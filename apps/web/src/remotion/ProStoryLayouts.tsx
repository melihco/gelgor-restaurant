'use client';

import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import type { StoryProps } from './types';
import { StoryLogoLockup, StoryLogoMark, StoryLogoTopCenter } from './StoryLogo';
import {
  HeadlineStack, KenBurnsPhoto, headlineSize, staggerOpacity,
  stableTextLayerStyle, textShadowHeavy, textShadowEditorial, textShadowAmbient, resolveStoryTextColors,
  CinematicLightLayer, EditorialKicker, CornerTicks, AccentRule, EditorialMetaRow, FilmGrainOverlay,
} from './shared/story-primitives';
import { useStoryFonts } from './shared/useRemotionFonts';
import { brandPanelGradientCss, cinematicScrimCss, dualToneScrimCss, shadeHexColor } from '../lib/brand-panel-gradient';

type Props = StoryProps & { spec: RemotionLayoutSpec };

export function EditorialLeftLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', brandName, primaryColor = '#1a2b4a',
    accentColor = '#c9a96e', categoryColor, headlineColor, subtitleColor,
    headlineWeight, headlineScale = 1, logoUrl = '', location = '', spec } = p;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  // Narrow 38% panel — keep the hero from bleeding past the photo seam.
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.82);
  const panelIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  const panelDark = shadeHexColor(primaryColor, 0.26);
  const ruleProgress = interpolate(frame, [16, 36], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '38%', opacity: panelIn, zIndex: 10,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '8% 6% 10% 7%',
        // Vertical brand gradient + grain instead of flat fill
        background: `linear-gradient(200deg, ${primaryColor} 0%, ${panelDark} 100%)`,
        boxShadow: `inset -1px 0 0 ${accentColor}55`,
        overflow: 'hidden',
      }}>
        <FilmGrainOverlay opacity={0.05} fine />
        {/* Accent seam at the photo boundary */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 3, background: `linear-gradient(to bottom, ${accentColor} 0%, ${accentColor}66 40%, transparent 100%)` }} />
        <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} />
        {spec.categoryVertical && categoryLabel ? (
          <div style={{ position: 'absolute', left: 28, top: '28%', transform: 'rotate(-90deg) translateX(-50%)', transformOrigin: 'left top', opacity: staggerOpacity(frame, 14, 30) }}>
            <span style={{ fontFamily: fonts.body, fontSize: 13, letterSpacing: 14, textTransform: 'uppercase', color: textColors.category, whiteSpace: 'nowrap' }}>{categoryLabel}</span>
          </div>
        ) : null}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 40 }}>
          {!spec.categoryVertical && categoryLabel ? (
            <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} opacity={staggerOpacity(frame, 18, 32)} />
          ) : (
            <div style={{ marginBottom: 16 }}><AccentRule accent={accentColor} progress={ruleProgress} /></div>
          )}
          <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? spec.heroWeight} fontSize={fontSize} color={textColors.headline} primaryColor={primaryColor} accentColor={accentColor} uppercase={spec.heroUppercase} tracking={spec.heroTracking} frame={frame} fps={fps} startFrame={20} lineGap={1.08} />
          {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 26, color: textColors.subtitle, marginTop: 18, opacity: staggerOpacity(frame, 36, 50), display: 'block' }}>{subtitle.slice(0, 120)}</span> : null}
        </div>
        {spec.showLocation && (location || brandName) ? (
          <EditorialMetaRow items={[brandName, location]} fontFamily={fonts.body} color="rgba(255,255,255,0.4)" accent={accentColor} opacity={staggerOpacity(frame, 44, 58)} />
        ) : null}
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, left: '38%', overflow: 'hidden' }}>
        <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.1} origin="65% 40%" driftY={28} driftX={-12} />
        <CinematicLightLayer warmth="warm" intensity={0.7} origin="60% -8%" />
        <CornerTicks color={`${accentColor}cc`} inset={28} length={24} opacity={0.5} corners={['tr', 'br']} />
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, background: `linear-gradient(to right, ${primaryColor}, transparent)` }} />
      </div>
    </AbsoluteFill>
  );
}

export function MagazineCoverLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', brandName, primaryColor = '#1a2b4a',
    accentColor = '#c9a96e', categoryColor, headlineColor, subtitleColor, headlineWeight, headlineScale = 1,
    logoUrl = '', location = '', spec } = p;
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.15);
  const mastOp = staggerOpacity(frame, 0, 18);
  const ruleProgress = interpolate(frame, [10, 30], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 30%" driftY={14} />
      {/* Cinematic dual-tone: dark top (safe zone) + brand tint flowing to bottom */}
      <AbsoluteFill style={{ background: dualToneScrimCss(primaryColor, 0.94) }} />
      <CinematicLightLayer warmth="warm" intensity={0.9} />
      <FilmGrainOverlay opacity={0.05} fine />
      {/* Print registration marks frame the masthead */}
      <CornerTicks color={`${accentColor}dd`} inset={36} length={30} thickness={2} opacity={0.7} />
      <AbsoluteFill style={{ padding: '6.5% 7%', display: 'flex', flexDirection: 'column' }}>
        {/* Masthead: brand + thin rule + ISSUE/date marker — magazine signature */}
        <div style={{ opacity: mastOp }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <StoryLogoMark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.95} />
            <span style={{
              fontFamily: fonts.body, fontSize: 11, letterSpacing: 5, textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.55)', textShadow: textShadowAmbient,
            }}>
              {(location || 'Featured').slice(0, 18)}
            </span>
          </div>
          <div style={{
            marginTop: 14, height: 1,
            width: `${Math.round(ruleProgress * 100)}%`,
            background: `linear-gradient(to right, ${accentColor}, ${accentColor}22)`,
          }} />
        </div>
        <div style={{ flex: 1 }} />
        <div>
          {categoryLabel ? (
            <EditorialKicker
              label={categoryLabel}
              accent={accentColor}
              fontFamily={fonts.body}
              color={textColors.category}
              opacity={staggerOpacity(frame, 12, 26)}
            />
          ) : null}
          <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 900} fontSize={fontSize} color={textColors.headline} primaryColor={primaryColor} accentColor={accentColor} uppercase={spec.heroUppercase} tracking={spec.heroTracking} frame={frame} fps={fps} startFrame={16} lineGap={0.88} textShadow={textShadowEditorial} />
          {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 26, fontStyle: 'italic', color: textColors.subtitle, marginTop: 14, display: 'block', lineHeight: 1.4, opacity: staggerOpacity(frame, 38, 52) }}>{subtitle.slice(0, 110)}</span> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function FlushCampaignLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', brandName, primaryColor = '#1a2b4a',
    accentColor = '#c9a96e', categoryColor, headlineColor, subtitleColor,
    headlineWeight, headlineScale = 1, logoUrl = '', cta = '', location = '', spec } = p;
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const fonts = useStoryFonts();
  const blockH = Math.round(height * 0.36);
  const photoH = height - blockH;
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 1.0);
  const blockIn = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const blockBg = primaryColor;
  const darker = shadeHexColor(primaryColor, 0.28);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: photoH, overflow: 'hidden' }}>
        <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 42%" driftY={14} />
        <CinematicLightLayer warmth="warm" intensity={0.7} />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%',
          background: `linear-gradient(to bottom, transparent, ${blockBg})`,
        }} />
      </div>
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.88} paddingTop="6.5%" />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: blockH,
        // Layered panel: diagonal brand gradient + radial accent glow instead of a flat fill
        background: `
          radial-gradient(ellipse 80% 120% at 12% 0%, ${accentColor}26 0%, transparent 55%),
          linear-gradient(160deg, ${blockBg} 0%, ${darker} 100%)
        `,
        opacity: blockIn,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: spec.align === 'center' ? 'center' : spec.align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: spec.align,
        padding: '34px 48px 8%',
        boxShadow: `inset 0 1px 0 ${accentColor}66, inset 0 14px 40px rgba(0,0,0,0.32)`,
        overflow: 'visible',
      }}>
        {/* Top accent seam — thicker tick fading into a hairline */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} 22%, ${accentColor}44 60%, transparent 100%)` }} />
        <FilmGrainOverlay opacity={0.04} fine />
        {categoryLabel ? (
          <EditorialKicker
            label={categoryLabel}
            accent={accentColor}
            fontFamily={fonts.body}
            color={textColors.category}
            align={spec.align === 'center' ? 'center' : 'left'}
            opacity={staggerOpacity(frame, 12, 28)}
          />
        ) : null}
        <HeadlineStack
          headline={headline}
          fontFamily={fonts.hero}
          fontWeight={headlineWeight ?? 900}
          fontSize={fontSize}
          color={textColors.headline}
          uppercase={spec.heroUppercase}
          tracking={spec.heroTracking}
          frame={frame}
          fps={fps}
          startFrame={16}
          lineGap={1.08}
          textShadow={spec.headlineTreatment === 'flat' ? textShadowHeavy : undefined}
          headlineTreatment={spec.headlineTreatment}
          accentColor={accentColor}
          align={spec.align}
        />
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 26, fontStyle: 'italic',
            color: textColors.subtitle, marginTop: 14,
            opacity: staggerOpacity(frame, 30, 44),
          }}>
            {subtitle.slice(0, 120)}
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
  const { photoUrl, headline, subtitle = '', categoryLabel = '', primaryColor = '#1a2b4a',
    accentColor = '#c9a96e', categoryColor, headlineColor, subtitleColor,
    headlineWeight, headlineScale = 1, logoUrl = '', brandName, cta = '', spec } = p;
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.95);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.12} origin="50% 50%" driftY={8} grade="vivid" />
      <AbsoluteFill style={{ background: primaryColor, opacity: 0.42, mixBlendMode: 'multiply' }} />
      <AbsoluteFill style={{ background: accentColor, opacity: 0.18, mixBlendMode: 'soft-light' }} />
      <CinematicLightLayer warmth="neutral" intensity={0.8} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.75) 100%)' }} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.85} paddingTop="6.5%" />
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 40px 12%', textAlign: 'center',
        background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 38%, transparent 62%)',
      }}>
        {categoryLabel ? (
          <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align="center" opacity={staggerOpacity(frame, 10, 28)} />
        ) : null}
        <div style={stableTextLayerStyle}>
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? 900}
            fontSize={fontSize}
            color="#fff"
            uppercase={spec.heroUppercase}
            tracking={spec.heroTracking}
            frame={frame}
            fps={fps}
            startFrame={12}
            lineGap={0.85}
            strokeColor={spec.headlineTreatment === 'flat' ? '#fff' : undefined}
            strokeWidth={spec.headlineTreatment === 'flat' ? 2 : undefined}
            textShadow={spec.headlineTreatment === 'flat' ? textShadowHeavy : undefined}
            headlineTreatment={spec.headlineTreatment}
            accentColor={accentColor}
            align="center"
          />
        </div>
        {subtitle ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 22, fontWeight: 600, color: '#fff',
            marginTop: 20, opacity: staggerOpacity(frame, 36, 50),
            textShadow: textShadowHeavy, lineHeight: 1.4,
          }}>
            {subtitle.slice(0, 120)}
          </span>
        ) : null}
        {spec.showCtaPill && cta ? <span style={{ marginTop: 24, padding: '14px 36px', border: `2px solid ${accentColor}`, fontFamily: fonts.body, fontSize: 14, fontWeight: 800, letterSpacing: 4, textTransform: 'uppercase', color: '#fff', opacity: staggerOpacity(frame, 42, 56) }}>{cta}</span> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function NoirEditorialLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', primaryColor = '#1a2b4a',
    accentColor = '#c9a96e', categoryColor, headlineColor, subtitleColor,
    headlineWeight, headlineScale = 1, logoUrl = '', brandName, location = '', spec } = p;
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
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
        {categoryLabel ? (
          <div style={{ marginTop: 28 }}>
            <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align={spec.align === 'center' ? 'center' : 'left'} opacity={staggerOpacity(frame, 12, 26)} />
          </div>
        ) : null}
        <div style={{ width: 56, height: 1, background: accentColor, marginBottom: 20, opacity: staggerOpacity(frame, 16, 30) }} />
        <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 300} fontSize={fontSize} color={textColors.headline} primaryColor={primaryColor} accentColor={accentColor} tracking={0.12} frame={frame} fps={fps} startFrame={18} lineGap={1.0} />
        {subtitle ? <span style={{ fontFamily: fonts.body, fontSize: 26, fontStyle: 'italic', color: textColors.subtitle, marginTop: 16, opacity: staggerOpacity(frame, 34, 48) }}>{subtitle.slice(0, 120)}</span> : null}
        {spec.showLocation && location ? <span style={{ fontFamily: fonts.body, fontSize: 11, letterSpacing: 5, color: 'rgba(255,255,255,0.35)', marginTop: 24, textTransform: 'uppercase' }}>{location}</span> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

export function CinematicCenterLayout(p: Props) {
  const { photoUrl, headline, subtitle = '', categoryLabel = '', primaryColor = '#1a2b4a',
    accentColor = '#c9a96e', categoryColor, headlineColor, subtitleColor,
    headlineWeight, headlineScale = 1, logoUrl = '', brandName, location = '', spec, overlayOpacity } = p;
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.88);
  const overlayOp = overlayOpacity ?? spec.overlayOpacity ?? 0.62;
  const gradStart = Math.round(Math.max(spec.gradientStart, 0.55) * 100);

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 38%" driftY={6} />
      {/* Top safe zone — subtle darkness for logo readability */}
      <AbsoluteFill style={{
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.14) 20%, transparent 34%)',
      }} />
      {/* Bottom: brand-tinted cinematic scrim */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%',
        background: dualToneScrimCss(primaryColor, Math.min(0.96, overlayOp + 0.08)),
        pointerEvents: 'none',
      }} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} paddingTop="6.5%" />
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 44px 12%', textAlign: 'center', zIndex: 8,
      }}>
        {categoryLabel ? (
          <EditorialKicker label={categoryLabel} accent={accentColor} fontFamily={fonts.body} color={textColors.category} align="center" opacity={staggerOpacity(frame, 18, 34)} />
        ) : null}
        <div style={{
          width: '100%', maxWidth: 920, padding: '22px 28px 24px', borderRadius: 14,
          background: 'rgba(0,0,0,0.52)', border: `1px solid rgba(255,255,255,0.12)`,
          boxShadow: `0 16px 56px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.06)`,
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}>
          <HeadlineStack headline={headline} fontFamily={fonts.hero} fontWeight={headlineWeight ?? 800} fontSize={fontSize} color="#fff" uppercase={spec.heroUppercase} tracking={spec.heroTracking} frame={frame} fps={fps} startFrame={22} lineGap={1.08} textShadow={textShadowEditorial} align="center" holdOpacity />
          {subtitle ? (
            <span style={{
              display: 'block',
              fontFamily: fonts.body, fontSize: 26, fontWeight: 400, color: 'rgba(255,255,255,0.88)',
              marginTop: 14, lineHeight: 1.5, letterSpacing: 0.3,
              opacity: staggerOpacity(frame, 38, 52),
              textShadow: textShadowAmbient,
            }}>
              {subtitle.slice(0, 110)}
            </span>
          ) : null}
        </div>
        <div style={{ marginTop: 24, opacity: staggerOpacity(frame, 46, 60) }}>
          <StoryLogoLockup
            logoUrl={logoUrl}
            brandName={brandName}
            fontFamily={fonts.hero}
            primaryColor={primaryColor}
            accentColor={accentColor}
            caption={location || 'Guest favorite'}
            height={60}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

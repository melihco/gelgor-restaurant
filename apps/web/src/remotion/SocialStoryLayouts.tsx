'use client';

/**
 * Social-native layouts — quote/testimonial card + location pin story.
 * Logo-forward: top hero mark, inline card logo, bottom lockup, watermark.
 */
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { RemotionLayoutSpec } from '../lib/remotion-template-types';
import type { StoryProps } from './types';
import {
  StoryLogoInline,
  StoryLogoLockup,
  StoryLogoTopCenter,
  StoryLogoWatermark,
} from './StoryLogo';
import {
  FilmGrainOverlay,
  HeadlineStack,
  KenBurnsPhoto,
  MeshGradientLayer,
  headlineSize,
  staggerOpacity,
  stableTextLayerStyle,
  stableTextOpacity,
  storyTextLayerStyle,
  textShadowHeavy,
  resolveStoryTextColors,
} from './shared/story-primitives';
import { useStoryFonts } from './shared/useRemotionFonts';

type Props = StoryProps & { layoutSpec: RemotionLayoutSpec };

function LocationPinIcon({ color }: { color: string }) {
  return (
    <svg width="28" height="36" viewBox="0 0 28 36" fill="none" aria-hidden>
      <path
        d="M14 0C7.373 0 2 5.15 2 11.5c0 8.625 12 24.5 12 24.5s12-15.875 12-24.5C26 5.15 20.627 0 14 0z"
        fill={color}
      />
      <circle cx="14" cy="11.5" r="4.5" fill="#fff" />
    </svg>
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
    <span
      style={{
        display: 'inline-block',
        marginTop: 14,
        padding: '12px 24px',
        borderRadius: 999,
        background: accent,
        color: '#0a0a0f',
        fontFamily: fonts.body,
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: 2,
        textTransform: 'uppercase',
        opacity,
        ...stableTextLayerStyle,
      }}
    >
      {cta}
    </span>
  );
}

/** Testimonial / quote card — giant marks + frosted card + logo lockup */
export function QuoteCardLayout({
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
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const quoteText = headline.replace(/^["'""]|["'""]$/g, '');
  const fontSize = headlineSize(quoteText, (headlineScale ?? spec.heroScale) * 0.72);
  const cardOp = stableTextOpacity(frame, 16, 34);
  const lockOp = stableTextOpacity(frame, 36, 52);
  const graphicQuote = spec.headlineTreatment === 'bubble' || spec.headlineTreatment === 'sticker';

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.4} />
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={1.06} origin="50% 35%" driftY={14} />
      <AbsoluteFill style={{
        background: `linear-gradient(to bottom, ${primaryColor}cc 0%, transparent 32%, rgba(0,0,0,0.82) 100%)`,
      }} />
      <StoryLogoWatermark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} position="center" opacity={0.1} />
      <FilmGrainOverlay opacity={0.09} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.95} paddingTop="4%" />

      <AbsoluteFill style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 36px 8%',
      }}>
        {categoryLabel ? (
          <span style={{
            fontFamily: fonts.body, fontSize: 13, letterSpacing: 12, textTransform: 'uppercase',
            color: textColors.category, marginBottom: 16, opacity: staggerOpacity(frame, 8, 20),
          }}>
            {categoryLabel}
          </span>
        ) : null}

        <div style={{
          width: '100%',
          maxWidth: 920,
          padding: graphicQuote ? '40px 28px 32px' : '36px 32px 28px',
          borderRadius: graphicQuote ? 28 : 24,
          background: graphicQuote ? 'rgba(0,0,0,0.48)' : 'rgba(0,0,0,0.62)',
          border: graphicQuote ? `2px solid ${accentColor}88` : `1px solid ${accentColor}55`,
          boxShadow: graphicQuote
            ? `0 28px 90px rgba(0,0,0,0.55)`
            : `0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)`,
          opacity: cardOp,
          ...stableTextLayerStyle,
          position: 'relative',
        }}>
          {!graphicQuote ? (
            <span style={{
              position: 'absolute', top: 8, left: 24,
              fontFamily: fonts.hero, fontSize: 120, lineHeight: 1, color: accentColor, opacity: 0.45,
            }}>
              “
            </span>
          ) : null}
          <div style={{ paddingTop: graphicQuote ? 8 : 24, paddingLeft: graphicQuote ? 0 : 8 }}>
            <HeadlineStack
              headline={quoteText}
              fontFamily={fonts.hero}
              fontWeight={headlineWeight ?? spec.heroWeight ?? 400}
              fontSize={fontSize}
              color="#fff"
              frame={frame}
              fps={fps}
              startFrame={20}
              lineGap={1.12}
              textShadow={graphicQuote ? undefined : textShadowHeavy}
              headlineTreatment={spec.headlineTreatment}
              accentColor={accentColor}
              align="center"
              holdOpacity
            />
          </div>
          {subtitle ? (
            <span style={{
              display: 'block', marginTop: 20, paddingTop: 16,
              borderTop: `1px solid ${accentColor}44`,
              fontFamily: fonts.body, fontSize: 18, fontStyle: 'italic',
              color: textColors.category, opacity: staggerOpacity(frame, 28, 42),
            }}>
              {subtitle.slice(0, 120)}
            </span>
          ) : null}
        </div>

        <div style={{ marginTop: 28, opacity: lockOp, ...stableTextLayerStyle }}>
          <StoryLogoLockup
            logoUrl={logoUrl}
            brandName={brandName}
            fontFamily={fonts.hero}
            primaryColor={primaryColor}
            accentColor={accentColor}
            caption="Guest verified"
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/** Native location pin UI — logo in card + hero top mark + watermark */
export function LocationPinLayout({
  photoUrl,
  headline,
  subtitle = '',
  categoryLabel = '',
  brandName,
  location = '',
  primaryColor = '#1a2b4a',
  accentColor = '#c9a96e',
  categoryColor,
  headlineColor,
  subtitleColor,
  headlineWeight,
  headlineScale = 1,
  logoUrl = '',
  cta = '',
  layoutSpec: spec,
}: Props) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fonts = useStoryFonts();
  const textColors = resolveStoryTextColors({ categoryColor, accentColor, headlineColor, subtitleColor });
  const place = location || subtitle || brandName;
  const fontSize = headlineSize(headline, (headlineScale ?? spec.heroScale) * 0.88);
  const cardOp = stableTextOpacity(frame, 18, 36);
  const headOp = stableTextOpacity(frame, 8, 22);

  return (
    <AbsoluteFill style={{ background: primaryColor }}>
      <MeshGradientLayer primary={primaryColor} accent={accentColor} opacity={0.35} />
      <KenBurnsPhoto photoUrl={photoUrl} scaleMax={spec.kenBurnsScale} origin="50% 40%" driftY={18} />
      <AbsoluteFill style={{
        background: `linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 35%, rgba(0,0,0,0.75) 100%)`,
      }} />
      <FilmGrainOverlay opacity={0.05} />
      <StoryLogoWatermark logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} position="bottom-right" opacity={0.16} />
      <StoryLogoTopCenter logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} opacity={0.92} paddingTop="3.8%" />

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '22% 40px 9%',
        zIndex: 8,
        ...stableTextLayerStyle,
      }}>
        <div style={{ opacity: headOp, ...stableTextLayerStyle }}>
          {categoryLabel ? (
            <span style={{
              fontFamily: fonts.body, fontSize: 13, letterSpacing: 12, textTransform: 'uppercase',
              color: textColors.category, marginBottom: 12, display: 'block',
            }}>
              {categoryLabel}
            </span>
          ) : null}
          <HeadlineStack
            headline={headline}
            fontFamily={fonts.hero}
            fontWeight={headlineWeight ?? spec.heroWeight}
            fontSize={fontSize}
            color="#fff"
            uppercase={spec.heroUppercase}
            frame={frame}
            fps={fps}
            startFrame={10}
            lineGap={1.06}
            textShadow={textShadowHeavy}
            holdOpacity
          />
        </div>

        <div style={{
          opacity: cardOp,
          ...storyTextLayerStyle,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '18px 20px',
            borderRadius: 20,
            background: 'rgba(8,8,12,0.9)',
            border: '1px solid rgba(255,255,255,0.22)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          }}>
            <StoryLogoInline logoUrl={logoUrl} brandName={brandName} fontFamily={fonts.hero} height={64} />
            <div style={{ width: 1, height: 52, background: 'rgba(255,255,255,0.18)' }} />
            <LocationPinIcon color={accentColor} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: fonts.body, fontSize: 20, fontWeight: 800, color: '#fff',
                letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {place}
              </div>
              {subtitle && location ? (
                <div style={{
                  fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 4,
                }}>
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
          {(spec.showCtaPill || cta) ? (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <CtaPill cta={cta || 'Yol tarifi'} accent={accentColor} fonts={fonts} opacity={cardOp} />
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

'use client';

/**
 * LayoutEngine — Brand-aware content layout renderer.
 *
 * Receives a CanvasOutput (content slots) + BrandTheme (design tokens)
 * and renders the appropriate layout component.
 *
 * All layouts inject BrandTheme as CSS custom properties so child components
 * stay token-driven without prop drilling.
 *
 * Supported layouts (v1):
 *  - feed_square     1:1  Instagram feed post
 *  - story_full      9:16 Instagram Story / Reel cover
 *  - carousel_slide  1:1  Carousel card with slide indicator
 */

import React, { CSSProperties } from 'react';
import type { BrandTheme, LayoutId } from '@/types/brand-theme';
import type { CanvasOutput } from '@/types/canvas-output';

// ── Token → CSS custom properties ────────────────────────────────────────────

// Maps font names to their Next.js CSS variable names (loaded in layout.tsx)
const FONT_VAR_MAP: Record<string, string> = {
  'Playfair Display':   'var(--font-playfair)',
  'Montserrat':         'var(--font-montserrat)',
  'Lora':               'var(--font-lora)',
  'Raleway':            'var(--font-raleway)',
  'Cormorant Garamond': 'var(--font-cormorant)',
  'DM Sans':            'var(--font-dm-sans)',
  'DM Serif Display':   'var(--font-dm-serif)',
  'Libre Baskerville':  'var(--font-libre)',
  'Poppins':            'var(--font-poppins)',
  'Fraunces':           'var(--font-fraunces)',
  'Space Grotesk':      'var(--font-space-grotesk)',
  'Inter':              'var(--font-outfit)',  // Inter → Outfit fallback
  'Nunito':             'var(--font-outfit)',
  'Josefin Sans':       'var(--font-montserrat)',
  'Syne':               'var(--font-space-grotesk)',
  'Source Serif 4':     'var(--font-libre)',
};

function resolveFontStack(name: string, fallback: string): string {
  const cssVar = FONT_VAR_MAP[name];
  if (cssVar) return `${cssVar}, '${name}', ${fallback}`;
  return `'${name}', ${fallback}`;
}

function themeToVars(theme: BrandTheme): CSSProperties {
  return {
    '--bt-primary':        theme.palette.primary,
    '--bt-accent':         theme.palette.accent,
    '--bt-neutral':        theme.palette.neutral,
    '--bt-shadow':         theme.palette.shadow,
    '--bt-overlay-color':  theme.overlay.color,
    '--bt-overlay-opacity': String(theme.overlay.opacity),
    '--bt-radius':         `${theme.layout.borderRadius}px`,
    '--bt-spacing':        `${theme.layout.spacingBase}px`,
    '--bt-heading-font':   resolveFontStack(theme.typography.headingFont, 'serif'),
    '--bt-body-font':      resolveFontStack(theme.typography.bodyFont, 'sans-serif'),
  } as CSSProperties;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ImageSlot({ url, alt = '' }: { url?: string | null; alt?: string }) {
  if (!url) {
    return (
      <div style={{
        width: '100%', height: '100%',
        background: 'var(--bt-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)',
        }} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

function Overlay() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bt-overlay-color)',
      opacity: 'var(--bt-overlay-opacity)' as unknown as number,
      pointerEvents: 'none',
    }} />
  );
}

// ── FeedSquareLayout (1:1) ────────────────────────────────────────────────────

function FeedSquareLayout({ content }: { content: CanvasOutput }) {
  const density = content.tokensHint.typographyWeight;
  const overlayOpacityOverride = content.tokensHint.overlayOpacity;

  return (
    <div style={{
      width: '100%',
      aspectRatio: '1 / 1',
      position: 'relative',
      borderRadius: 'var(--bt-radius)',
      overflow: 'hidden',
      background: 'var(--bt-primary)',
      fontFamily: 'var(--bt-body-font)',
    }}>
      {/* Background image */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ImageSlot url={content.visualBrief.galleryUrl} alt={content.headline} />
      </div>

      {/* Colour overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: content.tokensHint.primaryColor ?? 'var(--bt-overlay-color)',
        opacity: overlayOpacityOverride ?? ('var(--bt-overlay-opacity)' as unknown as number),
        pointerEvents: 'none',
      }} />

      {/* Text content — bottom anchor */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        padding: 'calc(var(--bt-spacing) * 2)',
        background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)',
      }}>
        {content.subline && (
          <p style={{
            margin: '0 0 4px',
            fontFamily: 'var(--bt-body-font)',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--bt-accent)',
            fontWeight: 500,
          }}>
            {content.subline}
          </p>
        )}
        <h2 style={{
          margin: '0 0 8px',
          fontFamily: 'var(--bt-heading-font)',
          fontSize: 20,
          fontWeight: density === 'light' ? 400 : density === 'bold' ? 700 : 600,
          color: 'var(--bt-neutral)',
          lineHeight: 1.25,
        }}>
          {content.headline}
        </h2>
        {content.cta && (
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 'calc(var(--bt-radius) / 2)',
            background: 'var(--bt-accent)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}>
            {content.cta}
          </span>
        )}
      </div>
    </div>
  );
}

// ── StoryFullLayout (9:16) ────────────────────────────────────────────────────

function StoryFullLayout({ content }: { content: CanvasOutput }) {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '9 / 16',
      position: 'relative',
      borderRadius: 'var(--bt-radius)',
      overflow: 'hidden',
      background: 'var(--bt-primary)',
      fontFamily: 'var(--bt-body-font)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Full bleed background */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ImageSlot url={content.visualBrief.galleryUrl} alt={content.headline} />
      </div>
      <Overlay />

      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 3,
        background: 'var(--bt-accent)',
      }} />

      {/* Center headline block */}
      <div style={{
        position: 'absolute',
        top: '50%', left: 0, right: 0,
        transform: 'translateY(-50%)',
        padding: 'calc(var(--bt-spacing) * 3)',
        textAlign: 'center',
      }}>
        <h1 style={{
          margin: '0 0 12px',
          fontFamily: 'var(--bt-heading-font)',
          fontSize: 28,
          fontWeight: 700,
          color: 'var(--bt-neutral)',
          lineHeight: 1.2,
          textShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
          {content.headline}
        </h1>
        {content.subline && (
          <p style={{
            margin: 0,
            fontFamily: 'var(--bt-body-font)',
            fontSize: 14,
            color: 'rgba(255,255,255,0.85)',
            lineHeight: 1.5,
          }}>
            {content.subline}
          </p>
        )}
      </div>

      {/* Bottom CTA */}
      {content.cta && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(var(--bt-spacing) * 3)',
          left: 0, right: 0,
          display: 'flex', justifyContent: 'center',
        }}>
          <span style={{
            padding: '10px 24px',
            borderRadius: 'calc(var(--bt-radius) / 1.5)',
            background: 'var(--bt-accent)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}>
            {content.cta}
          </span>
        </div>
      )}
    </div>
  );
}

// ── CarouselSlideLayout (1:1 + slide indicator) ───────────────────────────────

function CarouselSlideLayout({
  content,
  slideIndex = 0,
  totalSlides = 1,
}: {
  content: CanvasOutput;
  slideIndex?: number;
  totalSlides?: number;
}) {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '1 / 1',
      position: 'relative',
      borderRadius: 'var(--bt-radius)',
      overflow: 'hidden',
      background: 'var(--bt-primary)',
      fontFamily: 'var(--bt-body-font)',
    }}>
      {/* Left half: image */}
      <div style={{ position: 'absolute', inset: 0, clipPath: 'inset(0 40% 0 0)' }}>
        <ImageSlot url={content.visualBrief.galleryUrl} alt={content.headline} />
        <Overlay />
      </div>

      {/* Right half: content */}
      <div style={{
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: '60%',
        background: 'var(--bt-neutral)',
        padding: 'calc(var(--bt-spacing) * 2.5)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        {/* Slide indicator */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {Array.from({ length: totalSlides }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === slideIndex ? 16 : 6,
                height: 6,
                borderRadius: 3,
                background: i === slideIndex ? 'var(--bt-accent)' : 'var(--bt-primary)',
                opacity: i === slideIndex ? 1 : 0.3,
                transition: 'width 0.2s',
              }}
            />
          ))}
        </div>

        {/* Text content */}
        <div>
          <p style={{
            margin: '0 0 6px',
            fontSize: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--bt-accent)',
            fontWeight: 600,
          }}>
            {content.contentType.replace(/_/g, ' ')}
          </p>
          <h3 style={{
            margin: '0 0 10px',
            fontFamily: 'var(--bt-heading-font)',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--bt-shadow)',
            lineHeight: 1.3,
          }}>
            {content.headline}
          </h3>
          {content.bullets.slice(0, 3).map((b, i) => (
            <p key={i} style={{
              margin: '0 0 4px',
              fontSize: 11,
              color: 'var(--bt-shadow)',
              opacity: 0.75,
              lineHeight: 1.4,
              display: 'flex',
              gap: 6,
            }}>
              <span style={{ color: 'var(--bt-accent)', fontWeight: 700, flexShrink: 0 }}>—</span>
              {b}
            </p>
          ))}
        </div>

        {/* CTA */}
        {content.cta && (
          <span style={{
            alignSelf: 'flex-start',
            padding: '5px 12px',
            borderRadius: 'calc(var(--bt-radius) / 2)',
            background: 'var(--bt-accent)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}>
            {content.cta}
          </span>
        )}
      </div>
    </div>
  );
}

// ── EventCardLayout (1:1 — event / announcement poster) ──────────────────────

function EventCardLayout({ content }: { content: CanvasOutput }) {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '1 / 1',
      position: 'relative',
      borderRadius: 'var(--bt-radius)',
      overflow: 'hidden',
      background: 'var(--bt-shadow)',
      fontFamily: 'var(--bt-body-font)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Background image */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <ImageSlot url={content.visualBrief.galleryUrl} alt={content.headline} />
      </div>
      {/* Dark overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)' }} />

      {/* Top date badge */}
      {content.subline && (
        <div style={{
          position: 'absolute', top: 'calc(var(--bt-spacing) * 2)', left: 'calc(var(--bt-spacing) * 2)',
          padding: '6px 14px', borderRadius: 'calc(var(--bt-radius) / 1.5)',
          background: 'var(--bt-accent)', color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
        }}>
          {content.subline}
        </div>
      )}

      {/* Center headline */}
      <div style={{
        position: 'absolute',
        top: '50%', left: 0, right: 0,
        transform: 'translateY(-50%)',
        padding: 'calc(var(--bt-spacing) * 3)',
        textAlign: 'center',
      }}>
        <h2 style={{
          margin: '0 0 16px',
          fontFamily: 'var(--bt-heading-font)',
          fontSize: 28, fontWeight: 800,
          color: '#ffffff',
          lineHeight: 1.15,
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}>
          {content.headline}
        </h2>
        {content.bullets.slice(0, 2).map((b, i) => (
          <p key={i} style={{
            margin: '0 0 6px',
            fontSize: 13, color: 'rgba(255,255,255,0.82)',
            lineHeight: 1.4,
          }}>
            {b}
          </p>
        ))}
      </div>

      {/* Bottom CTA bar */}
      {content.cta && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          padding: 'calc(var(--bt-spacing) * 2)',
          background: 'var(--bt-accent)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
        }}>
          <span style={{
            color: '#fff', fontSize: 13, fontWeight: 800,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {content.cta}
          </span>
        </div>
      )}
    </div>
  );
}

// ── WeeklyBriefLayout (4:5 — editorial overview card) ────────────────────────

function WeeklyBriefLayout({ content }: { content: CanvasOutput }) {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '4 / 5',
      borderRadius: 'var(--bt-radius)',
      overflow: 'hidden',
      background: 'var(--bt-neutral)',
      fontFamily: 'var(--bt-body-font)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header band */}
      <div style={{
        background: 'var(--bt-primary)',
        padding: 'calc(var(--bt-spacing) * 2.5) calc(var(--bt-spacing) * 2)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--bt-heading-font)',
          fontSize: 18, fontWeight: 700,
          color: 'var(--bt-neutral)',
        }}>
          {content.headline}
        </span>
        <span style={{
          fontSize: 10, color: 'var(--bt-accent)', fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          {content.contentType.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, padding: 'calc(var(--bt-spacing) * 2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {content.subline && (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--bt-shadow)', lineHeight: 1.5, fontStyle: 'italic' }}>
            {content.subline}
          </p>
        )}

        {content.bullets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {content.bullets.map((b, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 12px',
                borderRadius: 'calc(var(--bt-radius) / 2)',
                background: i % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'transparent',
                borderLeft: `3px solid var(--bt-accent)`,
              }}>
                <span style={{ fontSize: 11, color: 'var(--bt-shadow)', lineHeight: 1.45 }}>{b}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {content.cta && (
        <div style={{
          padding: 'calc(var(--bt-spacing) * 1.5) calc(var(--bt-spacing) * 2)',
          borderTop: '0.5px solid rgba(0,0,0,0.08)',
          display: 'flex', justifyContent: 'flex-end',
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--bt-accent)',
            letterSpacing: '0.04em',
          }}>
            {content.cta} →
          </span>
        </div>
      )}
    </div>
  );
}

// ── ReviewShowcaseLayout (1:1 — social proof quote card) ─────────────────────

function ReviewShowcaseLayout({ content }: { content: CanvasOutput }) {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '1 / 1',
      position: 'relative',
      borderRadius: 'var(--bt-radius)',
      overflow: 'hidden',
      background: 'var(--bt-neutral)',
      fontFamily: 'var(--bt-body-font)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: 'calc(var(--bt-spacing) * 3)',
    }}>
      {/* Decorative quote mark */}
      <div style={{
        position: 'absolute', top: -10, left: 16,
        fontFamily: 'var(--bt-heading-font)',
        fontSize: 120, color: 'var(--bt-accent)',
        opacity: 0.12, lineHeight: 1, userSelect: 'none',
        pointerEvents: 'none',
      }}>
        "
      </div>

      {/* Top: brand accent strip */}
      <div style={{ width: 40, height: 4, background: 'var(--bt-accent)', borderRadius: 2 }} />

      {/* Quote text */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
        <p style={{
          margin: 0,
          fontFamily: 'var(--bt-heading-font)',
          fontSize: 18, fontWeight: 500,
          color: 'var(--bt-shadow)',
          lineHeight: 1.5,
          fontStyle: 'italic',
        }}>
          "{content.headline}"
        </p>
      </div>

      {/* Star rating */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <span key={i} style={{ fontSize: 16, color: 'var(--bt-accent)' }}>★</span>
        ))}
      </div>

      {/* Attribution */}
      {content.subline && (
        <p style={{
          margin: 0, fontSize: 11,
          color: 'var(--bt-shadow)', opacity: 0.55,
          fontWeight: 600,
        }}>
          — {content.subline}
        </p>
      )}

      {/* Bottom image strip */}
      {content.visualBrief.galleryUrl && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '35%',
          clipPath: 'polygon(20% 0%, 100% 0%, 100% 100%, 0% 100%)',
          overflow: 'hidden',
        }}>
          <ImageSlot url={content.visualBrief.galleryUrl} alt="" />
          <Overlay />
        </div>
      )}
    </div>
  );
}

// ── AdBannerHorizontalLayout (1200×628 — Facebook/LinkedIn banner) ───────────

function AdBannerHorizontalLayout({ content }: { content: CanvasOutput }) {
  return (
    <div style={{
      width: '100%',
      aspectRatio: '1200 / 628',
      borderRadius: 'var(--bt-radius)',
      overflow: 'hidden',
      background: 'var(--bt-primary)',
      fontFamily: 'var(--bt-body-font)',
      display: 'flex',
      flexDirection: 'row',
    }}>
      {/* Left: text content (60%) */}
      <div style={{
        flex: '0 0 60%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: 'calc(var(--bt-spacing) * 3)',
        gap: 12,
      }}>
        {content.subline && (
          <p style={{
            margin: 0, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--bt-accent)',
          }}>
            {content.subline}
          </p>
        )}
        <h2 style={{
          margin: 0,
          fontFamily: 'var(--bt-heading-font)',
          fontSize: 22, fontWeight: 800,
          color: 'var(--bt-neutral)',
          lineHeight: 1.2,
        }}>
          {content.headline}
        </h2>
        {content.bullets.slice(0, 2).map((b, i) => (
          <p key={i} style={{ margin: '2px 0', fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.4 }}>
            ✓ {b}
          </p>
        ))}
        {content.cta && (
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            marginTop: 6, padding: '9px 20px', borderRadius: 'calc(var(--bt-radius) / 1.5)',
            background: 'var(--bt-accent)', color: '#fff',
            fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
            alignSelf: 'flex-start',
          }}>
            {content.cta}
          </div>
        )}
      </div>

      {/* Right: image (40%) */}
      <div style={{ flex: '0 0 40%', position: 'relative' }}>
        <ImageSlot url={content.visualBrief.galleryUrl} alt={content.headline} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, var(--bt-primary) 0%, transparent 30%)',
        }} />
      </div>
    </div>
  );
}

// ── Layout registry ───────────────────────────────────────────────────────────

const LAYOUT_COMPONENTS: Record<LayoutId, React.ComponentType<{ content: CanvasOutput; [k: string]: unknown }>> = {
  feed_square:          FeedSquareLayout,
  story_full:           StoryFullLayout,
  carousel_slide:       CarouselSlideLayout,
  event_card:           EventCardLayout,
  weekly_brief:         WeeklyBriefLayout,
  review_showcase:      ReviewShowcaseLayout,
  ad_banner_horizontal: AdBannerHorizontalLayout,
};

// ── Public API ────────────────────────────────────────────────────────────────

export interface LayoutEngineProps {
  content: CanvasOutput;
  theme: BrandTheme;
  /** Override layout_id — useful for previewing a specific layout */
  layoutIdOverride?: LayoutId;
  /** Carousel-specific: current slide index */
  slideIndex?: number;
  /** Carousel-specific: total slides count */
  totalSlides?: number;
  className?: string;
  style?: CSSProperties;
}

export function LayoutEngine({
  content,
  theme,
  layoutIdOverride,
  slideIndex,
  totalSlides,
  className,
  style,
}: LayoutEngineProps) {
  const layoutId = layoutIdOverride ?? (content.layoutId as LayoutId) ?? theme.layout.defaultLayoutId as LayoutId;
  const Layout = LAYOUT_COMPONENTS[layoutId] ?? FeedSquareLayout;

  return (
    <div
      className={className}
      style={{
        ...themeToVars(theme),
        ...style,
      }}
    >
      <Layout
        content={content}
        slideIndex={slideIndex ?? 0}
        totalSlides={totalSlides ?? 1}
      />
    </div>
  );
}

export default LayoutEngine;

'use client';
import { useState } from 'react';
import { useTheme } from './theme-context';

// ─── Raw card shape from backend ──────────────────────────────────────
export interface DesignCard {
  card_type?: string;
  format?: string;
  concept_title?: string;
  background_reference_url?: string;
  background_intent?: string;
  overlay_color?: string;
  overlay_opacity?: number | string;
  headline?: string;
  subline?: string;
  cta_text?: string;
  cta_style?: string;
  cta_color?: string;
  text_color?: string;
  typography_style?: string;
  logo_position?: string;
  visual_mood?: string;
  strategic_purpose?: string;
  image_generation_prompt?: string;
  canva_field_mapping?: Record<string, string> | string;
  // fallbacks
  title?: string;
  caption?: string;
  description?: string;
  copy_main?: string;
  copy_secondary?: string;
}

// ─── Format helpers ───────────────────────────────────────────────────
function formatLabel(f: string | undefined): string {
  if (!f) return 'Post';
  const low = f.toLowerCase();
  if (low.includes('story'))  return 'Story';
  if (low.includes('reel'))   return 'Reel';
  if (low.includes('1x1'))    return 'Post 1:1';
  if (low.includes('4x5'))    return 'Post 4:5';
  if (low.includes('16x9'))   return 'Landscape';
  if (low.includes('carousel')) return 'Carousel';
  return 'Post';
}

function formatAspect(f: string | undefined): string {
  if (!f) return '1/1';
  const low = f.toLowerCase();
  if (low.includes('9x16') || low.includes('story') || low.includes('reel')) return '9/16';
  if (low.includes('4x5'))   return '4/5';
  if (low.includes('16x9'))  return '16/9';
  return '1/1';
}

function formatBadgeColor(f: string): string {
  const low = f.toLowerCase();
  if (low === 'story' || low === 'reel') return '#f472b6';
  return '#60a5fa';
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// ─── Single card visual ───────────────────────────────────────────────
function CardVisual({ card, maxH = 320 }: { card: DesignCard; maxH?: number }) {
  const aspect = formatAspect(card.format);
  const fLabel = formatLabel(card.format);
  const overlayColor = card.overlay_color ?? '#000000';
  const overlayOpacity = typeof card.overlay_opacity === 'string'
    ? parseFloat(card.overlay_opacity) : (card.overlay_opacity ?? 0.4);
  const textColor = card.text_color ?? '#ffffff';
  const ctaColor = card.cta_color ?? '#ffffff';
  const headline = card.headline ?? card.concept_title ?? card.title ?? '';
  const subline = card.subline ?? card.copy_main ?? card.caption ?? '';
  const cta = card.cta_text ?? '';
  const bgUrl = card.background_reference_url;

  const isVertical = aspect === '9/16' || aspect === '4/5';

  return (
    <div style={{
      position: 'relative',
      aspectRatio: aspect,
      maxHeight: isVertical ? maxH : undefined,
      width: isVertical ? `${maxH * (aspect === '9/16' ? 0.5625 : 0.8)}px` : '100%',
      borderRadius: 16,
      overflow: 'hidden',
      background: '#1a1a2e',
      flexShrink: 0,
    }}>
      {/* Background image */}
      {bgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      {/* Overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `rgba(${hexToRgb(overlayColor)}, ${overlayOpacity})`,
      }} />

      {/* Content */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '16px',
      }}>
        {/* Format badge */}
        <div style={{
          position: 'absolute', top: 10, left: 10,
          fontSize: 10, padding: '3px 8px', borderRadius: 20,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
          color: '#fff', fontWeight: 600, letterSpacing: '0.04em',
        }}>
          {fLabel}
        </div>

        {/* Text content */}
        {headline && (
          <div style={{
            fontSize: isVertical ? 18 : 20,
            fontWeight: 800,
            color: textColor,
            lineHeight: 1.2,
            marginBottom: subline ? 6 : (cta ? 10 : 0),
            textShadow: '0 1px 4px rgba(0,0,0,0.4)',
            letterSpacing: '-0.01em',
          }}>
            {headline}
          </div>
        )}

        {subline && (
          <div style={{
            fontSize: isVertical ? 12 : 13,
            color: textColor,
            opacity: 0.85,
            lineHeight: 1.4,
            marginBottom: cta ? 10 : 0,
            textShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }}>
            {subline}
          </div>
        )}

        {cta && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '7px 14px',
            borderRadius: 30,
            border: `1.5px solid ${ctaColor}`,
            color: ctaColor,
            fontSize: 11,
            fontWeight: 700,
            backdropFilter: 'blur(8px)',
            background: `rgba(${hexToRgb(ctaColor)}, 0.15)`,
            letterSpacing: '0.03em',
          }}>
            {cta}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card detail info ─────────────────────────────────────────────────
function CardDetail({ card, t }: { card: DesignCard; t: ReturnType<typeof useTheme>['t'] }) {
  const fields = [
    { label: 'Format',       value: formatLabel(card.format)     },
    { label: 'Kart Tipi',    value: card.card_type?.replace(/_/g,' ')  },
    { label: 'Başlık',       value: card.headline ?? card.concept_title },
    { label: 'Alt Metin',    value: card.subline ?? card.copy_main      },
    { label: 'CTA',          value: card.cta_text                       },
    { label: 'Arka Plan',    value: card.background_intent?.replace(/_/g,' ') },
    { label: 'Görsel Duygu', value: card.visual_mood?.slice(0, 60)      },
    { label: 'Amaç',         value: card.strategic_purpose?.slice(0, 80)},
  ].filter((f): f is { label: string; value: string } => !!f.value);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {fields.map((f) => (
        <div key={f.label} style={{ gridColumn: f.value.length > 40 ? '1 / -1' : undefined }}>
          <div style={{ fontSize: 10, color: t.labelColor, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</div>
          <div style={{ fontSize: 13, color: t.textPrimary, lineHeight: 1.35 }}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Main multi-card preview ──────────────────────────────────────────
interface Props {
  cards: DesignCard[];
  onCardSelect?: (index: number) => void;
}

export function DesignCardsPreview({ cards, onCardSelect }: Props) {
  const { t } = useTheme();
  const [active, setActive] = useState(0);
  const card = cards[active] ?? cards[0];
  if (!card) return null;

  const fLabel = formatLabel(card.format);
  const badgeColor = formatBadgeColor(fLabel);

  return (
    <div>
      {/* Progress dots */}
      {cards.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, justifyContent: 'center' }}>
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setActive(i); onCardSelect?.(i); }}
              style={{
                height: 3, borderRadius: 2,
                width: i === active ? 24 : 8,
                background: i === active ? t.accent : (t.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'),
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'width 200ms, background 200ms',
              }}
            />
          ))}
        </div>
      )}

      {/* Card visual */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <CardVisual card={card} maxH={340} />
      </div>

      {/* Format + nav pills */}
      {cards.length > 1 && (
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', marginBottom: 14, paddingBottom: 2 }}>
          {cards.map((c, i) => {
            const fl = formatLabel(c.format);
            const bc = formatBadgeColor(fl);
            const isSel = i === active;
            return (
              <button
                key={i}
                onClick={() => { setActive(i); onCardSelect?.(i); }}
                style={{
                  flexShrink: 0,
                  padding: '6px 12px', borderRadius: 30, cursor: 'pointer',
                  fontSize: 12, fontWeight: isSel ? 700 : 400,
                  background: isSel ? `${bc}14` : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                  border: `0.5px solid ${isSel ? bc + '30' : t.separator}`,
                  color: isSel ? bc : t.textTertiary,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span style={{ fontSize: 9, opacity: 0.7 }}>
                  {fl === 'Story' || fl === 'Reel' ? '▋' : '■'}
                </span>
                {fl} {i + 1}
              </button>
            );
          })}
        </div>
      )}

      {/* Card details */}
      <div style={{
        padding: '16px',
        background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
        border: `0.5px solid ${t.separator}`,
        borderRadius: 16,
        boxShadow: !t.isDark ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, marginBottom: 12 }}>
          {card.concept_title ?? card.headline ?? `Kart ${active + 1}`}
        </div>
        <CardDetail card={card} t={t} />
      </div>
    </div>
  );
}

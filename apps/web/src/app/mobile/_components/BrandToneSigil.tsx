'use client';

/**
 * Brand tone sigil — lives in the identity chip row (not a lone meta strip).
 */
import React from 'react';
import type { BrandTonePreset } from '@/lib/sync-company-profile-from-python';
import type { T } from './theme-context';
import { SA_CHROME } from './sa-chrome';

const TONE_META: Record<BrandTonePreset, {
  label: string;
  accent: string;
  glow: string;
}> = {
  friendly: {
    label: 'Samimi',
    accent: SA_CHROME.warmGold,
    glow: 'rgba(200,168,106,0.22)',
  },
  professional: {
    label: 'Profesyonel',
    accent: SA_CHROME.steel300,
    glow: 'rgba(138,171,189,0.22)',
  },
  energetic: {
    label: 'Enerjik',
    accent: '#D4A574',
    glow: 'rgba(212,165,116,0.22)',
  },
  luxury: {
    label: 'Lüks',
    accent: '#C9B896',
    glow: 'rgba(201,184,150,0.24)',
  },
  casual: {
    label: 'Rahat',
    accent: SA_CHROME.steel400,
    glow: 'rgba(106,142,160,0.22)',
  },
};

function ToneGlyph({ tone, color, size = 14 }: { tone: BrandTonePreset; color: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    'aria-hidden': true,
  };

  switch (tone) {
    case 'friendly':
      return (
        <svg {...common}>
          <path
            d="M5.5 11.5c1.8 3.2 4.2 4.8 6.5 4.8s4.7-1.6 6.5-4.8"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="9" cy="9.2" r="1.2" fill={color} />
          <circle cx="15" cy="9.2" r="1.2" fill={color} />
        </svg>
      );
    case 'professional':
      return (
        <svg {...common}>
          <path
            d="M12 3.8 19.2 12 12 20.2 4.8 12 12 3.8Z"
            stroke={color}
            strokeWidth="1.65"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2" fill={color} opacity="0.85" />
        </svg>
      );
    case 'energetic':
      return (
        <svg {...common}>
          <path
            d="M13.2 3.5 7.2 13.2h4.1L10.8 20.5l6.8-10.2h-4.3L13.2 3.5Z"
            stroke={color}
            strokeWidth="1.55"
            strokeLinejoin="round"
            fill={`${color}22`}
          />
        </svg>
      );
    case 'luxury':
      return (
        <svg {...common}>
          <path
            d="M7.2 5.5h9.6L20 9.2 12 19.2 4 9.2 7.2 5.5Z"
            stroke={color}
            strokeWidth="1.55"
            strokeLinejoin="round"
          />
          <path d="M4.4 9.2h15.2M9.2 5.5 12 19.2 14.8 5.5" stroke={color} strokeWidth="1.2" opacity="0.7" />
        </svg>
      );
    case 'casual':
      return (
        <svg {...common}>
          <path
            d="M6.5 15.5c0-4.8 3.2-8.8 8.8-9.2 0 5.2-2.4 9.2-8.8 9.2Z"
            stroke={color}
            strokeWidth="1.6"
            strokeLinejoin="round"
            fill={`${color}18`}
          />
          <path d="M8.2 14.2c2.4-1.8 4.2-4.2 5.2-7" stroke={color} strokeWidth="1.35" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export function BrandToneSigil({
  t,
  tone,
  label,
}: {
  t: T;
  tone: BrandTonePreset | string;
  label?: string | null;
}) {
  const key = (['professional', 'friendly', 'energetic', 'luxury', 'casual'].includes(tone)
    ? tone
    : 'friendly') as BrandTonePreset;
  const meta = TONE_META[key];
  const display = (label && label.trim()) || meta.label;

  return (
    <span
      className="brand-tone-sigil"
      data-tone={key}
      aria-label={`Marka tonu: ${display}`}
      title={`Ton · ${display}`}
      style={{
        ['--tone-accent' as string]: meta.accent,
        ['--tone-glow' as string]: meta.glow,
        borderColor: t.isDark ? `${meta.accent}50` : `${meta.accent}55`,
        background: t.isDark
          ? `linear-gradient(135deg, ${meta.glow}, rgba(255,255,255,0.04))`
          : `linear-gradient(135deg, ${meta.glow}, rgba(255,255,255,0.9))`,
        color: t.isDark ? meta.accent : SA_CHROME.steel700,
      }}
    >
      <ToneGlyph tone={key} color={meta.accent} size={13} />
      <span className="brand-tone-sigil__label">{display}</span>
    </span>
  );
}

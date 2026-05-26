'use client';
import { createContext, useContext, useState } from 'react';

export interface T {
  // ── Core backgrounds ──
  bg: string;            // page background
  surface: string;       // card background
  elevated: string;      // elevated surface (sheets, nav)
  glass: string;         // glass overlay

  // ── Text ──
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  labelColor: string;

  // ── Accent ──
  accent: string;
  accentGlow: string;
  accentDim: string;
  accentBorder: string;

  // ── Semantic ──
  live: string;      liveDim: string;
  warning: string;   warningDim: string;
  danger: string;    dangerDim: string;
  success: string;   successDim: string;
  info: string;      infoDim: string;

  // ── Separator ──
  separator: string;

  // ── Interactive ──
  pillActive: (color: string) => React.CSSProperties;
  pillIdle: React.CSSProperties;
  iconBtn: React.CSSProperties;
  backBtn: React.CSSProperties;
  surfaceCard: React.CSSProperties;
  surfaceGroup: React.CSSProperties;
  surfaceRow: React.CSSProperties;

  // ── Nav ──
  navBg: string;
  navBorder: string;
  navActiveColor: string;
  navIdleColor: string;

  isDark: boolean;
}

// ─── DARK — Deep Cinematic ─────────────────────────────────────────────
const dark: T = {
  bg:       '#04040A',
  surface:  '#0D0D1A',
  elevated: '#121220',
  glass:    'rgba(4,4,10,0.92)',

  textPrimary:   '#F4F4F8',
  textSecondary: 'rgba(228,228,240,0.72)',
  textTertiary:  'rgba(160,160,180,0.55)',
  textMuted:     'rgba(120,120,140,0.38)',
  labelColor:    'rgba(140,140,160,0.5)',

  accent:       '#7C3AED',
  accentGlow:   'rgba(124,58,237,0.28)',
  accentDim:    'rgba(124,58,237,0.10)',
  accentBorder: 'rgba(124,58,237,0.22)',

  live:        '#10B981',  liveDim:     'rgba(16,185,129,0.10)',
  warning:     '#F59E0B',  warningDim:  'rgba(245,158,11,0.10)',
  danger:      '#EF4444',  dangerDim:   'rgba(239,68,68,0.09)',
  success:     '#10B981',  successDim:  'rgba(16,185,129,0.10)',
  info:        '#3B82F6',  infoDim:     'rgba(59,130,246,0.10)',

  separator: 'rgba(255,255,255,0.055)',

  pillActive: (c) => ({ background: `${c}14`, border: `0.5px solid ${c}28`, color: c }),
  pillIdle:   { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.07)', color: 'rgba(160,160,180,0.55)' },
  iconBtn:    { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.07)' },
  backBtn:    { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.07)' },

  surfaceCard:  { background: '#0D0D1A', borderRadius: 22, boxShadow: '0 2px 24px rgba(0,0,0,0.55)' },
  surfaceGroup: { background: '#0D0D1A', borderRadius: 22, overflow: 'hidden' as const, boxShadow: '0 2px 24px rgba(0,0,0,0.45)' },
  surfaceRow:   { borderBottom: '0.5px solid rgba(255,255,255,0.05)', background: 'transparent' },

  navBg:          'rgba(4,4,10,0.94)',
  navBorder:      'rgba(255,255,255,0.07)',
  navActiveColor: '#A78BFA',
  navIdleColor:   'rgba(255,255,255,0.22)',

  isDark: true,
};

// ─── LIGHT — Editorial Soft ────────────────────────────────────────────
const light: T = {
  bg:       '#F2F2F7',
  surface:  '#FFFFFF',
  elevated: '#FFFFFF',
  glass:    'rgba(242,242,247,0.92)',

  textPrimary:   '#0A0A12',
  textSecondary: 'rgba(10,10,18,0.68)',
  textTertiary:  '#6B6B78',
  textMuted:     '#AEAEB8',
  labelColor:    '#8E8E98',

  accent:       '#6D28D9',
  accentGlow:   'rgba(109,40,217,0.18)',
  accentDim:    'rgba(109,40,217,0.07)',
  accentBorder: 'rgba(109,40,217,0.18)',

  live:        '#059669',  liveDim:     'rgba(5,150,105,0.08)',
  warning:     '#D97706',  warningDim:  'rgba(217,119,6,0.08)',
  danger:      '#DC2626',  dangerDim:   'rgba(220,38,38,0.07)',
  success:     '#059669',  successDim:  'rgba(5,150,105,0.08)',
  info:        '#2563EB',  infoDim:     'rgba(37,99,235,0.08)',

  separator: 'rgba(60,60,67,0.12)',

  pillActive: (c) => ({ background: `${c}0e`, border: `0.5px solid ${c}25`, color: c }),
  pillIdle:   { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#8E8E98' },
  iconBtn:    { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)' },
  backBtn:    { background: 'rgba(0,0,0,0.05)', border: '0.5px solid rgba(0,0,0,0.09)' },

  surfaceCard:  { background: '#FFFFFF', borderRadius: 22, boxShadow: '0 1px 8px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)' },
  surfaceGroup: { background: '#FFFFFF', borderRadius: 22, overflow: 'hidden' as const, boxShadow: '0 1px 8px rgba(0,0,0,0.05)' },
  surfaceRow:   { borderBottom: '0.5px solid rgba(60,60,67,0.09)', background: 'transparent' },

  navBg:          'rgba(242,242,247,0.94)',
  navBorder:      'rgba(60,60,67,0.12)',
  navActiveColor: '#6D28D9',
  navIdleColor:   'rgba(60,60,67,0.28)',

  isDark: false,
};

const ThemeCtx = createContext<{ t: T; toggle: () => void }>({ t: dark, toggle: () => {} });

export function MobileThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);
  return (
    <ThemeCtx.Provider value={{ t: isDark ? dark : light, toggle: () => setIsDark(d => !d) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() { return useContext(ThemeCtx); }

/**
 * Mobile typography scale — opt-in tokens.
 *
 * Use these for NEW components / sections to keep visual hierarchy consistent.
 * Existing screens with inline fontSize are not modified; they remain working.
 * Body min 12px (WCAG AA). Hero values use tight tracking for premium feel.
 */
export const type = {
  // micro — labels, eyebrows, captions on chips
  micro:   { fontSize: 10, lineHeight: 1.3, letterSpacing: '0.08em', fontWeight: 600 as const },
  // small — secondary metadata (timestamps, hints)
  small:   { fontSize: 11, lineHeight: 1.4 },
  // body — default body, list rows, secondary copy
  body:    { fontSize: 13, lineHeight: 1.55 },
  // bodyLg — primary body, card titles, content
  bodyLg:  { fontSize: 15, lineHeight: 1.5 },
  // title — section / card titles
  title:   { fontSize: 17, lineHeight: 1.3, letterSpacing: '-0.02em', fontWeight: 700 as const },
  // headline — screen titles (h1 equivalent)
  headline:{ fontSize: 22, lineHeight: 1.2, letterSpacing: '-0.03em', fontWeight: 800 as const },
  // hero — premium KPI, plan price, big numeric stats
  hero:    { fontSize: 32, lineHeight: 1, letterSpacing: '-0.04em', fontWeight: 800 as const },
} as const;

/**
 * Spacing scale — 4px base grid.
 * Use these for NEW components instead of magic numbers.
 */
export const sp = {
  xxs: 4,    // hairline gap
  xs:  6,    // chip padding
  sm:  8,    // tight gap
  md:  12,   // default gap / card inset
  lg:  16,   // section gap
  xl:  20,   // page padding
  xxl: 28,   // hero spacing
  hero: 40,  // hero padding
} as const;


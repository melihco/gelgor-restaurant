'use client';
import { createContext, useContext, useState } from 'react';

export interface T {
  bg: string;
  surface: string;
  elevated: string;
  glass: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textMuted: string;
  labelColor: string;

  accent: string;
  accentGlow: string;
  accentDim: string;
  accentBorder: string;

  // kept for semantic use only
  gold: string;
  goldDim: string;
  goldBorder: string;
  cyan: string;
  cyanDim: string;

  live: string;      liveDim: string;
  warning: string;   warningDim: string;
  danger: string;    dangerDim: string;
  success: string;   successDim: string;
  info: string;      infoDim: string;

  separator: string;
  separatorStrong: string;

  pillActive: (color: string) => React.CSSProperties;
  pillIdle: React.CSSProperties;
  iconBtn: React.CSSProperties;
  backBtn: React.CSSProperties;
  surfaceCard: React.CSSProperties;
  surfaceGroup: React.CSSProperties;
  surfaceRow: React.CSSProperties;

  // single gradient shortcut for primary CTA only
  gradientAccent: string;
  gradientGold: string;
  gradientSurface: string;

  navBg: string;
  navBorder: string;
  navActiveColor: string;
  navIdleColor: string;

  isDark: boolean;
}

// ─── DARK — Void ──────────────────────────────────────────────────────────
const dark: T = {
  bg:       '#08080F',
  surface:  '#0F0F1C',
  elevated: '#161626',
  glass:    'rgba(8,8,15,0.94)',

  textPrimary:   '#F5F5F8',
  textSecondary: 'rgba(230,230,242,0.65)',
  textTertiary:  'rgba(180,180,200,0.45)',
  textMuted:     'rgba(140,140,160,0.32)',
  labelColor:    'rgba(150,150,175,0.40)',

  accent:       '#8B5CF6',
  accentGlow:   'rgba(139,92,246,0.20)',
  accentDim:    'rgba(139,92,246,0.08)',
  accentBorder: 'rgba(139,92,246,0.16)',

  gold:       '#F59E0B',
  goldDim:    'rgba(245,158,11,0.10)',
  goldBorder: 'rgba(245,158,11,0.18)',

  cyan:    '#22D3EE',
  cyanDim: 'rgba(34,211,238,0.08)',

  live:        '#10B981',  liveDim:     'rgba(16,185,129,0.08)',
  warning:     '#F59E0B',  warningDim:  'rgba(245,158,11,0.08)',
  danger:      '#F87171',  dangerDim:   'rgba(248,113,113,0.08)',
  success:     '#10B981',  successDim:  'rgba(16,185,129,0.08)',
  info:        '#60A5FA',  infoDim:     'rgba(96,165,250,0.08)',

  separator:       'rgba(255,255,255,0.04)',
  separatorStrong: 'rgba(255,255,255,0.07)',

  pillActive: (c) => ({ background: `${c}12`, border: `0.5px solid ${c}24`, color: c }),
  pillIdle:   { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.06)', color: 'rgba(180,180,200,0.45)' },
  iconBtn:    { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.06)' },
  backBtn:    { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.06)' },

  // Minimal cards — one signal only: subtle border
  surfaceCard: {
    background: '#0F0F1C',
    borderRadius: 18,
    border: '0.5px solid rgba(255,255,255,0.05)',
  },
  surfaceGroup: {
    background: '#0F0F1C',
    borderRadius: 18,
    overflow: 'hidden' as const,
    border: '0.5px solid rgba(255,255,255,0.05)',
  },
  surfaceRow: {
    borderBottom: '0.5px solid rgba(255,255,255,0.04)',
    background: 'transparent',
  },

  gradientAccent:  'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
  gradientGold:    'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
  gradientSurface: 'linear-gradient(180deg, #131320 0%, #0F0F1C 100%)',

  navBg:          'rgba(8,8,18,0.85)',
  navBorder:      'rgba(255,255,255,0.06)',
  navActiveColor: '#A78BFA',
  navIdleColor:   'rgba(255,255,255,0.22)',

  isDark: true,
};

// ─── LIGHT — Clean White ───────────────────────────────────────────────────
const light: T = {
  bg:       '#F6F6F9',
  surface:  '#FFFFFF',
  elevated: '#FFFFFF',
  glass:    'rgba(246,246,249,0.94)',

  textPrimary:   '#0A0A14',
  textSecondary: 'rgba(10,10,20,0.60)',
  textTertiary:  '#6A6A82',
  textMuted:     '#ABABBE',
  labelColor:    '#8E8EA6',

  accent:       '#7C3AED',
  accentGlow:   'rgba(124,58,237,0.14)',
  accentDim:    'rgba(124,58,237,0.06)',
  accentBorder: 'rgba(124,58,237,0.14)',

  gold:       '#D97706',
  goldDim:    'rgba(217,119,6,0.07)',
  goldBorder: 'rgba(217,119,6,0.16)',

  cyan:    '#0891B2',
  cyanDim: 'rgba(8,145,178,0.07)',

  live:        '#059669',  liveDim:     'rgba(5,150,105,0.07)',
  warning:     '#D97706',  warningDim:  'rgba(217,119,6,0.07)',
  danger:      '#DC2626',  dangerDim:   'rgba(220,38,38,0.06)',
  success:     '#059669',  successDim:  'rgba(5,150,105,0.07)',
  info:        '#2563EB',  infoDim:     'rgba(37,99,235,0.07)',

  separator:       'rgba(0,0,0,0.06)',
  separatorStrong: 'rgba(0,0,0,0.10)',

  pillActive: (c) => ({ background: `${c}0c`, border: `0.5px solid ${c}20`, color: c }),
  pillIdle:   { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.06)', color: '#8E8EA6' },
  iconBtn:    { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.06)' },
  backBtn:    { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.06)' },

  surfaceCard: {
    background: '#FFFFFF',
    borderRadius: 18,
    border: '0.5px solid rgba(0,0,0,0.06)',
  },
  surfaceGroup: {
    background: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden' as const,
    border: '0.5px solid rgba(0,0,0,0.06)',
  },
  surfaceRow: {
    borderBottom: '0.5px solid rgba(0,0,0,0.05)',
    background: 'transparent',
  },

  gradientAccent:  'linear-gradient(135deg, #7C3AED 0%, #5B21B6 100%)',
  gradientGold:    'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
  gradientSurface: 'linear-gradient(180deg, #FAFAFD 0%, #FFFFFF 100%)',

  navBg:          'rgba(246,246,249,0.92)',
  navBorder:      'rgba(0,0,0,0.08)',
  navActiveColor: '#7C3AED',
  navIdleColor:   'rgba(0,0,0,0.28)',

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

/** Typography — SF Pro hierarchy. One scale, no exceptions. */
export const type = {
  micro:    { fontSize: 10,  lineHeight: 1.3, letterSpacing: '0.06em',  fontWeight: 600 as const },
  small:    { fontSize: 11,  lineHeight: 1.4 },
  body:     { fontSize: 13,  lineHeight: 1.6 },
  bodyLg:   { fontSize: 15,  lineHeight: 1.5 },
  title:    { fontSize: 17,  lineHeight: 1.3, letterSpacing: '-0.02em', fontWeight: 700 as const },
  headline: { fontSize: 22,  lineHeight: 1.2, letterSpacing: '-0.03em', fontWeight: 800 as const },
  display:  { fontSize: 30,  lineHeight: 1.05, letterSpacing: '-0.04em', fontWeight: 900 as const },
} as const;

/** 4px grid. */
export const sp = {
  xxs: 4, xs: 6, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, hero: 44,
} as const;

/** Border radius. */
export const radius = {
  xs: 6, sm: 10, md: 14, lg: 18, xl: 26, pill: 999,
} as const;

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

// ─── SA Steel Chrome palette ────────────────────────────────────────────────
// Derived from SmartAgency logo: cold chrome-steel A mark on near-black canvas.
// Hue: 205–215° (cold blue-steel) | Saturation: 20–35% | No purple/violet.
//
// SA-Steel-50:  #EEF3F7   SA-Steel-100: #D4E0EA   SA-Steel-200: #B0C4D4
// SA-Steel-300: #8AABBD   SA-Steel-400: #6A8EA0   SA-Steel-500: #4D7088
// SA-Steel-600: #355B72   SA-Steel-700: #1E3F55   SA-Steel-800: #0F2535
// ─────────────────────────────────────────────────────────────────────────────

// ─── DARK — SA Void Black + Steel Chrome ─────────────────────────────────────
const dark: T = {
  // Background layers: cold ink-black with slight blue cast (matches logo canvas)
  bg:       '#07090F',
  surface:  '#0C1018',
  elevated: '#131A24',
  glass:    'rgba(7,9,15,0.93)',

  // Typography: cool-white hierarchy
  textPrimary:   '#EEF2F6',
  textSecondary: 'rgba(218,228,238,0.70)',
  textTertiary:  'rgba(178,194,208,0.52)',
  textMuted:     'rgba(148,168,184,0.42)',
  labelColor:    'rgba(152,172,188,0.48)',

  // SA Steel-300 as primary accent — readable on dark, derived from logo wordmark
  accent:       '#8AABBD',
  accentGlow:   'rgba(138,171,189,0.18)',
  accentDim:    'rgba(138,171,189,0.08)',
  accentBorder: 'rgba(138,171,189,0.15)',

  gold:       '#C8A86A',
  goldDim:    'rgba(200,168,106,0.10)',
  goldBorder: 'rgba(200,168,106,0.18)',

  cyan:    '#5BB8CC',
  cyanDim: 'rgba(91,184,204,0.08)',

  live:        '#3CB87A',  liveDim:     'rgba(60,184,122,0.08)',
  warning:     '#C8963A',  warningDim:  'rgba(200,150,58,0.08)',
  danger:      '#D46A6A',  dangerDim:   'rgba(212,106,106,0.08)',
  success:     '#3CB87A',  successDim:  'rgba(60,184,122,0.08)',
  info:        '#6AACCB',  infoDim:     'rgba(106,172,203,0.08)',

  separator:       'rgba(255,255,255,0.04)',
  separatorStrong: 'rgba(255,255,255,0.07)',

  pillActive: (c) => ({ background: `${c}14`, border: `0.5px solid ${c}28`, color: c }),
  pillIdle:   { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)', color: 'rgba(178,194,208,0.55)' },
  iconBtn:    { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)' },
  backBtn:    { background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.08)' },

  surfaceCard: {
    background: '#0C1018',
    borderRadius: 18,
    border: '0.5px solid rgba(255,255,255,0.07)',
  },
  surfaceGroup: {
    background: '#0C1018',
    borderRadius: 18,
    overflow: 'hidden' as const,
    border: '0.5px solid rgba(255,255,255,0.07)',
  },
  surfaceRow: {
    borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    background: 'transparent',
  },

  // SA Steel gradient: Steel-500 → Steel-700 (cold, precise)
  gradientAccent:  'linear-gradient(135deg, #4D7088 0%, #2D5068 100%)',
  gradientGold:    'linear-gradient(135deg, #C8963A 0%, #A07828 100%)',
  gradientSurface: 'linear-gradient(180deg, #0F1520 0%, #0C1018 100%)',

  navBg:          'rgba(7,9,15,0.90)',
  navBorder:      'rgba(255,255,255,0.07)',
  navActiveColor: '#9DBECE',   // Steel-250: bright enough for nav contrast
  navIdleColor:   'rgba(255,255,255,0.20)',

  isDark: true,
};

// ─── LIGHT — Clean Steel White ────────────────────────────────────────────────
const light: T = {
  bg:       '#F4F6F8',
  surface:  '#FFFFFF',
  elevated: '#FFFFFF',
  glass:    'rgba(244,246,248,0.94)',

  textPrimary:   '#080C10',
  textSecondary: 'rgba(8,12,16,0.60)',
  textTertiary:  '#6A7A88',
  textMuted:     '#A8B4BE',
  labelColor:    '#8A9AAA',

  accent:       '#3D6880',
  accentGlow:   'rgba(61,104,128,0.12)',
  accentDim:    'rgba(61,104,128,0.06)',
  accentBorder: 'rgba(61,104,128,0.14)',

  gold:       '#A07828',
  goldDim:    'rgba(160,120,40,0.07)',
  goldBorder: 'rgba(160,120,40,0.16)',

  cyan:    '#1A7A96',
  cyanDim: 'rgba(26,122,150,0.07)',

  live:        '#1A8A5A',  liveDim:     'rgba(26,138,90,0.07)',
  warning:     '#A07828',  warningDim:  'rgba(160,120,40,0.07)',
  danger:      '#B84040',  dangerDim:   'rgba(184,64,64,0.06)',
  success:     '#1A8A5A',  successDim:  'rgba(26,138,90,0.07)',
  info:        '#2A6A90',  infoDim:     'rgba(42,106,144,0.07)',

  separator:       'rgba(0,0,0,0.06)',
  separatorStrong: 'rgba(0,0,0,0.10)',

  pillActive: (c) => ({ background: `${c}0d`, border: `0.5px solid ${c}22`, color: c }),
  pillIdle:   { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.06)', color: '#8A9AAA' },
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

  gradientAccent:  'linear-gradient(135deg, #3D6880 0%, #1E4860 100%)',
  gradientGold:    'linear-gradient(135deg, #A07828 0%, #785A18 100%)',
  gradientSurface: 'linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)',

  navBg:          'rgba(244,246,248,0.92)',
  navBorder:      'rgba(0,0,0,0.08)',
  navActiveColor: '#3D6880',
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

'use client';

import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';

export type BrandThemePalette = {
  primary: string;
  accent: string;
  secondary: string;
};

export function parseThemeHex(raw: unknown, fallback: string): string {
  const match = String(raw ?? '').match(/#[0-9a-fA-F]{3,8}/);
  return match?.[0] ?? fallback;
}

export function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  let r = 0;
  let g = 0;
  let b = 0;
  if (raw.length === 3) {
    r = parseInt(raw[0]! + raw[0], 16);
    g = parseInt(raw[1]! + raw[1], 16);
    b = parseInt(raw[2]! + raw[2], 16);
  } else if (raw.length >= 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

export function brandNavbarBackground(
  palette: BrandThemePalette,
  opts?: { dark?: boolean },
): CSSProperties {
  const dark = opts?.dark !== false;
  const base = dark ? 'rgba(0,0,0,0.94)' : 'rgba(250,250,252,0.94)';
  return {
    background: `
      radial-gradient(ellipse 120% 80% at 15% -20%, ${hexToRgba(palette.primary, dark ? 0.42 : 0.22)} 0%, transparent 55%),
      radial-gradient(ellipse 90% 70% at 85% -10%, ${hexToRgba(palette.accent, dark ? 0.34 : 0.18)} 0%, transparent 50%),
      radial-gradient(ellipse 70% 50% at 50% 100%, ${hexToRgba(palette.secondary, dark ? 0.2 : 0.1)} 0%, transparent 60%),
      ${base}
    `,
    backdropFilter: 'blur(32px) saturate(200%)',
    WebkitBackdropFilter: 'blur(32px) saturate(200%)',
  };
}

export function useBrandThemePalette(): BrandThemePalette {
  const { t } = useTheme();
  const tenantId = useActiveTenantId();

  const { data: themeKit } = useQuery({
    queryKey: ['brand-theme-kit', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/brand-context/${tenantId}/theme`, {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (!res.ok) return null;
      return res.json() as {
        theme?: { palette?: { primary?: string; accent?: string; secondary?: string } };
      };
    },
    staleTime: 120_000,
    enabled: Boolean(tenantId),
  });

  return useMemo(() => {
    const palette = themeKit?.theme?.palette;
    return {
      primary: parseThemeHex(palette?.primary, t.accent),
      accent: parseThemeHex(palette?.accent, t.navActiveColor),
      secondary: parseThemeHex(palette?.secondary, t.accent),
    };
  }, [themeKit, t.accent, t.navActiveColor]);
}

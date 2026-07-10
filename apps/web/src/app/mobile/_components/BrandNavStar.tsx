'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { useTenantBrandContext } from './TenantBrandProvider';
import { useWorkspaceStore } from '@/stores/workspace-store';

const STAR_PATH =
  'M12 2.5l2.8 8.6h9.1l-7.4 5.4 2.8 8.6L12 19.6l-7.3 5.5 2.8-8.6-7.4-5.4h9.1z';

function parseHex(raw: unknown, fallback: string): string {
  const match = String(raw ?? '').match(/#[0-9a-fA-F]{3,8}/);
  return match?.[0] ?? fallback;
}

export function BrandNavStar({
  active,
  onClick,
  onPointerEnter,
}: {
  active: boolean;
  onClick: () => void;
  onPointerEnter?: () => void;
}) {
  const { t } = useTheme();
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const tenantBrand = useTenantBrandContext();

  const { data: themeKit } = useQuery({
    queryKey: ['brand-theme-kit', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const res = await fetch(`/api/brand-context/${tenantId}/theme`, {
        headers: { 'X-Tenant-Id': tenantId },
      });
      if (!res.ok) return null;
      return res.json() as { theme?: { palette?: { primary?: string; accent?: string } } };
    },
    staleTime: 120_000,
    enabled: Boolean(tenantId),
  });

  const { primary, accent } = useMemo(() => {
    const palette = themeKit?.theme?.palette;
    return {
      primary: parseHex(palette?.primary, t.accent),
      accent: parseHex(palette?.accent, t.navActiveColor),
    };
  }, [themeKit, t.accent, t.navActiveColor]);

  const gradId = `brand-nav-star-${tenantId ?? 'default'}`;

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onPointerEnter}
      aria-label="Marka"
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative',
        width: 72,
        height: 72,
        marginTop: -22,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <div
        style={{
          width: 58,
          height: 58,
          margin: '0 auto',
          borderRadius: '50%',
          background: t.isDark ? 'rgba(8,8,16,0.92)' : 'rgba(255,255,255,0.96)',
          border: `1.5px solid ${active ? primary : t.navBorder}`,
          boxShadow: active
            ? `0 8px 28px ${primary}55, 0 0 0 3px ${primary}22`
            : `0 6px 22px ${primary}33, 0 2px 8px rgba(0,0,0,0.18)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease',
          transform: active ? 'scale(1.06)' : 'scale(1)',
        }}
      >
        {tenantBrand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenantBrand.logoUrl}
            alt=""
            style={{
              width: 34,
              height: 34,
              objectFit: 'contain',
              borderRadius: 8,
            }}
          />
        ) : (
          <svg width={34} height={34} viewBox="0 0 24 24" aria-hidden>
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={primary} />
                <stop offset="55%" stopColor={accent} />
                <stop offset="100%" stopColor={primary} />
              </linearGradient>
            </defs>
            <path d={STAR_PATH} fill={`url(#${gradId})`} />
          </svg>
        )}
      </div>
      <span
        style={{
          display: 'block',
          marginTop: 4,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          textAlign: 'center',
          color: active ? primary : t.navIdleColor,
        }}
      >
        Marka
      </span>
    </button>
  );
}

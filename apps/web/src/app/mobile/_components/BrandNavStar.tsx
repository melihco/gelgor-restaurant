'use client';

import { useTheme } from './theme-context';
import { useTenantBrandContext } from './TenantBrandProvider';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { useBrandThemePalette } from './use-brand-theme-palette';

const STAR_PATH =
  'M12 2.5l2.8 8.6h9.1l-7.4 5.4 2.8 8.6L12 19.6l-7.3 5.5 2.8-8.6-7.4-5.4h9.1z';

/** Center nav orb — ~10% larger than legacy 58px circle for thumb reach + logo legibility. */
const NAV_ORB_OUTER = 79;
const NAV_ORB_SIZE = 64;
const NAV_ORB_LIFT = -18;
const NAV_LOGO_SIZE = 46;

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
  const tenantId = useActiveTenantId();
  const tenantBrand = useTenantBrandContext();
  const palette = useBrandThemePalette();
  const { primary, accent } = palette;

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
        width: NAV_ORB_OUTER,
        height: NAV_ORB_OUTER,
        marginTop: NAV_ORB_LIFT,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        outline: 'none',
      }}
    >
      <div
        className={active ? 'sa-chrome-orb-ring sa-chrome-orb-ring--active' : 'sa-chrome-orb-ring'}
        style={{
          width: NAV_ORB_SIZE,
          height: NAV_ORB_SIZE,
          margin: '0 auto',
          borderRadius: '50%',
          background: t.isDark
            ? 'linear-gradient(165deg, rgba(19,26,36,0.98) 0%, rgba(7,9,15,0.96) 100%)'
            : 'linear-gradient(165deg, #FFFFFF 0%, #F4F6F8 100%)',
          border: `1.5px solid ${active ? t.accent : 'rgba(138,171,189,0.28)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: 'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease, border-color 200ms ease',
          transform: active ? 'scale(1.06)' : 'scale(1)',
        }}
      >
        {tenantBrand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenantBrand.logoUrl}
            alt=""
            style={{
              width: NAV_LOGO_SIZE,
              height: NAV_LOGO_SIZE,
              objectFit: 'contain',
              objectPosition: 'center center',
              display: 'block',
            }}
          />
        ) : (
          <svg width={40} height={40} viewBox="0 0 24 24" aria-hidden>
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
    </button>
  );
}

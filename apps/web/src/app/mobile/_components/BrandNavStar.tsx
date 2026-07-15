'use client';

import { useTheme } from './theme-context';
import { useTenantBrandContext } from './TenantBrandProvider';
import { BrandLogoAvatar } from './BrandLogoAvatar';

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
  const tenantBrand = useTenantBrandContext();

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
        <BrandLogoAvatar
          logoUrl={tenantBrand.logoUrl}
          brandName={tenantBrand.brandName}
          size={NAV_LOGO_SIZE}
        />
      </div>
    </button>
  );
}

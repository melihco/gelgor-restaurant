'use client';

import { useTheme } from './theme-context';
import { useTenantBrandContext } from './TenantBrandProvider';
import { BrandLogoAvatar } from './BrandLogoAvatar';

/** Center nav orb — diamond-facet halo + chrome mark. */
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
      {/* Slow diamond facet ring behind the orb */}
      <span
        className={active ? 'sa-chrome-orb-diamond sa-chrome-orb-diamond--active' : 'sa-chrome-orb-diamond'}
        aria-hidden
      />
      <div
        className={active ? 'sa-chrome-orb-ring sa-chrome-orb-ring--active' : 'sa-chrome-orb-ring'}
        style={{
          position: 'relative',
          zIndex: 1,
          width: NAV_ORB_SIZE,
          height: NAV_ORB_SIZE,
          margin: '0 auto',
          borderRadius: '50%',
          background: t.isDark
            ? 'linear-gradient(165deg, rgba(28,36,48,0.98) 0%, rgba(7,9,15,0.97) 100%)'
            : 'linear-gradient(165deg, #FFFFFF 0%, #EEF3F7 55%, #E4EBF1 100%)',
          border: `1.5px solid ${active ? 'rgba(214,228,238,0.72)' : 'rgba(138,171,189,0.32)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease, border-color 220ms ease',
          transform: active ? 'scale(1.07)' : 'scale(1)',
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

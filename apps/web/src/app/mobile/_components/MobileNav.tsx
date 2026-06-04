'use client';
import { useMobileStore } from './mobile-store';
import { useTheme } from './theme-context';
import { CLIENT_NAV_TABS } from './mobile-client-config';

/**
 * Floating pill nav — minimal, Apple-grade restraint.
 * One accent color, no glow rings, no labels except active.
 * The pill shape is the only decoration.
 */
export function MobileNav() {
  const { activeTab, setTab } = useMobileStore();
  const { t } = useTheme();

  return (
    <nav
      aria-label="Ana navigasyon"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        width: 'min(320px, calc(100vw - 32px))',
        height: 54,
        background: t.navBg,
        backdropFilter: 'blur(48px) saturate(180%)',
        WebkitBackdropFilter: 'blur(48px) saturate(180%)',
        borderRadius: 27,
        border: `0.5px solid ${t.navBorder}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 4px',
      }}
    >
      {CLIENT_NAV_TABS.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1,
              height: 46,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              border: 'none',
              background: isActive
                ? (t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)')
                : 'transparent',
              borderRadius: 23,
              cursor: 'pointer',
              padding: '0 4px',
              transition: 'background 150ms ease',
              outline: 'none',
            }}
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill="none"
              stroke={isActive ? t.navActiveColor : t.navIdleColor}
              strokeWidth={isActive ? 2.2 : 1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: 'stroke 150ms ease, stroke-width 150ms ease' }}
            >
              <path d={tab.icon} />
            </svg>

            {/* Label only on active */}
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: t.navActiveColor,
              opacity: isActive ? 1 : 0,
              maxHeight: isActive ? 12 : 0,
              overflow: 'hidden',
              transition: 'opacity 150ms ease, max-height 150ms ease',
              whiteSpace: 'nowrap',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

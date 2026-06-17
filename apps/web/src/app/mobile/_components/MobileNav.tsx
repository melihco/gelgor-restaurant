'use client';
import { useMemo } from 'react';
import { useMobileStore } from './mobile-store';
import { useTheme } from './theme-context';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { CLIENT_NAV_TABS, isMobileOperatorMode } from './mobile-client-config';
import { useMobileArtifacts } from '../_hooks/use-mobile-artifacts';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';

/**
 * Floating pill nav — minimal, Apple-grade restraint.
 * One accent color, no glow rings, no labels except active.
 * The pill shape is the only decoration.
 */
export function MobileNav() {
  const { activeTab, setTab } = useMobileStore();
  const { t } = useTheme();
  const tenantId = useWorkspaceStore((s) => s.tenantId);
  const { data: artifacts = [] } = useMobileArtifacts({
    params: { limit: 80 },
    enabled: Boolean(tenantId),
    subscribeOnly: true,
  });
  const pendingApprovalCount = useMemo(
    () => filterFeedPublishableArtifacts(artifacts).filter((a) => a.status === 'pending_review').length,
    [artifacts],
  );
  const showAllLabels = !isMobileOperatorMode();

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
        const badgeCount = tab.id === 'feed' ? pendingApprovalCount : 0;

        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            onPointerEnter={() => {
              if (tab.id === 'missions') {
                void import('./screens/MissionHub');
              } else if (tab.id === 'feed') {
                void import('./screens/PlatformFeed');
              } else if (tab.id === 'brand') {
                void import('./screens/BrandConstitution');
              }
            }}
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
              position: 'relative',
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
            {badgeCount > 0 && (
              <span style={{
                position: 'absolute',
                top: 6,
                right: 'calc(50% - 18px)',
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: 8,
                background: '#EF4444',
                color: '#fff',
                fontSize: 9,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 0 0 2px ' + (t.isDark ? 'rgba(6,6,14,0.95)' : 'rgba(255,255,255,0.95)'),
              }}>
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}

            {/* Label — aktif sekme veya müşteri modunda tüm sekmeler */}
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
              color: isActive ? t.navActiveColor : t.navIdleColor,
              opacity: (isActive || showAllLabels) ? (isActive ? 1 : 0.72) : 0,
              maxHeight: (isActive || showAllLabels) ? 12 : 0,
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

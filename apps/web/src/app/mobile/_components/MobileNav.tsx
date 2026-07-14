'use client';
import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileStore } from './mobile-store';
import { useTheme } from './theme-context';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import {
  CLIENT_NAV_TABS,
  CLIENT_NAV_MENU,
  isMobileOperatorMode,
  isMoreMenuScreen,
} from './mobile-client-config';
import { useMobileArtifacts } from '../_hooks/use-mobile-artifacts';
import { MOBILE_ARTIFACT_MISSION_POOL_LIMIT, refetchMobileFeedPool } from '../_lib/mobile-artifacts';
import { filterFeedDisplayArtifacts } from '@/lib/weekly-publish-package';
import { BrandNavStar } from './BrandNavStar';

/** Hover prefetch — stale dev chunks after HMR must not surface as runtime errors. */
function safePrefetch(importer: () => Promise<unknown>) {
  void importer().catch((err) => {
    const msg = String(err instanceof Error ? err.message : err);
    const isChunk =
      msg.includes('ChunkLoadError')
      || msg.includes('Loading chunk')
      || msg.includes('Failed to fetch dynamically imported module');
    if (!isChunk) {
      console.warn('[MobileNav] prefetch failed:', msg);
    }
  });
}

type SideTab = (typeof CLIENT_NAV_TABS)[number];

function SideNavButton({
  tab,
  isActive,
  badgeCount,
  showLabel,
  onSelect,
  onPointerEnter,
  t,
}: {
  tab: SideTab;
  isActive: boolean;
  badgeCount: number;
  showLabel: boolean;
  onSelect: () => void;
  onPointerEnter: () => void;
  t: ReturnType<typeof useTheme>['t'];
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerEnter={onPointerEnter}
      aria-label={tab.label}
      aria-current={isActive ? 'page' : undefined}
      style={{
        flex: 1,
        minWidth: 0,
        height: 52,
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
        width={22}
        height={22}
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
          top: 4,
          right: 'calc(50% - 20px)',
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
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        color: isActive ? t.navActiveColor : t.navIdleColor,
        opacity: (isActive || showLabel) ? (isActive ? 1 : 0.72) : 0,
        maxHeight: (isActive || showLabel) ? 12 : 0,
        overflow: 'hidden',
        transition: 'opacity 150ms ease, max-height 150ms ease',
        whiteSpace: 'nowrap',
      }}>
        {tab.label}
      </span>
    </button>
  );
}

function MenuNavButton({
  isActive,
  showLabel,
  onSelect,
  onPointerEnter,
  t,
}: {
  isActive: boolean;
  showLabel: boolean;
  onSelect: () => void;
  onPointerEnter: () => void;
  t: ReturnType<typeof useTheme>['t'];
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onPointerEnter={onPointerEnter}
      aria-label={CLIENT_NAV_MENU.label}
      aria-current={isActive ? 'page' : undefined}
      style={{
        flex: 1,
        minWidth: 0,
        height: 52,
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
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke={isActive ? t.navActiveColor : t.navIdleColor}
        strokeWidth={isActive ? 2.2 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'stroke 150ms ease, stroke-width 150ms ease' }}
      >
        <path d={CLIENT_NAV_MENU.icon} />
      </svg>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        color: isActive ? t.navActiveColor : t.navIdleColor,
        opacity: (isActive || showLabel) ? (isActive ? 1 : 0.72) : 0,
        maxHeight: (isActive || showLabel) ? 12 : 0,
        overflow: 'hidden',
        transition: 'opacity 150ms ease, max-height 150ms ease',
        whiteSpace: 'nowrap',
      }}>
        {CLIENT_NAV_MENU.label}
      </span>
    </button>
  );
}

/**
 * 3-item bottom nav: Akış · Marka (center) · Menü
 */
export function MobileNav() {
  const { activeTab, setTab, navigate, screen, bumpFeedRefresh } = useMobileStore();
  const { t } = useTheme();
  const tenantId = useActiveTenantId();
  const queryClient = useQueryClient();
  const { data: artifacts = [] } = useMobileArtifacts({
    params: { limit: MOBILE_ARTIFACT_MISSION_POOL_LIMIT },
    enabled: Boolean(tenantId),
    subscribeOnly: true,
  });
  const pendingApprovalCount = useMemo(
    () => filterFeedDisplayArtifacts(artifacts).filter((a) => a.status === 'pending_review').length,
    [artifacts],
  );
  const showAllLabels = !isMobileOperatorMode();
  const menuActive = isMoreMenuScreen(screen) || activeTab === 'missions';

  const feedTab = CLIENT_NAV_TABS.find((tab) => tab.id === 'feed')!;

  const prefetchTab = (tabId: SideTab['id']) => {
    if (tabId === 'feed') {
      safePrefetch(() => import('./screens/PlatformFeed'));
    } else if (tabId === 'brand') {
      safePrefetch(() => import('./screens/BrandConstitution'));
    }
  };

  const selectTab = (tabId: SideTab['id']) => {
    if (tabId === 'feed') {
      bumpFeedRefresh();
      if (tenantId) {
        void refetchMobileFeedPool(queryClient, tenantId);
      }
    }
    setTab(tabId);
  };

  const openMenu = () => {
    safePrefetch(() => import('./screens/MoreMenu'));
    navigate('more');
  };

  return (
    <nav
      aria-label="Ana navigasyon"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100,
        width: 'min(420px, calc(100% - 28px))',
        minHeight: 58,
        background: t.navBg,
        backdropFilter: 'blur(48px) saturate(180%)',
        WebkitBackdropFilter: 'blur(48px) saturate(180%)',
        borderRadius: 29,
        border: `0.5px solid ${t.navBorder}`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 6px 6px',
      }}
    >
      <SideNavButton
        tab={feedTab}
        isActive={activeTab === 'feed' && !menuActive}
        badgeCount={pendingApprovalCount}
        showLabel={showAllLabels}
        onSelect={() => selectTab('feed')}
        onPointerEnter={() => prefetchTab('feed')}
        t={t}
      />

      <BrandNavStar
        active={activeTab === 'brand' && !menuActive}
        onClick={() => selectTab('brand')}
        onPointerEnter={() => prefetchTab('brand')}
      />

      <MenuNavButton
        isActive={menuActive}
        showLabel={showAllLabels}
        onSelect={openMenu}
        onPointerEnter={() => safePrefetch(() => import('./screens/MoreMenu'))}
        t={t}
      />
    </nav>
  );
}

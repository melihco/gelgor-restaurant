'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useMobileStore, type MobileScreen, type NavTab } from './mobile-store';
import { resolveClientScreen, tabForMobileScreen } from './mobile-client-config';
import {
  stackUnderlayTab,
  type MobileNavTransition,
} from './mobile-nav-transition';
import { SaChromeShell } from './SaChromeShell';
import { shouldWrapWithSaChrome } from './sa-chrome';
import {
  AICommandCenter,
  CampaignDetail,
  CreativePreview,
  ApprovalFeedback,
  AIActivity,
  BrandConstitution,
  Templates,
  Insights,
  Campaigns,
  Outputs,
  Reviews,
  ReviewDetail,
  AgentsScreen,
  NewBrief,
  AdsOverview,
  MoreMenu,
  NotificationsScreen,
  SettingsScreen,
  VisitorsScreen,
  BillingScreen,
  MissionHub,
  BrandRulesScreen,
  MissionContentFactory,
  PlatformFeed,
  PlatformPreviewStudio,
} from './mobile-screen-loaders';

const TAB_CONFIG: { id: NavTab; screen: MobileScreen }[] = [
  { id: 'feed', screen: 'feed' },
  { id: 'brand', screen: 'brand' },
  { id: 'missions', screen: 'missions' },
];

function renderScreenContent(screen: MobileScreen): ReactNode {
  switch (screen) {
    case 'home':             return <AICommandCenter />;
    case 'campaigns':        return <Campaigns />;
    case 'campaign-detail':  return <CampaignDetail />;
    case 'creative-preview': return <CreativePreview />;
    case 'approval':         return <ApprovalFeedback />;
    case 'ai-activity':      return <AIActivity />;
    case 'brand':            return <BrandConstitution />;
    case 'templates':        return <Templates />;
    case 'insights':         return <Insights />;
    case 'outputs':          return <Outputs />;
    case 'reviews':          return <Reviews />;
    case 'review-detail':    return <ReviewDetail />;
    case 'agents':           return <AgentsScreen />;
    case 'new-brief':        return <NewBrief />;
    case 'ads':              return <AdsOverview />;
    case 'more':             return <MoreMenu />;
    case 'notifications':    return <NotificationsScreen />;
    case 'settings':         return <SettingsScreen />;
    case 'visitors':         return <VisitorsScreen />;
    case 'billing':          return <BillingScreen />;
    case 'missions':         return <MissionHub />;
    case 'brand-rules':      return <BrandRulesScreen />;
    case 'mission-factory':  return <MissionContentFactory />;
    case 'feed':             return <PlatformFeed />;
    case 'platform-preview': return <PlatformPreviewStudio />;
    default:                 return <AICommandCenter />;
  }
}

function renderScreen(screen: MobileScreen): ReactNode {
  const content = renderScreenContent(screen);
  if (!shouldWrapWithSaChrome(screen)) return content;
  return <SaChromeShell>{content}</SaChromeShell>;
}

function tabPaneClass(
  tabId: NavTab,
  visibleTab: NavTab,
  exitingTab: NavTab | null,
  navTransition: MobileNavTransition,
  hasStack: boolean,
): string {
  const isActive = visibleTab === tabId;
  const isExiting = exitingTab === tabId;
  const classes = ['mobile-tab-pane'];
  if (isActive) classes.push('is-active');
  if (isExiting) classes.push('is-exiting');
  if (hasStack) classes.push('is-under-stack');
  if (!hasStack && navTransition === 'tab-left') {
    if (isActive) classes.push('tab-enter-left');
    if (isExiting) classes.push('tab-exit-left');
  }
  if (!hasStack && navTransition === 'tab-right') {
    if (isActive) classes.push('tab-enter-right');
    if (isExiting) classes.push('tab-exit-right');
  }
  return classes.join(' ');
}

function stackLayerClass(navTransition: MobileNavTransition): string {
  const classes = ['mobile-stack-layer'];
  if (navTransition !== 'none') classes.push(`mobile-trans-${navTransition}`);
  return classes.join(' ');
}

export function MobileScreenRouter() {
  const screen = resolveClientScreen(useMobileStore((s) => s.screen));
  const activeTab = useMobileStore((s) => s.activeTab);
  const history = useMobileStore((s) => s.history);
  const navTransition = useMobileStore((s) => s.navTransition);

  const hasStack = history.length > 1;
  const stackScreen = hasStack ? resolveClientScreen(history[history.length - 1]!) : null;
  const visibleTab = hasStack
    ? stackUnderlayTab(history, activeTab, tabForMobileScreen)
    : activeTab;

  const prevVisibleTab = useRef(visibleTab);
  const exitingTab =
    !hasStack && (navTransition === 'tab-left' || navTransition === 'tab-right')
      ? prevVisibleTab.current
      : null;

  useEffect(() => {
    if (navTransition === 'none') {
      prevVisibleTab.current = visibleTab;
    }
  }, [visibleTab, navTransition]);

  useEffect(() => {
    if (navTransition === 'none') return;
    const timer = window.setTimeout(() => {
      useMobileStore.setState({ navTransition: 'none' });
    }, 380);
    return () => window.clearTimeout(timer);
  }, [screen, navTransition]);

  return (
    <div className="mobile-screen-host">
      <div className="mobile-tab-stage" aria-hidden={hasStack}>
        {TAB_CONFIG.map(({ id, screen: tabScreen }) => (
          <div
            key={id}
            className={tabPaneClass(id, visibleTab, exitingTab, navTransition, hasStack)}
            aria-hidden={visibleTab !== id && exitingTab !== id}
            inert={visibleTab !== id && exitingTab !== id ? true : undefined}
          >
            {renderScreen(tabScreen)}
          </div>
        ))}
      </div>

      {hasStack && stackScreen && (
        <div key={stackScreen} className={stackLayerClass(navTransition)}>
          {renderScreen(stackScreen)}
        </div>
      )}
    </div>
  );
}

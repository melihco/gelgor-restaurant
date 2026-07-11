import type { MobileScreen, NavTab } from './mobile-store';

export type MobileNavTransition =
  | 'none'
  | 'forward'
  | 'back'
  | 'tab-left'
  | 'tab-right'
  | 'modal-in'
  | 'modal-out';

/** Bottom-bar root screens — kept mounted for native tab persistence (scroll state). */
export const ROOT_TAB_SCREENS = new Set<MobileScreen>(['feed', 'missions', 'brand']);

/** Full-screen flows without bottom nav — slide up from bottom. */
export const MODAL_MOBILE_SCREENS = new Set<MobileScreen>([
  'creative-preview',
  'approval',
  'new-brief',
  'platform-preview',
]);

const TAB_ORDER: Record<NavTab, number> = {
  feed: 0,
  brand: 1,
  missions: 2,
};

export function tabSlideTransition(from: NavTab, to: NavTab): 'tab-left' | 'tab-right' | 'none' {
  if (from === to) return 'none';
  return TAB_ORDER[to] > TAB_ORDER[from] ? 'tab-left' : 'tab-right';
}

export function transitionForNavigate(
  target: MobileScreen,
  activeTab: NavTab,
  isModal: boolean,
): MobileNavTransition {
  if (isModal) return 'modal-in';
  const tab = target === 'feed' || target === 'missions' || target === 'brand' ? target : null;
  if (tab && tab !== activeTab) return tabSlideTransition(activeTab, tab);
  return 'forward';
}

export function transitionForBack(leaving: MobileScreen): MobileNavTransition {
  return MODAL_MOBILE_SCREENS.has(leaving) ? 'modal-out' : 'back';
}

/** Tab pane visible beneath a pushed stack (preserves feed scroll while overlays are open). */
export function stackUnderlayTab(
  history: MobileScreen[],
  activeTab: NavTab,
  tabForScreen: (screen: MobileScreen) => NavTab | null,
): NavTab {
  if (history.length <= 1) return activeTab;
  for (let i = history.length - 2; i >= 0; i -= 1) {
    const tab = tabForScreen(history[i]!);
    if (tab) return tab;
  }
  return activeTab;
}

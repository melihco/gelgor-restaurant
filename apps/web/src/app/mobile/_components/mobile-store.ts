'use client';
import { create } from 'zustand';
import { resolveClientScreen, tabForMobileScreen } from './mobile-client-config';

export type MobileScreen =
  | 'home'
  | 'campaigns'
  | 'campaign-detail'
  | 'creative-preview'
  | 'approval'
  | 'ai-activity'
  | 'agents'
  | 'brand'
  | 'templates'
  | 'insights'
  // NEW
  | 'outputs'
  | 'reviews'
  | 'review-detail'
  | 'new-brief'
  | 'ads'
  | 'more'
  | 'notifications'
  | 'settings'
  | 'visitors'
  | 'billing'
  | 'missions'
  | 'brand-rules'
  | 'mission-factory'
  | 'feed'
  | 'platform-preview'
  | 'reels-studio'
  | 'canva-templates';

export type NavTab = 'home' | 'content' | 'missions' | 'reviews' | 'more';

interface MobileStore {
  screen: MobileScreen;
  activeTab: NavTab;
  selectedCampaignId: string | null;
  selectedArtifactId: string | null;
  selectedReviewId: string | null;
  history: MobileScreen[];
  // Mission Content Factory params
  missionContentMissionId: string | null;
  missionContentNodeKey: string | null;
  /** Deep-link from Mission Hub BRS checklist → Brand Constitution tab. */
  brandReadinessFix: string | null;
  /** Mission Hub → Feed: pre-select mission filter chip */
  feedMissionFilterId: string | null;

  navigate: (screen: MobileScreen) => void;
  openBrand: (fix?: string) => void;
  openStoryTemplates: () => void;
  clearBrandReadinessFix: () => void;
  setTab: (tab: NavTab) => void;
  openCampaign: (id: string) => void;
  openCreative: (id: string) => void;
  openApproval: (id: string) => void;
  openReview: (id: string) => void;
  openMissionFactory: (missionId: string, nodeKey: string) => void;
  openPlatformPreview: (artifactId: string) => void;
  openFeedForMission: (missionId: string | null) => void;
  clearFeedMissionFilter: () => void;
  goBack: () => void;
}

export const useMobileStore = create<MobileStore>((set, get) => ({
  screen: 'home',
  activeTab: 'home',
  selectedCampaignId: null,
  selectedArtifactId: null,
  selectedReviewId: null,
  history: ['home'],
  missionContentMissionId: null,
  missionContentNodeKey: null,
  brandReadinessFix: null,
  feedMissionFilterId: null,

  navigate: (screen) => {
    const resolved = resolveClientScreen(screen);
    const tab = tabForMobileScreen(resolved);
    set((s) => ({
      screen: resolved,
      history: [...s.history, resolved],
      ...(tab ? { activeTab: tab } : {}),
    }));
  },

  openBrand: (fix) => {
    if (fix === 'story-templates') {
      const resolved = resolveClientScreen('templates');
      const tab = tabForMobileScreen(resolved);
      set((s) => ({
        screen: resolved,
        brandReadinessFix: null,
        history: [...s.history, resolved],
        ...(tab ? { activeTab: tab } : {}),
      }));
      return;
    }
    const tab = tabForMobileScreen('brand');
    set((s) => ({
      screen: 'brand',
      brandReadinessFix: fix ?? null,
      history: [...s.history, 'brand'],
      ...(tab ? { activeTab: tab } : {}),
    }));
  },

  openStoryTemplates: () => {
    const resolved = resolveClientScreen('templates');
    const tab = tabForMobileScreen(resolved);
    set((s) => ({
      screen: resolved,
      history: [...s.history, resolved],
      ...(tab ? { activeTab: tab } : {}),
    }));
  },

  clearBrandReadinessFix: () => set({ brandReadinessFix: null }),

  setTab: (tab) => {
    const map: Record<NavTab, MobileScreen> = {
      home: 'home',
      content: 'feed',
      missions: 'missions',
      reviews: 'reviews',
      more: 'more',
    };
    const screen = resolveClientScreen(map[tab]);
    set({ activeTab: tab, screen, history: [screen] });
  },

  openCampaign: (id) =>
    set((s) => ({ selectedCampaignId: id, screen: 'campaign-detail', history: [...s.history, 'campaign-detail'] })),

  openCreative: (id) =>
    set((s) => ({ selectedArtifactId: id, screen: 'creative-preview', history: [...s.history, 'creative-preview'] })),

  openApproval: (id) =>
    set((s) => ({ selectedArtifactId: id, screen: 'approval', history: [...s.history, 'approval'] })),

  openReview: (id) =>
    set((s) => ({ selectedReviewId: id, screen: 'review-detail', history: [...s.history, 'review-detail'] })),

  openMissionFactory: (missionId, nodeKey) =>
    set((s) => ({
      missionContentMissionId: missionId,
      missionContentNodeKey: nodeKey,
      screen: 'mission-factory',
      history: [...s.history, 'mission-factory'],
    })),

  openPlatformPreview: (artifactId) =>
    set((s) => ({
      selectedArtifactId: artifactId,
      screen: 'platform-preview',
      history: [...s.history, 'platform-preview'],
    })),

  openFeedForMission: (missionId) =>
    set({
      feedMissionFilterId: missionId,
      activeTab: 'content',
      screen: 'feed',
      history: ['feed'],
    }),

  clearFeedMissionFilter: () => set({ feedMissionFilterId: null }),

  goBack: () => {
    const { history } = get();
    if (history.length <= 1) return;
    const next = history.slice(0, -1);
    set({ history: next, screen: next[next.length - 1]! });
  },

}));

'use client';
import { create } from 'zustand';

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

export type NavTab = 'home' | 'content' | 'ai' | 'reviews' | 'more';

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

  navigate: (screen: MobileScreen) => void;
  setTab: (tab: NavTab) => void;
  openCampaign: (id: string) => void;
  openCreative: (id: string) => void;
  openApproval: (id: string) => void;
  openReview: (id: string) => void;
  openMissionFactory: (missionId: string, nodeKey: string) => void;
  openPlatformPreview: (artifactId: string) => void;
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

  navigate: (screen) =>
    set((s) => ({ screen, history: [...s.history, screen] })),

  setTab: (tab) => {
    const map: Record<NavTab, MobileScreen> = {
      home: 'home',
      content: 'feed',
      ai: 'ai-activity',
      reviews: 'reviews',
      more: 'more',
    };
    set({ activeTab: tab, screen: map[tab], history: [map[tab]] });
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

  goBack: () => {
    const { history } = get();
    if (history.length <= 1) return;
    const next = history.slice(0, -1);
    set({ history: next, screen: next[next.length - 1]! });
  },
}));

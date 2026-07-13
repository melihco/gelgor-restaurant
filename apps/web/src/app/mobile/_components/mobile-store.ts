'use client';
import { create } from 'zustand';
import { MOBILE_ARTIFACT_FEED_INITIAL } from '../_lib/mobile-artifacts';
import { resolveClientScreen, tabForMobileScreen } from './mobile-client-config';
import {
  MODAL_MOBILE_SCREENS,
  tabSlideTransition,
  transitionForBack,
  transitionForNavigate,
  type MobileNavTransition,
} from './mobile-nav-transition';
import type { PendingBriefJob } from '@/lib/pending-brief-job';

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

export type NavTab = 'feed' | 'missions' | 'brand';

interface MobileStore {
  screen: MobileScreen;
  activeTab: NavTab;
  selectedCampaignId: string | null;
  selectedArtifactId: string | null;
  selectedReviewId: string | null;
  history: MobileScreen[];
  /** Drives native push/pop/tab/modal animations in MobileScreenRouter. */
  navTransition: MobileNavTransition;
  // Mission Content Factory params
  missionContentMissionId: string | null;
  missionContentNodeKey: string | null;
  /** Deep-link from Mission Hub BRS checklist → Brand Constitution tab. */
  brandReadinessFix: string | null;
  /** Optional BRS/PPR check id for field-level focus (e.g. gallery_coverage). */
  brandReadinessCheckId: string | null;
  /** Mission Hub → Feed: pre-select mission filter chip */
  feedMissionFilterId: string | null;
  /** Progressive feed window — grows on scroll. Shared so the poller refreshes the same cache key. */
  feedListLimit: number;
  /** Brief jobs queued from New Brief — tracked until artifacts land in feed. */
  pendingBriefJobs: PendingBriefJob[];
  /** Incremented when Akış tab is tapped — feed scrolls to top and refetches. */
  feedRefreshNonce: number;

  navigate: (screen: MobileScreen) => void;
  setFeedListLimit: (limit: number) => void;
  openBrand: (fix?: string, checkId?: string) => void;
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
  enqueueBriefProduction: (job: PendingBriefJob) => void;
  bumpFeedRefresh: () => void;
  goBack: () => void;
}

export const useMobileStore = create<MobileStore>((set, get) => ({
  screen: 'feed',
  activeTab: 'feed',
  selectedCampaignId: null,
  selectedArtifactId: null,
  selectedReviewId: null,
  history: ['feed'],
  navTransition: 'none',
  missionContentMissionId: null,
  missionContentNodeKey: null,
  brandReadinessFix: null,
  brandReadinessCheckId: null,
  feedMissionFilterId: null,
  feedListLimit: MOBILE_ARTIFACT_FEED_INITIAL,
  pendingBriefJobs: [],
  feedRefreshNonce: 0,

  setFeedListLimit: (limit) => set((s) => (s.feedListLimit === limit ? s : { feedListLimit: limit })),

  bumpFeedRefresh: () => set((s) => ({ feedRefreshNonce: s.feedRefreshNonce + 1 })),

  navigate: (screen) => {
    const resolved = resolveClientScreen(screen);
    const tab = tabForMobileScreen(resolved);
    set((s) => ({
      screen: resolved,
      history: [...s.history, resolved],
      navTransition: transitionForNavigate(resolved, s.activeTab, MODAL_MOBILE_SCREENS.has(resolved)),
      ...(tab ? { activeTab: tab } : {}),
    }));
  },

  openBrand: (fix, checkId) => {
    const tab = tabForMobileScreen('brand');
    set((s) => ({
      screen: 'brand',
      brandReadinessFix: fix ?? null,
      brandReadinessCheckId: checkId ?? null,
      history: [...s.history, 'brand'],
      navTransition: transitionForNavigate('brand', s.activeTab, false),
      ...(tab ? { activeTab: tab } : {}),
    }));
  },

  openStoryTemplates: () => {
    const resolved = resolveClientScreen('templates');
    const tab = tabForMobileScreen(resolved);
    set((s) => ({
      screen: resolved,
      history: [...s.history, resolved],
      navTransition: 'forward',
      ...(tab ? { activeTab: tab } : {}),
    }));
  },

  clearBrandReadinessFix: () => set({ brandReadinessFix: null, brandReadinessCheckId: null }),

  setTab: (tab) => {
    const map: Record<NavTab, MobileScreen> = {
      feed: 'feed',
      missions: 'missions',
      brand: 'brand',
    };
    const screen = resolveClientScreen(map[tab]);
    set((s) => ({
      activeTab: tab,
      screen,
      history: [screen],
      navTransition: tabSlideTransition(s.activeTab, tab),
    }));
  },

  openCampaign: (id) =>
    set((s) => ({
      selectedCampaignId: id,
      screen: 'campaign-detail',
      history: [...s.history, 'campaign-detail'],
      navTransition: 'forward',
    })),

  openCreative: (id) =>
    set((s) => ({
      selectedArtifactId: id,
      screen: 'creative-preview',
      history: [...s.history, 'creative-preview'],
      navTransition: 'modal-in',
    })),

  openApproval: (id) =>
    set((s) => ({
      selectedArtifactId: id,
      screen: 'approval',
      history: [...s.history, 'approval'],
      navTransition: 'modal-in',
    })),

  openReview: (id) =>
    set((s) => ({
      selectedReviewId: id,
      screen: 'review-detail',
      history: [...s.history, 'review-detail'],
      navTransition: 'forward',
    })),

  openMissionFactory: (missionId, nodeKey) =>
    set((s) => ({
      missionContentMissionId: missionId,
      missionContentNodeKey: nodeKey,
      screen: 'mission-factory',
      history: [...s.history, 'mission-factory'],
      navTransition: 'forward',
    })),

  openPlatformPreview: (artifactId) =>
    set((s) => ({
      selectedArtifactId: artifactId,
      screen: 'platform-preview',
      history: [...s.history, 'platform-preview'],
      navTransition: 'modal-in',
    })),

  openFeedForMission: (missionId) =>
    set((s) => ({
      feedMissionFilterId: missionId,
      activeTab: 'feed',
      screen: 'feed',
      history: ['feed'],
      navTransition: tabSlideTransition(s.activeTab, 'feed'),
    })),

  clearFeedMissionFilter: () => set({ feedMissionFilterId: null }),

  enqueueBriefProduction: (job) =>
    set((s) => ({
      pendingBriefJobs: [...s.pendingBriefJobs.filter((j) => j.id !== job.id), job],
    })),

  goBack: () => {
    const { history } = get();
    if (history.length <= 1) return;
    const leaving = history[history.length - 1]!;
    const next = history.slice(0, -1);
    const prev = next[next.length - 1]!;
    const tab = tabForMobileScreen(prev);
    set({
      history: next,
      screen: prev,
      navTransition: transitionForBack(leaving),
      ...(tab ? { activeTab: tab } : {}),
    });
  },

}));

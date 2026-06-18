'use client';

import dynamic from 'next/dynamic';
import { ScreenSkeleton } from './ScreenSkeleton';
import { BrandLoadingScreen } from './BrandLoadingScreen';

/** Dev hot-reload / stale .next → ChunkLoadError: one automatic full reload per session key. */
function importWithChunkRetry<T extends Record<string, unknown>>(
  key: string,
  importer: () => Promise<T>,
): () => Promise<T> {
  return async () => {
    try {
      return await importer();
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      const isChunk =
        msg.includes('ChunkLoadError')
        || msg.includes('Loading chunk')
        || msg.includes('Failed to fetch dynamically imported module');
      if (isChunk && typeof window !== 'undefined') {
        const storageKey = `chunk-retry:${key}`;
        if (!sessionStorage.getItem(storageKey)) {
          sessionStorage.setItem(storageKey, '1');
          window.location.reload();
          return new Promise(() => {});
        }
      }
      throw err;
    }
  };
}

export const AICommandCenter = dynamic(
  () => import('./screens/AICommandCenter').then((m) => ({ default: m.AICommandCenter })),
  { loading: () => <ScreenSkeleton /> },
);
export const CampaignDetail = dynamic(
  () => import('./screens/CampaignDetail').then((m) => ({ default: m.CampaignDetail })),
  { loading: () => <ScreenSkeleton /> },
);
export const CreativePreview = dynamic(
  () => import('./screens/CreativePreview').then((m) => ({ default: m.CreativePreview })),
  { loading: () => <ScreenSkeleton /> },
);
export const ApprovalFeedback = dynamic(
  () => import('./screens/ApprovalFeedback').then((m) => ({ default: m.ApprovalFeedback })),
  { loading: () => <ScreenSkeleton /> },
);
export const AIActivity = dynamic(
  () => import('./screens/AIActivity').then((m) => ({ default: m.AIActivity })),
  { loading: () => <ScreenSkeleton /> },
);
export const BrandConstitution = dynamic(
  importWithChunkRetry('BrandConstitution', () =>
    import('./screens/BrandConstitution').then((m) => ({ default: m.BrandConstitution }))),
  { loading: () => <ScreenSkeleton />, ssr: false },
);
export const Templates = dynamic(
  () => import('./screens/Templates').then((m) => ({ default: m.Templates })),
  { loading: () => <ScreenSkeleton /> },
);
export const Insights = dynamic(
  () => import('./screens/Insights').then((m) => ({ default: m.Insights })),
  { loading: () => <ScreenSkeleton /> },
);
export const Campaigns = dynamic(
  () => import('./screens/Campaigns').then((m) => ({ default: m.Campaigns })),
  { loading: () => <ScreenSkeleton /> },
);
export const Outputs = dynamic(
  () => import('./screens/Outputs').then((m) => ({ default: m.Outputs })),
  { loading: () => <ScreenSkeleton /> },
);
export const Reviews = dynamic(
  () => import('./screens/Reviews').then((m) => ({ default: m.Reviews })),
  { loading: () => <ScreenSkeleton /> },
);
export const ReviewDetail = dynamic(
  () => import('./screens/Reviews').then((m) => ({ default: m.ReviewDetail })),
  { loading: () => <ScreenSkeleton /> },
);
export const AgentsScreen = dynamic(
  () => import('./screens/AgentsScreen').then((m) => ({ default: m.AgentsScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const NewBrief = dynamic(
  () => import('./screens/NewBrief').then((m) => ({ default: m.NewBrief })),
  { loading: () => <ScreenSkeleton /> },
);
export const AdsOverview = dynamic(
  () => import('./screens/AdsOverview').then((m) => ({ default: m.AdsOverview })),
  { loading: () => <ScreenSkeleton /> },
);
export const MoreMenu = dynamic(
  () => import('./screens/MoreMenu').then((m) => ({ default: m.MoreMenu })),
  { loading: () => <ScreenSkeleton /> },
);
export const NotificationsScreen = dynamic(
  () => import('./screens/NotificationsScreen').then((m) => ({ default: m.NotificationsScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const SettingsScreen = dynamic(
  () => import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const VisitorsScreen = dynamic(
  () => import('./screens/VisitorsScreen').then((m) => ({ default: m.VisitorsScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const BillingScreen = dynamic(
  () => import('./screens/BillingScreen').then((m) => ({ default: m.BillingScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const MissionHub = dynamic(
  importWithChunkRetry('MissionHub', () =>
    import('./screens/MissionHub').then((m) => ({ default: m.MissionHub }))),
  { loading: () => <ScreenSkeleton />, ssr: false },
);
export const BrandRulesScreen = dynamic(
  () => import('./screens/BrandRulesScreen').then((m) => ({ default: m.BrandRulesScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const MissionContentFactory = dynamic(
  importWithChunkRetry('MissionContentFactory', () =>
    import('./screens/MissionContentFactory').then((m) => ({ default: m.MissionContentFactory }))),
  { loading: () => <ScreenSkeleton />, ssr: false },
);
export const PlatformFeed = dynamic(
  importWithChunkRetry('PlatformFeed', () =>
    import('./screens/PlatformFeed').then((m) => ({ default: m.PlatformFeed }))),
  { loading: () => null, ssr: false },
);
export const PlatformPreviewStudio = dynamic(
  importWithChunkRetry('PlatformPreviewStudio', () =>
    import('./screens/PlatformPreviewStudio').then((m) => ({ default: m.PlatformPreviewStudio }))),
  { loading: () => <ScreenSkeleton />, ssr: false },
);
export const ReelsStudio = dynamic(
  () => import('./screens/ReelsStudio').then((m) => ({ default: m.ReelsStudio })),
  { loading: () => <ScreenSkeleton /> },
);

export const LoginScreen = dynamic(
  importWithChunkRetry('LoginScreen', () =>
    import('./screens/LoginScreen').then((m) => ({ default: m.LoginScreen }))),
  { loading: () => <BrandLoadingScreen />, ssr: false },
);

export const OnboardingFlow = dynamic(
  importWithChunkRetry('OnboardingFlow', () =>
    import('./screens/OnboardingFlow').then((m) => ({ default: m.OnboardingFlow }))),
  { loading: () => <BrandLoadingScreen />, ssr: false },
);

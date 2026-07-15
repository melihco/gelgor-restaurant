'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { ScreenSkeleton } from './ScreenSkeleton';
import { BrandLoadingScreen } from './BrandLoadingScreen';

const CHUNK_RETRY_COOLDOWN_MS = 45_000;

function chunkRetryStorageKey(key: string): string {
  return `chunk-retry:${key}`;
}

export function clearChunkRetryKey(key: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(chunkRetryStorageKey(key));
}

function isChunkLoadError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'ChunkLoadError') return true;
  const msg = String(err instanceof Error ? err.message : err);
  return msg.includes('ChunkLoadError')
    || msg.includes('Loading chunk')
    || msg.includes('Failed to fetch dynamically imported module');
}

/**
 * Dev HMR / stale .next chunks → auto-reload once per cooldown window.
 * After that, callers should show a manual retry UI (see LazyMobileScreen).
 */
function importWithChunkRetry<T extends Record<string, unknown>>(
  key: string,
  importer: () => Promise<T>,
): () => Promise<T> {
  return async () => {
    try {
      const mod = await importer();
      clearChunkRetryKey(key);
      return mod;
    } catch (err) {
      if (isChunkLoadError(err) && typeof window !== 'undefined') {
        const storageKey = chunkRetryStorageKey(key);
        const lastRaw = sessionStorage.getItem(storageKey);
        const last = lastRaw ? Number(lastRaw) : 0;
        const now = Date.now();
        if (!lastRaw || !Number.isFinite(last) || now - last > CHUNK_RETRY_COOLDOWN_MS) {
          sessionStorage.setItem(storageKey, String(now));
          const url = new URL(window.location.href);
          url.searchParams.set('_chunk', String(now));
          window.location.replace(url.toString());
          return new Promise(() => {});
        }
      }
      throw err;
    }
  };
}

function ChunkLoadRecovery({
  screenLabel,
  onRetry,
}: {
  screenLabel: string;
  onRetry: () => void;
}) {
  return (
    <div style={{ padding: '32px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
        {screenLabel} yüklenemedi
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55, marginBottom: 16 }}>
        Dev sunucusu kodu yenilediğinde eski JS parçası kalabilir. Sayfayı yenileyin veya tekrar deneyin.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onRetry}
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            border: 'none',
            background: '#8AABBD',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Tekrar dene
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            border: '0.5px solid rgba(255,255,255,0.15)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sayfayı yenile
        </button>
      </div>
    </div>
  );
}

const screenModuleCache = new Map<string, ComponentType>();

/** Warm a tab screen chunk so the first tap skips the loading shell. */
export function prefetchMobileScreen(
  loadKey: string,
  importer: () => Promise<{ default: ComponentType }>,
): Promise<ComponentType> {
  const cached = screenModuleCache.get(loadKey);
  if (cached) return Promise.resolve(cached);
  return importWithChunkRetry(loadKey, importer)().then((mod) => {
    screenModuleCache.set(loadKey, mod.default);
    return mod.default;
  });
}

function LazyMobileScreen({
  loadKey,
  screenLabel,
  importer,
  loading = <ScreenSkeleton />,
}: {
  loadKey: string;
  screenLabel: string;
  importer: () => Promise<{ default: ComponentType }>;
  loading?: ReactNode;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(
    () => screenModuleCache.get(loadKey) ?? null,
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (screenModuleCache.has(loadKey)) {
      setComponent(() => screenModuleCache.get(loadKey)!);
      return;
    }
    let active = true;
    setFailed(false);
    prefetchMobileScreen(loadKey, importer)
      .then((Resolved) => {
        if (active) setComponent(() => Resolved);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
    // importer is stable per loadKey; re-run only on manual retry.
  }, [loadKey, attempt]);

  if (Component) return <Component />;
  if (failed) {
    return (
      <ChunkLoadRecovery
        screenLabel={screenLabel}
        onRetry={() => {
          clearChunkRetryKey(loadKey);
          setComponent(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  return loading;
}

export function BrandConstitution() {
  return (
    <LazyMobileScreen
      loadKey="BrandConstitution"
      screenLabel="Marka profili"
      importer={() => import('./screens/BrandConstitution').then((m) => ({ default: m.BrandConstitution }))}
    />
  );
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
export function MoreMenu() {
  return (
    <LazyMobileScreen
      loadKey="MoreMenu"
      screenLabel="Menü"
      loading={null}
      importer={() => import('./screens/MoreMenu').then((m) => ({ default: m.MoreMenu }))}
    />
  );
}
export const NotificationsScreen = dynamic(
  () => import('./screens/NotificationsScreen').then((m) => ({ default: m.NotificationsScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export function SettingsScreen() {
  return (
    <LazyMobileScreen
      loadKey="SettingsScreen"
      screenLabel="Entegrasyonlar"
      importer={() => import('./screens/SettingsScreen').then((m) => ({ default: m.SettingsScreen }))}
    />
  );
}
export const VisitorsScreen = dynamic(
  () => import('./screens/VisitorsScreen').then((m) => ({ default: m.VisitorsScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const BillingScreen = dynamic(
  () => import('./screens/BillingScreen').then((m) => ({ default: m.BillingScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export function MissionHub() {
  return (
    <LazyMobileScreen
      loadKey="MissionHub"
      screenLabel="Görevler"
      importer={() => import('./screens/MissionHub').then((m) => ({ default: m.MissionHub }))}
    />
  );
}
export const BrandRulesScreen = dynamic(
  () => import('./screens/BrandRulesScreen').then((m) => ({ default: m.BrandRulesScreen })),
  { loading: () => <ScreenSkeleton /> },
);
export const MissionContentFactory = dynamic(
  importWithChunkRetry('MissionContentFactory', () =>
    import('./screens/MissionContentFactory').then((m) => ({ default: m.MissionContentFactory }))),
  { loading: () => <ScreenSkeleton />, ssr: false },
);
export function PlatformFeed() {
  return (
    <LazyMobileScreen
      loadKey="PlatformFeed"
      screenLabel="Feed"
      importer={() => import('./screens/PlatformFeed').then((m) => ({ default: m.PlatformFeed }))}
      loading={null}
    />
  );
}
export const PlatformPreviewStudio = dynamic(
  importWithChunkRetry('PlatformPreviewStudio', () =>
    import('./screens/PlatformPreviewStudio').then((m) => ({ default: m.PlatformPreviewStudio }))),
  { loading: () => <ScreenSkeleton />, ssr: false },
);
export function InstagramProfile() {
  return (
    <LazyMobileScreen
      loadKey="InstagramProfile"
      screenLabel="Profil"
      loading={null}
      importer={() => import('./screens/InstagramProfile').then((m) => ({ default: m.InstagramProfile }))}
    />
  );
}
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

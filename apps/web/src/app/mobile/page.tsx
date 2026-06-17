'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMobileStore } from './_components/mobile-store';
import { MobileThemeProvider, useTheme } from './_components/theme-context';
import { useAuthStore } from './_components/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { MobileNav } from './_components/MobileNav';
import { ProfileSheet } from './_components/ProfileSheet';
import { apiClient } from '@/lib/api-client';
import { getSessionToken } from '@/lib/session-token';
import { invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { BrandLoadingScreen } from './_components/BrandLoadingScreen';

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
  ReelsStudio,
} from './_components/mobile-screen-loaders';
import { MobileArtifactsPoller } from './_components/MobileArtifactsPoller';
import { TenantBrandProvider } from './_components/TenantBrandProvider';
import { resolveClientScreen } from './_components/mobile-client-config';

const LoginScreen = dynamic(
  () => import('./_components/screens/LoginScreen').then((m) => ({ default: m.LoginScreen })),
  { loading: () => <BrandLoadingScreen /> },
);
const OnboardingFlow = dynamic(
  () => import('./_components/screens/OnboardingFlow').then((m) => ({ default: m.OnboardingFlow })),
  { loading: () => <BrandLoadingScreen /> },
);

/* ─── Mobile-scoped CSS ──────────────────────────────────────────────
 * IMPORTANT: All rules MUST be scoped to .sa-mobile to avoid leaking
 * into the admin panel. Never target html/body/::webkit-scrollbar globally.
 * ─────────────────────────────────────────────────────────────────── */
const CSS = `
  /* Scoped wrapper — all mobile styles must live under .sa-mobile */
  .sa-mobile, .sa-mobile *,
  .sa-mobile *::before, .sa-mobile *::after {
    -webkit-tap-highlight-color: transparent;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    box-sizing: border-box;
  }
  .sa-mobile {
    overscroll-behavior: none;
    -webkit-overflow-scrolling: touch;
  }
  .sa-mobile ::-webkit-scrollbar { display: none; }
  .sa-mobile button {
    -webkit-appearance: none; appearance: none;
    font-family: inherit; letter-spacing: inherit;
  }
  .sa-mobile button:active { opacity: 0.75; transform: scale(0.975); }
  .sa-mobile input, .sa-mobile textarea { font-family: inherit; }
  .sa-mobile input::placeholder, .sa-mobile textarea::placeholder {
    color: rgba(140,140,160,0.4);
  }

  /* ── Font settings (safe to apply globally) ── */
  :root {
    -webkit-text-size-adjust: 100%;
  }

  /* ── Keyframes ── */
  @keyframes liveGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.50); }
    50%      { box-shadow: 0 0 0 7px rgba(16,185,129,0); }
  }
  @keyframes violetGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(138,171,189,0.45); }
    50%      { box-shadow: 0 0 0 9px rgba(138,171,189,0); }
  }
  @keyframes goldGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0.45); }
    50%      { box-shadow: 0 0 0 8px rgba(245,158,11,0); }
  }
  @keyframes shimmer {
    0%,100% { opacity: 0.30; } 50% { opacity: 1; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleUp {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spinSlow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes breathe {
    0%,100% { transform: scale(1);    opacity: 0.55; }
    50%      { transform: scale(1.07); opacity: 1;   }
  }
  @keyframes fabPulse {
    0%,100% { box-shadow: 0 4px 20px rgba(138,171,189,0.4); }
    50%      { box-shadow: 0 4px 28px rgba(138,171,189,0.65), 0 0 0 6px rgba(138,171,189,0.12); }
  }
  @keyframes cardEnter {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes storyProgress {
    from { width: 0%; }
    to   { width: 100%; }
  }
  @keyframes marquee {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes navPop {
    0%   { opacity: 0; transform: translateY(12px) scale(0.95); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes splashLogoIn {
    from { opacity: 0; transform: scale(0.9) translateY(10px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes laserHaloOrbit {
    0%   { transform: rotateX(68deg) rotateZ(0deg) scale(0.995); opacity: 0.34; }
    50%  { transform: rotateX(68deg) rotateZ(180deg) scale(1.022); opacity: 0.48; }
    100% { transform: rotateX(68deg) rotateZ(360deg) scale(0.995); opacity: 0.34; }
  }
  @keyframes laserScanMove {
    0%   { left: -20%; opacity: 0; }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { left: 120%; opacity: 0; }
  }
  @keyframes laserScanDot {
    0%, 100% { opacity: 0.2; transform: scale(0.6); }
    50%      { opacity: 1; transform: scale(1.2); }
  }
  @keyframes laserGridPulse {
    0%, 100% { opacity: 0.18; }
    50%      { opacity: 0.3; }
  }
  @keyframes laserCoreFloat {
    0%, 100% { transform: translateY(0) scale(1); }
    50%      { transform: translateY(-3px) scale(1.012); }
  }

  .sa-mobile .splash-logo { animation: splashLogoIn 520ms cubic-bezier(0.34,1.2,0.64,1) both; }

  /* ── 3D Laser / Drone Show ── */
  .sa-mobile .brand-laser-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    perspective: 900px;
  }
  .sa-mobile .brand-laser-stage--md { width: min(390px, 94vw); height: min(360px, 86vw); }
  .sa-mobile .brand-laser-stage--sm { width: min(285px, 84vw); height: min(250px, 74vw); }
  .sa-mobile .brand-laser-stage--lg { width: min(450px, 96vw); height: min(410px, 90vw); }

  .sa-mobile .brand-laser-perspective {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sa-mobile .brand-laser-grid {
    position: absolute;
    width: 140%;
    height: 55%;
    bottom: -8%;
    left: -20%;
    background:
      linear-gradient(rgba(77,112,136,0.12) 1px, transparent 1px),
      linear-gradient(90deg, rgba(77,112,136,0.12) 1px, transparent 1px);
    background-size: 28px 28px;
    transform: rotateX(68deg);
    transform-origin: center bottom;
    mask-image: radial-gradient(ellipse 70% 80% at 50% 100%, #000 20%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse 70% 80% at 50% 100%, #000 20%, transparent 75%);
    opacity: 0.28;
    animation: laserGridPulse 7.5s ease-in-out infinite;
    pointer-events: none;
  }

  .sa-mobile .brand-laser-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid transparent;
    pointer-events: none;
    top: 50%;
    left: 50%;
    transform-style: preserve-3d;
    box-shadow: 0 0 18px rgba(157,190,206,0.12);
    filter: blur(0.15px);
  }
  .sa-mobile .brand-laser-ring--halo-1 {
    width: 122%;
    height: 70%;
    margin-left: -61%;
    margin-top: -35%;
    border-color: rgba(157,190,206,0.2);
    border-top-color: rgba(34,211,238,0.3);
    border-bottom-color: rgba(77,112,136,0.14);
    box-shadow:
      0 0 28px rgba(157,190,206,0.12),
      inset 0 0 18px rgba(255,255,255,0.02);
    animation: laserHaloOrbit 12.5s ease-in-out infinite;
  }
  .sa-mobile .brand-laser-ring--halo-2 {
    width: 102%;
    height: 58%;
    margin-left: -51%;
    margin-top: -29%;
    border-color: rgba(176,196,212,0.12);
    border-top-color: rgba(255,255,255,0.16);
    border-bottom-color: rgba(34,211,238,0.1);
    box-shadow:
      0 0 20px rgba(176,196,212,0.08),
      inset 0 0 14px rgba(255,255,255,0.015);
    animation: laserHaloOrbit 12.5s ease-in-out infinite;
    animation-delay: -6.25s;
  }

  .sa-mobile .brand-laser-core {
    position: relative;
    z-index: 5;
    animation: laserCoreFloat 5.8s ease-in-out infinite, splashLogoIn 700ms cubic-bezier(0.22,1,0.36,1) both;
  }

  .sa-mobile .brand-loader-breathe {
    animation: brandLoaderBreathe 2.8s ease-in-out infinite;
  }
  @keyframes brandLoaderBreathe {
    0%, 100% { opacity: 0.9; transform: scale(0.988); }
    50% { opacity: 1; transform: scale(1); }
  }

  .sa-mobile .brand-loader-logo {
    width: min(280px, 72vw);
    max-width: 280px;
    height: auto !important;
    filter: drop-shadow(0 8px 24px rgba(0,0,0,0.18));
  }
  .sa-mobile .brand-loader-logo--sm {
    width: min(168px, 48vw);
    max-width: 168px;
    filter: drop-shadow(0 6px 18px rgba(0,0,0,0.14));
  }

  .sa-mobile .brand-grouped-fields > *:not(:last-child) {
    border-bottom: 0.5px solid rgba(255,255,255,0.05);
  }
  .sa-mobile[data-theme="light"] .brand-grouped-fields > *:not(:last-child) {
    border-bottom: 0.5px solid rgba(0,0,0,0.06);
  }

  /* Scan bar under logo */
  .sa-mobile .brand-laser-scan {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: min(200px, 55vw);
  }
  .sa-mobile .brand-laser-scan--sm { width: min(140px, 45vw); gap: 8px; }
  .sa-mobile .brand-laser-scan-track {
    position: relative;
    width: 100%;
    height: 2px;
    border-radius: 2px;
    background: rgba(77,112,136,0.14);
    overflow: hidden;
  }
  .sa-mobile .brand-laser-scan-head {
    position: absolute;
    top: -1px;
    width: 28%;
    height: 4px;
    border-radius: 4px;
    background: linear-gradient(90deg, transparent, #22D3EE, #9DBECE, #fff, #9DBECE, transparent);
    box-shadow: 0 0 12px rgba(34,211,238,0.8), 0 0 24px rgba(157,190,206,0.5);
    animation: laserScanMove 2.4s ease-in-out infinite;
  }
  .sa-mobile .brand-laser-scan-dots {
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  .sa-mobile .brand-laser-scan-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: linear-gradient(145deg, #E8E8F0, #9DBECE);
    box-shadow: 0 0 8px rgba(157,190,206,0.5);
    animation: laserScanDot 1.6s ease-in-out infinite;
    animation-delay: calc(var(--scan-i) * 0.12s);
  }
  .sa-mobile .brand-laser-scan--sm .brand-laser-scan-dot { width: 4px; height: 4px; }
  @keyframes shimmerSlide {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  .sa-mobile .screen-enter { animation: fadeUp 300ms cubic-bezier(0.22,1,0.36,1) both; }
  .sa-mobile .nav-enter   { animation: navPop 360ms cubic-bezier(0.34,1.2,0.64,1) both; }

  /* ── Desktop phone frame (≥ 768px) ── */
  @media (min-width: 768px) {
    .sa-mobile-outer {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      background: linear-gradient(165deg, #0F1520 0%, #08090F 50%, #050608 100%);
    }

    .sa-mobile-frame {
      position: relative;
      width: 393px;       /* iPhone 14 Pro logical width */
      height: 100vh;
      max-height: 100dvh;
      overflow: hidden;
      flex-shrink: 0;
      /* Key: transform makes position:fixed descendants use THIS as containing block */
      transform: translateZ(0);
      /* Subtle device-edge borders */
      border-left:  0.5px solid rgba(255,255,255,0.09);
      border-right: 0.5px solid rgba(255,255,255,0.09);
      box-shadow:
        -24px 0 80px rgba(0,0,0,0.55),
         24px 0 80px rgba(0,0,0,0.55);
    }
  }

  /* Mobile: wrappers are transparent layout containers */
  @media (max-width: 767px) {
    .sa-mobile-outer { display: contents; }
    .sa-mobile-frame { display: contents; }
  }
`;

const NO_NAV = new Set(['creative-preview', 'approval', 'new-brief', 'platform-preview']);

function ScreenRouter() {
  const screen = resolveClientScreen(useMobileStore(s => s.screen));
  const node = (() => {
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
      case 'reels-studio':     return <ReelsStudio />;
      default:                 return <AICommandCenter />;
    }
  })();
  return <div key={screen} className="screen-enter">{node}</div>;
}

function Splash() {
  return <BrandLoadingScreen />;
}

function AppShell() {
  const { t } = useTheme();
  const isChecking = useAuthStore((s) => s.isChecking);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);
  const showProfile = useAuthStore((s) => s.showProfile);
  const closeProfile = useAuthStore((s) => s.closeProfile);
  const { setTenantFromSession, tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();
  const screen = useMobileStore(s => s.screen);
  const noNav = NO_NAV.has(screen);

  // Show login form vs onboarding
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    // Mobile auth is token-driven. If there is no local JWT, never auto-login
    // from demo/cookie fallback after refresh.
    if (!getSessionToken()) {
      setUser(null);
      setShowLogin(true);
      return;
    }

    apiClient.getCurrentUserSecurity()
      .then(me => {
        if (me.isDemoFallback) {
          setUser(null);
          setShowLogin(true);
          return;
        }
        // Sync workspace store with the authenticated user's tenant.
        // This is the critical fix: without this, tenantId stays as DEFAULT_TENANT_ID
        // (000...001 / Sunu Event) on every page reload regardless of who is logged in.
        if (me.tenantId) {
          setTenantFromSession(me.tenantId);
          invalidateTenantBrandQueries(me.tenantId);
        }
        setUser(me);
      })
      .catch(() => setUser(null));
  }, [setUser, setTenantFromSession]);

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;
    const prefetch = () => {
      void import('./_components/screens/PlatformFeed');
      void import('./_components/screens/MissionHub');
      void queryClient.prefetchQuery({
        queryKey: ['missions', tenantId],
        queryFn: () => apiClient.listMissionsForHub(tenantId),
        staleTime: 45_000,
      });
    };
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(prefetch, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(prefetch, 800);
    return () => clearTimeout(t);
  }, [isAuthenticated, tenantId, queryClient]);

  useEffect(() => {
    const onAuthChanged = () => {
      // setSessionToken() fires this on login/register too — only show login after logout.
      if (!getSessionToken()) {
        setShowLogin(true);
      } else if (!useAuthStore.getState().isAuthenticated) {
        // Mid-onboarding token (signup) — stay on plans/welcome, not login form.
        setShowLogin(false);
      }
    };
    window.addEventListener('smartagency-auth-changed', onAuthChanged);
    return () => window.removeEventListener('smartagency-auth-changed', onAuthChanged);
  }, []);

  const base: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: t.bg,
    fontFamily: '-apple-system,"SF Pro Display","SF Pro Text",system-ui,sans-serif',
    color: t.textPrimary,
    transition: 'background 250ms ease',
  };

  if (isChecking) return <div style={base}><Splash /></div>;

  if (!isAuthenticated) {
    if (showLogin) {
      return (
        <div style={base}>
          <LoginScreen />
          <div style={{ position: 'fixed', bottom: 32, left: 0, right: 0, textAlign: 'center', zIndex: 10 }}>
            <button onClick={() => setShowLogin(false)} style={{ fontSize: 13, color: 'rgba(148,163,184,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}>
              ← Yeni hesap oluştur
            </button>
          </div>
        </div>
      );
    }
    return (
      <div style={base}>
        <OnboardingFlow
          onComplete={async () => {
            // Signup saved the token; now load the user to flip isAuthenticated → true
            // This transitions AppShell to the main app ONLY after Welcome step
            try {
              const me = await apiClient.getCurrentUserSecurity();
              if (me.isDemoFallback) {
                setUser(null);
                setShowLogin(true);
                return;
              }
              // Sync workspace store to the newly registered tenant before rendering main app
              if (me.tenantId) {
                setTenantFromSession(me.tenantId);
                invalidateTenantBrandQueries(me.tenantId);
              }
              setUser(me);
            } catch {
              setUser(null);
            }
          }}
          onLogin={() => setShowLogin(true)}
        />
      </div>
    );
  }

  return (
    <>
      <div style={{
        ...base,
        overflowY: noNav ? 'hidden' : 'auto',
        // Extra padding for floating pill nav (58px pill + 18px gap + safe area)
        paddingBottom: noNav ? 0 : 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
      }}>
        <ScreenRouter />
      </div>
      {!noNav && <MobileNav />}
      {showProfile && <ProfileSheet onClose={closeProfile} />}
    </>
  );
}

export default function MobilePage() {
  return (
    <MobileThemeProvider>
      <style>{CSS}</style>
      {/* Outer backdrop (desktop only — mobile: display:contents) */}
      <div className="sa-mobile-outer">
        {/* Phone frame: transform:translateZ(0) captures position:fixed children */}
        <div className="sa-mobile-frame">
          {/* sa-mobile scopes all CSS rules — prevents leaking into admin panel */}
          <div className="sa-mobile" style={{ display: 'contents' }}>
            <TenantBrandProvider>
              <MobileArtifactsPoller />
              <AppShell />
            </TenantBrandProvider>
          </div>
        </div>
      </div>
    </MobileThemeProvider>
  );
}

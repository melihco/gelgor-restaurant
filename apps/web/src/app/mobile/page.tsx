'use client';
import { useEffect, useState } from 'react';
import { useMobileStore } from './_components/mobile-store';
import { MobileThemeProvider, useTheme } from './_components/theme-context';
import { useAuthStore } from './_components/auth-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { MobileNav } from './_components/MobileNav';
import { ProfileSheet } from './_components/ProfileSheet';
import { LoginScreen } from './_components/screens/LoginScreen';
import { OnboardingFlow } from './_components/screens/OnboardingFlow';
import { apiClient } from '@/lib/api-client';
import { getSessionToken } from '@/lib/session-token';
import { invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';

import { AICommandCenter }    from './_components/screens/AICommandCenter';
import { CampaignDetail }     from './_components/screens/CampaignDetail';
import { CreativePreview }    from './_components/screens/CreativePreview';
import { ApprovalFeedback }   from './_components/screens/ApprovalFeedback';
import { AIActivity }         from './_components/screens/AIActivity';
import { BrandConstitution }  from './_components/screens/BrandConstitution';
import { Templates }          from './_components/screens/Templates';
import { Insights }           from './_components/screens/Insights';
import { Campaigns }          from './_components/screens/Campaigns';
import { Outputs }            from './_components/screens/Outputs';
import { Reviews, ReviewDetail } from './_components/screens/Reviews';
import { AgentsScreen }       from './_components/screens/AgentsScreen';
import { NewBrief }           from './_components/screens/NewBrief';
import { AdsOverview }        from './_components/screens/AdsOverview';
import { MoreMenu }           from './_components/screens/MoreMenu';
import { NotificationsScreen }from './_components/screens/NotificationsScreen';
import { SettingsScreen }     from './_components/screens/SettingsScreen';
import { VisitorsScreen }     from './_components/screens/VisitorsScreen';
import { BillingScreen }      from './_components/screens/BillingScreen';
import { MissionHub }            from './_components/screens/MissionHub';
import { BrandRulesScreen }      from './_components/screens/BrandRulesScreen';
import { MissionContentFactory } from './_components/screens/MissionContentFactory';
import { PlatformFeed }          from './_components/screens/PlatformFeed';
import { PlatformPreviewStudio } from './_components/screens/PlatformPreviewStudio';
import { ReelsStudio }           from './_components/screens/ReelsStudio';
import CanvaTemplatesScreen      from './_components/screens/CanvaTemplatesScreen';

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
    0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.55); }
    50%      { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
  }
  @keyframes violetGlow {
    0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.45); }
    50%      { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
  }
  @keyframes shimmer {
    0%,100% { opacity: 0.35; } 50% { opacity: 1; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes scaleUp {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes spinSlow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes breathe {
    0%,100% { transform: scale(1);    opacity: 0.6; }
    50%      { transform: scale(1.06); opacity: 1;   }
  }
  @keyframes storyProgress {
    from { width: 0%; }
    to   { width: 100%; }
  }
  @keyframes marquee {
    0%   { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }
  @keyframes shimmerSlide {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  @keyframes canvaBadgePop {
    0%   { opacity: 0; transform: scale(0.6) translateY(-4px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }

  .sa-mobile .screen-enter { animation: fadeUp 280ms cubic-bezier(0.34,1.2,0.64,1) both; }
`;

const NO_NAV = new Set(['creative-preview', 'approval', 'new-brief', 'platform-preview']);

function ScreenRouter() {
  const screen = useMobileStore(s => s.screen);
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
      case 'canva-templates':  return <CanvaTemplatesScreen />;
      default:                 return <AICommandCenter />;
    }
  })();
  return <div key={screen} className="screen-enter">{node}</div>;
}

function Splash() {
  const { t } = useTheme();
  return (
    <div style={{ height: '100dvh', background: t.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <div style={{ width: 64, height: 64, borderRadius: 20, overflow: 'hidden', boxShadow: '0 0 40px rgba(124,58,237,0.4)' }}>
        <SmartAgencyLogo variant="markOnly" priority className="!h-16 !w-16 !rounded-[20px]" />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(167,139,250,0.5)', animation: `shimmer 1.4s ease-in-out ${i*0.18}s infinite` }} />
        ))}
      </div>
    </div>
  );
}

function AppShell() {
  const { t } = useTheme();
  const { isChecking, isAuthenticated, setUser, showProfile, closeProfile } = useAuthStore();
  const { setTenantFromSession } = useWorkspaceStore();
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
      <div style={{ ...base, overflowY: noNav ? 'hidden' : 'auto' }}>
        <ScreenRouter />
        {!noNav && <MobileNav />}
      </div>
      {showProfile && <ProfileSheet onClose={closeProfile} />}
    </>
  );
}

export default function MobilePage() {
  return (
    <MobileThemeProvider>
      <style>{CSS}</style>
      {/* sa-mobile scopes all CSS rules — prevents leaking into admin panel */}
      <div className="sa-mobile" style={{ display: 'contents' }}>
        <AppShell />
      </div>
    </MobileThemeProvider>
  );
}

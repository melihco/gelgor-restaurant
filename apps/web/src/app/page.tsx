'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigationStore } from '@/stores/navigation-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';
import { getSessionToken } from '@/lib/session-token';
import { cn } from '@/lib/utils';
import AIDashboard from '@/components/dashboard/AIDashboard';
import SetupWizard from '@/components/setup/SetupWizard';
import AgentsPage from '@/components/pages/AgentsPage';
import ReviewsPage from '@/components/pages/ReviewsPage';
import ContentPage from '@/components/pages/ContentPage';
import BrandHubPage from '@/components/pages/BrandHubPage';
import AdsPage from '@/components/pages/AdsPage';
import VisitorPage from '@/components/pages/VisitorPage';
import OutputsPage from '@/components/pages/OutputsPage';
import ApprovalsPage from '@/components/pages/ApprovalsPage';
import ExecutionsPage from '@/components/pages/ExecutionsPage';
import BillingPage from '@/components/pages/BillingPage';
import { ReadinessPage, ReportsPage, SeoPage, SettingsPage } from '@/components/pages/SystemCommandPages';
import AssignTaskModal from '@/components/dashboard/AssignTaskModal';
import ArtifactCenter from '@/components/dashboard/ArtifactCenter';
import AgentDetailPanel from '@/components/dashboard/AgentDetailPanel';
import AppHeader from '@/tailadmin/layout/AppHeader';
import AppSidebar from '@/tailadmin/layout/AppSidebar';
import Backdrop from '@/tailadmin/layout/Backdrop';
import { useSidebar } from '@/tailadmin/context/SidebarContext';
import Button from '@/tailadmin/components/ui/button/Button';
import Label from '@/tailadmin/components/form/Label';
import Input from '@/tailadmin/components/form/input/InputField';
import Badge from '@/tailadmin/components/ui/badge/Badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/tailadmin/Card';
import { ClientErrorBoundary } from '@/components/client-error-boundary';

function PageContent({ page }: { page: string }) {
  switch (page) {
    case 'dashboard': return <AIDashboard />;
    case 'agents': return <AgentsPage />;
    case 'reviews': return <ReviewsPage />;
    case 'content': return <ContentPage />;
    case 'brand': return <BrandHubPage />;
    case 'ads': return <AdsPage />;
    case 'visitors': return <VisitorPage />;
    case 'outputs': return <OutputsPage />;
    case 'approvals': return <ApprovalsPage />;
    case 'executions': return <ExecutionsPage />;
    case 'billing': return <BillingPage />;
    case 'setup': return <SetupWizard />;
    case 'seo': return <SeoPage />;
    case 'readiness': return <ReadinessPage />;
    case 'reports': return <ReportsPage />;
    case 'settings': return <SettingsPage />;
    default: return <AIDashboard />;
  }
}

function SessionSpinner() {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-white/60" style={{ background: '#07080f' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-xl border-2 border-indigo-500/20 border-t-indigo-500/60" />
        <p>Verifying session…</p>
      </div>
    </div>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isExpanded, isHovered } = useSidebar();
  const queryClient = useQueryClient();

  const isLoggedOut = searchParams.get('loggedout') === '1';
  const isRegister =
    searchParams.get('register') === '1' ||
    searchParams.get('mode') === 'register' ||
    searchParams.get('newTenant') === '1';
  const gateFromUrl = isLoggedOut || isRegister;

  const [urlAuthRoute, setUrlAuthRoute] = useState<
    | null
    | {
        showGate: boolean;
        initialMode: 'login' | 'register';
      }
  >(null);

  useEffect(() => {
    if (gateFromUrl) {
      void queryClient.removeQueries({ queryKey: ['current-user-security'] });
    }
    setUrlAuthRoute({
      showGate: gateFromUrl,
      initialMode: isRegister ? 'register' : 'login',
    });
  }, [gateFromUrl, isRegister, queryClient]);

  const gateInitialMode = urlAuthRoute?.initialMode ?? (isRegister ? 'register' : 'login');
  const showAuthGate = (urlAuthRoute === null && gateFromUrl) || Boolean(urlAuthRoute?.showGate);
  const hasSessionToken = typeof window !== 'undefined' && Boolean(getSessionToken());

  const { data: security, isLoading, error } = useQuery({
    queryKey: ['current-user-security'],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    retry: false,
    enabled: urlAuthRoute !== null && !urlAuthRoute.showGate && hasSessionToken,
  });

  if (urlAuthRoute === null && !gateFromUrl) {
    return <SessionSpinner />;
  }

  if (showAuthGate) {
    return (
      <AuthGate
        initialMode={gateInitialMode}
        onAuthenticated={() => {
          setUrlAuthRoute((cur) => ({
            showGate: false,
            initialMode: cur?.initialMode ?? (isRegister ? 'register' : 'login'),
          }));
          void queryClient.invalidateQueries({ queryKey: ['current-user-security'] });
          router.replace('/', { scroll: false });
        }}
      />
    );
  }

  if (!hasSessionToken) {
    return (
      <AuthGate
        initialMode={gateInitialMode}
        onAuthenticated={() => {
          setUrlAuthRoute((cur) => ({
            showGate: false,
            initialMode: cur?.initialMode ?? (isRegister ? 'register' : 'login'),
          }));
          void queryClient.invalidateQueries({ queryKey: ['current-user-security'] });
          router.replace('/', { scroll: false });
        }}
      />
    );
  }

  if (isLoading) {
    return <SessionSpinner />;
  }

  if (!security || security.isDemoFallback || error) {
    return (
      <AuthGate
        onAuthenticated={() => {
          void queryClient.invalidateQueries({ queryKey: ['current-user-security'] });
          router.replace('/', { scroll: false });
        }}
      />
    );
  }

  return (
    <AuthenticatedShell
      security={security}
      sidebarWide={isExpanded || isHovered}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<SessionSpinner />}>
      <HomePageInner />
    </Suspense>
  );
}

function AuthenticatedShell({
  security,
  sidebarWide,
}: {
  security: { tenantId: string };
  sidebarWide: boolean;
}) {
  const currentPage = useNavigationStore((s) => s.currentPage);
  const setTenantFromSession = useWorkspaceStore((s) => s.setTenantFromSession);
  useEffect(() => {
    if (security.tenantId) setTenantFromSession(security.tenantId);
  }, [security.tenantId, setTenantFromSession]);

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: "#07080f" }}>
      <Backdrop />
      <div
        className={cn(
          'min-h-screen transition-[grid-template-columns] duration-300 ease-in-out',
          'lg:grid lg:h-screen lg:min-h-0 lg:overflow-hidden',
          sidebarWide ? 'lg:[grid-template-columns:240px_minmax(0,1fr)]' : 'lg:[grid-template-columns:72px_minmax(0,1fr)]',
        )}
      >
        <AppSidebar />
        <div className="isolate flex min-h-screen w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:h-full">
          <AppHeader />
          <main className="relative z-0 min-h-0 w-full min-w-0 flex-1 overflow-hidden">
            <ClientErrorBoundary key={currentPage}>
              <PageContent page={currentPage} />
            </ClientErrorBoundary>
          </main>
        </div>
      </div>

      <AgentDetailPanel />
      <AssignTaskModal />
      <ArtifactCenter />
    </div>
  );
}

function AuthGate({
  onAuthenticated,
  initialMode = 'login',
}: {
  onAuthenticated: () => void;
  initialMode?: 'login' | 'register';
}) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tenantName, setTenantName] = useState('');

  const mutation = useMutation({
    mutationFn: () => mode === 'login'
      ? apiClient.login({ email, password })
      : apiClient.register({ email, password, displayName, tenantName }),
    onSuccess: (session) => {
      setSessionToken(session.token);
      useWorkspaceStore.getState().setWorkspace(session.tenantId, session.officeId);
      onAuthenticated();
    },
  });
  const friendlyError = mutation.error ? toUserFriendlyApiError(mutation.error, 'Operation failed.') : null;

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    if (next === 'register') {
      setEmail('');
      setPassword('');
      setDisplayName('');
      setTenantName('');
    } else {
      setEmail('');
      setDisplayName('');
      setTenantName('');
    }
  };

  const isRegisterMode = mode === 'register';

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #07080f 0%, #0a0b14 100%)' }}
    >
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #4f46e5, transparent)' }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 30px rgba(99,102,241,0.4)' }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">SmartAgency</p>
            <p className="mt-0.5 text-[10px] text-slate-700">AI Agency Operating System</p>
          </div>
        </div>

        {/* Card */}
        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: 'rgba(13,14,22,0.9)',
            border: '1px solid rgba(255,255,255,0.09)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(24px)',
          }}
        >
          {/* Mode tabs */}
          <div className="flex" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className="flex-1 py-4 text-[13px] font-semibold transition-all"
                style={{
                  background: mode === m ? 'rgba(99,102,241,0.08)' : 'transparent',
                  borderBottom: mode === m ? '2px solid #6366f1' : '2px solid transparent',
                  color: mode === m ? '#818cf8' : '#475569',
                }}
              >
                {m === 'login' ? 'Sign In' : 'New Workspace'}
              </button>
            ))}
          </div>

          <div className="px-6 py-6">
            {/* Header text */}
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight text-white">
                {isRegisterMode ? 'Create your AI agency workspace' : 'Welcome back'}
              </h1>
              <p className="mt-1 text-[12px] text-slate-600">
                {isRegisterMode
                  ? 'Set up your tenant, connect integrations and deploy AI agents.'
                  : 'Sign in to your SmartAgency operating system.'}
              </p>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
              className="space-y-4"
            >
              {isRegisterMode && (
                <>
                  <AuthOsField
                    label="Company / Workspace name"
                    value={tenantName}
                    onChange={setTenantName}
                    placeholder="e.g. Acme Coffee Co."
                  />
                  <AuthOsField
                    label="Your name"
                    value={displayName}
                    onChange={setDisplayName}
                    placeholder="Owner / Admin name"
                  />
                </>
              )}

              <AuthOsField
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                type="email"
              />
              <AuthOsField
                label="Password"
                value={password}
                onChange={setPassword}
                placeholder="Min 8 characters"
                type="password"
              />

              {/* What happens next (register only) */}
              {isRegisterMode && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}
                >
                  <p className="text-[11px] font-semibold text-indigo-400 mb-2">After setup you can:</p>
                  <ul className="space-y-1">
                    {[
                      'Configure brand memory & company profile',
                      'Connect Google, Meta, Instagram integrations',
                      'Deploy AI agents for content, ads & reviews',
                      'Set packages & approval policies',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[11px] text-slate-600">
                        <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full bg-indigo-500/30 flex items-center justify-center">
                          <span className="h-1 w-1 rounded-full bg-indigo-400" />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Error */}
              {friendlyError && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  <p className="text-[13px] font-semibold text-red-400">{friendlyError.title}</p>
                  <p className="mt-0.5 text-[12px] text-red-500/80">{friendlyError.detail}</p>
                  {friendlyError.hint && (
                    <p className="mt-1.5 text-[11px] text-red-600">Tip: {friendlyError.hint}</p>
                  )}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  boxShadow: '0 0 20px rgba(99,102,241,0.3)',
                }}
              >
                {mutation.isPending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {isRegisterMode ? 'Creating workspace…' : 'Signing in…'}
                  </>
                ) : (
                  isRegisterMode ? 'Create Workspace' : 'Sign In'
                )}
              </button>
            </form>

            {/* Switch mode */}
            <div className="mt-5 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-center text-[12px] text-slate-700">
                {isRegisterMode ? 'Already have an account?' : "Don't have a workspace?"}
                {' '}
                <button
                  type="button"
                  onClick={() => switchMode(isRegisterMode ? 'login' : 'register')}
                  className="font-semibold text-indigo-400 hover:text-indigo-300 transition"
                >
                  {isRegisterMode ? 'Sign in instead' : 'Create workspace'}
                </button>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-slate-800">
          SmartAgency AI OS · Secure session-based auth
        </p>
      </div>
    </div>
  );
}

function AuthOsField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-3 text-[13px] text-white/90 placeholder-slate-700 outline-none transition focus:ring-1 focus:ring-indigo-500/50"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
      />
    </div>
  );
}

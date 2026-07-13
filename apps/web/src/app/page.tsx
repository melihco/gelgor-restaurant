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
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
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
  const friendlyError = mutation.error
    ? toUserFriendlyApiError(mutation.error, 'İşlem tamamlanamadı.')
    : null;

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
      style={{ background: '#0A0A0E' }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(ellipse 90% 55% at 50% -5%, rgba(77,112,136,0.18) 0%, transparent 58%),
              radial-gradient(ellipse 60% 40% at 100% 100%, rgba(201,169,110,0.07) 0%, transparent 55%)
            `,
          }}
        />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <SmartAgencyLogo variant="full" priority className="h-9 w-auto max-w-[min(240px,72vw)]" />
          <p className="text-[13px] leading-relaxed text-slate-500">
            AI destekli marka üretim platformu
          </p>
        </div>

        <div
          className="overflow-hidden rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '0.5px solid rgba(255,255,255,0.09)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className="flex-1 py-4 text-[13px] font-semibold transition-all"
                style={{
                  background: mode === m ? 'rgba(77,112,136,0.12)' : 'transparent',
                  borderBottom: mode === m ? '2px solid #5A82A0' : '2px solid transparent',
                  color: mode === m ? '#B8CDD8' : 'rgba(148,163,184,0.45)',
                }}
              >
                {m === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
              </button>
            ))}
          </div>

          <div className="px-6 py-6">
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight text-[#F4F4F8]">
                {isRegisterMode ? 'Marka alanınızı oluşturun' : 'Tekrar hoş geldiniz'}
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                {isRegisterMode
                  ? 'Firma bilgilerinizle workspace açın; marka analizi ve AI üretim hattı hazır olsun.'
                  : 'SmartAgency panelinize güvenli giriş yapın.'}
              </p>
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
              className="space-y-4"
            >
              {isRegisterMode && (
                <>
                  <AuthOsField
                    label="Firma / Marka adı"
                    value={tenantName}
                    onChange={setTenantName}
                    placeholder="ör. Deniz Kafe"
                  />
                  <AuthOsField
                    label="Adınız"
                    value={displayName}
                    onChange={setDisplayName}
                    placeholder="İsim Soyisim"
                  />
                </>
              )}

              <AuthOsField
                label="E-posta"
                value={email}
                onChange={setEmail}
                placeholder="siz@firma.com"
                type="email"
              />
              <AuthOsField
                label="Şifre"
                value={password}
                onChange={setPassword}
                placeholder="En az 8 karakter"
                type="password"
              />

              {isRegisterMode && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(77,112,136,0.08)', border: '0.5px solid rgba(77,112,136,0.22)' }}
                >
                  <p className="mb-2 text-[11px] font-semibold text-[#9DBECE]">Kurulum sonrası:</p>
                  <ul className="space-y-1">
                    {[
                      'Marka profili ve şablon kütüphanesi',
                      'Instagram ve Meta entegrasyonları',
                      'AI içerik ve görsel üretim hattı',
                      'Onay ve yayın takvimi',
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2 text-[11px] text-slate-500">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#5A82A0]" />
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
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #4D7088, #5A82A0)',
                  boxShadow: '0 6px 28px rgba(77,112,136,0.35)',
                }}
              >
                {mutation.isPending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    {isRegisterMode ? 'Hesap oluşturuluyor…' : 'Giriş yapılıyor…'}
                  </>
                ) : (
                  isRegisterMode ? 'Hesap Oluştur' : 'Giriş Yap'
                )}
              </button>
            </form>

            <div className="mt-5 pt-5" style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <p className="text-center text-[12px] text-slate-600">
                {isRegisterMode ? 'Zaten hesabınız var mı?' : 'Henüz hesabınız yok mu?'}
                {' '}
                <button
                  type="button"
                  onClick={() => switchMode(isRegisterMode ? 'login' : 'register')}
                  className="font-semibold transition"
                  style={{ color: '#8AABBD' }}
                >
                  {isRegisterMode ? 'Giriş yapın' : 'Hesap oluşturun'}
                </button>
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-700">
          SmartAgency · Güvenli oturum
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
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-slate-500">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-3 text-[13px] text-white/90 placeholder-slate-600 outline-none transition focus:ring-1"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          boxShadow: 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(138,171,189,0.45)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
      />
    </div>
  );
}

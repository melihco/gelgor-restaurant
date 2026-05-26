'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Target, Shield, ChevronRight, ChevronLeft,
  Check, Zap, Link2, Package, ArrowRight, Sparkles, AlertTriangle, CheckCircle2,
  ClipboardCheck,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { syncDiscoveryReferenceAssets } from '@/lib/discovery-asset-sync';
import { useNavigationStore } from '@/stores/navigation-store';
import type { SaveCompanyProfileRequest, ApprovalMode, OnboardingStatus, BrandDiscoveryResult, PythonBrandAnalyzeResponse } from '@/types';
import Label from '@/tailadmin/components/form/Label';
import Input from '@/tailadmin/components/form/input/InputField';
import TailAdminTextArea from '@/tailadmin/components/form/input/TextArea';
import PackageSelector from './PackageSelector';
import IntegrationPanel from './IntegrationPanel';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';

type WizardStep = 'welcome' | 'company' | 'integrations' | 'package' | 'permissions' | 'launch';

const STEPS: { id: WizardStep; label: string; icon: typeof Building2 }[] = [
  { id: 'welcome', label: 'Workspace hazır', icon: ClipboardCheck },
  { id: 'company', label: 'İşletme & marka', icon: Building2 },
  { id: 'integrations', label: 'Hesap bağlantıları', icon: Link2 },
  { id: 'package', label: 'Paket seçimi', icon: Package },
  { id: 'permissions', label: 'İzin ayarları', icon: Shield },
  { id: 'launch', label: 'Başlat', icon: Sparkles },
];

const TONE_OPTIONS = [
  { value: 'professional', label: 'Profesyonel', desc: 'Kurumsal ve güven veren' },
  { value: 'friendly', label: 'Samimi', desc: 'Sıcak ve erişilebilir' },
  { value: 'energetic', label: 'Enerjik', desc: 'Dinamik ve heyecanlı' },
  { value: 'luxury', label: 'Premium', desc: 'Lüks ve sofistike' },
  { value: 'casual', label: 'Rahat', desc: 'Doğal ve gündelik' },
];

const INDUSTRY_OPTIONS = [
  'Restoran / Kafe', 'Otel / Konaklama', 'E-ticaret', 'Sağlık', 'Eğitim',
  'Hukuk', 'Gayrimenkul', 'Güzellik / Bakım', 'Spor / Fitness', 'Teknoloji',
  'Finans', 'Danışmanlık', 'Perakende', 'Diğer',
];

// Playbook IDs that the backend understands — must match industry_playbooks.py keys
const PLAYBOOK_OPTIONS: { id: string; label: string }[] = [
  { id: 'restaurant_cafe',      label: 'Restoran / Kafe' },
  { id: 'beach_club',           label: 'Beach Club / Bar' },
  { id: 'local_products_shop',  label: 'Yöresel / Yerel Ürün Dükkanı' },
  { id: 'ecommerce_retail',     label: 'E-ticaret / Perakende' },
  { id: 'beauty_wellness',      label: 'Güzellik / Wellness' },
  { id: 'healthcare_clinic',    label: 'Sağlık / Klinik' },
  { id: 'real_estate',          label: 'Gayrimenkul' },
  { id: 'agency_services',      label: 'Ajans / Profesyonel Hizmet' },
  { id: 'local_service_business', label: 'Yerel Hizmet İşletmesi' },
];

// Default content pillars per playbook — mirrors backend industry_playbooks.py
const PLAYBOOK_PILLARS: Record<string, string[]> = {
  restaurant_cafe:       ['menu_share', 'campaign_offer', 'event_announcement', 'daily_story', 'social_proof', 'behind_the_scenes'],
  beach_club:            ['daily_story', 'event_announcement', 'campaign_offer', 'social_proof', 'behind_the_scenes'],
  local_products_shop:   ['product_highlight', 'producer_story', 'behind_the_scenes', 'educational_post', 'seasonal_availability', 'social_proof', 'tasting_experience', 'daily_story'],
  ecommerce_retail:      ['product_highlight', 'campaign_offer', 'seasonal_content', 'social_proof', 'ad_creative'],
  beauty_wellness:       ['service_intro', 'campaign_offer', 'social_proof', 'educational_post', 'behind_the_scenes', 'lead_generation'],
  healthcare_clinic:     ['educational_post', 'service_intro', 'social_proof', 'lead_generation'],
  real_estate:           ['product_highlight', 'lead_generation', 'educational_post', 'social_proof', 'campaign_offer'],
  agency_services:       ['service_intro', 'educational_post', 'social_proof', 'lead_generation'],
  local_service_business:['service_intro', 'lead_generation', 'social_proof', 'educational_post', 'google_business_update'],
};

export default function SetupWizard() {
  const queryClient = useQueryClient();
  const navigate = useNavigationStore((s) => s.navigate);
  const setSetupRequired = useNavigationStore((s) => s.setSetupRequired);
  const [step, setStep] = useState<WizardStep>('welcome');

  const { data: profile } = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
  });

  const { data: onboardingStatus } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: () => apiClient.getOnboardingStatus(),
    refetchInterval: 15_000,
  });

  const { data: sessionUser } = useQuery({
    queryKey: ['current-user-security'],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    staleTime: 60_000,
  });

  const [form, setForm] = useState<SaveCompanyProfileRequest>({
    brandName: '',
    industry: '',
    location: '',
    brandTone: 'professional',
    targetAudience: '',
    visualStyle: '',
    campaignGoals: '',
    competitors: '',
    customRules: '',
    languages: 'tr',
    logoUrl: '',
    websiteUrl: '',
    description: '',
    primaryFont: '',
    secondaryFont: '',
    brandColors: '',
    accentColors: '',
    socialTemplateStyle: '',
    logoUsageRules: '',
    defaultApprovalMode: 'SuggestAndWait' as ApprovalMode,
    instagramHandle: '',
    googleBusinessUrl: '',
    brandImageUrls: '',
    platformProfiles: '[]',
    contentNeeds: '[]',
    templateFamilies: '[]',
    riskRules: '{}',
    customerVisibleSummary: '',
    systemIntelligence: '',
    discoveryConfidence: null,
    creativeProfileConfirmedAt: null,
  });

  const [initialized, setInitialized] = useState(false);
  if (profile && !initialized) {
    setForm({
      brandName: profile.brandName || '',
      industry: profile.industry || '',
      location: profile.location || '',
      brandTone: profile.brandTone || 'professional',
      targetAudience: profile.targetAudience || '',
      visualStyle: profile.visualStyle || '',
      campaignGoals: profile.campaignGoals || '',
      competitors: profile.competitors || '',
      customRules: profile.customRules || '',
      languages: profile.languages || 'tr',
      logoUrl: profile.logoUrl || '',
      websiteUrl: profile.websiteUrl || '',
      description: profile.description || '',
      primaryFont: profile.primaryFont || '',
      secondaryFont: profile.secondaryFont || '',
      brandColors: profile.brandColors || '',
      accentColors: profile.accentColors || '',
      socialTemplateStyle: profile.socialTemplateStyle || '',
      logoUsageRules: profile.logoUsageRules || '',
      defaultApprovalMode: (profile.defaultApprovalMode as ApprovalMode) || 'SuggestAndWait',
      instagramHandle: profile.instagramHandle || '',
      googleBusinessUrl: profile.googleBusinessUrl || '',
      brandImageUrls: profile.brandImageUrls || '',
      platformProfiles: profile.platformProfiles || '[]',
      contentNeeds: profile.contentNeeds || '[]',
      templateFamilies: profile.templateFamilies || '[]',
      riskRules: profile.riskRules || '{}',
      customerVisibleSummary: profile.customerVisibleSummary || '',
      systemIntelligence: profile.systemIntelligence || '',
      discoveryConfidence: profile.discoveryConfidence ?? null,
      creativeProfileConfirmedAt: profile.creativeProfileConfirmedAt ?? null,
    });
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => apiClient.saveCompanyProfile(form),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
      ]);
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => apiClient.completeSetup(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
      ]);
      setSetupRequired(false);
      navigate('dashboard');
    },
  });

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  const goNext = useCallback(() => {
    if (step === 'company' || step === 'permissions') saveMutation.mutate();
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  }, [step, stepIndex, saveMutation]);

  const goPrev = useCallback(() => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }, [stepIndex]);

  const updateField = (field: keyof SaveCompanyProfileRequest, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: '#050507' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[-18%] h-[38rem] w-[38rem] rounded-full bg-indigo-500/14 blur-[130px]" />
        <div className="absolute right-[-10%] top-[18%] h-[32rem] w-[32rem] rounded-full bg-fuchsia-500/10 blur-[130px]" />
      </div>
      {/* Top bar */}
      <header className="relative z-10 flex h-16 items-center justify-between border-b border-white/[0.06] bg-black/20 px-8 backdrop-blur-2xl">
        <div className="flex items-center gap-3">
          <SmartAgencyLogo variant="full" priority className="h-9 max-w-[200px]" />
          <div>
            <p className="text-xs text-zinc-600">Self-serve onboarding merkezi</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setSetupRequired(false); navigate('dashboard'); }}
          className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Atla ve Dashboard'a git →
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1">
        {/* Sidebar steps */}
        <aside className="hidden w-80 flex-col border-r border-white/[0.06] bg-black/10 px-5 py-7 backdrop-blur-xl lg:flex">
          <p className="mb-6 px-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400/60">Kurulum Adımları</p>
          <div className="space-y-1">
            {STEPS.map((s, i) => {
              const active = s.id === step;
              const done = i < stepIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all"
                  style={{
                    background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
                    border: active ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                  }}
                >
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-xs"
                    style={{
                      background: done ? 'rgba(34,197,94,0.15)' : active ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
                      color: done ? '#22c55e' : active ? '#a5b4fc' : '#52525b',
                    }}
                  >
                    {done ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className={`text-xs font-medium ${active ? 'text-white' : 'text-zinc-500'}`}>{s.label}</p>
                    <p className="text-[9px] text-zinc-700">Adım {i + 1}/{STEPS.length}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <OnboardingProgressPanel status={onboardingStatus} onSelectStep={setStep} />
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 lg:py-10">
            <section className="mb-8 overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.055] p-7 shadow-[0_36px_110px_rgba(0,0,0,0.32)] backdrop-blur-3xl sm:p-9">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-end">
                <div>
                  <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/62">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
                    Launch readiness: {onboardingStatus?.score ?? 0}%
                  </div>
                  <h1 className="max-w-3xl text-[2.25rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-5xl">
                    {step === 'welcome'
                      ? 'Workspace\'iniz hazır — kuruluma başlayın.'
                      : 'Tenant marka hafızasını ve operasyonu kurun.'}
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-white/56">
                    {step === 'welcome'
                      ? 'Kayıt ile tenant, varsayılan ofis ve owner hesabı oluşturuldu. Sıradaki adımlarda işletme kartı, marka bağlamı, entegrasyonlar ve onay politikası tanımlanır.'
                      : 'Her müşterinin sektörünü, görsel dilini, tonunu ve hesap sinyallerini ayrı ayrı kaydederek agentların aynı ürünü farklı markalara göre üretmesini sağlayın.'}
                  </p>
                </div>
                <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Sonraki adım</p>
                  <p className="mt-3 text-lg font-semibold leading-7 text-white">{onboardingStatus?.nextStep?.label ?? 'Launch için hazır'}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{onboardingStatus?.nextStep?.detail ?? 'Tüm zorunlu kurulum adımları tamamlandı.'}</p>
                </div>
              </div>
            </section>

            <div className="mb-6 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {STEPS.map((s, i) => {
                const active = s.id === step;
                const done = i < stepIndex;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStep(s.id)}
                    className="flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold"
                    style={{
                      background: active ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.035)',
                      borderColor: active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)',
                      color: done ? '#22c55e' : active ? '#c7d2fe' : '#71717a',
                    }}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <s.icon className="h-3.5 w-3.5" />}
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl sm:p-7">
            {step === 'welcome' && (
              <WelcomeStep
                tenantName={sessionUser?.tenantName}
                displayName={sessionUser?.displayName}
                email={sessionUser?.email}
                role={sessionUser?.role}
                tenantId={sessionUser?.tenantId}
              />
            )}
            {step === 'company' && (
              <CompanyStep form={form} updateField={updateField} workspaceId={sessionUser?.tenantId ?? ''} />
            )}
            {step === 'integrations' && <IntegrationPanel />}
            {step === 'package' && <PackageSelector />}
            {step === 'permissions' && (
              <PermissionsStep
                mode={form.defaultApprovalMode}
                setMode={(mode) => setForm((prev) => ({ ...prev, defaultApprovalMode: mode }))}
              />
            )}
            {step === 'launch' && (
              <LaunchStep
                brandName={form.brandName}
                status={onboardingStatus}
                onLaunch={() => completeMutation.mutate()}
                loading={completeMutation.isPending}
              />
            )}
            </div>
          </div>
        </main>
      </div>

      {/* Footer navigation */}
      <footer className="relative z-10 flex h-16 items-center justify-between border-t border-white/[0.06] bg-black/20 px-8 backdrop-blur-2xl">
        <button
          type="button"
          onClick={goPrev}
          disabled={stepIndex === 0}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-zinc-400 transition-all hover:bg-white/[0.04] disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Geri
        </button>
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1.5 w-6 rounded-full" style={{ background: i <= stepIndex ? '#6366f1' : 'rgba(255,255,255,0.06)' }} />
          ))}
        </div>
        {step !== 'launch' ? (
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-xs font-semibold text-white transition-all hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)' }}
          >
            İleri <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div />
        )}
      </footer>
    </div>
  );
}

function WelcomeStep({
  tenantName,
  displayName,
  email,
  role,
  tenantId,
}: {
  tenantName?: string;
  displayName?: string;
  email?: string;
  role?: string;
  tenantId?: string;
}) {
  const roadmap = [
    { n: 1, title: 'Workspace (tenant)', done: true, detail: 'Kayıtta oluşturuldu: izole veri, varsayılan ofis, agent koltukları.' },
    { n: 2, title: 'İşletme & marka profili', done: false, detail: 'Marka adı, sektör, ton, hedef kitle ve isteğe bağlı Instagram / Google’dan öğrenme.' },
    { n: 3, title: 'Hesap bağlantıları', done: false, detail: 'Google Business, Instagram, Ads, Analytics — agent görevleri için OAuth.' },
    { n: 4, title: 'Paket & kota', done: false, detail: 'Abonelik katmanı, aylık agent run limitleri ve token bütçesi.' },
    { n: 5, title: 'Onay politikası', done: false, detail: 'Default action statüsü; live çalıştırma yine izin, entegrasyon ve kota kontrolünden geçer.' },
    { n: 6, title: 'Başlat', done: false, detail: 'Kurulumu tamamla; dashboard ve AI önerileri.' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">Sıfırdan kurulum — adım 1 tamam</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Aşağıda bu oturum için oluşturulan workspace özeti var. Devam ettiğinizde işletme bilgileri ve marka hafızası tenant veritabanına yazılır.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Workspace (tenant)</p>
          <p className="mt-2 text-lg font-semibold text-white">{tenantName?.trim() || '—'}</p>
          {tenantId ? (
            <p className="mt-2 font-mono text-[10px] text-zinc-600 break-all">id: {tenantId}</p>
          ) : null}
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Owner oturumu</p>
          <p className="mt-2 text-sm font-semibold text-white">{displayName || '—'}</p>
          <p className="mt-1 text-xs text-zinc-500">{email || '—'}</p>
          {role ? (
            <p className="mt-3 inline-flex rounded-full border border-indigo-400/20 bg-indigo-500/10 px-2.5 py-1 text-[10px] font-semibold text-indigo-200">
              Rol: {role}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white">Yol haritası</h3>
        <ul className="mt-4 space-y-2">
          {roadmap.map((row) => (
            <li
              key={row.n}
              className={`flex gap-3 rounded-xl border px-4 py-3 text-left ${row.done ? 'border-emerald-500/20 bg-emerald-500/[0.07]' : 'border-white/[0.06] bg-white/[0.025]'}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${row.done ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/[0.06] text-zinc-400'}`}>
                {row.done ? <Check className="h-3.5 w-3.5" /> : row.n}
              </span>
              <div>
                <p className="text-[13px] font-semibold text-white">{row.title}</p>
                <p className="mt-0.5 text-[11px] leading-5 text-zinc-500">{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OnboardingProgressPanel({
  status,
  onSelectStep,
}: {
  status?: OnboardingStatus;
  onSelectStep: (step: WizardStep) => void;
}) {
  const nextStepId = mapCheckToStep(status?.nextStep?.id);

  return (
    <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Onboarding Skoru</p>
        <span className="text-sm font-black text-white">{status?.score ?? 0}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
          style={{ width: `${status?.score ?? 0}%` }}
        />
      </div>
      <p className="mt-2 text-[10px] text-zinc-600">
        {status ? `${status.completed}/${status.total} adım tamamlandı` : 'Durum hesaplanıyor...'}
      </p>

      {status?.nextStep && (
        <button
          type="button"
          onClick={() => nextStepId && onSelectStep(nextStepId)}
          className="mt-3 w-full rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-2 text-left transition-colors hover:bg-amber-400/[0.09]"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
            <div>
              <p className="text-[11px] font-semibold text-amber-100">{status.nextStep.label}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-amber-100/55">{status.nextStep.detail}</p>
            </div>
          </div>
        </button>
      )}

      {status?.readyForLiveActions && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/[0.08] p-2 text-[10px] font-medium text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Live action için hazır
        </div>
      )}
    </div>
  );
}

function mapCheckToStep(checkId?: string): WizardStep | null {
  switch (checkId) {
    case 'profile':
    case 'brand_context':
      return 'company';
    case 'integrations':
      return 'integrations';
    case 'package':
      return 'package';
    case 'permissions':
      return 'permissions';
    case 'first_run':
      return 'launch';
    default:
      return null;
  }
}

function CompanyStep({
  form,
  updateField,
  workspaceId,
}: {
  form: SaveCompanyProfileRequest;
  updateField: (k: keyof SaveCompanyProfileRequest, v: string) => void;
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<{
    ok: boolean;
    message: string;
    tone?: string;
    hashtags?: string;
    report?: BrandDiscoveryResult['report'];
    // Python-side analysis result for the constitution panel
    pythonResult?: PythonBrandAnalyzeResponse | null;
    pythonError?: string | null;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [constitutionConfirmed, setConstitutionConfirmed] = useState(
    !!form.creativeProfileConfirmedAt,
  );
  const { data: brandStyleScore } = useQuery({
    queryKey: ['brand-style-score'],
    queryFn: () => apiClient.getBrandStyleScore(),
    staleTime: 60_000,
  });

  async function handleAnalyzeBrand() {
    if (!form.websiteUrl && !form.instagramHandle && !form.googleBusinessUrl) {
      setAnalyzeResult({ ok: false, message: 'Web sitesi, Instagram veya Google Business URL girin.' });
      return;
    }
    if (!workspaceId) {
      setAnalyzeResult({ ok: false, message: 'Oturum henüz yüklenmedi, lütfen bekleyin.' });
      return;
    }
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      // Run .NET discovery (existing flow — populates CompanyProfile) and
      // Python brand analysis (new — populates Python BrandContext) in parallel.
      // If Python call fails, it's non-blocking; existing .NET flow continues.
      const [nexusData, pythonResult] = await Promise.allSettled([
        apiClient.discoverBrand({
          websiteUrl: form.websiteUrl,
          instagramHandle: form.instagramHandle,
          googleBusinessUrl: form.googleBusinessUrl,
          applyToProfile: true,
        }),
        // Only call Python if we have at least one URL to analyze
        apiClient.analyzeBrandContext(
          workspaceId,
          {
            websiteUrl: form.websiteUrl,
            instagramHandle: form.instagramHandle,
            googleBusinessUrl: form.googleBusinessUrl,
          },
        ).catch((err) => {
          // Non-fatal: Python backend may not be running in all environments
          return { error: String(err), success: false } as PythonBrandAnalyzeResponse;
        }),
      ]);

      // Handle .NET result (primary)
      if (nexusData.status === 'fulfilled') {
        const data = nexusData.value;
        const updated = data.profile;
        const py = pythonResult.status === 'fulfilled' ? pythonResult.value : null;
        const pyOk = py && py.success && !py.error;

        setAnalyzeResult({
          ok: data.success,
          message: buildAnalyzeMessage(data, pyOk ? py : null),
          tone: data.report.brandTone,
          hashtags: data.report.topHashtags.join(', '),
          report: data.report,
          pythonResult: pyOk ? py : null,
          pythonError: py?.error ?? null,
        });
        updateField('brandName', updated.brandName || form.brandName);
        updateField('industry', updated.industry || form.industry);
        updateField('location', updated.location || form.location);
        updateField('brandTone', updated.brandTone || form.brandTone);
        updateField('targetAudience', updated.targetAudience || form.targetAudience);
        updateField('visualStyle', updated.visualStyle || form.visualStyle);
        updateField('campaignGoals', updated.campaignGoals || form.campaignGoals);
        updateField('customRules', updated.customRules || form.customRules);
        updateField('languages', updated.languages || form.languages);
        updateField('websiteUrl', updated.websiteUrl || form.websiteUrl);
        updateField('description', updated.description || form.description);
        updateField('socialTemplateStyle', updated.socialTemplateStyle || form.socialTemplateStyle || '');
        updateField('instagramHandle', updated.instagramHandle || form.instagramHandle || '');
        updateField('googleBusinessUrl', updated.googleBusinessUrl || form.googleBusinessUrl || '');
      } else {
        setAnalyzeResult({ ok: false, message: 'Bağlantı hatası. Lütfen tekrar deneyin.' });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['company-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
        queryClient.invalidateQueries({ queryKey: ['brand-style-score'] }),
      ]);

      const pyBulk = pythonResult.status === 'fulfilled' ? pythonResult.value : null;
      if (
        pyBulk &&
        pyBulk.success &&
        !pyBulk.error &&
        Array.isArray(pyBulk.reference_image_urls) &&
        pyBulk.reference_image_urls.length > 0
      ) {
        const { created } = await syncDiscoveryReferenceAssets(
          apiClient,
          null,
          pyBulk.reference_image_urls,
        );
        if (created > 0) {
          await queryClient.invalidateQueries({ queryKey: ['brand-context-assets'] });
        }
      }
    } catch {
      setAnalyzeResult({ ok: false, message: 'Bağlantı hatası.' });
    }
    setAnalyzing(false);
  }

  async function handleConfirmConstitution(workspaceId: string) {
    setConfirming(true);
    try {
      await apiClient.confirmBrandConstitution(workspaceId);
      setConstitutionConfirmed(true);
      updateField('creativeProfileConfirmedAt', new Date().toISOString());
    } catch {
      // Non-fatal: confirmation persists on the Python side; just show success locally
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-xl font-bold text-white">Bölüm A — İşletme / tenant kartı</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Bu alan şirketin kimliği ve kısa ticari özetidir; raporlarda ve agent brief&apos;lerinde görünür. Kayıtta verdiğiniz workspace adından farklı bir <strong className="text-zinc-400">marka adı</strong> kullanabilirsiniz.
        </p>
      </div>

      <div className="space-y-5">
        <Field label="Marka / iş görünen adı" value={form.brandName} onChange={(v) => updateField('brandName', v)} placeholder="Örn: Cafe Bosphorus" required />
        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Sektör" value={form.industry} onChange={(v) => updateField('industry', v)} options={INDUSTRY_OPTIONS} />
          <Field label="Lokasyon" value={form.location} onChange={(v) => updateField('location', v)} placeholder="Örn: İstanbul, Kadıköy" />
        </div>
        <Field label="Web sitesi" value={form.websiteUrl} onChange={(v) => updateField('websiteUrl', v)} placeholder="https://..." />
        <Field label="Logo URL" value={form.logoUrl} onChange={(v) => updateField('logoUrl', v)} placeholder="https://.../logo.png" />
        <TextArea label="Şirket açıklaması" value={form.description} onChange={(v) => updateField('description', v)} placeholder="Ne iş yapıyorsunuz? Müşterilerinize ne sunuyorsunuz?" rows={3} />
        <Field label="İçerik dilleri" value={form.languages} onChange={(v) => updateField('languages', v)} placeholder="tr, en" />
      </div>

      <div className="border-t border-white/[0.08] pt-10">
        <h2 className="text-xl font-bold text-white">Bölüm B — Marka hafızası (AI bağlamı)</h2>
        <p className="mt-1 text-sm text-zinc-500">İçerik, Canva ve onaylı aksiyon agentları bu sinyalleri tenant bazında birleştirir.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <BrandMemoryMetric label="Marka skoru" value={`${brandStyleScore?.score ?? 0}%`} hint={brandStyleScore?.label ?? 'Needs Calibration'} />
        <BrandMemoryMetric label="Veri kaynağı" value={form.instagramHandle || form.googleBusinessUrl ? 'Bağlı sinyal var' : 'Manuel'} hint="Instagram, Google veya elle girilen kurallar" />
        <BrandMemoryMetric label="Dil / pazar" value={form.languages || 'tr'} hint={form.location || 'Lokasyon bekleniyor'} />
      </div>

      {/* ── Auto-learn from accounts ── */}
      <div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))', border: '1px solid rgba(99,102,241,0.15)' }}>
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'rgba(99,102,241,0.15)' }}>
            <Sparkles className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Brand Discovery Agent</p>
            <p className="text-[11px] text-zinc-500">Web sitesi, Instagram ve Google sinyallerinden marka raporu çıkarır; formu otomatik doldurur.</p>
          </div>
        </div>
        <div className="mb-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">Web sitesi veya katalog</label>
            <input
              type="text"
              value={form.websiteUrl ?? ''}
              onChange={(e) => updateField('websiteUrl', e.target.value)}
              placeholder="https://marka.com"
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder-zinc-600"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">Instagram kullanıcı adı</label>
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
              <span className="text-sm text-zinc-500">@</span>
              <input
                type="text"
                value={form.instagramHandle ?? ''}
                onChange={(e) => updateField('instagramHandle' as keyof SaveCompanyProfileRequest, e.target.value)}
                placeholder="cafebosphorus"
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder-zinc-600"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-zinc-400">Google Business URL</label>
            <input
              type="text"
              value={form.googleBusinessUrl ?? ''}
              onChange={(e) => updateField('googleBusinessUrl' as keyof SaveCompanyProfileRequest, e.target.value)}
              placeholder="maps.google.com/..."
              className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder-zinc-600"
            />
          </div>
        </div>
        <TextArea
          label="Marka referans görselleri"
          value={form.brandImageUrls ?? ''}
          onChange={(v) => updateField('brandImageUrls', v)}
          placeholder="Logo, mağaza, ürün veya kampanya görsellerinin public URL'lerini virgülle girin"
          rows={2}
        />
        <button
          type="button"
          onClick={handleAnalyzeBrand}
          disabled={analyzing}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
        >
          {analyzing ? (
            <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Analiz ediliyor...</>
          ) : (
            <><Sparkles className="h-4 w-4" />Markamı otomatik analiz et</>
          )}
        </button>
        {analyzeResult && (
          <div className={`mt-3 rounded-lg p-3 text-[12px] ${analyzeResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-400'}`}>
            {analyzeResult.message}
            {analyzeResult.hashtags && <p className="mt-1 text-[11px] text-zinc-500">Önerilen hashtag&apos;ler: {analyzeResult.hashtags}</p>}
            {analyzeResult.report && (
              <div className="mt-3 grid gap-3 text-zinc-300 md:grid-cols-2">
                <DiscoveryChips title="Content pillars" items={analyzeResult.report.contentPillars} />
                <DiscoveryChips title="Template needs" items={analyzeResult.report.templateNeeds} />
                <DiscoveryChips title="Default CTA" items={analyzeResult.report.defaultCtas} />
                <DiscoveryChips title="Eksik sorular" items={analyzeResult.report.missingQuestions} tone="amber" />
              </div>
            )}
            {/* Python source status — shows exactly which sources worked */}
            {analyzeResult.pythonResult && (
              <div className="mt-3 border-t border-white/[0.08] pt-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">Kaynak durumu</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(analyzeResult.pythonResult.sources).map(([name, src]) => (
                    <SourceStatusChip key={name} name={name} source={src} />
                  ))}
                </div>
                {analyzeResult.pythonResult.missing_signals?.length > 0 && (
                  <div className="mt-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-600">Eksik sinyaller</p>
                    <ul className="space-y-0.5">
                      {analyzeResult.pythonResult.missing_signals.map((q) => (
                        <li key={q} className="text-[11px] text-amber-400">• {q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {analyzeResult.pythonError && (
              <p className="mt-2 text-[10px] text-zinc-600">
                ⚠ Agent hafızası güncellenemedi (Python servisi kapalı olabilir). Form verileri yine de .NET tarafında kaydedildi.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Brand Constitution Confirmation ───────────────────────────── */}
      {analyzeResult?.ok && analyzeResult.pythonResult && (
        <BrandConstitutionPanel
          pythonResult={analyzeResult.pythonResult}
          confirmed={constitutionConfirmed}
          confirming={confirming}
          workspaceId={workspaceId}
          onConfirm={() => void handleConfirmConstitution(workspaceId)}
        />
      )}

      {/* Warning when analysis hasn't been run */}
      {!analyzeResult && !form.creativeProfileConfirmedAt && (form.websiteUrl || form.instagramHandle) && (
        <div className="flex items-start gap-2 rounded-xl px-4 py-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-[12px] text-amber-400">
            Marka analizi henüz çalıştırılmadı. Ajanlar şu an genel içerik üretir.
            URL&apos;leri girdikten sonra &quot;Markamı otomatik analiz et&quot; butonuna basın.
          </p>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="mb-2 block text-xs font-medium text-zinc-400">Marka tonu</label>
          <div className="grid grid-cols-5 gap-2">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => updateField('brandTone', t.value)}
                className="rounded-xl px-3 py-3 text-center transition-all"
                style={{
                  background: form.brandTone === t.value ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                  border: form.brandTone === t.value ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p className={`text-[11px] font-semibold ${form.brandTone === t.value ? 'text-indigo-300' : 'text-zinc-400'}`}>{t.label}</p>
                <p className="mt-0.5 text-[9px] text-zinc-600">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <TextArea label="Hedef kitle" value={form.targetAudience} onChange={(v) => updateField('targetAudience', v)} placeholder="Kim için üretiyorsunuz? Yaş, ilgi alanları, davranış..." rows={2} />
        <TextArea label="Görsel stil" value={form.visualStyle} onChange={(v) => updateField('visualStyle', v)} placeholder="Örn: sıcak doğal ışık, premium minimal, gerçek mekan fotoğrafları, pastel renkler..." rows={2} />
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="mb-4">
            <p className="text-sm font-semibold text-white">Sosyal medya template brand kit</p>
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">Canva şablonları ve AI görsel üretimi bu kuralları kullanır.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary font" value={form.primaryFont ?? ''} onChange={(v) => updateField('primaryFont', v)} placeholder="Örn: Montserrat" />
            <Field label="Secondary font" value={form.secondaryFont ?? ''} onChange={(v) => updateField('secondaryFont', v)} placeholder="Örn: Playfair Display" />
            <Field label="Brand colors" value={form.brandColors ?? ''} onChange={(v) => updateField('brandColors', v)} placeholder="#111827, #F97316" />
            <Field label="Accent colors" value={form.accentColors ?? ''} onChange={(v) => updateField('accentColors', v)} placeholder="#FDE68A, #22C55E" />
          </div>
          <div className="mt-4 grid gap-4">
            <TextArea label="Sosyal template stili" value={form.socialTemplateStyle ?? ''} onChange={(v) => updateField('socialTemplateStyle', v)} placeholder="Örn: büyük başlık, bol boşluk, gerçek fotoğraf üstüne minimal CTA..." rows={2} />
            <TextArea label="Logo kullanım kuralları" value={form.logoUsageRules ?? ''} onChange={(v) => updateField('logoUsageRules', v)} placeholder="Örn: logo sağ üstte küçük kullanılsın..." rows={2} />
          </div>
        </div>
        <TextArea label="Kampanya hedefleri" value={form.campaignGoals} onChange={(v) => updateField('campaignGoals', v)} placeholder="Marka bilinirliği, satış artışı, müşteri sadakati..." rows={2} />
        <TextArea label="Rakipler" value={form.competitors} onChange={(v) => updateField('competitors', v)} placeholder="Rakip markalar, virgülle ayırın" rows={2} />
        <TextArea label="Agent marka kuralları" value={form.customRules} onChange={(v) => updateField('customRules', v)} placeholder="Örn: Fiyat iddiası yapma, samimi ama abartısız konuş..." rows={3} />
      </div>
    </div>
  );
}

function BrandMemoryMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-600">{label}</p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-zinc-500">{hint}</p>
    </div>
  );
}

function DiscoveryChips({ title, items, tone = 'emerald' }: { title: string; items: string[]; tone?: 'emerald' | 'amber' }) {
  const color = tone === 'amber'
    ? 'border-amber-400/20 bg-amber-400/[0.08] text-amber-100'
    : 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-100';

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length > 0 ? items.slice(0, 6).map((item) => (
          <span key={item} className={`rounded-full border px-2 py-1 text-[10px] ${color}`}>
            {item}
          </span>
        )) : (
          <span className="text-[11px] text-zinc-600">Henüz çıkarılamadı</span>
        )}
      </div>
    </div>
  );
}

function PermissionsStep({ mode, setMode }: { mode: ApprovalMode; setMode: (m: ApprovalMode) => void }) {
  const modes: { value: ApprovalMode; label: string; desc: string; icon: typeof Shield }[] = [
    { value: 'SuggestOnly', label: 'Sadece Öneri', desc: 'Agentlar öneri üretir; provider execution için ayrıca manuel karar gerekir.', icon: Shield },
    { value: 'SuggestAndWait', label: 'Öner + Onay Bekle', desc: 'Agentlar öneri üretir ve aksiyon Pending kalır; onaydan sonra dry-run veya live çalıştırabilirsiniz.', icon: Target },
    { value: 'AutoExecute', label: 'Otomatik Onayla', desc: 'Uygun actionlar Approved başlar; live execution yine rol izni, entegrasyon ve quota kontrolünden geçer.', icon: Zap },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">Operasyon İzinleri</h2>
        <p className="mt-1 text-sm text-zinc-500">AI agentlarınızın çıktıları nasıl uygulayacağını belirleyin.</p>
      </div>
      <div className="space-y-3">
        {modes.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMode(m.value)}
            className="flex w-full items-start gap-4 rounded-xl p-5 text-left transition-all"
            style={{
              background: mode === m.value ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.015)',
              border: mode === m.value ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: mode === m.value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)' }}>
              <m.icon className={`h-5 w-5 ${mode === m.value ? 'text-indigo-400' : 'text-zinc-600'}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className={`text-sm font-semibold ${mode === m.value ? 'text-white' : 'text-zinc-400'}`}>{m.label}</p>
                {mode === m.value && <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[9px] font-bold text-indigo-300">SEÇİLİ</span>}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600">{m.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function LaunchStep({
  brandName,
  status,
  onLaunch,
  loading,
}: {
  brandName: string;
  status?: OnboardingStatus;
  onLaunch: () => void;
  loading: boolean;
}) {
  const checks = status?.checks ?? [];
  const firstRunDone = checks.find((check) => check.id === 'first_run')?.complete ?? false;

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 40px rgba(99,102,241,0.3)' }}>
        <Sparkles className="h-10 w-10 text-white" />
      </div>
      <h2 className="text-2xl font-bold text-white">Launch Readiness</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-500">
        {brandName ? `${brandName} için` : ''} AI operasyon ekibinizin müşteri kullanıma hazır olup olmadığını son kez kontrol edin.
      </p>

      <div className="mt-8 grid w-full max-w-xl gap-2 text-left">
        {checks.map((check) => (
          <div
            key={check.id}
            className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"
          >
            <div
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
              style={{ background: check.complete ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.1)' }}
            >
              {check.complete ? <Check className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-white">{check.label}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-zinc-600">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {status && !status.readyForLaunch && (
        <div className="mt-5 max-w-xl rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
          <p className="text-sm font-semibold text-amber-100">Kurulum henüz tam değil</p>
          <p className="mt-1 text-[12px] leading-5 text-amber-100/60">
            Operasyona geçebilirsiniz, fakat müşteri kullanımı için en az profil, paket ve izin adımlarını tamamlamanız önerilir.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onLaunch}
        disabled={loading}
        className="mt-8 flex items-center gap-2 rounded-xl px-8 py-3 text-sm font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, #6366f1, #7c3aed)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}
      >
        {loading
          ? 'Başlatılıyor...'
          : firstRunDone
            ? <>Operasyona Başla <ArrowRight className="h-4 w-4" /></>
            : <>Dashboard’da İlk AI Önerisini Başlat <ArrowRight className="h-4 w-4" /></>}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <Label>
        {label} {required && <span className="text-error-500">*</span>}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800"
      >
        <option value="">Seçin...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <Label>{label}</Label>
      <TailAdminTextArea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

/* ── New helpers ──────────────────────────────────────────────────────── */

function buildAnalyzeMessage(
  data: BrandDiscoveryResult,
  py: PythonBrandAnalyzeResponse | null,
): string {
  if (!data.success || !data.fetchOk) {
    return 'Discovery sınırlı veriyle tamamlandı. Aşağıdaki eksik soruları kontrol edin.';
  }
  const pillars = data.report.contentPillars.length;
  const templates = data.report.templateNeeds.length;
  let msg = `Brand Discovery tamamlandı. ${pillars} içerik pillar'ı ve ${templates} template ihtiyacı çıkarıldı.`;
  if (py?.confidence != null) {
    msg += ` Güvenilirlik: ${py.confidence}%${py.confidence < 50 ? ' (düşük — daha fazla URL ekleyin)' : ''}.`;
  }
  return msg;
}

function SourceStatusChip({
  name,
  source,
}: {
  name: string;
  source: { attempted: boolean; ok: boolean; error: string | null; data_points: string[] };
}) {
  if (!source.attempted) return null;
  const label = { website: 'Web sitesi', instagram: 'Instagram', google: 'Google' }[name] ?? name;
  return (
    <div
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]"
      style={{
        background: source.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${source.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
        color: source.ok ? '#22c55e' : '#ef4444',
      }}
    >
      <span>{source.ok ? '✓' : '✗'}</span>
      <span className="font-semibold">{label}</span>
      {source.ok && source.data_points.length > 0 && (
        <span className="text-zinc-600">({source.data_points.slice(0, 2).join(', ')})</span>
      )}
      {!source.ok && source.error && (
        <span className="text-[10px] text-red-500/70 max-w-[200px] truncate" title={source.error}>
          — {source.error}
        </span>
      )}
    </div>
  );
}

function BrandConstitutionPanel({
  pythonResult,
  confirmed,
  confirming,
  workspaceId,
  onConfirm,
}: {
  pythonResult: PythonBrandAnalyzeResponse;
  confirmed: boolean;
  confirming: boolean;
  workspaceId: string;
  onConfirm: () => void;
}) {
  // Editable corrections — industry and pillars can be wrong from auto-detection
  const detectedPlaybook = PLAYBOOK_OPTIONS.find(p =>
    p.id === pythonResult.inferred_industry || p.label === pythonResult.inferred_industry
  ) ?? PLAYBOOK_OPTIONS[0]!;

  const [selectedPlaybook, setSelectedPlaybook] = useState(detectedPlaybook.id);
  const [saving, setSaving] = useState(false);
  const [corrected, setCorrected] = useState(false);

  const isWrongDetection = selectedPlaybook !== detectedPlaybook.id;
  const pillarsForSelected = PLAYBOOK_PILLARS[selectedPlaybook] ?? pythonResult.content_pillars;

  async function saveCorrection() {
    if (!isWrongDetection) { onConfirm(); return; }
    setSaving(true);
    try {
      // PATCH brand context with corrected business_type and pillars
      await fetch(`/api/brand-context/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_type: selectedPlaybook,
          content_pillars: JSON.stringify(pillarsForSelected),
          custom_rules: `İşletme türü elle düzeltildi: ${selectedPlaybook}. İçerik fikirleri bu türe uygun olmalıdır.`,
        }),
      });
      setCorrected(true);
    } catch { /* non-fatal */ } finally {
      setSaving(false);
      onConfirm();
    }
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: confirmed ? 'rgba(34,197,94,0.06)' : 'rgba(99,102,241,0.06)',
        border: confirmed ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(99,102,241,0.18)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5">
          {confirmed
            ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            : <Sparkles className="h-5 w-5 text-indigo-400 shrink-0" />}
          <div>
            <p className="text-[14px] font-semibold text-white">
              {confirmed ? 'Brand Constitution onaylandı ✓' : 'Brand Constitution — onay bekliyor'}
            </p>
            <p className="text-[11px] text-zinc-500">
              {confirmed
                ? 'Ajanlar bu profili kullanarak içerik üretir.'
                : 'Sektörü kontrol edin — yanlışsa düzeltin, sonra onaylayın.'}
            </p>
          </div>
        </div>
        {!confirmed && (
          <button
            type="button"
            onClick={saveCorrection}
            disabled={confirming || saving}
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', boxShadow: '0 0 15px rgba(99,102,241,0.3)' }}
          >
            {(confirming || saving) ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Onaylanıyor…</>
            ) : (
              <><CheckCircle2 className="h-4 w-4" /> {isWrongDetection ? 'Düzelt ve Onayla' : 'Marka profilini onayla'}</>
            )}
          </button>
        )}
      </div>

      {/* Editable fields */}
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <ConstitutionField label="Ton" value={pythonResult.inferred_tone} />

        {/* Industry — EDITABLE dropdown */}
        <div className="rounded-xl px-3 py-2.5 sm:col-span-2" style={{
          background: isWrongDetection ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.04)',
          border: isWrongDetection ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.06)',
        }}>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-700 mb-1.5">
            Sektör / İşletme Türü
            {isWrongDetection && <span className="ml-2 text-amber-500 normal-case font-normal">— düzeltildi</span>}
          </p>
          {confirmed ? (
            <p className="text-[12px] text-white/80">{PLAYBOOK_OPTIONS.find(p => p.id === selectedPlaybook)?.label ?? selectedPlaybook}</p>
          ) : (
            <select
              value={selectedPlaybook}
              onChange={(e) => setSelectedPlaybook(e.target.value)}
              className="w-full bg-transparent text-[12px] text-white/90 outline-none cursor-pointer"
              style={{ appearance: 'auto' }}
            >
              {PLAYBOOK_OPTIONS.map(p => (
                <option key={p.id} value={p.id} style={{ background: '#1a1a2e', color: '#fff' }}>
                  {p.label}{p.id === detectedPlaybook.id ? ' (otomatik tespit)' : ''}
                </option>
              ))}
            </select>
          )}
          {isWrongDetection && !confirmed && (
            <p className="mt-1.5 text-[10px] text-amber-400/80">
              ⚠ Otomatik tespit &ldquo;{detectedPlaybook.label}&rdquo; yaptı — yanlış sektör seçimi ajanlara hatalı içerik ürettirir.
            </p>
          )}
        </div>

        {/* Content Pillars — shows updated pillars if industry changed */}
        <ConstitutionField
          label="Content Pillars"
          value={(isWrongDetection ? pillarsForSelected : pythonResult.content_pillars).join(', ') || '—'}
        />
        <ConstitutionField label="Varsayılan CTA'lar" value={pythonResult.default_ctas.join(' · ') || '—'} />
        <ConstitutionField
          label="Onay gerektiren sinyaller"
          value={
            Object.entries(pythonResult.risk_rules)
              .filter(([, v]) => v === 'approval_required')
              .map(([k]) => k)
              .join(', ') || 'Yok'
          }
        />
        <ConstitutionField
          label="Top hashtag'ler"
          value={pythonResult.instagram_top_hashtags.slice(0, 5).join(' ') || '—'}
        />
      </div>

      {/* Confidence bar */}
      <div className="px-5 pb-5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-700">Güvenilirlik</p>
          <p className="text-[12px] font-semibold" style={{ color: pythonResult.confidence >= 70 ? '#22c55e' : pythonResult.confidence >= 40 ? '#f59e0b' : '#ef4444' }}>
            {pythonResult.confidence}%
          </p>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          <div className="h-full rounded-full transition-[width]"
            style={{
              width: `${pythonResult.confidence}%`,
              background: pythonResult.confidence >= 70 ? '#22c55e' : pythonResult.confidence >= 40 ? '#f59e0b' : '#ef4444',
            }} />
        </div>
        {pythonResult.confidence < 50 && (
          <p className="mt-2 text-[11px] text-amber-500">
            Düşük güvenilirlik — web sitesi + Instagram ekleyerek analizi iyileştirebilirsiniz.
          </p>
        )}
      </div>
    </div>
  );
}

function ConstitutionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-700">{label}</p>
      <p className="mt-1 text-[12px] text-white/80">{value}</p>
    </div>
  );
}

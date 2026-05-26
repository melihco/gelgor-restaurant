'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Beaker,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { logoutFromBrowser } from '@/lib/browser-logout';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { DEFAULT_OFFICE_ID, DEFAULT_TENANT_ID } from '@/lib/runtime-config';
import type {
  ApprovalMode,
  BrandDiscoveryResult,
  CompanyProfile,
  SaveCompanyProfileRequest,
} from '@/types';

function profileToForm(p: CompanyProfile): SaveCompanyProfileRequest {
  return {
    brandName: p.brandName ?? '',
    industry: p.industry ?? '',
    location: p.location ?? '',
    brandTone: p.brandTone ?? 'professional',
    targetAudience: p.targetAudience ?? '',
    visualStyle: p.visualStyle ?? '',
    campaignGoals: p.campaignGoals ?? '',
    competitors: p.competitors ?? '',
    customRules: p.customRules ?? '',
    languages: p.languages ?? 'tr',
    logoUrl: p.logoUrl ?? '',
    websiteUrl: p.websiteUrl ?? '',
    description: p.description ?? '',
    primaryFont: p.primaryFont ?? '',
    secondaryFont: p.secondaryFont ?? '',
    brandColors: p.brandColors ?? '',
    accentColors: p.accentColors ?? '',
    socialTemplateStyle: p.socialTemplateStyle ?? '',
    logoUsageRules: p.logoUsageRules ?? '',
    defaultApprovalMode: (p.defaultApprovalMode as ApprovalMode) || 'SuggestAndWait',
    instagramHandle: p.instagramHandle ?? '',
    googleBusinessUrl: p.googleBusinessUrl ?? '',
    brandImageUrls: p.brandImageUrls ?? '',
    platformProfiles: p.platformProfiles ?? '[]',
    contentNeeds: p.contentNeeds ?? '[]',
    templateFamilies: p.templateFamilies ?? '[]',
    riskRules: p.riskRules ?? '{}',
    customerVisibleSummary: p.customerVisibleSummary ?? '',
    systemIntelligence: p.systemIntelligence ?? '',
    discoveryConfidence: p.discoveryConfidence ?? null,
    creativeProfileConfirmedAt: p.creativeProfileConfirmedAt ?? null,
  };
}

const emptyForm = (): SaveCompanyProfileRequest => profileToForm({
  id: '',
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
  defaultApprovalMode: 'SuggestAndWait',
  setupCompleted: false,
  platformProfiles: '[]',
  contentNeeds: '[]',
  templateFamilies: '[]',
  riskRules: '{}',
  customerVisibleSummary: '',
  systemIntelligence: '',
} as CompanyProfile);

export default function SetupLabPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SaveCompanyProfileRequest>(emptyForm);
  const [initialized, setInitialized] = useState(false);
  const [applyDiscovery, setApplyDiscovery] = useState(true);
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [lastDiscovery, setLastDiscovery] = useState<BrandDiscoveryResult | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [newTenantBusy, setNewTenantBusy] = useState(false);

  const { data: security, isError: authError, isLoading: authLoading } = useQuery({
    queryKey: ['current-user-security'],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    retry: false,
  });

  const {
    data: profile,
    isLoading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
    enabled: !authError && !!security,
    retry: false,
  });

  useEffect(() => {
    if (!profile || initialized) return;
    setForm(profileToForm(profile));
    setInitialized(true);
  }, [profile, initialized]);

  const saveMutation = useMutation({
    mutationFn: () => apiClient.saveCompanyProfile(form),
    onSuccess: async () => {
      setErrorMsg(null);
      setStatusMsg('Profil kaydedildi.');
      await queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    },
    onError: (e) => {
      setStatusMsg(null);
      setErrorMsg(toUserFriendlyApiError(e, 'Profil kaydedilemedi.').detail);
    },
  });

  const discoverMutation = useMutation({
    mutationFn: () =>
      apiClient.discoverBrand({
        websiteUrl: form.websiteUrl.trim(),
        instagramHandle: form.instagramHandle?.trim(),
        googleBusinessUrl: form.googleBusinessUrl?.trim(),
        primaryGoal: primaryGoal.trim() || undefined,
        applyToProfile: applyDiscovery,
      }),
    onSuccess: async (result) => {
      setErrorMsg(null);
      setLastDiscovery(result);
      setStatusMsg(result.message || 'Keşif tamamlandı.');
      await queryClient.invalidateQueries({ queryKey: ['company-profile'] });
      if (result.profile) setForm(profileToForm(result.profile));
      setInitialized(true);
    },
    onError: (e) => {
      setStatusMsg(null);
      setErrorMsg(toUserFriendlyApiError(e, 'Marka keşfi başarısız.').detail);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: () => apiClient.analyzeBrand(),
    onSuccess: async () => {
      setErrorMsg(null);
      setStatusMsg('Sosyal / hesap analizi tamamlandı (BrandAnalysis güncellendi).');
      await queryClient.invalidateQueries({ queryKey: ['company-profile'] });
    },
    onError: (e) => {
      setStatusMsg(null);
      setErrorMsg(toUserFriendlyApiError(e, 'Analiz başarısız.').detail);
    },
  });

  const startNewTenant = useCallback(async () => {
    setNewTenantBusy(true);
    setErrorMsg(null);
    try {
      await logoutFromBrowser();
      useWorkspaceStore.getState().setWorkspace(DEFAULT_TENANT_ID, DEFAULT_OFFICE_ID);
      queryClient.clear();
      window.location.replace(`/?register=1&_=${Date.now()}`);
    } finally {
      setNewTenantBusy(false);
    }
  }, [queryClient]);

  const reindexMutation = useMutation({
    mutationFn: () => apiClient.reindexBrandMemory(),
    onSuccess: () => {
      setErrorMsg(null);
      setStatusMsg('Marka belleği yeniden indeks isteği gönderildi.');
    },
    onError: (e) => {
      setErrorMsg(toUserFriendlyApiError(e, 'İndeksleme başarısız.').detail);
    },
  });

  const updateField = useCallback((field: keyof SaveCompanyProfileRequest, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const canDiscover =
    form.websiteUrl.trim().length > 0 ||
    (form.instagramHandle?.trim().length ?? 0) > 0 ||
    (form.googleBusinessUrl?.trim().length ?? 0) > 0;

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#030712] text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (authError || !security) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#030712] px-4 text-center">
        <Beaker className="h-10 w-10 text-indigo-400" />
        <h1 className="text-xl font-semibold text-white">Oturum gerekli</h1>
        <p className="max-w-md text-sm text-gray-400">
          Bu laboratuvar ekranı giriş yapmış bir tenant ile çalışır. Önce ana sayfadan giriş yapın veya yeni hesap oluşturun.
        </p>
        <Link
          href="/"
          className="rounded-xl bg-indigo-500 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-400"
        >
          Giriş sayfasına git
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-10%,rgba(99,102,241,0.18),transparent_55%)]" />

      <header className="relative z-10 border-b border-white/[0.06] bg-[#030712]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <SmartAgencyLogo variant="markOnly" priority className="h-10 w-10" />
            <div>
              <h1 className="text-sm font-semibold text-white">Kurulum laboratuvarı</h1>
              <p className="text-[11px] text-gray-500">Tenant: {security.tenantId.slice(0, 8)}…</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/customer-setup" className="text-xs font-medium text-gray-400 hover:text-white">
              Müşteri LP →
            </Link>
            <Link href="/" className="text-xs font-medium text-gray-400 hover:text-white">
              Ana uygulama →
            </Link>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-4xl px-4 pt-6 sm:px-6">
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-amber-100">Yeni tenant (izole workspace)</h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
            Şu an Sunu gibi mevcut bir tenant ile oturum açıksanız, yeni şirket için önce çıkış yapılmalı.
            Aşağıdaki düğme oturumu kapatır ve kayıt formunu açar — kayıt Nexus’ta yeni Tenant + Office + Owner oluşturur.
          </p>
          <button
            type="button"
            disabled={newTenantBusy}
            onClick={() => void startNewTenant()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-gray-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {newTenantBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
            Çıkış yap ve yeni tenant kaydı
          </button>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
        {(statusMsg || errorMsg) && (
          <div
            className={cn(
              'rounded-xl border px-4 py-3 text-sm',
              errorMsg
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
            )}
          >
            {errorMsg || statusMsg}
          </div>
        )}

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Wand2 className="h-5 w-5 text-cyan-400" />
              Marka keşfi (web + sosyal sinyal)
            </h2>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={applyDiscovery}
                onChange={(e) => setApplyDiscovery(e.target.checked)}
                className="rounded border-gray-600 bg-[#0a0f1a]"
              />
              Sonucu CompanyProfile&apos;a yaz
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Nexus <code className="rounded bg-black/30 px-1 py-0.5">POST /api/setup/brand-discovery</code> — Python{' '}
            <code className="rounded bg-black/30 px-1 py-0.5">analyze-brand</code>. En az bir URL gerekir.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Web sitesi" value={form.websiteUrl} onChange={(v) => updateField('websiteUrl', v)} placeholder="https://..." />
            <Field label="Primary goal (opsiyonel)" value={primaryGoal} onChange={setPrimaryGoal} placeholder="Örn. içerik otomasyonu" />
            <Field label="Instagram (kullanıcı adı, @ yok)" value={form.instagramHandle ?? ''} onChange={(v) => updateField('instagramHandle', v)} />
            <Field label="Google İşletme URL" value={form.googleBusinessUrl ?? ''} onChange={(v) => updateField('googleBusinessUrl', v)} />
          </div>
          <button
            type="button"
            disabled={!canDiscover || discoverMutation.isPending}
            onClick={() => discoverMutation.mutate()}
            className={cn(
              'mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition',
              canDiscover && !discoverMutation.isPending
                ? 'bg-cyan-500 text-gray-950 hover:bg-cyan-400'
                : 'cursor-not-allowed bg-gray-700 text-gray-500',
            )}
          >
            {discoverMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Keşfi çalıştır
          </button>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Sparkles className="h-5 w-5 text-violet-400" />
            Hesap derin analizi
          </h2>
          <p className="mt-2 text-xs text-gray-500">
            <code className="rounded bg-black/30 px-1 py-0.5">POST /api/setup/analyze-brand</code> — Profilde Instagram{' '}
            <strong>veya</strong> Google İşletme dolu olmalı.
          </p>
          <button
            type="button"
            disabled={analyzeMutation.isPending}
            onClick={() => analyzeMutation.mutate()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/15 px-5 py-2.5 text-sm font-semibold text-violet-200 hover:bg-violet-500/25 disabled:opacity-50"
          >
            {analyzeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sosyal analizi çalıştır
          </button>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Save className="h-5 w-5 text-emerald-400" />
              Şirket profili (manuel kayıt)
            </h2>
            <button
              type="button"
              disabled={profileLoading}
              onClick={() => void refetchProfile()}
              className="inline-flex items-center gap-2 text-xs font-semibold text-gray-400 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', profileLoading && 'animate-spin')} />
              Sunucudan yenile
            </button>
          </div>
          {profileError && (
            <p className="mt-2 text-xs text-amber-400">
              Profil okunamadı — tenant&apos;ta henüz profil yoksa keşif ile oluşturulabilir.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Marka adı" value={form.brandName} onChange={(v) => updateField('brandName', v)} />
            <Field label="Sektör" value={form.industry} onChange={(v) => updateField('industry', v)} />
            <Field label="Lokasyon" value={form.location} onChange={(v) => updateField('location', v)} />
            <Field label="Ton" value={form.brandTone} onChange={(v) => updateField('brandTone', v)} />
            <Field label="Hedef kitle" value={form.targetAudience} onChange={(v) => updateField('targetAudience', v)} />
            <Field label="Görsel stil" value={form.visualStyle} onChange={(v) => updateField('visualStyle', v)} />
            <Field label="Kampanya hedefleri" value={form.campaignGoals} onChange={(v) => updateField('campaignGoals', v)} />
            <Field label="Diller" value={form.languages} onChange={(v) => updateField('languages', v)} />
            <div className="sm:col-span-2">
              <Field label="Açıklama" value={form.description} onChange={(v) => updateField('description', v)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Profili kaydet
            </button>
            <button
              type="button"
              disabled={reindexMutation.isPending}
              onClick={() => reindexMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-white/[0.05]"
            >
              {reindexMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Vektör belleği reindex
            </button>
          </div>
        </section>

        {lastDiscovery?.report && (
          <section className="rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.06] p-6">
            <h2 className="text-lg font-semibold text-white">Son keşif raporu</h2>
            <p className="mt-1 text-xs text-gray-500">
              fetchOk: {String(lastDiscovery.fetchOk)} · analyzedAt: {lastDiscovery.analyzedAt ?? '—'}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <ReportRow label="Marka" value={lastDiscovery.report.brandName} />
              <ReportRow label="Sektör" value={lastDiscovery.report.industry} />
              <ReportRow label="Özet" value={lastDiscovery.report.websiteSummary} className="sm:col-span-2" />
              <ReportList label="Hedef kitle" items={lastDiscovery.report.targetAudience} />
              <ReportList label="İçerik sütunları" items={lastDiscovery.report.contentPillars} />
              <ReportList label="Şablon ihtiyaçları" items={lastDiscovery.report.templateNeeds} />
              <ReportList label="Eksik sorular" items={lastDiscovery.report.missingQuestions} />
            </dl>
            {lastDiscovery.analysisText ? (
              <details className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-gray-400">analysis_text (tam metin)</summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] text-gray-400">
                  {lastDiscovery.analysisText}
                </pre>
              </details>
            ) : null}
          </section>
        )}

        {profile && (
          <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h2 className="text-lg font-semibold text-white">Sunucudaki profil özeti</h2>
            <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <ReportRow label="brandAnalyzedAt" value={profile.brandAnalyzedAt ?? '—'} />
              <ReportRow label="setupCompleted" value={String(profile.setupCompleted)} />
            </dl>
            {profile.brandAnalysis ? (
              <details className="mt-3 rounded-xl border border-white/[0.08] bg-black/20 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-gray-400">BrandAnalysis</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-gray-400">
                  {profile.brandAnalysis}
                </pre>
              </details>
            ) : (
              <p className="mt-2 text-xs text-gray-500">BrandAnalysis henüz boş.</p>
            )}
          </section>
        )}

        <p className="text-center text-[11px] text-gray-600">
          İkinci tenant için ana uygulamada ayrı hesap ile giriş yapın veya seed ile tanımlı kullanıcı kullanın.
          <Link href="/customer-setup" className="ml-1 text-indigo-400 hover:underline">
            Müşteri LP
          </Link>
          <ArrowRight className="mx-1 inline h-3 w-3" />
        </p>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-lg border border-white/[0.1] bg-[#0a0f1a] px-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-indigo-500/40"
      />
    </label>
  );
}

function ReportRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-200">{value || '—'}</dd>
    </div>
  );
}

function ReportList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <dt className="text-[10px] uppercase text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-300">
        {items?.length ? (
          <ul className="list-inside list-disc space-y-0.5">
            {items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          '—'
        )}
      </dd>
    </div>
  );
}

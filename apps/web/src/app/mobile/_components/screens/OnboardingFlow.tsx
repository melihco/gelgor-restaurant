'use client';
/**
 * ONBOARDING FLOW — Discover → Sign up → Confirm brand → Typography → Gallery → Templates → Welcome
 */
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../auth-store';
import { apiClient } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';
import { getRequestContextHeaders } from '@/lib/runtime-config';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { humanizeMobileServiceError } from '@/lib/mobile-customer-copy';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { BrandDiscoveryResult, BrandIntelligenceReport } from '@/types';
import Image from 'next/image';
import {
  SMART_AGENCY_MARK_TRANSPARENT_SRC,
  SmartAgencyLogo,
} from '@/components/brand/SmartAgencyLogo';
import { StoryNavigation } from '../StoryNavigation';
import {
  OnboardingChromeBackdrop,
  OnboardingPreviewIcon,
  OnboardingProgressRail,
  OnboardingStatusPill,
  OnboardingStepDot,
  OnboardingSuccessMark,
} from '../OnboardingChrome';
import { SA_ONBOARDING } from '../sa-chrome';
import {
  TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS,
  buildUserConfirmedTypographyPatch,
  resolvePostDesignDefaultsForTypography,
  resolveSuggestedTypographyConfig,
} from '@/lib/typography-design-policy';
import type { BrandDesignTypographyConfig, TypographyVibe } from '@/types/brand-theme';
import {
  BRAND_TONE_PRESETS,
  pythonToneToPreset,
  type BrandTonePreset,
} from '@/lib/sync-company-profile-from-python';
import { normalizeSectorId } from '@/lib/sector-production-profile';
import { serviceProfileCategoryForSector } from '@/lib/canonical-sector';

// ─── Types ────────────────────────────────────────────────────────────
type Step =
  | 'url'
  | 'analyzing'
  | 'results'
  | 'signup'
  | 'brand_confirm'
  | 'typography_confirm'
  | 'gallery_ready'
  | 'templates_showcase'
  | 'welcome';

type DiscoveryResultWithCache = BrandDiscoveryResult & { previewCacheKey?: string };

const ONBOARDING_SECTORS: { id: string; label: string }[] = [
  { id: 'beach_club', label: 'Beach club' },
  { id: 'restaurant_cafe', label: 'Restoran / cafe' },
  { id: 'hotel_resort', label: 'Otel / resort' },
  { id: 'local_products_shop', label: 'Yöresel ürün' },
  { id: 'pub', label: 'Bar / pub' },
  { id: 'beauty_wellness', label: 'Güzellik / wellness' },
  { id: 'coffee_shop', label: 'Kahve' },
  { id: 'fashion_retail', label: 'Moda / retail' },
  { id: 'event_management', label: 'Düğün / etkinlik' },
  { id: 'kids_party_venue', label: 'Çocuk parti evi' },
  { id: 'general_business', label: 'Diğer' },
];

const TONE_LABELS: Record<BrandTonePreset, string> = {
  professional: 'Profesyonel',
  friendly: 'Samimi',
  energetic: 'Enerjik',
  luxury: 'Premium',
  casual: 'Rahat',
};

interface ShowcaseTemplate {
  id: string;
  template_type: string;
  template_name: string;
  format: string;
  thumbnail_url: string | null;
}

interface AnalysisStep {
  id: string;
  label: string;
  detail: string;
  durationMs: number;
  done: boolean;
  active: boolean;
}

// ─── Analysis steps definition ────────────────────────────────────────
const ANALYSIS_STEPS_WEB: Omit<AnalysisStep, 'done' | 'active'>[] = [
  { id: 'crawl',     label: 'Web sitesi taranıyor',       detail: 'Sayfa içeriği ve başlıklar okunuyor',         durationMs: 2200 },
  { id: 'brand',     label: 'Marka kimliği çıkarılıyor',  detail: 'İsim, ton, sektör belirleniyor',              durationMs: 1800 },
  { id: 'visual',    label: 'Görsel dil analiz ediliyor',  detail: 'Renk paleti ve stil değerlendiriliyor',       durationMs: 1600 },
  { id: 'audience',  label: 'Hedef kitle modelleniyor',   detail: 'Demografik profil çıkarılıyor',               durationMs: 1500 },
  { id: 'content',   label: 'İçerik ihtiyaçları tespiti', detail: 'Hangi içerik türleri gerekli?',              durationMs: 1400 },
  { id: 'templates', label: 'Şablon ailesi seçiliyor',    detail: 'Markaya uygun şablonlar belirleniyor',    durationMs: 1200 },
  { id: 'finalize',  label: 'Marka profili oluşturuluyor', detail: 'AI marka profilinizi tamamlıyor',         durationMs: 1000 },
];

const ANALYSIS_STEPS_IG: Omit<AnalysisStep, 'done' | 'active'>[] = [
  { id: 'crawl',     label: 'Instagram profili inceleniyor', detail: 'Biyografi, gönderiler ve hashtagler okunuyor', durationMs: 2400 },
  { id: 'visual',    label: 'Feed görselleri analiz ediliyor', detail: 'Renk paleti ve görsel dil tespit ediliyor',   durationMs: 1800 },
  { id: 'brand',     label: 'Marka kimliği çıkarılıyor',    detail: 'İsim, ton, sektör belirleniyor',              durationMs: 1800 },
  { id: 'audience',  label: 'Hedef kitle modelleniyor',     detail: 'Takipçi profili ve içerik dengesi analiz ediliyor', durationMs: 1500 },
  { id: 'content',   label: 'İçerik stratejisi üretiliyor', detail: 'Sektöre özel yayın takvimi hazırlanıyor',     durationMs: 1400 },
  { id: 'templates', label: 'Şablon ailesi seçiliyor',      detail: 'Markaya uygun şablonlar belirleniyor',        durationMs: 1200 },
  { id: 'finalize',  label: 'Marka profili oluşturuluyor',  detail: 'AI marka profilinizi tamamlıyor',             durationMs: 1000 },
];

function getAnalysisSteps(url: string, ig: string) {
  return (!url && ig) ? ANALYSIS_STEPS_IG : ANALYSIS_STEPS_WEB;
}

/** SmartAgency wordmark — shared across all onboarding steps */
function OnboardingLogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <SmartAgencyLogo
      variant="full"
      priority
      className={`onboarding-logo${compact ? ' onboarding-logo--compact' : ''}`}
    />
  );
}

function OnboardingLogoHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`onboarding-header${compact ? ' onboarding-header--compact' : ''}`}>
      <OnboardingLogoMark compact={compact} />
    </header>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function stripHandle(h: string): string {
  return h.replace('@', '').trim();
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

// ─── URL Step ─────────────────────────────────────────────────────────
function UrlStep({
  onNext,
  onLogin,
}: {
  onNext: (url: string, ig: string, menuUrl: string, googleBusinessUrl: string) => void;
  onLogin: () => void;
}) {
  const [url, setUrl] = useState('');
  const [ig, setIg] = useState('');
  const [menuUrl, setMenuUrl] = useState('');
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'web' | 'social'>('web');
  const [igOnlyAck, setIgOnlyAck] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 420);
    return () => clearTimeout(t);
  }, [mode]);

  function handleSubmit() {
    const cleanIg = stripHandle(ig);
    const normalizedGoogle = googleBusinessUrl.trim() ? normalizeUrl(googleBusinessUrl) : '';
    if (normalizedGoogle) {
      try { new URL(normalizedGoogle); } catch { setError('Geçerli bir Google Business linki girin'); return; }
    }
    if (mode === 'social') {
      if (!cleanIg && !normalizedGoogle) { setError('Instagram veya Google Business girin'); return; }
      const optionalWeb = url.trim() ? normalizeUrl(url) : '';
      if (optionalWeb) {
        try { new URL(optionalWeb); } catch { setError('Geçerli bir web sitesi URL\'i girin'); return; }
      }
      if (!optionalWeb && !igOnlyAck) {
        setError('Web sitesi olmadan devam için aşağıdaki uyarıyı onaylayın.');
        setExtrasOpen(true);
        return;
      }
      onNext(optionalWeb, cleanIg, '', normalizedGoogle);
      return;
    }
    const normalized = normalizeUrl(url);
    const normalizedMenu = menuUrl.trim() ? normalizeUrl(menuUrl) : '';
    if (!normalized && !cleanIg && !normalizedMenu && !normalizedGoogle) {
      setError('Web sitesi, menü, Instagram veya Google Business girin');
      return;
    }
    if (normalized) {
      try { new URL(normalized); } catch { setError('Geçerli bir URL girin (örn: siteniz.com)'); return; }
    }
    if (normalizedMenu) {
      try { new URL(normalizedMenu); } catch { setError('Geçerli bir menü linki girin'); return; }
    }
    onNext(normalized, cleanIg, normalizedMenu, normalizedGoogle);
  }

  const primaryFilled = mode === 'web' ? url.trim().length > 0 : ig.trim().length > 0;
  const extrasCount = [
    mode === 'web' ? menuUrl.trim() : url.trim(),
    mode === 'web' ? ig.trim() : '',
    googleBusinessUrl.trim(),
  ].filter(Boolean).length;

  return (
    <div
      className={`onboarding-shell onboarding-shell--discover${extrasOpen ? ' is-extras-open' : ''}`}
    >
      <OnboardingChromeBackdrop showMark={false} />

      <main className="discover-main">
        <header className="discover-top">
          <Image
            src={SMART_AGENCY_MARK_TRANSPARENT_SRC}
            alt="SmartAgency"
            width={1024}
            height={1024}
            priority
            className="discover-mark"
          />
          <h1 className="discover-hero-title">Markanı tanıyalım</h1>
          <p className="discover-hero-lead">
            Web sitesi veya Instagram
          </p>
        </header>

        <form
          id="discover-form"
          className="discover-form"
          onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          noValidate
        >
          <div className="discover-segment" role="tablist" aria-label="Ana kaynak">
            {([
              { key: 'web' as const, label: 'Web sitesi' },
              { key: 'social' as const, label: 'Instagram' },
            ]).map((opt) => (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={mode === opt.key}
                onClick={() => {
                  setMode(opt.key);
                  setError('');
                  setIgOnlyAck(false);
                }}
                className={`discover-segment-btn${mode === opt.key ? ' is-on' : ''}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="discover-panel">
            <label className="discover-hline">
              <span className="discover-hline-label">
                {mode === 'web' ? 'Web' : 'Instagram'}
              </span>
              <input
                ref={inputRef}
                value={mode === 'web' ? url : ig}
                onChange={(e) => {
                  if (mode === 'web') setUrl(e.target.value);
                  else setIg(e.target.value);
                  setError('');
                }}
                placeholder={mode === 'web' ? 'siteniz.com' : '@markaniz'}
                type={mode === 'web' ? 'url' : 'text'}
                inputMode={mode === 'web' ? 'url' : 'text'}
                autoComplete={mode === 'web' ? 'url' : 'username'}
                enterKeyHint="go"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`discover-hline-input${primaryFilled ? ' is-filled' : ''}`}
              />
            </label>

            {extrasOpen && (
              <>
                {mode === 'web' ? (
                  <>
                    <label className="discover-hline">
                      <span className="discover-hline-label">Menü</span>
                      <input
                        value={menuUrl}
                        onChange={(e) => { setMenuUrl(e.target.value); setError(''); }}
                        placeholder="menu.siteniz.com"
                        type="url"
                        inputMode="url"
                        enterKeyHint="next"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="discover-hline-input"
                      />
                    </label>
                    <label className="discover-hline">
                      <span className="discover-hline-label">Instagram</span>
                      <input
                        value={ig}
                        onChange={(e) => { setIg(e.target.value); setError(''); }}
                        placeholder="@markaniz"
                        inputMode="text"
                        enterKeyHint="next"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="discover-hline-input"
                      />
                    </label>
                  </>
                ) : (
                  <label className="discover-hline">
                    <span className="discover-hline-label">Web</span>
                    <input
                      value={url}
                      onChange={(e) => { setUrl(e.target.value); setError(''); setIgOnlyAck(false); }}
                      placeholder="siteniz.com · önerilir"
                      type="url"
                      inputMode="url"
                      enterKeyHint="next"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="discover-hline-input"
                    />
                  </label>
                )}
                <label className="discover-hline">
                  <span className="discover-hline-label">Google</span>
                  <input
                    value={googleBusinessUrl}
                    onChange={(e) => { setGoogleBusinessUrl(e.target.value); setError(''); }}
                    placeholder="maps / g.page linki"
                    type="url"
                    inputMode="url"
                    enterKeyHint="go"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="discover-hline-input"
                  />
                </label>
              </>
            )}

            <button
              type="button"
              className="discover-extras-row"
              aria-expanded={extrasOpen}
              onClick={() => setExtrasOpen((v) => !v)}
            >
              <span>
                {extrasOpen
                  ? 'Daha az'
                  : extrasCount > 0
                    ? `Ek kaynaklar · ${extrasCount}`
                    : 'Menü, Google ekle'}
              </span>
              <span className={`discover-extras-chevron${extrasOpen ? ' is-open' : ''}`} aria-hidden />
            </button>
          </div>

          {mode === 'social' && extrasOpen && !url.trim() && (
            <label className="discover-notice">
              <input
                type="checkbox"
                checked={igOnlyAck}
                onChange={(e) => { setIgOnlyAck(e.target.checked); setError(''); }}
              />
              <span>Web olmadan devam — kalite riskini kabul ediyorum</span>
            </label>
          )}

          {error && <p className="onboarding-error discover-error">{error}</p>}
        </form>
      </main>

      <footer className="discover-dock">
        <button type="submit" form="discover-form" className="onboarding-cta">
          Analizi başlat
        </button>
        <div className="discover-dock-meta">
          <span className="discover-dock-note">2–4 dk</span>
          <button type="button" onClick={onLogin} className="discover-login">
            Giriş yap
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── Analysis Step ─────────────────────────────────────────────────────
function AnalyzingStep({ url, ig, menuUrl, googleBusinessUrl, onDone }: {
  url: string; ig: string; menuUrl: string; googleBusinessUrl: string;
  onDone: (result: DiscoveryResultWithCache | null) => void;
}) {
  const baseSteps = getAnalysisSteps(url, ig);
  const [steps, setSteps] = useState<AnalysisStep[]>(
    baseSteps.map((s, i) => ({ ...s, done: false, active: i === 0 }))
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [apiResult, setApiResult] = useState<DiscoveryResultWithCache | null>(null);
  const [apiSettled, setApiSettled] = useState(false);
  const doneRef = useRef(false);
  const apiResultRef = useRef<DiscoveryResultWithCache | null>(null);

  // Pre-signup preview: full Python analyze (no auth / no DB persist)
  useEffect(() => {
    let cancelled = false;
    setApiSettled(false);
    fetch('/api/onboarding/preview-brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        websiteUrl: url,
        instagramHandle: ig || undefined,
        menuUrl: menuUrl || undefined,
        googleBusinessUrl: googleBusinessUrl || undefined,
      }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success !== false) {
          const result = json as DiscoveryResultWithCache;
          apiResultRef.current = result;
          setApiResult(result);
        } else {
          apiResultRef.current = null;
          setApiResult(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          apiResultRef.current = null;
          setApiResult(null);
        }
      })
      .finally(() => {
        if (!cancelled) setApiSettled(true);
      });
    return () => { cancelled = true; };
  }, [url, ig, menuUrl, googleBusinessUrl]);

  // Animate steps sequentially; finish only after API settles (or min animation time)
  useEffect(() => {
    if (currentIdx >= baseSteps.length) {
      if (!apiSettled || doneRef.current) return;
      doneRef.current = true;
      setTimeout(() => onDone(apiResultRef.current), 600);
      return;
    }
    const step = baseSteps[currentIdx]!;
    const timer = setTimeout(() => {
      setSteps(prev => prev.map((s, i) => ({
        ...s,
        done: i < currentIdx + 1,
        active: i === currentIdx + 1,
      })));
      setCurrentIdx(i => i + 1);
      setProgress(Math.round(((currentIdx + 1) / baseSteps.length) * 100));
    }, step.durationMs);
    return () => clearTimeout(timer);
  }, [currentIdx, apiSettled, onDone, baseSteps]);

  const domain = extractDomain(url);

  return (
    <div className="onboarding-shell">
      <OnboardingChromeBackdrop />

      <div className="onboarding-analyze-head">
        <OnboardingLogoMark compact />
        <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.45)', marginBottom: 6, letterSpacing: '0.04em' }}>
          Analiz ediliyor
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#F4F4F8', letterSpacing: '-0.02em', marginBottom: 4 }}>
          {domain}
        </div>
        {ig && <div style={{ fontSize: 13, color: '#9DBECE' }}>@{ig}</div>}
        <p style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', marginTop: 14, lineHeight: 1.5 }}>
          Genelde 2–4 dakika sürer. Bu ekranda kalabilirsiniz.
        </p>
      </div>

      {/* Progress ring — immersive ritual */}
      <div className="onboarding-analyze-ring" style={{ display: 'flex', justifyContent: 'center', padding: '24px 0 18px' }}>
        <div style={{ position: 'relative', width: 112, height: 112 }}>
          <div className="onboarding-setup-shimmer" aria-hidden style={{ inset: -8 }} />
          <svg width="112" height="112" style={{ transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
            <circle cx="56" cy="56" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
            <circle cx="56" cy="56" r="46" fill="none" stroke="url(#analyzeGrad)" strokeWidth="5"
              strokeDasharray={`${(progress / 100) * 289} 289`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 700ms cubic-bezier(0.22,1,0.36,1)', filter: 'drop-shadow(0 0 10px rgba(157,190,206,0.45))' }} />
            <defs>
              <linearGradient id="analyzeGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#4D7088" />
                <stop offset="55%" stopColor="#9DBECE" />
                <stop offset="100%" stopColor="#C8A86A" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#EAF1F6', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{progress}%</div>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(157,190,206,0.55)', marginTop: 2 }}>analiz</div>
          </div>
        </div>
      </div>

      {/* Steps list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 24px' }}>
        {steps.map((stepItem, i) => (
          <div key={stepItem.id} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            padding: '12px 0',
            borderBottom: i < steps.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
            opacity: stepItem.done ? 1 : stepItem.active ? 1 : 0.35,
            transition: 'opacity 300ms, transform 300ms',
            transform: stepItem.active ? 'translateX(2px)' : 'none',
          }}>
            <OnboardingStepDot
              state={stepItem.done ? 'done' : stepItem.active ? 'active' : 'idle'}
            />

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: stepItem.active ? 700 : 500, color: stepItem.done ? SA_ONBOARDING.doneBright : stepItem.active ? '#F4F4F8' : 'rgba(148,163,184,0.5)', marginBottom: 2, transition: 'color 300ms' }}>
                {stepItem.label}
              </div>
              {(stepItem.done || stepItem.active) && (
                <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', lineHeight: 1.4 }}>{stepItem.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Results Step ──────────────────────────────────────────────────────
// Works with real API data OR gracefully falls back to domain-derived previews.
// Pre-auth preview uses /api/onboarding/preview-brand (Python analyze, no persist).
// We always show a compelling screen; fallbacks apply when preview fails.
function ResultsStep({ result, url, ig, onNext }: {
  result: BrandDiscoveryResult | null;
  url: string;
  ig?: string;
  onNext: () => void;
}) {
  const domain = url ? extractDomain(url) : (ig ? `@${ig}` : 'Markanız');

  // ── Resolve data from real API or generate sensible fallbacks ──
  const report  = (result?.report ?? {}) as Partial<BrandIntelligenceReport>;
  const profile = result?.profile;
  const hasSignals = Boolean(
    report.brandName || report.industry || report.brandTone || report.contentPillars?.length || profile?.brandName,
  );
  const hasReal = hasSignals;
  const limitedPreview = Boolean(
    result
    && (
      result.fetchOk === false
      || (
        (result as { confidence?: number }).confidence != null
        && Number((result as { confidence?: number }).confidence) < 50
      )
    ),
  );

  const brandName = profile?.brandName ?? report.brandName ?? domain;
  const industry  = profile?.industry  ?? report.industry  ?? 'İşletme';
  const location  = profile?.location  ?? '';
  const tone      = (profile?.brandTone ?? report.brandTone ?? '').split(/[,\-·]/g).map(s => s.trim()).filter(Boolean).slice(0, 4);
  const audience  = (report.targetAudience ?? []).slice(0, 3);
  const pillars   = (report.contentPillars ?? []).slice(0, 4);
  const goals     = (report.primaryGoals   ?? []).slice(0, 3);
  const summary   = (report as any).websiteSummary as string | undefined;
  const rawConfidence = Number(
    (result as { confidence?: number } | null)?.confidence
      ?? profile?.discoveryConfidence
      ?? 0,
  );
  // Never invent a high score — missing confidence means unknown, show 0 / hide boast copy
  const confidence = Number.isFinite(rawConfidence) ? Math.min(Math.max(rawConfidence, 0), 100) : 0;
  const channels  = (report.preferredChannels ?? []).slice(0, 3);
  const resultMessage = typeof result?.message === 'string' ? result.message : '';

  // Fallback preview cards when API data is absent
  const fallbackCards = !hasReal ? [
    {
      label: 'Marka Analizi',
      icon: 'brand' as const,
      color: SA_ONBOARDING.doneBright,
      desc: url ? domain : (ig ? `@${ig}` : 'Markanız'),
    },
    {
      label: 'İçerik İhtiyaçları',
      icon: 'content' as const,
      color: '#6A8EA0',
      desc: 'Kayıt sonrası hazırlanır',
    },
    {
      label: 'AI Ekibi Hazır',
      icon: 'team' as const,
      color: SA_ONBOARDING.done,
      desc: 'İçerik, tasarım ve analiz',
    },
  ] : [];

  return (
    <div className="onboarding-shell" style={{ overflow: 'hidden' }}>

      <OnboardingChromeBackdrop success />

      <div className="onboarding-results-head">
        <OnboardingLogoMark compact />
        <OnboardingStatusPill>
          {limitedPreview ? 'Sınırlı Önizleme' : hasReal ? 'Analiz Tamamlandı' : 'Ön Tarama Tamamlandı'}
        </OnboardingStatusPill>

        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#F4F4F8', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 6 }}>
          {brandName}
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {industry !== 'İşletme' && (
            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.65)' }}>
              {industry}
            </span>
          )}
          {location && (
            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.65)' }}>
              {location}
            </span>
          )}
          {ig && (
            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(157,190,206,0.10)', color: '#9DBECE' }}>
              @{ig}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable results */}
      <div className="onboarding-stagger" style={{ flex: 1, overflowY: 'auto', padding: '4px 24px', paddingBottom: 120 }}>

        {/* AI Confidence Score — honest source-based score only */}
        {hasReal && confidence > 0 && (
          <div style={{ ...cardStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 54, height: 54, flexShrink: 0 }}>
              <svg width="54" height="54" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="27" cy="27" r="21" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
                <circle cx="27" cy="27" r="21" fill="none" stroke={confidence >= 60 ? '#4D7088' : '#B45309'} strokeWidth="5"
                  strokeDasharray={`${(confidence / 100) * 132} 132`} strokeLinecap="round"
                  style={{ filter: confidence >= 60 ? 'drop-shadow(0 0 5px rgba(77,112,136,0.5))' : 'none' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: confidence >= 60 ? '#9DBECE' : '#FBBF24', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(confidence)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F8', marginBottom: 3 }}>Kaynak Güveni</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)' }}>
                {confidence >= 80
                  ? 'Birden fazla kaynak'
                  : confidence >= 60
                    ? 'Temel kaynaklar'
                    : 'Sınırlı kaynak'}
              </div>
              {resultMessage && limitedPreview && (
                <div style={{ fontSize: 11, color: 'rgba(251,191,36,0.85)', marginTop: 4, lineHeight: 1.4 }}>
                  {resultMessage}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pre-auth / weak-source info card */}
        {(!hasReal || limitedPreview) && (
          <div style={{ ...cardStyle, marginBottom: 12, background: 'rgba(77,112,136,0.08)', border: '0.5px solid rgba(77,112,136,0.22)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <OnboardingPreviewIcon name="info" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9DBECE', marginBottom: 4 }}>
                {limitedPreview ? 'Web veya Google ekleyin' : 'Devam etmek için kayıt olun'}
              </div>
            </div>
          </div>
        )}

        {/* Detected URL */}
        <ResultCard label="Tespit Edilen Kaynak">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <OnboardingPreviewIcon name="globe" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#F4F4F8' }}>{domain}</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: SA_ONBOARDING.doneBg, color: SA_ONBOARDING.doneBright, fontWeight: 600 }}>Tarandı</span>
            </div>
            {ig && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <OnboardingPreviewIcon name="camera" />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#F4F4F8' }}>@{ig}</span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(157,190,206,0.12)', color: '#9DBECE', fontWeight: 600 }}>Instagram</span>
              </div>
            )}
          </div>
        </ResultCard>

        {/* Real data cards */}
        {tone.length > 0 && (
          <ResultCard label="Marka Tonu">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {tone.map(t => <span key={t} style={chipStyle('#9DBECE')}>{t}</span>)}
            </div>
          </ResultCard>
        )}

        {audience.length > 0 && (
          <ResultCard label="Hedef Kitle">
            {audience.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < audience.length - 1 ? 7 : 0 }}>
                <span style={{ color: SA_ONBOARDING.done, flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span>
                <span style={{ fontSize: 13, color: 'rgba(226,232,240,0.72)', lineHeight: 1.5 }}>{a}</span>
              </div>
            ))}
          </ResultCard>
        )}

        {pillars.length > 0 && (
          <ResultCard label="İçerik Direkleri">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {pillars.map(p => <span key={p} style={chipStyle('#60A5FA')}>{p.replace(/_/g, ' ')}</span>)}
            </div>
          </ResultCard>
        )}

        {goals.length > 0 && (
          <ResultCard label="Birincil Hedefler">
            {goals.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < goals.length - 1 ? 6 : 0 }}>
                <span style={{ color: '#F59E0B', flexShrink: 0, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: 'rgba(226,232,240,0.72)', lineHeight: 1.45 }}>{g}</span>
              </div>
            ))}
          </ResultCard>
        )}

        {channels.length > 0 && (
          <ResultCard label="Önerilen Kanallar">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {channels.map(c => <span key={c} style={chipStyle('#F59E0B')}>{c.replace(/_/g, ' ')}</span>)}
            </div>
          </ResultCard>
        )}

        {summary && (
          <ResultCard label="Web Sitesi Özeti">
            <p style={{ fontSize: 13, color: 'rgba(226,232,240,0.65)', lineHeight: 1.65, margin: 0 }}>
              {summary.slice(0, 220)}{summary.length > 220 ? '...' : ''}
            </p>
          </ResultCard>
        )}

        {/* Fallback preview cards (when no real API data) */}
        {fallbackCards.map((card, i) => (
          <div key={i} style={{ ...cardStyle, marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <OnboardingPreviewIcon name={card.icon} color={card.color} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F8', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)', lineHeight: 1.5 }}>{card.desc}</div>
            </div>
          </div>
        ))}

      </div>

      {/* CTA dock */}
      <div className="onboarding-cta-dock">
        <button type="button" onClick={onNext} className="onboarding-cta">
          Hesap oluştur & devam et
        </button>
      </div>
    </div>
  );
}

// ─── Setup Progress Overlay (premium account-creation splash) ──────────
// Shown while the account + deep brand setup runs (can take 1–3 min). Maps the
// SignupStep `status` string to a 5-phase journey with a living progress ring,
// so the user always sees meaningful motion instead of a frozen button.
const SETUP_PHASES = [
  { id: 'account',  label: 'Hesabınız oluşturuluyor',    detail: 'Güvenli kullanıcı ve çalışma alanı hazırlanıyor' },
  { id: 'profile',  label: 'Firma profili kaydediliyor', detail: 'Temel marka bilgileri güvene alınıyor' },
  { id: 'analysis', label: 'Derin marka analizi',         detail: 'Web, Instagram, galeri ve marka anayasası taranıyor' },
  { id: 'memory',   label: 'Marka hafızası işleniyor',    detail: 'AI ajanları için marka profili yazılıyor' },
  { id: 'campaign', label: 'İlk kampanya hazırlanıyor',   detail: 'Markanıza özel haftalık plan öneriliyor' },
] as const;

// Approximate ceiling each phase eases toward — analysis is the long pole.
const SETUP_PHASE_TARGET = [14, 30, 86, 94, 99];

function setupPhaseFromStatus(status: string): number {
  const s = (status || '').toLowerCase();
  if (!s) return 0;
  if (s.includes('kampanya') || s.includes('tamamlandı') || s.includes('üretim hazır') || s.includes('galeri')) return 4;
  if (s.includes('marka hafıza')) return 3;
  if (s.includes('derin marka') || s.includes('analiz')) return 2;
  if (s.includes('firma profili')) return 1;
  if (s.includes('hesap')) return 0;
  return 0;
}

function SetupProgressOverlay({ brandName, status }: { brandName: string; status: string }) {
  const phase = setupPhaseFromStatus(status);
  const [pct, setPct] = useState(4);
  const pctRef = useRef(4);

  // Smooth, ever-advancing fill: each tick eases toward the active phase's
  // ceiling so the long analysis phase still feels alive without ever lying
  // by hitting 100% before completion.
  useEffect(() => {
    const target = SETUP_PHASE_TARGET[phase] ?? 99;
    const id = setInterval(() => {
      const cur = pctRef.current;
      const next = Math.min(cur + (target - cur) * 0.07, target);
      pctRef.current = next;
      setPct(next);
    }, 380);
    return () => clearInterval(id);
  }, [phase]);

  const display = Math.round(pct);
  const hint = phase >= 2
    ? '1–3 dakika sürebilir'
    : 'Hazırlanıyor…';

  return (
    <div className="onboarding-shell">
      <OnboardingChromeBackdrop />
      <div className="onboarding-setup">
        <OnboardingLogoMark compact />

        <div className="onboarding-setup-ringwrap">
          <div className="onboarding-setup-shimmer" aria-hidden />
          <svg width="132" height="132" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="66" cy="66" r="58" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            <circle
              cx="66" cy="66" r="58" fill="none" stroke="url(#setupGrad)" strokeWidth="7"
              strokeDasharray={`${(pct / 100) * 364} 364`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 380ms linear', filter: 'drop-shadow(0 0 10px rgba(90,130,160,0.6))' }}
            />
            <defs>
              <linearGradient id="setupGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#4D7088" />
                <stop offset="1" stopColor="#9DBECE" />
              </linearGradient>
            </defs>
          </svg>
          <div className="onboarding-setup-ringcenter">
            <div className="onboarding-setup-pct">{display}<span>%</span></div>
            <div className="onboarding-setup-pctlabel">kuruluyor</div>
          </div>
        </div>

        <div className="onboarding-setup-brand">{brandName || 'Markanız'}</div>
        <div className="onboarding-setup-sub">Kurulum sürüyor</div>

        <div className="onboarding-setup-steps">
          {SETUP_PHASES.map((p, i) => {
            const done = i < phase;
            const active = i === phase;
            return (
              <div key={p.id} className={`onboarding-setup-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
                <OnboardingStepDot state={done ? 'done' : active ? 'active' : 'idle'} />
                <div className="onboarding-setup-step-text">
                  <div className="onboarding-setup-step-label">{p.label}</div>
                  {active && <div className="onboarding-setup-step-detail">{p.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {status && <div className="onboarding-setup-status">{status}</div>}
        <div className="onboarding-setup-hint">{hint}</div>
      </div>
    </div>
  );
}

// ─── Sign Up Step ──────────────────────────────────────────────────────
function SignupStep({
  brandName,
  websiteUrl,
  igHandle,
  menuUrl,
  googleBusinessUrl,
  discoveryResult,
  onDone,
}: {
  brandName: string;
  websiteUrl: string;
  igHandle: string;
  menuUrl: string;
  googleBusinessUrl: string;
  discoveryResult: DiscoveryResultWithCache | null;
  onDone: (companyName: string, tenantId?: string) => void;
}) {
  const { setWorkspace } = useWorkspaceStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany]   = useState(brandName);
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [status, setStatus]     = useState('');

  function baselineProfile() {
    return {
      brandName: company.trim(),
      industry: '',
      location: '',
      brandTone: '',
      targetAudience: '',
      visualStyle: '',
      campaignGoals: '',
      competitors: '',
      customRules: '',
      languages: 'tr',
      logoUrl: '',
      websiteUrl,
      description: '',
      defaultApprovalMode: 'SuggestAndWait',
      instagramHandle: igHandle || undefined,
      googleBusinessUrl: googleBusinessUrl || undefined,
      contentNeeds: '[]',
      riskRules: '{}',
      customerVisibleSummary: `${company.trim()} için onboarding başlatıldı. Web sitesi ve görsel analiz sonuçları hazırlanıyor.`,
    };
  }

  function parseJsonList(value: unknown): string[] {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return value.split(/[,\n;]+/).map((item) => item.trim()).filter(Boolean);
    }
  }

  function parseRefUrls(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
    if (typeof raw !== 'string' || !raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
        : [];
    } catch {
      return [];
    }
  }

  function cleanProfileText(value: unknown): string {
    return String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function uniqueNonEmpty(items: Array<unknown>): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const text = cleanProfileText(item);
      if (!text) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
    }
    return out;
  }

  function buildProductionBrandDescription(input: {
    analysis: Awaited<ReturnType<typeof apiClient.analyzeBrandContext>>;
    ctx: Record<string, unknown>;
    industry: string;
    pillars: string[];
    ctas: string[];
  }): string {
    const { analysis, ctx, industry, pillars, ctas } = input;
    const brand = cleanProfileText(company) || cleanProfileText(ctx.business_name) || brandName;
    const location = cleanProfileText(ctx.location);
    const websiteSummary = cleanProfileText(analysis.website_summary || ctx.website_summary || ctx.description);
    const instagramBio = cleanProfileText(analysis.instagram_bio || ctx.instagram_bio);
    const targetAudience = cleanProfileText(ctx.target_audience);
    const visualStyle = cleanProfileText(ctx.visual_style);
    const brandTone = cleanProfileText(analysis.inferred_tone || ctx.brand_tone);

    const intro = uniqueNonEmpty([
      brand && `${brand}${location ? `, ${location}` : ''} merkezli ${industry || 'yerel işletme'} markasıdır.`,
      websiteSummary,
      instagramBio && `Instagram bio: ${instagramBio}`,
    ]).join(' ');

    const productionContext = uniqueNonEmpty([
      targetAudience && `Hedef kitle: ${targetAudience}.`,
      brandTone && `Marka tonu: ${brandTone}.`,
      visualStyle && `Görsel dünya: ${visualStyle}.`,
      pillars.length ? `İçerik üretiminde ana odaklar: ${pillars.slice(0, 8).join(', ')}.` : '',
      ctas.length ? `Kampanya ve CTA yönü: ${ctas.slice(0, 6).join(', ')}.` : '',
    ]).join(' ');

    return uniqueNonEmpty([intro, productionContext]).join('\n\n').slice(0, 1900);
  }

  async function persistPythonAnalysisToProfile(
    analysis: Awaited<ReturnType<typeof apiClient.analyzeBrandContext>>,
    authoritativeSector?: string,
  ) {
    const ctx = (analysis.brand_context ?? {}) as Record<string, unknown>;
    const pillars = analysis.content_pillars?.length
      ? analysis.content_pillars
      : parseJsonList(ctx.content_pillars);
    const ctas = analysis.default_ctas?.length
      ? analysis.default_ctas
      : parseJsonList(ctx.default_ctas);
    const riskRules = analysis.risk_rules && Object.keys(analysis.risk_rules).length
      ? analysis.risk_rules
      : (() => {
          try {
            return ctx.risk_rules ? JSON.parse(String(ctx.risk_rules)) : {};
          } catch {
            return {};
          }
        })();
    const brandTone = analysis.inferred_tone || String(ctx.brand_tone || '');
    const industry = authoritativeSector
      || analysis.inferred_industry
      || String(ctx.business_type || '');
    const refUrls = parseRefUrls(analysis.reference_image_urls ?? ctx.reference_image_urls);
    const analysisText = [
      analysis.website_summary || String(ctx.website_summary || ''),
      analysis.instagram_bio ? `Instagram: ${analysis.instagram_bio}` : '',
    ].filter(Boolean).join('\n\n');
    const productionDescription = buildProductionBrandDescription({
      analysis,
      ctx,
      industry,
      pillars,
      ctas,
    });
    const summary = `${company.trim()} için sektör ${industry || 'general_business'} olarak analiz edildi. Önerilen sosyal medya ihtiyaçları: ${pillars.slice(0, 5).join(', ') || 'daily_story'}.`;

    await apiClient.saveCompanyProfile({
      ...baselineProfile(),
      brandName: company.trim() || String(ctx.business_name || brandName),
      industry,
      location: String(ctx.location || ''),
      brandTone,
      targetAudience: String(ctx.target_audience || analysis.instagram_bio || ''),
      visualStyle: String(ctx.visual_style || ''),
      campaignGoals: ctas.join(', '),
      competitors: String(ctx.competitors || ''),
      customRules: String(ctx.custom_rules || ''),
      languages: analysis.inferred_language || String(ctx.languages || 'tr'),
      logoUrl: String(ctx.logo_url || ''),
      websiteUrl: websiteUrl || String(ctx.website_url || ''),
      description: productionDescription || analysis.website_summary || String(ctx.description || ''),
      instagramHandle: igHandle || String(ctx.instagram_handle || '') || undefined,
      googleBusinessUrl: googleBusinessUrl || String(ctx.google_business_url || '') || undefined,
      contentNeeds: JSON.stringify(pillars),
      riskRules: JSON.stringify(riskRules),
      discoveryConfidence: analysis.confidence ?? (ctx.discovery_confidence as number | null) ?? null,
      customerVisibleSummary: summary,
      systemIntelligence: JSON.stringify({
        sources: analysis.sources,
        missing_signals: analysis.missing_signals,
        instagram_top_hashtags: analysis.instagram_top_hashtags,
      }),
    } as any);
  }

  async function runDiscoveryBrandOnboarding(tenantId: string) {
    if (!websiteUrl && !igHandle && !menuUrl && !googleBusinessUrl) {
      throw new Error('Marka analizi için web sitesi, menü, Google Business veya Instagram gerekli.');
    }

    setStatus('Marka keşfi: web, Instagram, Google ve galeri (1–3 dk)…');
    const previewCacheKey = discoveryResult?.previewCacheKey;
    const res = await fetch('/api/onboarding/deep-brand-setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getRequestContextHeaders(),
      },
      body: JSON.stringify({
        tenantId,
        companyName: company.trim(),
        websiteUrl: websiteUrl || undefined,
        instagramHandle: igHandle || undefined,
        menuUrl: menuUrl || undefined,
        googleBusinessUrl: googleBusinessUrl || undefined,
        previewCacheKey: previewCacheKey || undefined,
        phase: 'discovery',
      }),
    });

    const data = await res.json().catch(() => ({})) as {
      ok?: boolean;
      errors?: string[];
      authoritativeSector?: string;
      brandAnalysis?: Awaited<ReturnType<typeof apiClient.analyzeBrandContext>>;
      gallery?: { analyzed?: number; usable?: number; calibration?: { matched: number; tested: number } };
      steps?: Array<{ id: string; ok: boolean; detail?: string }>;
    };

    if (data.brandAnalysis) {
      setStatus('Firma profili kaydediliyor — markanı bir sonraki adımda doğrulayacaksın…');
      try {
        await persistPythonAnalysisToProfile(data.brandAnalysis, data.authoritativeSector);
        await fetch(`/api/brand-context/${tenantId}/hydrate-company-profile`, {
          method: 'POST',
          headers: getRequestContextHeaders(),
        }).catch(() => null);
      } catch (persistErr) {
        console.warn('[onboarding] enriched profile persist failed', persistErr);
      }
    }

    if (!res.ok || !data.ok) {
      const stepFail = data.steps?.find((s) => !s.ok);
      console.warn('[onboarding] discovery setup incomplete', {
        status: res.status,
        error: data.errors?.[0],
        step: stepFail,
        cache: previewCacheKey ? 'sent' : 'none',
      });
      setStatus(
        data.brandAnalysis
          ? 'Marka profili kaydedildi · Doğrulama adımında tamamlayabilirsiniz.'
          : 'Temel profil kaydedildi · Marka doğrulamasında devam edin.',
      );
      return;
    }

    const cacheHit = data.steps?.some((s) => s.id === 'preview_cache_hit' && s.ok);
    const galleryLine = `Galeri: ${data.gallery?.analyzed ?? 0} görsel`;
    setStatus(
      cacheHit
        ? `${galleryLine} · Önizleme önbelleğinden yüklendi · Markanı doğrula.`
        : `${galleryLine} · Keşif tamam · Markanı doğrula.`,
    );
  }

  function signupFailureMessage(e: unknown): string {
    const err = e as { status?: number; responseBody?: string; message?: string };
    const status = typeof err?.status === 'number' ? err.status : undefined;
    const body = String(err?.responseBody ?? err?.message ?? '');
    let apiError = '';
    try {
      const parsed = JSON.parse(body) as { error?: string; message?: string; title?: string };
      apiError = String(parsed.error || parsed.message || parsed.title || '').trim();
    } catch {
      apiError = '';
    }
    const msg = humanizeMobileServiceError(apiError || body, status);
    if (status === 409 || /already exists/i.test(body) || /already exists/i.test(apiError)) {
      return 'Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.';
    }
    if (status === 400) return apiError || 'Bilgiler geçersiz, tekrar kontrol edin.';
    if (status === 503 || /unreachable|not_configured|backend/i.test(body)) {
      return msg || 'Kayıt servisi şu an ulaşılamıyor. Birkaç saniye sonra tekrar deneyin.';
    }
    if (status === 0 || /timeout|timed out|failed to fetch|network/i.test(body)) {
      return 'Bağlantı zaman aşımına uğradı. Tekrar deneyin — hesap oluşmuş olabilir, o zaman giriş yapın.';
    }
    if (msg && msg !== body && !msg.startsWith('{')) return msg;
    return 'Kayıt başarısız. Lütfen tekrar deneyin.';
  }

  async function handleSignup() {
    if (!email || !password || !company) { setError('Tüm alanlar zorunludur'); return; }
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalı'); return; }
    setLoading(true); setError('');
    let registeredTenantId: string | undefined;
    try {
      setStatus('Hesap oluşturuluyor...');
      const session = await apiClient.register({
        email: email.trim(),
        password,
        tenantName: company.trim(),
        displayName: name.trim() || company.trim(),
      });
      registeredTenantId = session.tenantId;

      // Save token + workspace — but do NOT call setUser() yet.
      // If setUser() is called here, isAuthenticated becomes true and AppShell
      // immediately renders the main app, skipping Plans and Welcome steps.
      // setUser() is called in onComplete() after the full flow finishes.
      if (session.token) setSessionToken(session.token);
      if (session.tenantId && session.officeId) setWorkspace(session.tenantId, session.officeId);

      // Post-register work must not surface as "kayıt başarısız" — account already exists.
      try {
        setStatus('Firma profili kaydediliyor...');
        await apiClient.saveCompanyProfile(baselineProfile() as any);
      } catch (profileErr) {
        console.warn('[onboarding] baseline profile save failed after register', profileErr);
        setStatus('Hesap hazır · Profil bir sonraki adımda tamamlanacak…');
      }

      if (session.tenantId && (websiteUrl || igHandle || menuUrl || googleBusinessUrl)) {
        try {
          await runDiscoveryBrandOnboarding(session.tenantId);
        } catch (discoverErr) {
          console.warn('[onboarding] discovery after signup failed', discoverErr);
          setStatus('Hesap hazır · Marka doğrulamasında devam edin.');
        }
      }

      // Auto-propose first welcome mission in the background. Strategist proposal
      // can take 30-90s, so onboarding must not hold the user on the setup screen.
      try {
        setStatus('Marka kurulumu tamamlandı · Haftalık plan arka planda hazırlanıyor.');
        const proposeRes = await fetch(`/api/missions/${session.tenantId}/propose`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getRequestContextHeaders(),
          },
          body: JSON.stringify({ context_signals: 'onboarding_welcome', background: true }),
          signal: AbortSignal.timeout(5_000),
        });
        if (proposeRes.status === 412) {
          setStatus('Marka kurulumu tamamlandı · Kampanya önerisi için galeri skorunu tamamlayın.');
        }
      } catch {
        // Non-blocking: Mission Hub can still trigger a weekly plan later.
      }
      onDone(company.trim(), session.tenantId);
    } catch (e: unknown) {
      // Only register() failures land here now.
      console.warn('[onboarding] register failed', e, { registeredTenantId });
      setError(signupFailureMessage(e));
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  // While the account + deep brand setup runs, swap the form for a premium
  // full-screen progress experience instead of leaving an empty dark page.
  if (loading) {
    return <SetupProgressOverlay brandName={company.trim() || brandName} status={status} />;
  }

  return (
    <div className="onboarding-shell">
      <OnboardingChromeBackdrop />
      <OnboardingLogoHeader compact />

      <main className="onboarding-main onboarding-signup-main">
        <h1 className="onboarding-title onboarding-title--step">Hesap Oluşturun</h1>

        <div className="onboarding-fields">
          <label className="onboarding-field">
            <span className="onboarding-field-label">Firma Adı</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Firma veya marka adı"
              className={`onboarding-input${company.trim() ? ' onboarding-input--filled' : ''}`}
            />
          </label>
          <label className="onboarding-field">
            <span className="onboarding-field-label onboarding-field-label--muted">Adınız · opsiyonel</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="İsim Soyisim"
              className={`onboarding-input${name.trim() ? ' onboarding-input--filled' : ''}`}
            />
          </label>
          <label className="onboarding-field">
            <span className="onboarding-field-label">E-posta</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@firma.com"
              type="email"
              autoComplete="email"
              className={`onboarding-input${email.trim() ? ' onboarding-input--filled' : ''}`}
            />
          </label>
          <label className="onboarding-field">
            <span className="onboarding-field-label">Şifre</span>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 8 karakter"
              type="password"
              autoComplete="new-password"
              className={`onboarding-input${password.trim() ? ' onboarding-input--filled' : ''}`}
            />
          </label>
        </div>

        {error && <p className="onboarding-error">{error}</p>}

        <div className="onboarding-actions">
          <button
            type="button"
            onClick={handleSignup}
            className="onboarding-cta"
          >
            Hesap Oluştur
          </button>
          <p className="auth-legal-note">Hesabınızı oluşturarak marka analizinizi kaydedersiniz.</p>
        </div>
      </main>
    </div>
  );
}

function extractHexColor(raw: unknown, fallback: string): string {
  const m = String(raw ?? '').match(/#[0-9a-fA-F]{3,8}/);
  return m?.[0] ?? fallback;
}

// ─── Brand confirm (before constitution locks production) ───────────────
function BrandConfirmStep({
  brandName,
  tenantId,
  onDone,
}: {
  brandName: string;
  tenantId: string;
  onDone: (confirmedName: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(brandName);
  const [sector, setSector] = useState('general_business');
  const [tone, setTone] = useState<BrandTonePreset>('friendly');
  const [primary, setPrimary] = useState('#1a1a1a');
  const [accent, setAccent] = useState('#4f8ef7');
  const profileRef = useRef<Awaited<ReturnType<typeof apiClient.getCompanyProfile>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const headers = getRequestContextHeaders();
        const [ctxRes, profile] = await Promise.all([
          fetch(`/api/brand-context/${tenantId}`, { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null),
          apiClient.getCompanyProfile(tenantId).catch(() => null),
        ]);
        const ctx = ctxRes?.ok ? ((await ctxRes.json()) as Record<string, unknown>) : {};
        if (cancelled) return;
        if (profile) profileRef.current = profile;
        const nextName = String(profile?.brandName || ctx.business_name || brandName).trim() || brandName;
        const nextSector = normalizeSectorId(
          String(profile?.industry || ctx.business_type || 'general_business'),
        );
        const nextTone = pythonToneToPreset(String(profile?.brandTone || ctx.brand_tone || 'friendly'));
        const nextPrimary = extractHexColor(
          ctx.brand_primary_color || profile?.brandColors,
          '#1a1a1a',
        );
        const nextAccent = extractHexColor(
          ctx.brand_accent_color || profile?.accentColors || String(profile?.brandColors || '').split(/[,\s]+/)[1],
          '#4f8ef7',
        );
        setName(nextName);
        setSector(nextSector);
        setTone(nextTone);
        setPrimary(nextPrimary);
        setAccent(nextAccent);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Marka bilgileri yüklenemedi.');
          setLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tenantId, brandName]);

  async function handleConfirm() {
    if (submitting) return;
    const cleanName = name.trim();
    if (!cleanName) { setError('Marka adı zorunlu'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const headers = {
        ...getRequestContextHeaders(),
        'Content-Type': 'application/json',
      };
      const existing = profileRef.current;
      await apiClient.saveCompanyProfile({
        brandName: cleanName,
        industry: sector,
        location: existing?.location ?? '',
        brandTone: tone,
        targetAudience: existing?.targetAudience ?? '',
        visualStyle: existing?.visualStyle ?? '',
        campaignGoals: existing?.campaignGoals ?? '',
        competitors: existing?.competitors ?? '',
        customRules: existing?.customRules ?? '',
        languages: existing?.languages ?? 'tr',
        logoUrl: existing?.logoUrl ?? '',
        websiteUrl: existing?.websiteUrl ?? '',
        description: existing?.description ?? '',
        defaultApprovalMode: existing?.defaultApprovalMode ?? 'SuggestAndWait',
        instagramHandle: existing?.instagramHandle ?? '',
        googleBusinessUrl: existing?.googleBusinessUrl ?? '',
        primaryFont: existing?.primaryFont ?? '',
        secondaryFont: existing?.secondaryFont ?? '',
        brandColors: `${primary}, ${accent}`,
        accentColors: accent,
        socialTemplateStyle: existing?.socialTemplateStyle ?? '',
        platformProfiles: existing?.platformProfiles ?? '[]',
        contentNeeds: existing?.contentNeeds ?? '[]',
        operatingCapabilities: existing?.operatingCapabilities ?? '[]',
        galleryPolicy: existing?.galleryPolicy ?? '{}',
        templateFamilies: existing?.templateFamilies ?? '[]',
        riskRules: existing?.riskRules ?? '{}',
        customerVisibleSummary: existing?.customerVisibleSummary ?? '',
        systemIntelligence: existing?.systemIntelligence ?? '',
        discoveryConfidence: existing?.discoveryConfidence ?? null,
      });

      await fetch(`/api/brand-context-data/${tenantId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          business_name: cleanName,
          business_type: sector,
          brand_tone: tone,
          brand_primary_color: primary,
          brand_accent_color: accent,
          brand_service_profile: {
            category: serviceProfileCategoryForSector(sector) || sector,
            source: 'manual_override',
            category_confidence: 1,
            category_reason: 'Onboarding marka doğrulama',
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);

      const finRes = await fetch('/api/onboarding/deep-brand-setup', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenantId,
          companyName: cleanName,
          phase: 'finalize',
        }),
        signal: AbortSignal.timeout(290_000),
      });
      const finData = await finRes.json().catch(() => ({})) as { ok?: boolean; errors?: string[] };
      if (!finRes.ok || finData.ok === false) {
        console.warn('[onboarding] finalize incomplete', finData.errors);
      }
      onDone(cleanName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Doğrulama kaydedilemedi.');
      setSubmitting(false);
    }
  }

  const sectorLabel =
    ONBOARDING_SECTORS.find((s) => s.id === sector)?.label
    ?? sector;

  if (loading) {
    return (
      <div className="onboarding-shell onboarding-shell--confirm">
        <OnboardingChromeBackdrop />
        <main className="onboarding-welcome-body">
          <div className="onboarding-setup-shimmer" aria-hidden />
          <h1 className="onboarding-title" style={{ marginBottom: 10 }}>Markanı doğrula</h1>
          <p className="onboarding-lead" style={{ maxWidth: 300 }}>
            Keşif sonuçları hazırlanıyor…
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="onboarding-shell onboarding-shell--confirm">
      <OnboardingChromeBackdrop />
      <OnboardingLogoHeader compact />
      <main className="confirm-main onboarding-stagger">
        <header className="confirm-top">
          <h1 className="confirm-hero-title">Markanı doğrula</h1>
          <p className="confirm-hero-lead">
            Keşiften gelen kimliği kontrol et — üretim buna kilitlenir.
          </p>
        </header>

        <div
          className="confirm-identity-card"
          style={{
            background: `linear-gradient(145deg, ${primary} 0%, ${primary}ee 42%, ${accent}cc 100%)`,
          }}
        >
          <div className="confirm-identity-card__veil" aria-hidden />
          <div className="confirm-identity-card__body">
            <span className="confirm-identity-card__eyebrow">Canlı önizleme</span>
            <p className="confirm-identity-card__name">{name.trim() || 'Marka adı'}</p>
            <div className="confirm-identity-card__meta">
              <span>{sectorLabel}</span>
              <span aria-hidden>·</span>
              <span>{TONE_LABELS[tone]}</span>
            </div>
            <div className="confirm-identity-card__swatches" aria-hidden>
              <span style={{ background: primary }} />
              <span style={{ background: accent }} />
            </div>
          </div>
        </div>

        <div className="confirm-panel">
          <label className="confirm-hline">
            <span className="confirm-hline-label">Marka adı</span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className={`confirm-hline-input${name.trim() ? ' is-filled' : ''}`}
              autoComplete="organization"
              enterKeyHint="next"
              inputMode="text"
            />
          </label>

          <label className="confirm-hline">
            <span className="confirm-hline-label">Sektör</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="confirm-hline-input is-filled confirm-hline-select"
            >
              {ONBOARDING_SECTORS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
              {!ONBOARDING_SECTORS.some((s) => s.id === sector) && (
                <option value={sector}>{sector}</option>
              )}
            </select>
          </label>
        </div>

        <div className="confirm-section">
          <span className="confirm-section-label">Marka tonu</span>
          <div className="confirm-tone-grid" role="group" aria-label="Marka tonu">
            {BRAND_TONE_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                className={`confirm-tone-chip${tone === t ? ' is-on' : ''}`}
                aria-pressed={tone === t}
                onClick={() => setTone(t)}
              >
                {TONE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="confirm-section">
          <span className="confirm-section-label">Renkler</span>
          <div className="confirm-color-grid">
            <label className="confirm-color-card">
              <span className="confirm-color-card__label">Ana renk</span>
              <span className="confirm-color-card__swatch" style={{ background: primary }}>
                <input
                  type="color"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  aria-label="Ana renk"
                />
              </span>
              <span className="confirm-color-card__hex">{primary.toUpperCase()}</span>
            </label>
            <label className="confirm-color-card">
              <span className="confirm-color-card__label">Vurgu</span>
              <span className="confirm-color-card__swatch" style={{ background: accent }}>
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  aria-label="Vurgu rengi"
                />
              </span>
              <span className="confirm-color-card__hex">{accent.toUpperCase()}</span>
            </label>
          </div>
        </div>

        {error && <p className="onboarding-error confirm-error">{error}</p>}
      </main>

      <div className="confirm-dock">
        <button
          type="button"
          className="onboarding-cta"
          disabled={submitting || !name.trim()}
          onClick={() => void handleConfirm()}
        >
          {submitting ? 'Üretim kilidi açılıyor…' : 'Doğrula ve devam et'}
        </button>
      </div>
    </div>
  );
}

const MIN_GALLERY_PHOTOS = 3;

// ─── Gallery gate before template showcase ─────────────────────────────
function GalleryReadyStep({
  brandName,
  tenantId,
  onDone,
}: {
  brandName: string;
  tenantId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function refreshCount() {
    const headers = getRequestContextHeaders();
    const [ctxRes, analysisRes] = await Promise.all([
      fetch(`/api/brand-context/${tenantId}`, { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null),
      fetch(`/api/brand-context/${tenantId}/gallery-analysis`, { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null),
    ]);
    const ctx = ctxRes?.ok ? ((await ctxRes.json()) as Record<string, unknown>) : {};
    let refs: string[] = [];
    const raw = ctx.reference_image_urls;
    if (Array.isArray(raw)) refs = raw.map(String);
    else if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) refs = parsed.map(String);
      } catch { /* ignore */ }
    }
    const analysisKeys = analysisRes?.ok
      ? Object.keys((await analysisRes.json().catch(() => ({}))) as Record<string, unknown>)
      : [];
    const count = Math.max(refs.filter((u) => u.startsWith('http') || u.includes('/api/media')).length, analysisKeys.length);
    setPhotoCount(count);
    return count;
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        // Website/IG refs may already exist — provision before gating on upload.
        await fetch(`/api/brand-context/${tenantId}/provision-gallery`, {
          method: 'POST',
          headers: {
            ...getRequestContextHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ analyze: true, allowSynthetic: false }),
          signal: AbortSignal.timeout(120_000),
        }).catch(() => null);
        const count = await refreshCount();
        if (cancelled) return;
        setLoading(false);
        if (count >= MIN_GALLERY_PHOTOS) {
          void generateTemplates();
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    void boot();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only gate
  }, [tenantId]);

  async function generateTemplates() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    setStatus('Marka şablonları üretiliyor…');
    try {
      const headers = {
        ...getRequestContextHeaders(),
        'Content-Type': 'application/json',
      };
      // Re-provision in case website-only refs arrived late
      await fetch(`/api/brand-context/${tenantId}/provision-gallery`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ analyze: true, allowSynthetic: false }),
        signal: AbortSignal.timeout(120_000),
      }).catch(() => null);

      const genRes = await fetch(`/api/brand-context/${tenantId}/generate-design-templates`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locale: 'tr' }),
        signal: AbortSignal.timeout(290_000),
      });
      if (!genRes.ok) {
        const err = (await genRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message || 'Marka şablonları üretilemedi.');
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Şablon üretimi başarısız.');
      setGenerating(false);
      setStatus('');
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length || uploading) return;
    setUploading(true);
    setError(null);
    setStatus(`${files.length} fotoğraf yükleniyor…`);
    try {
      const fileList = Array.from(files).slice(0, 12);
      // Mobile WebView often breaks multipart FormData — upload as JSON data URLs.
      const images = await Promise.all(fileList.map(async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error('Dosya okunamadı'));
          reader.readAsDataURL(file);
        });
        if (!dataUrl.startsWith('data:')) throw new Error('Dosya okunamadı');
        return {
          dataUrl,
          fileName: file.name || 'photo.jpg',
          mimeType: file.type || 'image/jpeg',
        };
      }));

      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/gallery-upload`,
        tenantId,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images }),
        },
      );
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; uploaded?: number };

      if (!res.ok) {
        const raw = String(data.error ?? '');
        const errMap: Record<string, string> = {
          file_too_large_max_10mb: 'Dosya 10 MB sınırını aşıyor.',
          images_only_jpg_png_webp: 'Sadece JPG, PNG, WebP veya HEIC yükleyebilirsiniz.',
          heic_unsupported_convert_to_jpg: 'HEIC dönüştürülemedi — JPG olarak kaydedip tekrar deneyin.',
          no_files: 'Fotoğraf alınamadı — tekrar seçin.',
          'Failed to parse body as FormData.': 'Yükleme formatı bozuldu — tekrar deneyin.',
          'R2 storage not configured': 'Depolama yapılandırması eksik.',
        };
        throw new Error(errMap[raw] || (raw ? humanizeMobileServiceError(raw) : `Yükleme başarısız (${res.status})`));
      }
      const count = await refreshCount();
      setStatus(`✓ ${data.uploaded ?? fileList.length} fotoğraf yüklendi (${count} toplam)`);
      if (count >= MIN_GALLERY_PHOTOS) {
        await generateTemplates();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yükleme hatası');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (loading || (generating && photoCount >= MIN_GALLERY_PHOTOS && !error)) {
    return (
      <div className="onboarding-shell">
        <OnboardingChromeBackdrop />
        <main className="onboarding-welcome-body">
          <div className="onboarding-setup-shimmer" aria-hidden />
          <h1 className="onboarding-title" style={{ marginBottom: 10 }}>
            {generating ? 'Şablonlar hazırlanıyor' : 'Galeri kontrol ediliyor'}
          </h1>
          <p className="onboarding-lead" style={{ maxWidth: 300 }}>
            {status || `${brandName} için görseller toplanıyor…`}
          </p>
        </main>
      </div>
    );
  }

  const ready = photoCount >= MIN_GALLERY_PHOTOS;

  return (
    <div className="onboarding-shell">
      <OnboardingChromeBackdrop />
      <OnboardingLogoHeader compact />
      <main className="onboarding-welcome-body" style={{ paddingBottom: 28 }}>
        <h1 className="onboarding-title" style={{ marginBottom: 8 }}>Fotoğraflarını ekle</h1>
        <p className="onboarding-lead" style={{ maxWidth: 320, marginBottom: 16 }}>
          {photoCount} / {MIN_GALLERY_PHOTOS} fotoğraf
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,.heic,.jpg,.jpeg,.png,.webp"
          multiple
          hidden
          onChange={(e) => void handleUpload(e.target.files)}
        />

        <button
          type="button"
          className="onboarding-primary-btn"
          disabled={uploading || generating}
          onClick={() => fileRef.current?.click()}
          style={{ marginBottom: 12, minHeight: 44 }}
        >
          {uploading ? 'Yükleniyor…' : 'Fotoğraf yükle'}
        </button>

        {ready && (
          <button
            type="button"
            className="onboarding-cta"
            disabled={generating}
            onClick={() => void generateTemplates()}
          >
            {generating ? 'Şablonlar üretiliyor…' : 'Şablonları oluştur'}
          </button>
        )}

        {error && (
          <p className="onboarding-lead" style={{ color: '#fca5a5', marginTop: 12 }}>{error}</p>
        )}
        {status && !error && (
          <p className="onboarding-lead" style={{ marginTop: 12 }}>{status}</p>
        )}
      </main>
    </div>
  );
}

// ─── Templates Showcase Step ───────────────────────────────────────────
const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  campaign_announcement: 'Kampanya',
  event_special: 'Özel gün',
  menu_highlight: 'Menü',
  venue_showcase: 'Mekan',
  seasonal_promo: 'Sezon',
  social_proof: 'Yorum',
  daily_story: 'Günlük',
  announcement_formal: 'Duyuru',
  reel_cover: 'Reel kapak',
  brand_identity: 'Kimlik',
};

function TypographyConfirmStep({
  brandName,
  tenantId,
  onDone,
}: {
  brandName: string;
  tenantId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<BrandDesignTypographyConfig | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [primary, setPrimary] = useState('#1a1a1a');
  const [accent, setAccent] = useState('#4f8ef7');
  const [neutral, setNeutral] = useState('#f5f5f5');
  const [shadow, setShadow] = useState('#111111');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const themeRef = useRef<Record<string, unknown>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const headers = getRequestContextHeaders();
        const [themeRes, ctxRes, profile] = await Promise.all([
          fetch(`/api/brand-context/${tenantId}/theme`, { headers, signal: AbortSignal.timeout(20_000) }),
          fetch(`/api/brand-context/${tenantId}`, { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null),
          apiClient.getCompanyProfile(tenantId).catch(() => null),
        ]);
        const themeJson = themeRes.ok ? ((await themeRes.json()) as { theme?: Record<string, unknown> }) : {};
        const theme = themeJson.theme ?? {};
        themeRef.current = theme;
        const ctx = ctxRes?.ok ? ((await ctxRes.json()) as Record<string, unknown>) : null;
        const sector = String(ctx?.business_type ?? ctx?.industry ?? 'general_business');
        const visualDna = typeof ctx?.visual_dna === 'string' ? ctx.visual_dna : null;
        const palette = (theme.palette && typeof theme.palette === 'object'
          ? theme.palette
          : {}) as Record<string, unknown>;
        const nextLogo = String(ctx?.logo_url || profile?.logoUrl || '').trim();
        const nextPrimary = extractHexColor(ctx?.brand_primary_color || palette.primary || profile?.brandColors, '#1a1a1a');
        const nextAccent = extractHexColor(ctx?.brand_accent_color || palette.accent || profile?.accentColors, '#4f8ef7');
        const nextNeutral = extractHexColor(palette.neutral, '#f5f5f5');
        const nextShadow = extractHexColor(palette.shadow, '#111111');
        if (!cancelled) {
          setLogoUrl(nextLogo);
          setPrimary(nextPrimary);
          setAccent(nextAccent);
          setNeutral(nextNeutral);
          setShadow(nextShadow);
          setConfig(resolveSuggestedTypographyConfig(theme, sector, visualDna));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Marka teması yüklenemedi. Lütfen tekrar deneyin.');
          setLoading(false);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tenantId]);

  async function handleLogoUpload(file: File | null) {
    if (!file || uploadingLogo) return;
    setUploadingLogo(true);
    setError(null);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((res, rej) => {
        reader.onload = () => res(String(reader.result));
        reader.onerror = () => rej(new Error('Dosya okunamadı'));
        reader.readAsDataURL(file);
      });
      const uploadRes = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getRequestContextHeaders() },
        body: JSON.stringify({ dataUrl, mimeType: file.type || 'image/png' }),
      });
      if (!uploadRes.ok) throw new Error('Logo yüklenemedi');
      const { imageUrl } = (await uploadRes.json()) as { imageUrl?: string };
      if (!imageUrl) throw new Error('Logo URL alınamadı');
      setLogoUrl(imageUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Logo yüklenemedi');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  }

  async function handleConfirm() {
    if (!config || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const headers = {
        ...getRequestContextHeaders(),
        'Content-Type': 'application/json',
      };
      const confirmed = buildUserConfirmedTypographyPatch({
        ...config,
        accent_color: accent,
      });
      const postDefaults = resolvePostDesignDefaultsForTypography(confirmed);
      const currentTheme = themeRef.current;
      const prevPalette = (currentTheme.palette && typeof currentTheme.palette === 'object'
        ? currentTheme.palette
        : {}) as Record<string, unknown>;

      const putRes = await fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          theme: {
            ...currentTheme,
            typography_design: confirmed,
            typographyDesign: confirmed,
            post_design_defaults: postDefaults,
            postDesignDefaults: postDefaults,
            palette: {
              ...prevPalette,
              primary,
              accent,
              neutral,
              shadow,
            },
            creative_identity_confirmed_at: new Date().toISOString(),
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!putRes.ok) throw new Error('Görsel kimlik kaydedilemedi.');

      await fetch(`/api/brand-context-data/${tenantId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          ...(logoUrl ? { logo_url: logoUrl } : {}),
          brand_primary_color: primary,
          brand_accent_color: accent,
        }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);

      if (logoUrl) {
        try {
          const existing = await apiClient.getCompanyProfile(tenantId);
          await apiClient.saveCompanyProfile({
            ...existing,
            logoUrl,
            brandColors: `${primary}, ${accent}`,
            accentColors: accent,
          } as Parameters<typeof apiClient.saveCompanyProfile>[0]);
        } catch { /* non-fatal */ }
      }

      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
      setSubmitting(false);
    }
  }

  const vibeLabel = config
    ? (TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS.find((o) => o.id === config.vibe)?.label ?? config.vibe)
    : '';
  const previewName = (brandName || 'Marka').trim().slice(0, 22);

  if (loading) {
    return (
      <div className="onboarding-shell onboarding-shell--visual">
        <OnboardingChromeBackdrop />
        <main className="onboarding-welcome-body">
          <div className="onboarding-setup-shimmer" aria-hidden />
          <h1 className="onboarding-title" style={{ marginBottom: 10 }}>Görsel kimliğiniz</h1>
          <p className="onboarding-lead" style={{ maxWidth: 300 }}>
            {brandName} için logo, renk ve vibe hazırlanıyor…
          </p>
        </main>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="onboarding-shell onboarding-shell--visual">
        <main className="onboarding-welcome-body">
          <p className="onboarding-lead">{error ?? 'Görsel kimlik yüklenemedi.'}</p>
          <button type="button" className="onboarding-primary-btn" onClick={onDone}>
            Devam et
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="onboarding-shell onboarding-shell--visual">
      <OnboardingChromeBackdrop />
      <OnboardingLogoHeader compact />
      <main className="visual-main onboarding-stagger">
        <header className="confirm-top">
          <h1 className="confirm-hero-title">Görsel kimliğini onayla</h1>
          <p className="confirm-hero-lead">
            Logo, palet ve tipografi vibe — üretim dili buradan kilitlenir.
          </p>
        </header>

        <div
          className="visual-preview-card"
          style={{
            background: `linear-gradient(145deg, ${primary} 0%, ${primary}dd 48%, ${accent}bb 100%)`,
          }}
        >
          <div className="visual-preview-card__veil" aria-hidden />
          <div className="visual-preview-card__row">
            <div className="visual-preview-card__logo" style={{ background: neutral }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" />
              ) : (
                <span>Logo</span>
              )}
            </div>
            <div className="visual-preview-card__copy">
              <span className="visual-preview-card__eyebrow">{vibeLabel}</span>
              <p
                className={`visual-preview-card__sample vibe-sample--${config.vibe}`}
                style={{ color: shadow === '#111111' || shadow.toLowerCase() === '#000000' ? '#fff' : shadow }}
              >
                {previewName}
              </p>
              <div className="visual-preview-card__strip" aria-hidden>
                <span style={{ background: primary }} />
                <span style={{ background: accent }} />
                <span style={{ background: neutral }} />
                <span style={{ background: shadow }} />
              </div>
            </div>
          </div>
        </div>

        <div className="confirm-section">
          <span className="confirm-section-label">Logo</span>
          <div className="visual-logo-panel">
            <div className="visual-logo-panel__mark" style={{ background: neutral }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="Logo" />
              ) : (
                <span>Logo yok</span>
              )}
            </div>
            <div className="visual-logo-panel__actions">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                onChange={(e) => void handleLogoUpload(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="visual-logo-panel__btn"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                {uploadingLogo ? 'Yükleniyor…' : logoUrl ? 'Logoyu değiştir' : 'Logo yükle'}
              </button>
              <p className="visual-logo-panel__hint">PNG / SVG · şeffaf arka plan tercih</p>
            </div>
          </div>
        </div>

        <div className="confirm-section">
          <span className="confirm-section-label">Renk paleti</span>
          <div className="visual-palette-grid">
            {([
              { label: 'Ana', value: primary, set: setPrimary },
              { label: 'Vurgu', value: accent, set: setAccent },
              { label: 'Nötr', value: neutral, set: setNeutral },
              { label: 'Gölge', value: shadow, set: setShadow },
            ] as const).map((c) => (
              <label key={c.label} className="confirm-color-card">
                <span className="confirm-color-card__label">{c.label}</span>
                <span className="confirm-color-card__swatch" style={{ background: c.value }}>
                  <input
                    type="color"
                    value={c.value}
                    onChange={(e) => c.set(e.target.value)}
                    aria-label={c.label}
                  />
                </span>
                <span className="confirm-color-card__hex">{c.value.toUpperCase()}</span>
              </label>
            ))}
          </div>
          <div className="visual-palette-bar" aria-hidden>
            <span style={{ flex: 2.2, background: primary }} />
            <span style={{ flex: 1.5, background: accent }} />
            <span style={{ flex: 1.1, background: neutral }} />
            <span style={{ flex: 0.9, background: shadow }} />
          </div>
        </div>

        <div className="confirm-section">
          <span className="confirm-section-label">Tipografi vibe</span>
          <div className="visual-vibe-grid" role="listbox" aria-label="Tipografi vibe">
            {TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS.map((opt) => {
              const active = config.vibe === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`visual-vibe-card${active ? ' is-on' : ''}`}
                  onClick={() => setConfig({ ...config, vibe: opt.id as TypographyVibe })}
                >
                  <span className={`visual-vibe-card__glyph vibe-sample--${opt.id}`} aria-hidden>
                    Aa
                  </span>
                  <span className="visual-vibe-card__text">
                    <span className="visual-vibe-card__title">{opt.label}</span>
                    <span className="visual-vibe-card__desc">{opt.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error && <p className="onboarding-error confirm-error">{error}</p>}
      </main>

      <div className="confirm-dock">
        <button
          type="button"
          className="onboarding-cta"
          disabled={submitting || uploadingLogo}
          onClick={() => void handleConfirm()}
        >
          {submitting ? 'Kaydediliyor…' : 'Kimliği onayla ve devam et'}
        </button>
      </div>
    </div>
  );
}

function TemplatesShowcaseStep({
  brandName,
  tenantId,
  onDone,
}: {
  brandName: string;
  tenantId: string;
  onDone: () => void;
}) {
  const [templates, setTemplates] = useState<ShowcaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Generation runs during deep setup; templates should exist by now. Retry a
    // couple of times in case persistence is still settling.
    async function load(attempt = 0): Promise<void> {
      try {
        const res = await fetch(`/api/brand-context/${tenantId}/design-templates`, {
          headers: getRequestContextHeaders(),
          signal: AbortSignal.timeout(15_000),
        });
        const data = res.ok ? ((await res.json()) as ShowcaseTemplate[]) : [];
        const withPreview = Array.isArray(data) ? data.filter((t) => t.thumbnail_url) : [];
        if (cancelled) return;
        if (withPreview.length === 0 && attempt < 2) {
          setTimeout(() => load(attempt + 1), 2500);
          return;
        }
        setTemplates(withPreview);
        setLoading(false);
      } catch {
        if (cancelled) return;
        if (attempt < 2) {
          setTimeout(() => load(attempt + 1), 2500);
          return;
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tenantId]);

  // No templates → skip straight to welcome (never block onboarding).
  useEffect(() => {
    if (!loading && templates.length === 0) onDone();
  }, [loading, templates.length, onDone]);

  if (loading) {
    return (
      <div className="onboarding-shell">
        <OnboardingChromeBackdrop />
        <main className="onboarding-welcome-body">
          <div className="onboarding-setup-shimmer" aria-hidden />
          <h1 className="onboarding-title" style={{ marginBottom: 10 }}>Tasarımlarınız hazırlanıyor</h1>
          <p className="onboarding-lead" style={{ maxWidth: 300 }}>
            {brandName} için markanıza özel şablonlar oluşturuluyor…
          </p>
        </main>
      </div>
    );
  }

  if (templates.length === 0) return null;

  const total = templates.length + 1; // +1 intro screen
  const isIntro = index === 0;
  const template = isIntro ? null : templates[index - 1];

  return (
    <StoryNavigation
      count={total}
      index={index}
      onIndexChange={setIndex}
      onComplete={onDone}
      autoAdvanceMs={isIntro ? 3200 : 4200}
      disableBack={false}
    >
      {isIntro ? (
        <div className="onboarding-shell">
          <OnboardingChromeBackdrop />
          <main className="onboarding-welcome-body">
            <OnboardingSuccessMark icon="brand" />
            <h1 className="onboarding-title" style={{ marginBottom: 10 }}>
              Markanı tanıdık
            </h1>
            <p className="onboarding-lead" style={{ maxWidth: 320 }}>
              <strong>{templates.length} tasarım</strong> hazır · kaydırarak bakın
            </p>
          </main>
        </div>
      ) : (
        <div className="template-showcase-screen">
          <style>{`
            .template-showcase-screen { position: absolute; inset: 0; background: #0A0A0E; }
            .template-showcase-media { position: absolute; inset: 0; }
            .template-showcase-media img { width: 100%; height: 100%; object-fit: cover; }
            .template-showcase-scrim {
              position: absolute; inset: 0;
              background: linear-gradient(to top, rgba(8,8,12,0.92) 4%, rgba(8,8,12,0.25) 42%, rgba(8,8,12,0.55) 100%);
            }
            .template-showcase-caption {
              position: absolute; left: 0; right: 0; bottom: 0; z-index: 5;
              padding: 24px 22px calc(36px + env(safe-area-inset-bottom));
            }
            .template-showcase-kicker {
              font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
              color: rgba(157,190,206,0.95); margin-bottom: 8px;
            }
            .template-showcase-name { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 8px; line-height: 1.15; }
            .template-showcase-desc { font-size: 14px; color: rgba(226,232,240,0.78); line-height: 1.45; }
            .template-showcase-badge {
              position: absolute; top: 54px; right: 18px; z-index: 6;
              padding: 5px 11px; border-radius: 30px; font-size: 11px; font-weight: 600;
              background: rgba(255,255,255,0.12); color: #fff; backdrop-filter: blur(8px);
              text-transform: capitalize;
            }
          `}</style>
          <div className="template-showcase-media">
            {template?.thumbnail_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={template.thumbnail_url} alt={template.template_name} />
            )}
          </div>
          <div className="template-showcase-scrim" aria-hidden />
          <div className="template-showcase-badge">{template?.format?.replace('_', ' ')}</div>
          <div className="template-showcase-caption">
            <div className="template-showcase-kicker">
              Şablon {index} / {templates.length}
            </div>
            <div className="template-showcase-name">{template?.template_name}</div>
            <div className="template-showcase-desc">
              {template ? (TEMPLATE_TYPE_LABELS[template.template_type] ?? '') : ''}
            </div>
          </div>
        </div>
      )}
    </StoryNavigation>
  );
}

function WelcomeStep({
  brandName,
  websiteUrl,
  igHandle,
  onDone,
}: {
  brandName: string;
  websiteUrl: string;
  igHandle?: string;
  onDone: () => void;
}) {
  const brandInitials = brandName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const domain = extractDomain(websiteUrl || '').replace(/^www\./, '');

  return (
    <div className="onboarding-shell onboarding-shell--welcome">
      <OnboardingChromeBackdrop success />
      <OnboardingLogoHeader compact />

      <main className="onboarding-welcome-body onboarding-stagger">
        <OnboardingSuccessMark />

        <h1 className="onboarding-title" style={{ marginBottom: 10 }}>
          {brandName} hazır!
        </h1>
        <p className="onboarding-lead" style={{ marginBottom: 24, maxWidth: 310 }}>
          Marka profilin hazır.
        </p>

        <div className="onboarding-brand-card">
          <div className="onboarding-brand-card-head">
            <div className="onboarding-brand-avatar">{brandInitials || 'AI'}</div>
            <div style={{ minWidth: 0 }}>
              <div className="onboarding-brand-meta-title">{brandName}</div>
              <div className="onboarding-brand-meta-sub">
                {domain || 'Marka alanı'}{igHandle ? ` · @${igHandle}` : ''}
              </div>
            </div>
          </div>
          <div className="onboarding-feature-grid">
            {['Marka profili', 'Görsel kimlik', 'İçerik planı', 'AI ekibi hazır'].map((f) => (
              <div key={f} className="onboarding-feature-chip">{f}</div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onDone}
          className="onboarding-cta"
          style={{ maxWidth: 360 }}
        >
          Uygulamaya Git
        </button>
      </main>
    </div>
  );
}

// ─── Shared UI helpers ────────────────────────────────────────────────
const cardStyle: React.CSSProperties = {
  padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', marginBottom: 10,
};
function ResultCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(148,163,184,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}
function chipStyle(color: string): React.CSSProperties {
  return { padding: '5px 12px', borderRadius: 30, fontSize: 12, fontWeight: 500, background: `${color}0d`, border: `0.5px solid ${color}22`, color, display: 'inline-block' };
}

// ─── MAIN ONBOARDING FLOW ─────────────────────────────────────────────
interface Props {
  onComplete: () => void;
  onLogin: () => void;
}

export function OnboardingFlow({ onComplete, onLogin }: Props) {
  const [step, setStep] = useState<Step>('url');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [igHandle, setIgHandle]     = useState('');
  const [menuUrl, setMenuUrl]       = useState('');
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState('');
  const [result, setResult]         = useState<DiscoveryResultWithCache | null>(null);
  const [signupBrandName, setSignupBrandName] = useState('');
  const [tenantId, setTenantId]     = useState('');

  const discoveredBrandName = result?.profile?.brandName ?? result?.report?.brandName ?? (websiteUrl ? extractDomain(websiteUrl) : igHandle ? `@${igHandle}` : 'Markanız');
  const brandName = signupBrandName || discoveredBrandName;

  // Immersive analyze/setup — thin journey context only (no phase labels crowding the ritual)
  const railVisible = step !== 'analyzing';
  const flowClass = `onboarding-flow${railVisible ? ' onboarding-flow--with-rail' : ''}`;

  return (
    <div className={flowClass}>
      <OnboardingProgressRail step={step} visible={railVisible} />
      <div key={step} className="onboarding-flow-stage">
        {step === 'url' && (
          <UrlStep
            onNext={(url, ig, menu, google) => {
              setWebsiteUrl(url);
              setIgHandle(ig);
              setMenuUrl(menu);
              setGoogleBusinessUrl(google);
              setStep('analyzing');
            }}
            onLogin={onLogin}
          />
        )}
        {step === 'analyzing' && (
          <AnalyzingStep
            url={websiteUrl}
            ig={igHandle}
            menuUrl={menuUrl}
            googleBusinessUrl={googleBusinessUrl}
            onDone={(res) => { setResult(res); setStep('results'); }}
          />
        )}
        {step === 'results' && (
          <ResultsStep result={result} url={websiteUrl} ig={igHandle} onNext={() => setStep('signup')} />
        )}
        {step === 'signup' && (
          <SignupStep
            brandName={brandName}
            websiteUrl={websiteUrl}
            igHandle={igHandle}
            menuUrl={menuUrl}
            googleBusinessUrl={googleBusinessUrl}
            discoveryResult={result}
            onDone={(companyName, newTenantId) => {
              setSignupBrandName(companyName);
              if (newTenantId) setTenantId(newTenantId);
              setStep(newTenantId ? 'brand_confirm' : 'welcome');
            }}
          />
        )}
        {step === 'brand_confirm' && tenantId && (
          <BrandConfirmStep
            brandName={signupBrandName || brandName}
            tenantId={tenantId}
            onDone={(confirmedName) => {
              setSignupBrandName(confirmedName);
              setStep('typography_confirm');
            }}
          />
        )}
        {step === 'typography_confirm' && tenantId && (
          <TypographyConfirmStep
            brandName={signupBrandName || brandName}
            tenantId={tenantId}
            onDone={() => setStep('gallery_ready')}
          />
        )}
        {step === 'gallery_ready' && tenantId && (
          <GalleryReadyStep
            brandName={signupBrandName || brandName}
            tenantId={tenantId}
            onDone={() => setStep('templates_showcase')}
          />
        )}
        {step === 'templates_showcase' && (
          <TemplatesShowcaseStep
            brandName={brandName}
            tenantId={tenantId}
            onDone={() => setStep('welcome')}
          />
        )}
        {step === 'welcome' && (
          <WelcomeStep
            brandName={brandName}
            websiteUrl={websiteUrl}
            igHandle={igHandle}
            onDone={onComplete}
          />
        )}
      </div>
    </div>
  );
}

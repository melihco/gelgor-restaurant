'use client';
/**
 * ONBOARDING FLOW — Brand Analysis → Sign Up → Package → Welcome
 *
 * Step 1: URL input (website, optional instagram)
 * Step 2: Live brand analysis animation (real API)
 * Step 3: Brand intelligence results preview
 * Step 4: Create account (sign up)
 * Step 5: Package selection
 * Step 6: Welcome + brand constitution confirmed
 */
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../auth-store';
import { apiClient } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';
import { getRequestContextHeaders } from '@/lib/runtime-config';
import { humanizeMobileServiceError } from '@/lib/mobile-customer-copy';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { BrandDiscoveryResult, BrandIntelligenceReport } from '@/types';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { StoryNavigation } from '../StoryNavigation';
import {
  TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS,
  buildUserConfirmedTypographyPatch,
  isTypographyDesignConfirmed,
  resolveSuggestedTypographyConfig,
} from '@/lib/typography-design-policy';
import type { BrandDesignTypographyConfig, TypographyVibe } from '@/types/brand-theme';

// ─── Types ────────────────────────────────────────────────────────────
type Step = 'url' | 'analyzing' | 'results' | 'signup' | 'typography_confirm' | 'templates_showcase' | 'welcome';

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
function UrlStep({ onNext, onLogin }: { onNext: (url: string, ig: string, menuUrl: string) => void; onLogin: () => void }) {
  const [url, setUrl]     = useState('');
  const [ig, setIg]       = useState('');
  const [menuUrl, setMenuUrl] = useState('');
  const [error, setError] = useState('');
  const [mode, setMode]   = useState<'web' | 'social'>('web');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 400); }, [mode]);

  function handleSubmit() {
    const cleanIg = stripHandle(ig);
    if (mode === 'social') {
      if (!cleanIg) { setError('Instagram kullanıcı adınızı girin'); return; }
      onNext('', cleanIg, '');
      return;
    }
    const normalized = normalizeUrl(url);
    const normalizedMenu = menuUrl.trim() ? normalizeUrl(menuUrl) : '';
    if (!normalized && !cleanIg && !normalizedMenu) { setError('Web sitesi URL\'i, menü linki veya Instagram handle\'ı girin'); return; }
    if (normalized) {
      try { new URL(normalized); } catch { setError('Geçerli bir URL girin (örn: siteniz.com)'); return; }
    }
    if (normalizedMenu) {
      try { new URL(normalizedMenu); } catch { setError('Geçerli bir menü linki girin'); return; }
    }
    onNext(normalized, cleanIg, normalizedMenu);
  }

  const hasWebInput = url.trim().length > 0;
  const hasIgInput  = ig.trim().length > 0;
  const hasMenuInput = menuUrl.trim().length > 0;

  return (
    <div className="onboarding-shell">
      <div className="onboarding-ambient" aria-hidden />

      <header className="onboarding-header">
        <OnboardingLogoMark />
        <h1 className="onboarding-title">Markanızı tanıyalım</h1>
        <p className="onboarding-lead">
          Web siteniz ve sosyal profilinizden marka kimliğinizi çıkarıyoruz.
        </p>
      </header>

      <main className="onboarding-main">
        <div className="onboarding-segment">
          {([
            { key: 'web' as const, label: 'Web sitesi' },
            { key: 'social' as const, label: 'Instagram' },
          ]).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { setMode(opt.key); setError(''); }}
              className={`onboarding-segment-btn${mode === opt.key ? ' onboarding-segment-btn--on' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {mode === 'web' ? (
          <div className="onboarding-fields">
            <label className="onboarding-field">
              <span className="onboarding-field-label">Web siteniz</span>
              <input
                ref={inputRef}
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="siteniz.com"
                type="url"
                autoComplete="url"
                className={`onboarding-input${hasWebInput ? ' onboarding-input--filled' : ''}${error ? ' onboarding-input--error' : ''}`}
              />
            </label>
            <label className="onboarding-field">
              <span className="onboarding-field-label onboarding-field-label--muted">Menü linki · opsiyonel</span>
              <input
                value={menuUrl}
                onChange={(e) => { setMenuUrl(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="menu.siteniz.com"
                type="url"
                className={`onboarding-input${hasMenuInput ? ' onboarding-input--filled' : ''}`}
              />
            </label>
            <label className="onboarding-field">
              <span className="onboarding-field-label onboarding-field-label--muted">Instagram · opsiyonel</span>
              <input
                value={ig}
                onChange={(e) => { setIg(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="@markaniz"
                className={`onboarding-input${hasIgInput ? ' onboarding-input--filled' : ''}`}
              />
            </label>
          </div>
        ) : (
          <div className="onboarding-fields">
            <label className="onboarding-field">
              <span className="onboarding-field-label">Instagram kullanıcı adı</span>
              <input
                ref={inputRef}
                value={ig}
                onChange={(e) => { setIg(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="markaniz"
                autoCapitalize="none"
                className={`onboarding-input${hasIgInput ? ' onboarding-input--filled' : ''}${error ? ' onboarding-input--error' : ''}`}
              />
            </label>
          </div>
        )}

        {error && <p className="onboarding-error">{error}</p>}

        <div className="onboarding-actions">
          <button type="button" onClick={handleSubmit} className="onboarding-cta">
            Analizi Başlat
          </button>
          <p className="onboarding-note">Marka analizi genelde 2–4 dakika sürer.</p>
        </div>
      </main>

      <footer className="onboarding-footer">
        <button type="button" onClick={onLogin} className="onboarding-login-link">
          Zaten hesabınız var mı? <span>Giriş Yap</span>
        </button>
      </footer>
    </div>
  );
}

// ─── Analysis Step ─────────────────────────────────────────────────────
function AnalyzingStep({ url, ig, menuUrl, onDone }: {
  url: string; ig: string; menuUrl: string;
  onDone: (result: BrandDiscoveryResult | null) => void;
}) {
  const baseSteps = getAnalysisSteps(url, ig);
  const [steps, setSteps] = useState<AnalysisStep[]>(
    baseSteps.map((s, i) => ({ ...s, done: false, active: i === 0 }))
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [apiResult, setApiResult] = useState<BrandDiscoveryResult | null>(null);
  const [apiSettled, setApiSettled] = useState(false);
  const doneRef = useRef(false);
  const apiResultRef = useRef<BrandDiscoveryResult | null>(null);

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
      }),
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.success !== false) {
          const result = json as BrandDiscoveryResult;
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
  }, [url, ig, menuUrl]);

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
      <div className="onboarding-ambient" aria-hidden />

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

      {/* Progress ring */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 20px' }}>
        <div style={{ position: 'relative', width: 100, height: 100 }}>
          <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#4D7088" strokeWidth="6"
              strokeDasharray={`${(progress / 100) * 264} 264`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 800ms ease', filter: 'drop-shadow(0 0 8px rgba(77,112,136,0.6))' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#9DBECE', fontVariantNumeric: 'tabular-nums' }}>{progress}%</div>
          </div>
        </div>
      </div>

      {/* Steps list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 24px' }}>
        {steps.map((step, i) => (
          <div key={step.id} style={{
            display: 'flex', gap: 14, alignItems: 'flex-start',
            padding: '12px 0',
            borderBottom: i < steps.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
            opacity: step.done ? 1 : step.active ? 1 : 0.35,
            transition: 'opacity 300ms',
          }}>
            {/* State indicator */}
            <div style={{ flexShrink: 0, marginTop: 2, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: step.done ? 'rgba(52,211,153,0.15)' : step.active ? 'rgba(77,112,136,0.14)' : 'rgba(255,255,255,0.05)', border: `1px solid ${step.done ? 'rgba(52,211,153,0.35)' : step.active ? 'rgba(77,112,136,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
              {step.done ? (
                <span style={{ fontSize: 10, color: '#34D399', fontWeight: 700 }}>✓</span>
              ) : step.active ? (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4D7088', animation: 'breathe 1s ease-in-out infinite' }} />
              ) : (
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
              )}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: step.active ? 700 : 500, color: step.done ? '#34D399' : step.active ? '#F4F4F8' : 'rgba(148,163,184,0.5)', marginBottom: 2, transition: 'color 300ms' }}>
                {step.label}
              </div>
              {(step.done || step.active) && (
                <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.45)', lineHeight: 1.4 }}>{step.detail}</div>
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
  const hasReal = !!result?.success;

  const brandName = profile?.brandName ?? report.brandName ?? domain;
  const industry  = profile?.industry  ?? report.industry  ?? 'İşletme';
  const location  = profile?.location  ?? '';
  const tone      = (profile?.brandTone ?? report.brandTone ?? '').split(/[,\-·]/g).map(s => s.trim()).filter(Boolean).slice(0, 4);
  const audience  = (report.targetAudience ?? []).slice(0, 3);
  const pillars   = (report.contentPillars ?? []).slice(0, 4);
  const goals     = (report.primaryGoals   ?? []).slice(0, 3);
  const summary   = (report as any).websiteSummary as string | undefined;
  const confidence= Math.min((result as any)?.confidence ?? (hasReal ? 82 : 0), 100);
  const channels  = (report.preferredChannels ?? []).slice(0, 3);

  // Fallback preview cards when API data is absent
  const fallbackCards = !hasReal ? [
    {
      label: 'Marka Analizi',
      icon: '✦',
      color: '#9DBECE',
      desc: `${url ? domain : (ig ? `@${ig}` : 'Markanız')} analiz edildi. Tam marka profili kayıt sonrası oluşturulacak.`,
    },
    {
      label: 'İçerik İhtiyaçları',
      icon: '◈',
      color: '#60A5FA',
      desc: 'AI ekibiniz içerik stratejinizi kayıt tamamlandığında otomatik hazırlayacak.',
    },
    {
      label: 'AI Ekibi Hazır',
      icon: '⚡',
      color: '#34D399',
      desc: '6 ajan markanız için çalışmaya başlayacak: içerik, tasarım, analiz ve daha fazlası.',
    },
  ] : [];

  return (
    <div className="onboarding-shell" style={{ overflow: 'hidden' }}>

      <div className="onboarding-ambient onboarding-ambient--success" aria-hidden />

      <div className="onboarding-results-head">
        <OnboardingLogoMark compact />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 10px rgba(52,211,153,0.7)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#34D399', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {hasReal ? 'Analiz Tamamlandı' : 'Ön Tarama Tamamlandı'}
          </span>
        </div>

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
              📍 {location}
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
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px', paddingBottom: 120 }}>

        {/* AI Confidence Score (only when real data) */}
        {hasReal && (
          <div style={{ ...cardStyle, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative', width: 54, height: 54, flexShrink: 0 }}>
              <svg width="54" height="54" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="27" cy="27" r="21" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
                <circle cx="27" cy="27" r="21" fill="none" stroke="#4D7088" strokeWidth="5"
                  strokeDasharray={`${(confidence / 100) * 132} 132`} strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0 0 5px rgba(77,112,136,0.5))' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#9DBECE', fontVariantNumeric: 'tabular-nums' }}>
                {confidence}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F4F4F8', marginBottom: 3 }}>AI Güven Skoru</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.5)' }}>
                {confidence >= 80 ? 'Marka veriniz oldukça güçlü' : confidence >= 60 ? 'Marka profiliniz tespit edildi' : 'Temel marka verileri alındı'}
              </div>
            </div>
          </div>
        )}

        {/* Pre-auth info card */}
        {!hasReal && (
          <div style={{ ...cardStyle, marginBottom: 12, background: 'rgba(77,112,136,0.08)', border: '0.5px solid rgba(77,112,136,0.22)', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>✦</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9DBECE', marginBottom: 4 }}>Tam analiz için kayıt gerekli</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)', lineHeight: 1.55 }}>
                Hesap oluşturduktan sonra AI ekibiniz {domain} sitesini derinlemesine analiz ederek marka profilinizi otomatik hazırlayacak.
              </div>
            </div>
          </div>
        )}

        {/* Detected URL */}
        <ResultCard label="Tespit Edilen Kaynak">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14 }}>🌐</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#F4F4F8' }}>{domain}</span>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', color: '#34D399', fontWeight: 600 }}>Tarandı</span>
            </div>
            {ig && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14 }}>📸</span>
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
                <span style={{ color: '#34D399', flexShrink: 0, marginTop: 2, fontSize: 10 }}>●</span>
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
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${card.color}14`, border: `0.5px solid ${card.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, color: card.color, flexShrink: 0 }}>
              {card.icon}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F8', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)', lineHeight: 1.5 }}>{card.desc}</div>
            </div>
          </div>
        ))}

        {/* What happens next teaser */}
        <div style={{ ...cardStyle, background: 'rgba(52,211,153,0.05)', border: '0.5px solid rgba(52,211,153,0.15)', marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#34D399', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Kayıt Sonrası</div>
          {[
            '✦ Tam marka analizini görün',
            '⚡ AI ekibinizi aktive edin',
            '📊 İçerik stratejinizi otomatik oluşturun',
            '🎨 Markaya özel şablonlar hazırlanır',
          ].map((item, i) => (
            <div key={i} style={{ fontSize: 13, color: 'rgba(226,232,240,0.65)', marginBottom: i < 3 ? 7 : 0, display: 'flex', gap: 8 }}>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 24px', paddingBottom: 'max(20px,env(safe-area-inset-bottom))', background: 'rgba(4,4,10,0.96)', backdropFilter: 'blur(24px)', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <button onClick={onNext} style={{ width: '100%', padding: '18px', borderRadius: 18, background: 'linear-gradient(135deg,#4D7088,#5A82A0)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', boxShadow: '0 6px 32px rgba(77,112,136,0.45)', cursor: 'pointer' }}>
          Hesap Oluştur & Tam Analizi Gör →
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
    ? 'Derin analiz 1–3 dakika sürebilir — bu ekranda kalabilirsiniz.'
    : 'Birkaç saniye içinde hazır...';

  return (
    <div className="onboarding-shell">
      <div className="onboarding-ambient" aria-hidden />
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
        <div className="onboarding-setup-sub">AI ekibiniz markanız için hazırlanıyor</div>

        <div className="onboarding-setup-steps">
          {SETUP_PHASES.map((p, i) => {
            const done = i < phase;
            const active = i === phase;
            return (
              <div key={p.id} className={`onboarding-setup-step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
                <div className="onboarding-setup-step-dot">
                  {done ? '✓' : active ? <span className="onboarding-setup-spinner" /> : null}
                </div>
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
function SignupStep({ brandName, websiteUrl, igHandle, menuUrl, discoveryResult, onDone }: {
  brandName: string;
  websiteUrl: string;
  igHandle: string;
  menuUrl: string;
  discoveryResult: BrandDiscoveryResult | null;
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
      googleBusinessUrl: String(ctx.google_business_url || '') || undefined,
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

  async function runFullBrandOnboarding(tenantId: string) {
    if (!websiteUrl && !igHandle && !menuUrl) {
      throw new Error('Marka analizi için web sitesi, menü linki veya Instagram gerekli.');
    }

    setStatus('Derin marka analizi: web, Instagram, galeri ve anayasa (1–3 dk)...');
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
      }),
    });

    const data = await res.json().catch(() => ({})) as {
      ok?: boolean;
      errors?: string[];
      productionReady?: boolean;
      authoritativeSector?: string;
      brandAnalysis?: Awaited<ReturnType<typeof apiClient.analyzeBrandContext>>;
      gallery?: { analyzed?: number; usable?: number; calibration?: { matched: number; tested: number } };
      steps?: Array<{ id: string; ok: boolean; detail?: string }>;
    };

    if (data.brandAnalysis) {
      setStatus('Firma profili ve marka hafızası kaydediliyor...');
      await persistPythonAnalysisToProfile(data.brandAnalysis, data.authoritativeSector);
      await fetch(`/api/brand-context/${tenantId}/hydrate-company-profile`, {
        method: 'POST',
        headers: getRequestContextHeaders(),
      }).catch(() => null);
    }

    if (!res.ok || !data.ok) {
      const stepFail = data.steps?.find((s) => !s.ok);
      console.warn('[onboarding] deep brand setup incomplete', {
        status: res.status,
        error: data.errors?.[0],
        step: stepFail,
      });
      setStatus(
        data.brandAnalysis
          ? 'Marka profili kaydedildi · Gelişmiş ayarlar arka planda tamamlanacak.'
          : 'Temel marka profili kaydedildi · Analizi Marka Ayarlarından tamamlayabilirsiniz.',
      );
      return;
    }

    const cal = data.gallery?.calibration;
    const galleryLine = cal && cal.tested > 0
      ? `Galeri: ${data.gallery?.analyzed ?? 0} görsel · caption eşleşme ${cal.matched}/${cal.tested}`
      : `Galeri: ${data.gallery?.analyzed ?? 0} görsel etiketlendi`;

    if (data.productionReady) {
      setStatus(
        `${galleryLine} · Üretim hazır: story şablonları, AI görsel ayarları ve galeri mirror kayıtlı.`,
      );
    } else {
      const failed = data.steps?.find(
        (s) => !s.ok && ['theme_derive', 'template_library_lock', 'ai_production_defaults', 'gallery_provision'].includes(s.id),
      );
      setStatus(
        failed
          ? `${galleryLine} · Kısmi kurulum (${failed.id}) — Marka Ayarlarından tamamlayın.`
          : `${galleryLine} · Marka analizi tamamlandı.`,
      );
    }
  }

  async function handleSignup() {
    if (!email || !password || !company) { setError('Tüm alanlar zorunludur'); return; }
    if (password.length < 8) { setError('Şifre en az 8 karakter olmalı'); return; }
    setLoading(true); setError('');
    try {
      setStatus('Hesap oluşturuluyor...');
      const session = await apiClient.register({
        email: email.trim(),
        password,
        tenantName: company.trim(),
        displayName: name.trim() || company.trim(),
      });

      // Save token + workspace — but do NOT call setUser() yet.
      // If setUser() is called here, isAuthenticated becomes true and AppShell
      // immediately renders the main app, skipping Plans and Welcome steps.
      // setUser() is called in onComplete() after the full flow finishes.
      if (session.token) setSessionToken(session.token);
      if (session.tenantId && session.officeId) setWorkspace(session.tenantId, session.officeId);

      // Always persist the minimum profile first. If later AI enrichment fails,
      // Brand details must still show the signed-up company instead of blanks.
      setStatus('Firma profili kaydediliyor...');
      await apiClient.saveCompanyProfile(baselineProfile() as any);

      if (session.tenantId && (websiteUrl || igHandle || menuUrl)) {
        await runFullBrandOnboarding(session.tenantId);
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
    } catch (e: any) {
      const status = typeof e?.status === 'number' ? e.status : undefined;
      const body = String(e?.responseBody ?? e?.message ?? '');
      const msg = humanizeMobileServiceError(body, status);
      setError(
        status === 409 || msg.includes('409') || body.includes('already exists') ? 'Bu e-posta zaten kayıtlı.' :
        status === 400 || msg.includes('400') ? 'Bilgiler geçersiz, tekrar kontrol edin.' :
        msg.includes('Marka') || msg.includes('analiz') || msg.includes('kaynak') || msg.includes('anayasa')
          ? msg
          : msg && msg !== body
            ? msg
            : 'Kayıt başarısız. Lütfen tekrar deneyin.'
      );
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
      <div className="onboarding-ambient" aria-hidden />
      <OnboardingLogoHeader compact />

      <main className="onboarding-main onboarding-signup-main">
        <h1 className="onboarding-title onboarding-title--step">Hesap Oluşturun</h1>
        <p className="onboarding-lead onboarding-lead--step">
          Marka analizinizi kaydedin ve AI ekibinizi aktive edin.
        </p>

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

// ─── Welcome Step ──────────────────────────────────────────────────────
// ─── Templates Showcase Step ───────────────────────────────────────────
const TEMPLATE_TYPE_DESCRIPTIONS: Record<string, string> = {
  campaign_announcement: 'Kampanyalarınızı duyururken bu tasarım kullanılır.',
  event_special: 'Özel günlerde markanıza özel kutlama tasarımı.',
  menu_highlight: 'Ürün ve menü tanıtımlarınız için.',
  venue_showcase: 'Mekanınızı en iyi gösteren story tasarımı.',
  seasonal_promo: 'Sezon kampanyalarınız için hazır.',
  social_proof: 'Müşteri yorumlarınızı paylaşırken.',
  daily_story: 'Günlük paylaşımlarınız için sade tasarım.',
  announcement_formal: 'Resmi duyurularınız için kurumsal tasarım.',
  reel_cover: 'Reel videolarınızın kapak tasarımı.',
  brand_identity: 'Marka kimliğinizi yansıtan tasarım.',
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
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<BrandDesignTypographyConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const headers = getRequestContextHeaders();
        const [themeRes, ctxRes] = await Promise.all([
          fetch(`/api/brand-context/${tenantId}/theme`, { headers, signal: AbortSignal.timeout(20_000) }),
          fetch(`/api/brand-context/${tenantId}`, { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null),
        ]);
        const themeJson = themeRes.ok ? ((await themeRes.json()) as { theme?: Record<string, unknown> }) : {};
        const theme = themeJson.theme ?? {};
        if (isTypographyDesignConfirmed(theme)) {
          onDone();
          return;
        }
        const ctx = ctxRes?.ok ? ((await ctxRes.json()) as Record<string, unknown>) : null;
        const sector = String(ctx?.business_type ?? ctx?.industry ?? 'general_business');
        if (!cancelled) {
          setConfig(resolveSuggestedTypographyConfig(theme, sector));
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
  }, [tenantId, onDone]);

  async function handleConfirm() {
    if (!config || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const headers = {
        ...getRequestContextHeaders(),
        'Content-Type': 'application/json',
      };
      const confirmed = buildUserConfirmedTypographyPatch(config);
      const themeRes = await fetch(`/api/brand-context/${tenantId}/theme`, {
        headers: getRequestContextHeaders(),
        signal: AbortSignal.timeout(20_000),
      });
      const themeJson = themeRes.ok ? ((await themeRes.json()) as { theme?: Record<string, unknown> }) : {};
      const currentTheme = themeJson.theme ?? {};

      const putRes = await fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          theme: {
            ...currentTheme,
            typography_design: confirmed,
            typographyDesign: confirmed,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!putRes.ok) throw new Error('Tipografi stili kaydedilemedi.');

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
      setError(e instanceof Error ? e.message : 'Bir hata oluştu.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="onboarding-shell">
        <div className="onboarding-ambient" aria-hidden />
        <main className="onboarding-welcome-body">
          <div className="onboarding-setup-shimmer" aria-hidden />
          <h1 className="onboarding-title" style={{ marginBottom: 10 }}>Tipografi stiliniz</h1>
          <p className="onboarding-lead" style={{ maxWidth: 300 }}>
            {brandName} için önerilen yazı stili hazırlanıyor…
          </p>
        </main>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="onboarding-shell">
        <main className="onboarding-welcome-body">
          <p className="onboarding-lead">{error ?? 'Tipografi yüklenemedi.'}</p>
          <button type="button" className="onboarding-primary-btn" onClick={onDone}>
            Devam et
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-ambient" aria-hidden />
      <OnboardingLogoHeader compact />
      <main className="onboarding-welcome-body" style={{ paddingBottom: 24 }}>
        <h1 className="onboarding-title" style={{ marginBottom: 8 }}>Yazı stilinizi seçin</h1>
        <p className="onboarding-lead" style={{ maxWidth: 320, marginBottom: 20 }}>
          {brandName} için tüm AI tasarımları bu tipografi kimliğine kilitlenecek.
          Sektörünüze uygun öneriyi onaylayın veya değiştirin.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
          width: '100%',
          maxWidth: 360,
          marginBottom: 20,
        }}
        >
          {TYPOGRAPHY_VIBE_ONBOARDING_OPTIONS.map((opt) => {
            const active = config.vibe === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setConfig({ ...config, vibe: opt.id as TypographyVibe })}
                style={{
                  textAlign: 'left',
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: active ? '2px solid rgba(157,190,206,0.95)' : '1px solid rgba(255,255,255,0.12)',
                  background: active ? 'rgba(157,190,206,0.14)' : 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
                  {opt.emoji} {opt.label}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(226,232,240,0.72)', lineHeight: 1.35 }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="onboarding-lead" style={{ color: '#fca5a5', marginBottom: 12 }}>
            {error}
          </p>
        )}

        <button
          type="button"
          className="onboarding-primary-btn"
          disabled={submitting}
          onClick={() => void handleConfirm()}
        >
          {submitting ? 'Şablonlar üretiliyor…' : 'Onayla ve devam et'}
        </button>
      </main>
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
        <div className="onboarding-ambient" aria-hidden />
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
          <div className="onboarding-ambient" aria-hidden />
          <main className="onboarding-welcome-body">
            <div className="onboarding-success-ring" aria-hidden>✦</div>
            <h1 className="onboarding-title" style={{ marginBottom: 10 }}>
              Markanı tanıdık
            </h1>
            <p className="onboarding-lead" style={{ maxWidth: 320 }}>
              {brandName} için kurumsal renkleriniz, logonuz ve tarzınızla
              {` `}<strong>{templates.length} özel tasarım şablonu</strong> hazırladık.
              Kaydırarak göz atın.
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
              {template ? (TEMPLATE_TYPE_DESCRIPTIONS[template.template_type] ?? 'Markanıza özel tasarım.') : ''}
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
      <div className="onboarding-ambient onboarding-ambient--success" aria-hidden />
      <OnboardingLogoHeader compact />

      <main className="onboarding-welcome-body">
        <div className="onboarding-success-ring" aria-hidden>✓</div>

        <h1 className="onboarding-title" style={{ marginBottom: 10 }}>
          {brandName} hazır!
        </h1>
        <p className="onboarding-lead" style={{ marginBottom: 24, maxWidth: 310 }}>
          AI ekibiniz aktive edildi. Marka analiziniz tamamlandı ve ajanlar çalışmaya hazır.
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
            {['✦ Marka profili', '🎨 Görsel kimlik', '📊 İçerik planı', '🤖 AI ekibi aktif'].map((f) => (
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
          Komuta Merkezine Git ✦
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
  const [result, setResult]         = useState<BrandDiscoveryResult | null>(null);
  const [signupBrandName, setSignupBrandName] = useState('');
  const [tenantId, setTenantId]     = useState('');

  const discoveredBrandName = result?.profile?.brandName ?? result?.report?.brandName ?? (websiteUrl ? extractDomain(websiteUrl) : igHandle ? `@${igHandle}` : 'Markanız');
  const brandName = signupBrandName || discoveredBrandName;

  // Slide transition
  const slideStyle: React.CSSProperties = { animation: 'slideUp 300ms cubic-bezier(0.34,1.1,0.64,1) both', height: '100dvh', overflow: 'hidden' };

  return (
    <div key={step} style={slideStyle}>
      {step === 'url' && (
        <UrlStep
          onNext={(url, ig, menu) => { setWebsiteUrl(url); setIgHandle(ig); setMenuUrl(menu); setStep('analyzing'); }}
          onLogin={onLogin}
        />
      )}
      {step === 'analyzing' && (
        <AnalyzingStep
          url={websiteUrl}
          ig={igHandle}
          menuUrl={menuUrl}
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
          discoveryResult={result}
          onDone={(companyName, newTenantId) => {
            setSignupBrandName(companyName);
            if (newTenantId) setTenantId(newTenantId);
            setStep(newTenantId ? 'typography_confirm' : 'welcome');
          }}
        />
      )}
      {step === 'typography_confirm' && tenantId && (
        <TypographyConfirmStep
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
  );
}

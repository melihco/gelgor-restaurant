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
import { useTheme } from '../theme-context';
import { useAuthStore } from '../auth-store';
import { apiClient } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';
import { getRequestContextHeaders } from '@/lib/runtime-config';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { BrandDiscoveryResult, BrandIntelligenceReport } from '@/types';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';

// ─── Types ────────────────────────────────────────────────────────────
type Step = 'url' | 'analyzing' | 'results' | 'signup' | 'welcome';

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
function UrlStep({ onNext, onLogin }: { onNext: (url: string, ig: string) => void; onLogin: () => void }) {
  const { t } = useTheme();
  const [url, setUrl]     = useState('');
  const [ig, setIg]       = useState('');
  const [error, setError] = useState('');
  const [mode, setMode]   = useState<'web' | 'social'>('web');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 400); }, []);

  function handleSubmit() {
    const cleanIg = stripHandle(ig);
    if (mode === 'social') {
      if (!cleanIg) { setError('Instagram kullanıcı adınızı girin'); return; }
      onNext('', cleanIg);
      return;
    }
    const normalized = normalizeUrl(url);
    if (!normalized && !cleanIg) { setError('Web sitesi URL\'i veya Instagram handle\'ı girin'); return; }
    if (normalized) {
      try { new URL(normalized); } catch { setError('Geçerli bir URL girin (örn: siteniz.com)'); return; }
    }
    onNext(normalized, cleanIg);
  }

  const hasWebInput = url.trim().length > 0;
  const hasIgInput  = ig.trim().length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#04040A', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif' }}>
      {/* Top glow */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '140%', height: 280, background: 'radial-gradient(ellipse at 50% 0%, rgba(77,112,136,0.16) 0%, transparent 65%)', pointerEvents: 'none' }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ margin: '0 auto 18px', width: 68, height: 68, borderRadius: 18, overflow: 'hidden', boxShadow: '0 0 40px rgba(77,112,136,0.35)' }}>
            <SmartAgencyLogo variant="markOnly" priority className="!h-[68px] !w-[68px] !rounded-[18px]" />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#F4F4F8', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 8 }}>
            Markanızı analiz edelim
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(160,160,180,0.6)', lineHeight: 1.6 }}>
            Web sitesi veya Instagram ile başlayın,<br />AI ekibimiz markanızı tanısın.
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 4, border: '0.5px solid rgba(255,255,255,0.08)' }}>
          {([
            { key: 'web',    icon: '🌐', label: 'Web Sitesi' },
            { key: 'social', icon: '📸', label: 'Sadece Instagram' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => { setMode(opt.key); setError(''); }}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 11, border: 'none', cursor: 'pointer',
                background: mode === opt.key ? 'rgba(77,112,136,0.22)' : 'transparent',
                color: mode === opt.key ? '#C4B5FD' : 'rgba(148,163,184,0.45)',
                fontSize: 13, fontWeight: mode === opt.key ? 700 : 500,
                boxShadow: mode === opt.key ? 'inset 0 0 0 0.5px rgba(77,112,136,0.5)' : 'none',
                transition: 'all 180ms',
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>

        {mode === 'web' ? (
          <>
            {/* Website URL */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Web Siteniz</div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(148,163,184,0.4)', pointerEvents: 'none' }}>🌐</div>
                <input
                  ref={inputRef}
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="siteniz.com"
                  type="url"
                  autoComplete="url"
                  style={{
                    width: '100%', padding: '16px 16px 16px 44px', borderRadius: 16, outline: 'none', boxSizing: 'border-box',
                    fontSize: 17, letterSpacing: '-0.01em',
                    background: 'rgba(255,255,255,0.06)',
                    border: error ? '1px solid rgba(239,68,68,0.5)' : `1px solid ${hasWebInput ? 'rgba(77,112,136,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: '#F4F4F8',
                    boxShadow: hasWebInput ? '0 0 0 3px rgba(77,112,136,0.12)' : 'none',
                    transition: 'border 200ms, box-shadow 200ms',
                  }}
                />
              </div>
            </div>

            {/* Instagram optional */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Instagram (opsiyonel)</div>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'rgba(148,163,184,0.3)', pointerEvents: 'none' }}>@</div>
                <input
                  value={ig}
                  onChange={e => { setIg(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="instagram_handle"
                  style={{
                    width: '100%', padding: '13px 16px 13px 34px', borderRadius: 14, outline: 'none', boxSizing: 'border-box',
                    fontSize: 15,
                    background: 'rgba(255,255,255,0.04)',
                    border: `0.5px solid ${hasIgInput ? 'rgba(77,112,136,0.25)' : 'rgba(255,255,255,0.08)'}`,
                    color: '#F4F4F8',
                  }}
                />
              </div>
            </div>
          </>
        ) : (
          /* Instagram-only mode */
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Instagram Kullanıcı Adı</div>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(157,190,206,0.5)', pointerEvents: 'none' }}>@</div>
              <input
                ref={inputRef}
                value={ig}
                onChange={e => { setIg(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                placeholder="markaniniz"
                autoCapitalize="none"
                style={{
                  width: '100%', padding: '16px 16px 16px 40px', borderRadius: 16, outline: 'none', boxSizing: 'border-box',
                  fontSize: 18, letterSpacing: '-0.01em',
                  background: 'rgba(255,255,255,0.06)',
                  border: error ? '1px solid rgba(239,68,68,0.5)' : `1px solid ${hasIgInput ? 'rgba(77,112,136,0.4)' : 'rgba(255,255,255,0.1)'}`,
                  color: '#F4F4F8',
                  boxShadow: hasIgInput ? '0 0 0 3px rgba(77,112,136,0.12)' : 'none',
                  transition: 'border 200ms, box-shadow 200ms',
                }}
              />
            </div>
            <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(157,190,206,0.08)', border: '0.5px solid rgba(157,190,206,0.18)', fontSize: 12, color: 'rgba(157,190,206,0.7)', lineHeight: 1.5 }}>
              📸 Profil, son gönderiler ve hashtagler analiz edilecek. Web sitesi olmayan markalar için ideal.
            </div>
          </div>
        )}

        {error && <div style={{ marginBottom: 12, fontSize: 12, color: '#EF4444' }}>{error}</div>}

        {/* CTA */}
        <button onClick={handleSubmit} style={{
          width: '100%', padding: '17px', borderRadius: 18,
          background: 'linear-gradient(135deg,#4D7088,#5A82A0)',
          border: 'none', color: '#fff', fontSize: 16, fontWeight: 800,
          letterSpacing: '-0.01em',
          boxShadow: '0 6px 32px rgba(77,112,136,0.45)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          ✦ Analizi Başlat
        </button>

        <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: 'rgba(148,163,184,0.4)' }}>
          Kayıt olmadan analiz yapabilirsiniz
        </p>
      </div>

      {/* Bottom login link */}
      <div style={{ padding: '0 28px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))', textAlign: 'center' }}>
        <button onClick={onLogin} style={{ fontSize: 14, color: 'rgba(148,163,184,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Zaten hesabınız var mı? <span style={{ color: '#9DBECE', fontWeight: 600 }}>Giriş Yap</span>
        </button>
      </div>
    </div>
  );
}

// ─── Analysis Step ─────────────────────────────────────────────────────
function AnalyzingStep({ url, ig, onDone }: {
  url: string; ig: string;
  onDone: (result: BrandDiscoveryResult | null) => void;
}) {
  const { t } = useTheme();
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
  }, [url, ig]);

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
    <div style={{ height: '100dvh', background: '#04040A', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif' }}>
      {/* Ambient glow */}
      <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '150%', height: 400, background: 'radial-gradient(ellipse at 50% 0%, rgba(77,112,136,0.14) 0%, transparent 60%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 28px 0', textAlign: 'center' }}>
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
    <div style={{ height: '100dvh', background: '#04040A', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif' }}>

      {/* Ambient glow */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '140%', height: 260, background: 'radial-gradient(ellipse at 50% 0%, rgba(52,211,153,0.10) 0%, transparent 60%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 16px', flexShrink: 0 }}>
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

// ─── Sign Up Step ──────────────────────────────────────────────────────
function SignupStep({ brandName, websiteUrl, igHandle, discoveryResult, onDone }: {
  brandName: string;
  websiteUrl: string;
  igHandle: string;
  discoveryResult: BrandDiscoveryResult | null;
  onDone: (companyName: string) => void;
}) {
  const { t } = useTheme();
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

  async function persistPythonAnalysisToProfile(
    analysis: Awaited<ReturnType<typeof apiClient.analyzeBrandContext>>,
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
    const industry = analysis.inferred_industry || String(ctx.business_type || '');
    const refUrls = parseRefUrls(analysis.reference_image_urls ?? ctx.reference_image_urls);
    const analysisText = [
      analysis.website_summary || String(ctx.website_summary || ''),
      analysis.instagram_bio ? `Instagram: ${analysis.instagram_bio}` : '',
    ].filter(Boolean).join('\n\n');
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
      description: analysis.website_summary || String(ctx.description || ''),
      instagramHandle: igHandle || String(ctx.instagram_handle || '') || undefined,
      googleBusinessUrl: String(ctx.google_business_url || '') || undefined,
      brandImageUrls: refUrls.slice(0, 40).join(','),
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
    if (!websiteUrl && !igHandle) {
      throw new Error('Marka analizi için web sitesi veya Instagram gerekli.');
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
      }),
    });

    const data = await res.json().catch(() => ({})) as {
      ok?: boolean;
      errors?: string[];
      productionReady?: boolean;
      brandAnalysis?: Awaited<ReturnType<typeof apiClient.analyzeBrandContext>>;
      gallery?: { analyzed?: number; usable?: number; calibration?: { matched: number; tested: number } };
      steps?: Array<{ id: string; ok: boolean; detail?: string }>;
    };

    if (!res.ok || !data.ok) {
      const stepFail = data.steps?.find((s) => !s.ok);
      throw new Error(
        data.errors?.[0]
        || (stepFail ? `${stepFail.id}: ${stepFail.detail ?? 'başarısız'}` : 'Marka kurulumu tamamlanamadı.'),
      );
    }

    if (data.brandAnalysis) {
      setStatus('Firma profili ve marka hafızası kaydediliyor...');
      await persistPythonAnalysisToProfile(data.brandAnalysis);
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

      if (session.tenantId && (websiteUrl || igHandle)) {
        await runFullBrandOnboarding(session.tenantId);
      }

      // Auto-propose first welcome mission when foundation scores allow it.
      try {
        const proposeRes = await fetch(`/api/missions/${session.tenantId}/propose`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getRequestContextHeaders(),
          },
          body: JSON.stringify({ context_signals: 'onboarding_welcome' }),
          signal: AbortSignal.timeout(120_000),
        });
        if (proposeRes.ok) {
          setStatus('Marka kurulumu tamamlandı · İlk kampanya önerildi.');
        } else if (proposeRes.status === 412) {
          setStatus('Marka kurulumu tamamlandı · Kampanya önerisi için galeri skorunu tamamlayın.');
        } else {
          setStatus('Marka kurulumu tamamlandı · Haftalık Plan sekmesinden kampanya başlatabilirsiniz.');
        }
      } catch {
        setStatus('Marka kurulumu tamamlandı · Haftalık Plan sekmesinden kampanya başlatabilirsiniz.');
      }
      onDone(company.trim());
    } catch (e: any) {
      const msg = String(e?.message || '');
      setError(
        msg.includes('409') ? 'Bu e-posta zaten kayıtlı.' :
        msg.includes('400') ? 'Bilgiler geçersiz, tekrar kontrol edin.' :
        msg.includes('Marka') || msg.includes('analiz') || msg.includes('kaynak') || msg.includes('anayasa')
          ? msg
          : 'Kayıt başarısız. Lütfen tekrar deneyin.'
      );
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  return (
    <div style={{ height: '100dvh', background: '#04040A', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#F4F4F8', letterSpacing: '-0.03em', marginBottom: 6 }}>Hesap Oluşturun</h1>
        <p style={{ fontSize: 14, color: 'rgba(148,163,184,0.5)', marginBottom: 32 }}>Marka analizinizi kaydedin ve AI ekibinizi aktive edin.</p>

        <FormField label="Firma Adı" value={company} onChange={setCompany} placeholder="Firma veya marka adı" />
        <FormField label="Adınız" value={name} onChange={setName} placeholder="İsim Soyisim (opsiyonel)" />
        <FormField label="E-posta" value={email} onChange={setEmail} placeholder="email@firma.com" type="email" />
        <FormField label="Şifre" value={password} onChange={setPassword} placeholder="En az 8 karakter" type="password" />

        {error && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', fontSize: 13, color: '#EF4444' }}>{error}</div>}

        <button onClick={handleSignup} disabled={loading} style={{ width: '100%', padding: '18px', borderRadius: 18, background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#4D7088,#5A82A0)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 6px 32px rgba(77,112,136,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {loading ? <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} /> Hesap oluşturuluyor...</> : 'Devam Et →'}
        </button>
        {loading && status && (
          <p style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: 'rgba(148,163,184,0.58)', lineHeight: 1.5 }}>
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Welcome Step ──────────────────────────────────────────────────────
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
    <div style={{ height: '100dvh', background: '#04040A', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)', width: '170%', height: 420, background: 'radial-gradient(ellipse at 50% 0%, rgba(77,112,136,0.22) 0%, rgba(52,211,153,0.10) 35%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Success ring */}
      <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'linear-gradient(180deg, rgba(52,211,153,0.14), rgba(52,211,153,0.08))', border: '1px solid rgba(52,211,153,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, fontSize: 36, color: '#34D399', boxShadow: '0 0 48px rgba(52,211,153,0.24)' }}>
        ✓
      </div>

      <h1 style={{ fontSize: 30, fontWeight: 800, color: '#F4F4F8', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10 }}>
        {brandName} hazır!
      </h1>
      <p style={{ fontSize: 15, color: 'rgba(148,163,184,0.62)', lineHeight: 1.65, marginBottom: 24, maxWidth: 310 }}>
        AI ekibiniz aktive edildi. Marka analiziniz tamamlandı ve ajanlar çalışmaya hazır.
      </p>

      {/* Brand summary + features */}
      <div style={{ width: '100%', maxWidth: 360, marginBottom: 18, padding: '16px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.045)', border: '0.5px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, textAlign: 'left' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, rgba(77,112,136,0.25), rgba(90,130,160,0.22))', border: '0.5px solid rgba(157,190,206,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4B5FD', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
            {brandInitials || 'AI'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#F4F4F8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {brandName}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(148,163,184,0.58)', marginTop: 2 }}>
              {domain || 'Marka alanı'}{igHandle ? ` · @${igHandle}` : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {['✦ Marka profili', '🎨 Görsel kimlik', '📊 İçerik planı', '🤖 AI ekibi aktif'].map((f) => (
            <div key={f} style={{ padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '0.5px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(226,232,240,0.72)' }}>
              {f}
            </div>
          ))}
        </div>
      </div>

      <button onClick={onDone} style={{ width: '100%', maxWidth: 360, padding: '18px 22px', borderRadius: 18, background: 'linear-gradient(135deg,#4D7088,#5A82A0)', border: 'none', color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', cursor: 'pointer', boxShadow: '0 8px 36px rgba(77,112,136,0.48)' }}>
        Komuta Merkezine Git ✦
      </button>
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
function FormField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
        style={{ width: '100%', padding: '14px 15px', borderRadius: 14, outline: 'none', boxSizing: 'border-box', fontSize: 15, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', color: '#F4F4F8' }}
      />
    </div>
  );
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
  const [result, setResult]         = useState<BrandDiscoveryResult | null>(null);
  const [signupBrandName, setSignupBrandName] = useState('');

  const discoveredBrandName = result?.profile?.brandName ?? result?.report?.brandName ?? (websiteUrl ? extractDomain(websiteUrl) : igHandle ? `@${igHandle}` : 'Markanız');
  const brandName = signupBrandName || discoveredBrandName;

  // Slide transition
  const slideStyle: React.CSSProperties = { animation: 'slideUp 300ms cubic-bezier(0.34,1.1,0.64,1) both', height: '100dvh', overflow: 'hidden' };

  return (
    <div key={step} style={slideStyle}>
      {step === 'url' && (
        <UrlStep
          onNext={(url, ig) => { setWebsiteUrl(url); setIgHandle(ig); setStep('analyzing'); }}
          onLogin={onLogin}
        />
      )}
      {step === 'analyzing' && (
        <AnalyzingStep
          url={websiteUrl}
          ig={igHandle}
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
          discoveryResult={result}
          onDone={(companyName) => {
            setSignupBrandName(companyName);
            setStep('welcome');
          }}
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

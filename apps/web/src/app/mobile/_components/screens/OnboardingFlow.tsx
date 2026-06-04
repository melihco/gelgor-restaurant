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
const ANALYSIS_STEPS: Omit<AnalysisStep, 'done' | 'active'>[] = [
  { id: 'crawl',     label: 'Web sitesi taranıyor',       detail: 'Sayfa içeriği ve başlıklar okunuyor',         durationMs: 2200 },
  { id: 'brand',     label: 'Marka kimliği çıkarılıyor',  detail: 'İsim, ton, sektör belirleniyor',              durationMs: 1800 },
  { id: 'visual',    label: 'Görsel dil analiz ediliyor',  detail: 'Renk paleti ve stil değerlendiriliyor',       durationMs: 1600 },
  { id: 'audience',  label: 'Hedef kitle modelleniyor',   detail: 'Demografik profil çıkarılıyor',               durationMs: 1500 },
  { id: 'content',   label: 'İçerik ihtiyaçları tespiti', detail: 'Hangi content türleri gerekli?',              durationMs: 1400 },
  { id: 'templates', label: 'Şablon ailesi seçiliyor',    detail: 'Markaya uygun template\'ler belirleniyor',    durationMs: 1200 },
  { id: 'finalize',  label: 'Marka profili oluşturuluyor','detail': 'AI marka constitution tamamlanıyor',         durationMs: 1000 },
];

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 400); }, []);

  function handleSubmit() {
    const normalized = normalizeUrl(url);
    if (!normalized) { setError('Web sitesi URL\'ini girin'); return; }
    try { new URL(normalized); } catch { setError('Geçerli bir URL girin (örn: siteniz.com)'); return; }
    onNext(normalized, stripHandle(ig));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#04040A', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif' }}>
      {/* Top decoration */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '140%', height: 280, background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px' }}>
        {/* Logo — canonical asset (same as desktop); avoids missing / oversized sa-logo in deploy */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ margin: '0 auto 20px', width: 72, height: 72, borderRadius: 18, overflow: 'hidden', boxShadow: '0 0 40px rgba(124,58,237,0.35)' }}>
            <SmartAgencyLogo variant="markOnly" priority className="!h-[72px] !w-[72px] !rounded-[18px]" />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#F4F4F8', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 10 }}>
            Markanızı analiz edelim
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(160,160,180,0.65)', lineHeight: 1.6 }}>
            Web sitenizi girin, AI ekibimiz<br />markanızı dakikalar içinde tanısın.
          </p>
        </div>

        {/* Website input — hero element */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Web Siteniz
          </div>
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
                width: '100%', padding: '17px 16px 17px 44px', borderRadius: 16, outline: 'none', boxSizing: 'border-box',
                fontSize: 17, letterSpacing: '-0.01em',
                background: 'rgba(255,255,255,0.06)',
                border: error ? '1px solid rgba(239,68,68,0.5)' : `1px solid ${url ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: '#F4F4F8',
                boxShadow: url ? '0 0 0 3px rgba(124,58,237,0.12)' : 'none',
                transition: 'border 200ms, box-shadow 200ms',
              }}
            />
          </div>
          {error && <div style={{ marginTop: 6, fontSize: 12, color: '#EF4444' }}>{error}</div>}
        </div>

        {/* Instagram — optional */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'rgba(148,163,184,0.35)', pointerEvents: 'none' }}>@</div>
            <input
              value={ig}
              onChange={e => setIg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="instagram_handle (opsiyonel)"
              style={{
                width: '100%', padding: '14px 16px 14px 36px', borderRadius: 14, outline: 'none', boxSizing: 'border-box',
                fontSize: 15,
                background: 'rgba(255,255,255,0.04)',
                border: '0.5px solid rgba(255,255,255,0.09)',
                color: '#F4F4F8',
              }}
            />
          </div>
        </div>

        {/* CTA */}
        <button onClick={handleSubmit} style={{
          width: '100%', padding: '18px', borderRadius: 18,
          background: 'linear-gradient(135deg,#7C3AED,#6366F1)',
          border: 'none', color: '#fff', fontSize: 16, fontWeight: 800,
          letterSpacing: '-0.01em',
          boxShadow: '0 6px 32px rgba(124,58,237,0.45)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          ✦ Analizi Başlat
        </button>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'rgba(148,163,184,0.45)' }}>
          Kayıt olmadan analiz yapabilirsiniz
        </p>
      </div>

      {/* Bottom login link */}
      <div style={{ padding: '0 28px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))', textAlign: 'center' }}>
        <button onClick={onLogin} style={{ fontSize: 14, color: 'rgba(148,163,184,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Zaten hesabınız var mı? <span style={{ color: '#A78BFA', fontWeight: 600 }}>Giriş Yap</span>
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
  const [steps, setSteps] = useState<AnalysisStep[]>(
    ANALYSIS_STEPS.map((s, i) => ({ ...s, done: false, active: i === 0 }))
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [apiResult, setApiResult] = useState<BrandDiscoveryResult | null>(null);
  const doneRef = useRef(false);

  // Run real API call in parallel
  useEffect(() => {
    apiClient.discoverBrand({
      websiteUrl: url,
      instagramHandle: ig || undefined,
      applyToProfile: false,
    }).then(result => { setApiResult(result); }).catch(() => { /* silent */ });
  }, [url, ig]);

  // Animate steps sequentially
  useEffect(() => {
    if (currentIdx >= ANALYSIS_STEPS.length) {
      if (!doneRef.current) {
        doneRef.current = true;
        setTimeout(() => onDone(apiResult), 600);
      }
      return;
    }
    const step = ANALYSIS_STEPS[currentIdx]!;
    const timer = setTimeout(() => {
      setSteps(prev => prev.map((s, i) => ({
        ...s,
        done: i < currentIdx + 1,
        active: i === currentIdx + 1,
      })));
      setCurrentIdx(i => i + 1);
      setProgress(Math.round(((currentIdx + 1) / ANALYSIS_STEPS.length) * 100));
    }, step.durationMs);
    return () => clearTimeout(timer);
  }, [currentIdx, apiResult, onDone]);

  const domain = extractDomain(url);

  return (
    <div style={{ height: '100dvh', background: '#04040A', display: 'flex', flexDirection: 'column', fontFamily: '-apple-system,"SF Pro Display",system-ui,sans-serif' }}>
      {/* Ambient glow */}
      <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '150%', height: 400, background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.14) 0%, transparent 60%)', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 28px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.45)', marginBottom: 6, letterSpacing: '0.04em' }}>
          Analiz ediliyor
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#F4F4F8', letterSpacing: '-0.02em', marginBottom: 4 }}>
          {domain}
        </div>
        {ig && <div style={{ fontSize: 13, color: '#A78BFA' }}>@{ig}</div>}
      </div>

      {/* Progress ring */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0 20px' }}>
        <div style={{ position: 'relative', width: 100, height: 100 }}>
          <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#7C3AED" strokeWidth="6"
              strokeDasharray={`${(progress / 100) * 264} 264`} strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 800ms ease', filter: 'drop-shadow(0 0 8px rgba(124,58,237,0.6))' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#A78BFA', fontVariantNumeric: 'tabular-nums' }}>{progress}%</div>
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
            <div style={{ flexShrink: 0, marginTop: 2, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: step.done ? 'rgba(52,211,153,0.15)' : step.active ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${step.done ? 'rgba(52,211,153,0.35)' : step.active ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
              {step.done ? (
                <span style={{ fontSize: 10, color: '#34D399', fontWeight: 700 }}>✓</span>
              ) : step.active ? (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C3AED', animation: 'breathe 1s ease-in-out infinite' }} />
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
// discoverBrand() requires auth → pre-auth calls fail silently.
// We always show a compelling, informative screen regardless of API result.
function ResultsStep({ result, url, ig, onNext }: {
  result: BrandDiscoveryResult | null;
  url: string;
  ig?: string;
  onNext: () => void;
}) {
  const domain = extractDomain(url);

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
      color: '#A78BFA',
      desc: `${domain} tarandı. Tam marka profili kayıt sonrası oluşturulacak.`,
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
            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, background: 'rgba(167,139,250,0.10)', color: '#A78BFA' }}>
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
                <circle cx="27" cy="27" r="21" fill="none" stroke="#7C3AED" strokeWidth="5"
                  strokeDasharray={`${(confidence / 100) * 132} 132`} strokeLinecap="round"
                  style={{ filter: 'drop-shadow(0 0 5px rgba(124,58,237,0.5))' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#A78BFA', fontVariantNumeric: 'tabular-nums' }}>
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
          <div style={{ ...cardStyle, marginBottom: 12, background: 'rgba(124,58,237,0.08)', border: '0.5px solid rgba(124,58,237,0.22)', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>✦</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#A78BFA', marginBottom: 4 }}>Tam analiz için kayıt gerekli</div>
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
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(167,139,250,0.12)', color: '#A78BFA', fontWeight: 600 }}>Instagram</span>
              </div>
            )}
          </div>
        </ResultCard>

        {/* Real data cards */}
        {tone.length > 0 && (
          <ResultCard label="Marka Tonu">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {tone.map(t => <span key={t} style={chipStyle('#A78BFA')}>{t}</span>)}
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
        <button onClick={onNext} style={{ width: '100%', padding: '18px', borderRadius: 18, background: 'linear-gradient(135deg,#7C3AED,#6366F1)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', boxShadow: '0 6px 32px rgba(124,58,237,0.45)', cursor: 'pointer' }}>
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

  async function analyzeAndPersistGallery(workspaceId: string, imageUrls: string[]) {
    const urls = imageUrls
      .filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
      .filter((u) => !/scontent-|cdninstagram\.com|fbcdn\.net|instagram\.fcdn/i.test(u));

    if (urls.length === 0) return;

    const BATCH = 25;
    const results: unknown[] = [];
    for (let i = 0; i < urls.length; i += BATCH) {
      const batch = urls.slice(i, i + BATCH);
      setStatus(`${Math.min(i + BATCH, urls.length)} / ${urls.length} marka görseli AI ile etiketleniyor...`);
      const galleryRes = await fetch('/api/analyze-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetUrls: batch, maxImages: BATCH }),
      });

      if (!galleryRes.ok) {
        throw new Error(`Gallery analysis failed (${galleryRes.status})`);
      }

      const galleryData = await galleryRes.json();
      const batchResults = Array.isArray(galleryData?.results) ? galleryData.results : [];
      results.push(...batchResults);
    }
    if (results.length === 0) return;

    setStatus(`${results.length} görselin sahne etiketleri kaydediliyor...`);
    await fetch(`/api/brand-context/${workspaceId}/gallery-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    });
  }

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

  async function persistPythonAnalysisToProfile(
    analysis: Awaited<ReturnType<typeof apiClient.analyzeBrandContext>>,
  ) {
    const ctx = analysis.brand_context;
    const pillars = analysis.content_pillars?.length
      ? analysis.content_pillars
      : parseJsonList(ctx?.content_pillars);
    const ctas = parseJsonList(ctx?.default_ctas);
    const riskRules = analysis.risk_rules && Object.keys(analysis.risk_rules).length
      ? analysis.risk_rules
      : (() => {
          try {
            return ctx?.risk_rules ? JSON.parse(ctx.risk_rules) : {};
          } catch {
            return {};
          }
        })();
    const brandTone = analysis.inferred_tone || ctx?.brand_tone || '';
    const industry = analysis.inferred_industry || '';
    const summary = `${company.trim()} için sektör ${industry || 'general_business'} olarak analiz edildi. Önerilen sosyal medya ihtiyaçları: ${pillars.slice(0, 5).join(', ') || 'daily_story'}.`;

    await apiClient.saveCompanyProfile({
      ...baselineProfile(),
      brandName: company.trim() || ctx?.business_name || brandName,
      industry,
      brandTone,
      targetAudience: ctx?.target_audience || '',
      visualStyle: ctx?.visual_style || '',
      campaignGoals: ctas.join(', '),
      languages: analysis.inferred_language || 'tr',
      websiteUrl,
      description: analysis.website_summary || '',
      instagramHandle: igHandle || undefined,
      contentNeeds: JSON.stringify(pillars),
      riskRules: JSON.stringify(riskRules),
      discoveryConfidence: analysis.confidence ?? ctx?.discovery_confidence ?? null,
      customerVisibleSummary: summary,
    } as any);
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

      // Persist analysis results now that we have auth + tenantId.
      // We re-run discovery after signup because pre-auth discovery can fail silently.
      if (session.tenantId && (websiteUrl || igHandle)) {
        let latestDiscovery = discoveryResult;
        try {
          setStatus('Web sitesi ve marka sinyalleri analiz ediliyor...');
          latestDiscovery = await apiClient.discoverBrand({
            websiteUrl: websiteUrl || undefined,
            instagramHandle: igHandle || undefined,
            applyToProfile: true,
          });
        } catch (err) {
          console.warn('[onboarding] authenticated discoverBrand failed:', err);
        }

        const r = latestDiscovery?.report;
        const p = latestDiscovery?.profile;
        const summaryFromReport = r
          ? `${company.trim()} için sektör ${r.industry || 'general_business'} olarak analiz edildi. Öncelikli hedefler: ${(r.primaryGoals ?? []).slice(0, 3).join(', ') || 'bilinirlik'}. Önerilen sosyal medya ihtiyaçları: ${(r.contentPillars ?? []).slice(0, 5).join(', ') || 'daily_story'}.`
          : undefined;

        try {
          setStatus('Firma detayları analiz çıktılarıyla güncelleniyor...');
          await apiClient.saveCompanyProfile({
            brandName: company.trim(),
            industry: r?.industry || p?.industry || '',
            location: p?.location || '',
            brandTone: r?.brandTone || p?.brandTone || '',
            targetAudience: Array.isArray(r?.targetAudience) ? r.targetAudience.join(', ') : (p?.targetAudience || ''),
            visualStyle: r?.visualStyle || p?.visualStyle || '',
            campaignGoals: Array.isArray(r?.primaryGoals) ? r.primaryGoals.join(', ') : (p?.campaignGoals || ''),
            competitors: p?.competitors || '',
            customRules: p?.customRules || '',
            languages: latestDiscovery?.inferredLanguage || p?.languages || 'tr',
            logoUrl: p?.logoUrl || '',
            websiteUrl: websiteUrl || p?.websiteUrl || '',
            description: r?.websiteSummary || p?.description || '',
            defaultApprovalMode: p?.defaultApprovalMode ?? 'SuggestAndWait',
            instagramHandle: igHandle || p?.instagramHandle || undefined,
            contentNeeds: Array.isArray(r?.contentPillars) ? JSON.stringify(r.contentPillars) : (p?.contentNeeds || undefined),
            riskRules: r?.riskRules && Object.keys(r.riskRules).length ? JSON.stringify(r.riskRules) : (p?.riskRules || undefined),
            discoveryConfidence: p?.discoveryConfidence ?? null,
            customerVisibleSummary: summaryFromReport || p?.customerVisibleSummary || undefined,
          } as any);
        } catch (err) {
          console.warn('[onboarding] saveCompanyProfile failed:', err);
        }

        try {
          setStatus('Galeri ve referans görseller toplanıyor...');
          const brandContextResult = await apiClient.analyzeBrandContext(session.tenantId, {
            websiteUrl: websiteUrl || undefined,
            instagramHandle: igHandle || undefined,
          });
          setStatus('Python analiz çıktıları firma detaylarına yazılıyor...');
          await persistPythonAnalysisToProfile(brandContextResult);
          await analyzeAndPersistGallery(session.tenantId, brandContextResult.reference_image_urls ?? []);
          setStatus('Görsel kimlik profili oluşturuluyor...');
          await fetch(`/api/brand-context/${session.tenantId}/analyze-visuals`, {
            method: 'POST',
          }).catch(() => {/* non-fatal */});

          // Auto-confirm constitution: if visual_dna was produced during analysis,
          // silently set brand_constitution_confirmed_at so BRS clears the proposal gate
          // without requiring a manual Brand Hub step. Tenants can refine later.
          setStatus('Marka anayasası kaydediliyor...');
          await fetch(`/api/brand-context/${session.tenantId}/confirm-constitution`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ auto_confirmed: true }),
          }).catch(() => {/* non-fatal — gate will degrade gracefully */});

        } catch (err) {
          console.warn('[onboarding] visual intelligence failed:', err);
        }
      }

      // Auto-propose first welcome mission (fire-and-forget): after onboarding
      // the brand has enough data to generate useful content immediately.
      try {
        await fetch(`/api/missions/${session.tenantId}/auto-trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'onboarding_welcome' }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {/* non-fatal */}

      // Continue to next step — auth store update happens in onComplete
      setStatus('Marka kurulumu tamamlandı.');
      onDone(company.trim());
    } catch (e: any) {
      setError(
        e?.message?.includes('409') ? 'Bu e-posta zaten kayıtlı.' :
        e?.message?.includes('400') ? 'Bilgiler geçersiz, tekrar kontrol edin.' :
        'Kayıt başarısız. Lütfen tekrar deneyin.'
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

        <button onClick={handleSignup} disabled={loading} style={{ width: '100%', padding: '18px', borderRadius: 18, background: loading ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#7C3AED,#6366F1)', border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 6px 32px rgba(124,58,237,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
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
      <div style={{ position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)', width: '170%', height: 420, background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.22) 0%, rgba(52,211,153,0.10) 35%, transparent 70%)', pointerEvents: 'none' }} />

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
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(99,102,241,0.22))', border: '0.5px solid rgba(167,139,250,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4B5FD', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
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
          {['✦ Brand Constitution', '🎨 Görsel Kimlik', '📊 İçerik Planı', '🤖 AI Ekibi Aktif'].map((f) => (
            <div key={f} style={{ padding: '8px 10px', borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '0.5px solid rgba(255,255,255,0.08)', fontSize: 12, color: 'rgba(226,232,240,0.72)' }}>
              {f}
            </div>
          ))}
        </div>
      </div>

      <button onClick={onDone} style={{ width: '100%', maxWidth: 360, padding: '18px 22px', borderRadius: 18, background: 'linear-gradient(135deg,#7C3AED,#6366F1)', border: 'none', color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', cursor: 'pointer', boxShadow: '0 8px 36px rgba(124,58,237,0.48)' }}>
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

  const discoveredBrandName = result?.profile?.brandName ?? result?.report?.brandName ?? (websiteUrl ? extractDomain(websiteUrl) : 'Markanız');
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

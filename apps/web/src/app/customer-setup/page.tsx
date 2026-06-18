'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import {
  ArrowRight,
  Building2,
  Check,
  Globe,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type SectorId = 'hospitality' | 'retail' | 'saas' | 'professional' | 'generic';

const SECTOR_LABELS: Record<SectorId, string> = {
  hospitality: 'Restoran / otel / etkinlik',
  retail: 'Perakende / e-ticaret',
  saas: 'SaaS / teknoloji',
  professional: 'Hizmet / danışmanlık',
  generic: 'Diğer',
};

const SECTOR_QUESTIONS: Record<
  SectorId,
  { id: string; label: string; type: 'text' | 'number' | 'select'; options?: string[]; placeholder?: string }[]
> = {
  hospitality: [
    { id: 'covers', label: 'Günlük ortalama örtü / kapasite', type: 'number', placeholder: 'Örn. 120' },
    { id: 'channels', label: 'Ana rezervasyon kanalı', type: 'select', options: ['Telefon', 'Web', 'Üçüncü parti (Rez)', 'Karma'] },
  ],
  retail: [
    { id: 'skus', label: 'Aktif SKU sayısı (yaklaşık)', type: 'number', placeholder: 'Örn. 450' },
    { id: 'omni', label: 'Satış modeli', type: 'select', options: ['Sadece mağaza', 'Sadece online', 'Omni-channel'] },
  ],
  saas: [
    { id: 'icp', label: 'Hedef müşteri profili (ICP) özeti', type: 'text', placeholder: 'Örn. 50–500 çalışanlı KOBİ' },
    { id: 'plg', label: 'Ürün büyüme modeli', type: 'select', options: ['PLG', 'Satış odaklı', 'Hibrit'] },
  ],
  professional: [
    { id: 'leads', label: 'Aylık nitelikli lead hedefi', type: 'number', placeholder: 'Örn. 30' },
    { id: 'geo', label: 'Hizmet bölgesi', type: 'text', placeholder: 'Örn. Marmara + uzaktan' },
  ],
  generic: [
    { id: 'employees', label: 'Takım büyüklüğü (yaklaşık)', type: 'number', placeholder: 'Örn. 15' },
    { id: 'channel', label: 'Birincil pazarlama kanalı', type: 'select', options: ['Sosyal', 'Arama / SEO', 'Öneri', 'Offline'] },
  ],
};

const STATIC_REPORT_INSIGHTS = [
  {
    title: 'İçerik sinyali',
    body: 'Blog ve etkinlik sayfaları güçlü; ürün/hizmet sayfalarında tutarlı CTA ve tek mesaj eksik görünüyor.',
  },
  {
    title: 'Dönüşüm yolları',
    body: 'İletişim formu veya rezervasyon net; sosyal kanallarla hizalı kampanya landing’leri önerilir.',
  },
  {
    title: 'AI otomasyon fırsatı',
    body: 'Tekrarlayan duyurular, sezon mesajları ve çok dilli kısa metinler için agent tabanlı üretim yüksek uyumlu.',
  },
];

function looksLikeUrl(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  try {
    const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    new URL(withProto);
    return true;
  } catch {
    return false;
  }
}

export default function CustomerSetupPage() {
  const [url, setUrl] = useState('');
  const [analyzeState, setAnalyzeState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [reportVisible, setReportVisible] = useState(false);

  const [setupStep, setSetupStep] = useState(0);
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState<SectorId>('hospitality');
  const [sectorAnswers, setSectorAnswers] = useState<Record<string, string>>({});
  const [goals, setGoals] = useState<string[]>([]);

  const sectorQs = SECTOR_QUESTIONS[sector];
  const goalOptions = [
    'Daha fazla rezervasyon / lead',
    'Sosyal içerik düzeni',
    'Reklam bütçesi verimliliği',
    'Marka tutarlılığı (çok şube)',
    'Müşteri yorumları ve itibar',
  ];

  const urlValid = useMemo(() => looksLikeUrl(url), [url]);

  const runAnalyze = useCallback(() => {
    if (!urlValid) return;
    setAnalyzeState('loading');
    setReportVisible(false);
    window.setTimeout(() => {
      setAnalyzeState('done');
      setReportVisible(true);
      const el = document.getElementById('analysis-report');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 2200);
  }, [urlValid]);

  const canNextFromBasics = companyName.trim().length > 1;
  const canNextFromSector = sectorQs.every((q) => (sectorAnswers[q.id] ?? '').trim().length > 0);
  const canFinish = goals.length > 0;

  return (
    <div className="min-h-screen bg-[#030712] text-gray-100 antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.22),transparent_55%)]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_0%,rgba(34,211,238,0.08),transparent_50%)]" />

      <header className="relative z-10 border-b border-white/[0.06] bg-[#030712]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <SmartAgencyLogo variant="full" priority framed className="h-10 max-w-[220px]" />
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">
              Kurulum akışı — demo
            </p>
          </div>
          <Link
            href="/"
            className="text-xs font-semibold text-gray-400 transition hover:text-white"
          >
            Ana uygulamaya dön →
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-14 sm:px-6">
        {/* 1. Hero */}
        <section className="text-center">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200/90">
            <Globe className="h-3.5 w-3.5" />
            İkinci tenant / yeni müşteri senaryosu
          </p>
          <h1 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl sm:leading-tight">
            Sitenizi analiz edin, sektöre göre kurulumu tek akışta tamamlayın.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-base">
            Bu sayfa ana platform düzeninden bağımsızdır: statik metinler, örnek fiyatlar ve demoya hazır
            çok adımlı şirket kurulumu. Gerçek tenant oluşturma için ek API bağlanabilir.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#url-analyze"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
            >
              Analize başla
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#pricing"
              className="inline-flex items-center rounded-xl border border-white/[0.12] bg-white/[0.04] px-6 py-3 text-sm font-semibold text-gray-200 transition hover:bg-white/[0.08]"
            >
              Fiyatları gör
            </a>
          </div>
        </section>

        {/* 2. URL + analyze */}
        <section id="url-analyze" className="mt-20 scroll-mt-24">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl sm:p-8">
            <h2 className="text-lg font-semibold text-white">Web adresi & AI ön analiz</h2>
            <p className="mt-2 text-sm text-gray-400">
              URL’nizi girin; demo akışında sabit bir örnek rapor üretilir (gerçek tarama entegrasyonu sonra eklenebilir).
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://sirketiniz.com"
                className="h-12 flex-1 rounded-xl border border-white/[0.1] bg-[#0a0f1a] px-4 text-sm text-white placeholder:text-gray-600 outline-none ring-0 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="button"
                disabled={!urlValid || analyzeState === 'loading'}
                onClick={runAnalyze}
                className={cn(
                  'inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold transition',
                  urlValid && analyzeState !== 'loading'
                    ? 'bg-cyan-500 text-gray-950 hover:bg-cyan-400'
                    : 'cursor-not-allowed bg-gray-700 text-gray-500',
                )}
              >
                {analyzeState === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analiz ediliyor…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI ile analiz et
                  </>
                )}
              </button>
            </div>
            {!urlValid && url.length > 0 && (
              <p className="mt-2 text-xs text-amber-400/90">Geçerli bir adres girin (ör. sirket.com veya https://…)</p>
            )}
          </div>
        </section>

        {/* 3. Report */}
        <section
          id="analysis-report"
          className={cn('mt-12 scroll-mt-24 transition-all duration-500', reportVisible ? 'opacity-100' : 'opacity-40')}
        >
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">Analiz özeti</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Örnek AI raporu</h2>
                <p className="mt-1 font-mono text-xs text-emerald-200/70">
                  Kaynak: {urlValid ? (url.startsWith('http') ? url : `https://${url}`) : '—'}
                </p>
              </div>
              <span className="rounded-lg bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                Demo verisi
              </span>
            </div>
            <ul className="mt-8 grid gap-4 sm:grid-cols-3">
              {STATIC_REPORT_INSIGHTS.map((item) => (
                <li
                  key={item.title}
                  className="rounded-xl border border-white/[0.06] bg-[#0a0f1a]/80 p-4"
                >
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-xs leading-relaxed text-gray-400">{item.body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-gray-500">
              Canlı üründe bu blok; gerçek sayfa yapısı, sektör sınıflandırması ve risk skorları API ile doldurulur.
            </p>
          </div>
        </section>

        {/* 4. Wizard */}
        <section id="company-setup" className="mt-20 scroll-mt-24">
          <div className="mb-6 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-400" />
            <h2 className="text-xl font-semibold text-white">Şirket kurulumu (adım adım)</h2>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8">
            <div className="mb-8 flex flex-wrap gap-2">
              {['Temel bilgiler', 'Sektör detayı', 'Hedefler', 'Özet'].map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSetupStep(i)}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-xs font-semibold transition',
                    setupStep === i
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white/[0.06] text-gray-400 hover:bg-white/[0.1]',
                  )}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>

            {setupStep === 0 && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-semibold text-gray-400">Şirket / marka adı</label>
                  <input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="mt-1.5 h-11 w-full max-w-md rounded-xl border border-white/[0.1] bg-[#0a0f1a] px-4 text-sm text-white outline-none focus:border-indigo-500/50"
                    placeholder="Örn. Sunu Event"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-400">Sektör</label>
                  <select
                    value={sector}
                    onChange={(e) => {
                      setSector(e.target.value as SectorId);
                      setSectorAnswers({});
                    }}
                    className="mt-1.5 h-11 w-full max-w-md rounded-xl border border-white/[0.1] bg-[#0a0f1a] px-4 text-sm text-white outline-none focus:border-indigo-500/50"
                  >
                    {(Object.keys(SECTOR_LABELS) as SectorId[]).map((id) => (
                      <option key={id} value={id} className="bg-[#0a0f1a]">
                        {SECTOR_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={!canNextFromBasics}
                  onClick={() => setSetupStep(1)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold',
                    canNextFromBasics ? 'bg-indigo-500 text-white hover:bg-indigo-400' : 'cursor-not-allowed bg-gray-700 text-gray-500',
                  )}
                >
                  Devam
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {setupStep === 1 && (
              <div className="space-y-5">
                <p className="text-sm text-gray-400">
                  <span className="font-semibold text-white">{SECTOR_LABELS[sector]}</span> için birkaç ek soru.
                </p>
                {sectorQs.map((q) => (
                  <div key={q.id}>
                    <label className="text-xs font-semibold text-gray-400">{q.label}</label>
                    {q.type === 'select' && q.options ? (
                      <select
                        value={sectorAnswers[q.id] ?? ''}
                        onChange={(e) => setSectorAnswers((s) => ({ ...s, [q.id]: e.target.value }))}
                        className="mt-1.5 h-11 w-full max-w-md rounded-xl border border-white/[0.1] bg-[#0a0f1a] px-4 text-sm text-white"
                      >
                        <option value="" className="bg-[#0a0f1a]">
                          Seçin…
                        </option>
                        {q.options.map((opt) => (
                          <option key={opt} value={opt} className="bg-[#0a0f1a]">
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={q.type === 'number' ? 'number' : 'text'}
                        value={sectorAnswers[q.id] ?? ''}
                        onChange={(e) => setSectorAnswers((s) => ({ ...s, [q.id]: e.target.value }))}
                        placeholder={q.placeholder}
                        className="mt-1.5 h-11 w-full max-w-md rounded-xl border border-white/[0.1] bg-[#0a0f1a] px-4 text-sm text-white"
                      />
                    )}
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep(0)}
                    className="rounded-xl border border-white/[0.12] px-5 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.05]"
                  >
                    Geri
                  </button>
                  <button
                    type="button"
                    disabled={!canNextFromSector}
                    onClick={() => setSetupStep(2)}
                    className={cn(
                      'rounded-xl px-5 py-2.5 text-sm font-semibold',
                      canNextFromSector ? 'bg-indigo-500 text-white' : 'cursor-not-allowed bg-gray-700 text-gray-500',
                    )}
                  >
                    Devam
                  </button>
                </div>
              </div>
            )}

            {setupStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">Öncelik verdiğiniz hedefleri seçin (birden fazla).</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {goalOptions.map((g) => {
                    const on = goals.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setGoals((prev) => (on ? prev.filter((x) => x !== g) : [...prev, g]))
                        }
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition',
                          on
                            ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                            : 'border-white/[0.08] bg-[#0a0f1a]/50 text-gray-300 hover:border-white/[0.14]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px]',
                            on ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-gray-600 bg-transparent',
                          )}
                        >
                          {on ? <Check className="h-3 w-3" /> : null}
                        </span>
                        {g}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSetupStep(1)}
                    className="rounded-xl border border-white/[0.12] px-5 py-2.5 text-sm font-semibold text-gray-300"
                  >
                    Geri
                  </button>
                  <button
                    type="button"
                    disabled={!canFinish}
                    onClick={() => setSetupStep(3)}
                    className={cn(
                      'rounded-xl px-5 py-2.5 text-sm font-semibold',
                      canFinish ? 'bg-indigo-500 text-white' : 'cursor-not-allowed bg-gray-700 text-gray-500',
                    )}
                  >
                    Özete geç
                  </button>
                </div>
              </div>
            )}

            {setupStep === 3 && (
              <div className="space-y-6">
                <div className="rounded-xl border border-white/[0.08] bg-[#0a0f1a]/60 p-5 text-sm">
                  <p>
                    <span className="text-gray-500">Şirket:</span>{' '}
                    <span className="font-semibold text-white">{companyName || '—'}</span>
                  </p>
                  <p className="mt-2">
                    <span className="text-gray-500">Sektör:</span>{' '}
                    <span className="text-white">{SECTOR_LABELS[sector]}</span>
                  </p>
                  <p className="mt-2 text-gray-500">Sektör yanıtları</p>
                  <ul className="mt-1 list-inside list-disc text-gray-300">
                    {sectorQs.map((q) => (
                      <li key={q.id}>
                        {q.label}: <span className="text-white">{sectorAnswers[q.id] || '—'}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-gray-500">Hedefler</p>
                  <p className="text-gray-200">{goals.join(' · ') || '—'}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setSetupStep(0)}
                    className="rounded-xl border border-white/[0.12] px-5 py-2.5 text-sm font-semibold text-gray-300"
                  >
                    Baştan düzenle
                  </button>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20"
                  >
                    Ana uygulamaya geç
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <p className="text-xs text-gray-500">
                  Üretimde bu adım tenant + office kaydı ve kurulum API’sine bağlanır.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 5. Pricing */}
        <section id="pricing" className="mt-24 scroll-mt-24">
          <h2 className="text-center text-xl font-semibold text-white">Örnek fiyatlandırma (statik)</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-gray-400">
            Rakamlar demodur; satış ekibi ile net paketleme yapılır. KDV ve sözleşme koşulları ayrıdır.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              {
                name: 'Pilot',
                price: '₺14.900',
                period: '/ ay',
                blurb: 'Tek şube, temel ajanlar, onaylı otomasyon.',
                items: ['2 aktif agent', 'Aylık 200 AI çıktısı', 'Email destek'],
                cta: 'Pilot planı seç',
                highlight: false,
              },
              {
                name: 'Growth',
                price: '₺39.900',
                period: '/ ay',
                blurb: 'Çok kanallı içerik, reklam içgörüsü, marka hub.',
                items: ['6 agent + öncelik kuyruğu', 'Canva Brand şablonları', 'Slack / webhooks (yakında)'],
                cta: 'En çok tercih edilen',
                highlight: true,
              },
              {
                name: 'Enterprise',
                price: 'Özel',
                period: 'teklif',
                blurb: 'Çok tenant, SSO, özelleştirilmiş risk politikası.',
                items: ['Dedicated success', 'Özel entegrasyonlar', 'SLA ve güvenlik incelemesi'],
                cta: 'Satışla görüş',
                highlight: false,
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={cn(
                  'flex flex-col rounded-2xl border p-6',
                  tier.highlight
                    ? 'border-indigo-500/40 bg-gradient-to-b from-indigo-500/10 to-transparent shadow-lg shadow-indigo-500/10'
                    : 'border-white/[0.08] bg-white/[0.02]',
                )}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{tier.name}</p>
                <p className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-white">{tier.price}</span>
                  <span className="text-sm text-gray-500">{tier.period}</span>
                </p>
                <p className="mt-3 text-sm text-gray-400">{tier.blurb}</p>
                <ul className="mt-6 flex-1 space-y-2 text-sm text-gray-300">
                  {tier.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={cn(
                    'mt-8 w-full rounded-xl py-3 text-sm font-semibold transition',
                    tier.highlight
                      ? 'bg-indigo-500 text-white hover:bg-indigo-400'
                      : 'border border-white/[0.12] bg-transparent text-white hover:bg-white/[0.06]',
                  )}
                >
                  {tier.cta}
                </button>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-20 border-t border-white/[0.06] pt-10 text-center text-xs text-gray-600">
          <p>SmartAgency — müşteri kurulum demo sayfası. Ana uygulama ile görsel ve layout bağımsızdır.</p>
          <p className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            <Link href="/" className="text-gray-500 underline hover:text-gray-300">
              Giriş / dashboard
            </Link>
            <Link href="/setup-lab" className="text-indigo-400/90 underline hover:text-indigo-300">
              Kurulum laboratuvarı (API)
            </Link>
          </p>
        </footer>
      </main>
    </div>
  );
}

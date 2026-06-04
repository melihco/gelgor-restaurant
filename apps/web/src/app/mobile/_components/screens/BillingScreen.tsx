'use client';
/**
 * BillingScreen — Kullandığın Kadar Öde (Token Wallet)
 *
 * Plan/abonelik mantığı kaldırıldı. Ekran artık yalnızca:
 *  1. Token cüzdanı (bakiye, harcama, yükleme)
 *  2. Son 30 günlük gerçek AI kullanım özeti
 *  3. Kredi yükleme (her pakete tıklayınca ne kapsadığını gösteren modal)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { IcoBack } from '../Icons';
import { apiClient } from '@/lib/api-client';
import { TokenWalletCard } from '../TokenWalletCard';
import { PlanUsagePanel } from '../PlanUsagePanel';
import type { T } from '../theme-context';

// ── Kredi Paket Tanımları ──────────────────────────────────────────────

interface CreditPack {
  id: string;
  credits: number;
  price: number;
  label: string;
  note: string;
  popular?: boolean;
  // Her bir AI işlemi için tahmini kullanım
  breakdown: Array<{ action: string; creditsEach: number; qty: number }>;
  highlights: string[];
}

const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'pack_500',
    credits: 500,
    price: 79,
    label: 'Başlangıç',
    note: '~14 misyon',
    breakdown: [
      { action: 'Misyon stratejisi (Claude Sonnet)', creditsEach: 35, qty: 5  },
      { action: 'İçerik ideasyonu (2 iterasyon)',    creditsEach: 35, qty: 5  },
      { action: 'Galeri analizi (foto başına)',       creditsEach: 0.2, qty: 30 },
      { action: 'Auto-produce (7 post/misyon)',       creditsEach: 2,  qty: 5  },
    ],
    highlights: [
      '~14 tam misyon döngüsü',
      '98 sosyal medya içeriği',
      '30 fotoğraf galeri analizi',
      'Sınırsız caption + hashtag üretimi',
    ],
  },
  {
    id: 'pack_2000',
    credits: 2000,
    price: 199,
    label: 'Standart',
    note: '~57 misyon',
    popular: true,
    breakdown: [
      { action: 'Misyon stratejisi (Claude Sonnet)', creditsEach: 35, qty: 22 },
      { action: 'İçerik ideasyonu (2 iterasyon)',    creditsEach: 35, qty: 22 },
      { action: 'Story/Carousel üretimi',            creditsEach: 4,  qty: 44 },
      { action: 'Galeri analizi (foto başına)',       creditsEach: 0.2, qty: 80 },
      { action: 'Auto-produce (7 post/misyon)',       creditsEach: 2,  qty: 22 },
    ],
    highlights: [
      '~57 tam misyon döngüsü',
      '399 sosyal medya içeriği',
      '80 fotoğraf galeri analizi',
      '44 story/carousel tasarımı',
      '~5 aylık tam otonom üretim',
    ],
  },
  {
    id: 'pack_5000',
    credits: 5000,
    price: 449,
    label: 'Pro',
    note: '~142 misyon',
    breakdown: [
      { action: 'Misyon stratejisi (Claude Sonnet)', creditsEach: 35, qty: 52 },
      { action: 'İçerik ideasyonu (2 iterasyon)',    creditsEach: 35, qty: 52 },
      { action: 'Story/Carousel üretimi',            creditsEach: 4,  qty: 104},
      { action: 'Galeri analizi (foto başına)',       creditsEach: 0.2, qty: 200},
      { action: 'Reel (Runway Gen4 video)',           creditsEach: 50, qty: 5  },
      { action: 'Auto-produce (7 post/misyon)',       creditsEach: 2,  qty: 52 },
    ],
    highlights: [
      '~142 tam misyon döngüsü',
      '994 sosyal medya içeriği',
      '200 fotoğraf galeri analizi',
      '5 Runway reel videosu dahil',
      '~12 aylık tam otonom üretim',
    ],
  },
];

// ── Pack Detail Modal ─────────────────────────────────────────────────

function PackDetailModal({
  pack,
  t,
  onClose,
  onBuy,
}: {
  pack: CreditPack;
  t: T;
  onClose: () => void;
  onBuy: () => void;
}) {
  const totalEstimate = pack.breakdown.reduce(
    (s, b) => s + b.creditsEach * b.qty, 0,
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end',
        padding: '0',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '88dvh',
          background: t.isDark ? '#111118' : '#fff',
          borderRadius: '24px 24px 0 0',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Pull handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2,
            background: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '14px 20px 12px', borderBottom: `0.5px solid ${t.separator}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary,
                letterSpacing: '-0.02em' }}>{pack.label}</span>
              {pack.popular && (
                <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px',
                  borderRadius: 20, background: t.accent, color: '#fff',
                  letterSpacing: '0.05em' }}>POPÜLER</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: t.accent,
                letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                ${pack.price}
              </span>
              <span style={{ fontSize: 13, color: t.textMuted }}>
                = {pack.credits.toLocaleString('tr-TR')} kredi
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: t.textSecondary, fontSize: 16, fontWeight: 300,
          }}>✕</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex',
          flexDirection: 'column', gap: 18 }}>

          {/* Neler yapabilirsiniz */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
              letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
              Neler Yapabilirsiniz
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pack.highlights.map((h, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    background: `${t.accent}20`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', marginTop: 1 }}>
                    <span style={{ color: t.accent, fontSize: 9, fontWeight: 800 }}>✓</span>
                  </div>
                  <span style={{ fontSize: 14, color: t.textPrimary, lineHeight: 1.45 }}>{h}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Kredi dağılımı */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
              letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
              Tahmini Kredi Dağılımı
            </div>
            <div style={{ borderRadius: 14, overflow: 'hidden',
              border: `0.5px solid ${t.separator}` }}>
              {pack.breakdown.map((b, i) => {
                const subtotal = b.creditsEach * b.qty;
                const pct = Math.round((subtotal / totalEstimate) * 100);
                return (
                  <div key={i} style={{
                    padding: '12px 14px',
                    background: i % 2 === 0
                      ? (t.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)')
                      : 'transparent',
                    borderBottom: i < pack.breakdown.length - 1 ? `0.5px solid ${t.separator}` : 'none',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: t.textSecondary, flex: 1,
                        paddingRight: 8, lineHeight: 1.3 }}>{b.action}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary,
                        fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        ~{Math.round(subtotal).toLocaleString('tr-TR')} kr
                      </span>
                    </div>
                    {/* mini progress bar */}
                    <div style={{ height: 3, borderRadius: 2,
                      background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}>
                      <div style={{ height: '100%', borderRadius: 2,
                        width: `${pct}%`, background: t.accent, opacity: 0.6 }} />
                    </div>
                    <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>
                      {b.qty}× {b.creditsEach < 1 ? b.creditsEach.toFixed(1) : Math.round(b.creditsEach)} kredi
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
              Gerçek kullanım içerik türü ve galeri boyutuna göre değişebilir.
              Kalan krediler bir sonraki yüklemede birikerek devam eder.
            </div>
          </div>
        </div>

        {/* Buy button */}
        <div style={{
          padding: '12px 20px', paddingBottom: 'max(20px,env(safe-area-inset-bottom,20px))',
          borderTop: `0.5px solid ${t.separator}`,
          background: t.isDark ? '#111118' : '#fff',
        }}>
          <button
            onClick={onBuy}
            style={{
              width: '100%', padding: '16px',
              borderRadius: 16, border: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em',
              background: `linear-gradient(135deg, ${t.accent}, #6366F1)`,
              color: '#fff',
            }}
          >
            {pack.credits.toLocaleString('tr-TR')} Kredi Yükle — ${pack.price}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ana Ekran ─────────────────────────────────────────────────────────

export function BillingScreen() {
  const { t } = useTheme();
  const { goBack } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const [modalPack, setModalPack] = useState<CreditPack | null>(null);

  const { data: quotaData } = useQuery({
    queryKey: ['usage-quota'],
    queryFn: async () => { try { return await apiClient.getUsageQuota(); } catch { return null; } },
    staleTime: 60_000,
  });

  const { data: usageCost, isLoading } = useQuery({
    queryKey: ['usage-cost', tenantId, quotaData?.packageSlug],
    queryFn: () => apiClient.getWorkspaceUsageCost(tenantId!, 30, quotaData?.packageSlug),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const wallet      = usageCost?.token_wallet;
  const remaining   = wallet?.remaining_tokens ?? null;
  const totalSpent  = typeof usageCost?.week_cost_usd === 'number' ? usageCost.week_cost_usd : null;
  const artifactCount = usageCost?.week_artifact_count ?? null;

  const handleBuy = (pack: CreditPack) => {
    setModalPack(null);
    // TODO: Stripe payment intent → pack.id
    alert(`${pack.label} paketi yakında aktif olacak.`);
  };

  return (
    <>
      {modalPack && (
        <PackDetailModal
          pack={modalPack}
          t={t}
          onClose={() => setModalPack(null)}
          onBuy={() => handleBuy(modalPack)}
        />
      )}

      <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100,
        transition: 'background 300ms' }}>

        {/* Header */}
        <div style={{ padding: '56px 24px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={goBack} style={{ ...t.backBtn, width: 34, height: 34,
              borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer' }}>
              <IcoBack color={t.textSecondary} />
            </button>
            <div>
              <p style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em',
                textTransform: 'uppercase', marginBottom: 3 }}>Kullandığın Kadar Öde</p>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPrimary,
                letterSpacing: '-0.02em' }}>Kredi & Kullanım</h1>
            </div>
          </div>
        </div>

        {/* Token Wallet card */}
        <div style={{ padding: '20px 24px 0' }}>
          <SLabel t={t} text="Kredi Cüzdanı" />
          {isLoading ? (
            <div style={{ height: 80, borderRadius: 16,
              background: t.isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%',
                border: `2px solid ${t.separator}`,
                borderTop: `2px solid ${t.accent}`,
                animation: 'spinSlow 1s linear infinite' }} />
            </div>
          ) : wallet ? (
            <TokenWalletCard wallet={wallet} t={t} />
          ) : (
            <div style={{ ...t.surfaceCard, padding: '18px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 6 }}>
                Cüzdan bilgisi yüklenemedi.
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, opacity: 0.7 }}>
                Sunucu bağlantısını kontrol edin.
              </div>
            </div>
          )}
        </div>

        {quotaData && (
          <div style={{ padding: '20px 24px 0' }}>
            <PlanUsagePanel
              quota={quotaData}
              wallet={usageCost?.token_wallet}
              packageSlug={quotaData.packageSlug}
              t={t}
            />
          </div>
        )}

        {/* Last 30-day summary */}
        {(totalSpent !== null || artifactCount !== null) && (
          <div style={{ padding: '20px 24px 0' }}>
            <SLabel t={t} text="Son 30 Gün" />
            <div style={{ display: 'flex', gap: 10 }}>
              {artifactCount !== null && (
                <div style={{ flex: 1, ...t.surfaceCard, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: t.accent,
                    letterSpacing: '-0.04em', lineHeight: 1 }}>{artifactCount}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, fontWeight: 500 }}>
                    Üretilen İçerik
                  </div>
                </div>
              )}
              {totalSpent !== null && (
                <div style={{ flex: 1, ...t.surfaceCard, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: t.textPrimary,
                    letterSpacing: '-0.04em', lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums' }}>
                    ${totalSpent.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, fontWeight: 500 }}>
                    AI Harcaması
                  </div>
                </div>
              )}
              {remaining !== null && (
                <div style={{ flex: 1, ...t.surfaceCard, padding: '16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em',
                    lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    color: remaining > 200 ? t.success : remaining > 50 ? t.warning : '#EF4444' }}>
                    {remaining.toLocaleString('tr-TR')}
                  </div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, fontWeight: 500 }}>
                    Kalan Kredi
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Credit pack cards — her biri modal açıyor */}
        <div style={{ padding: '20px 24px 0' }}>
          <SLabel t={t} text="Kredi Yükle" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CREDIT_PACKS.map(pack => (
              <button
                key={pack.id}
                onClick={() => setModalPack(pack)}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  ...t.surfaceCard,
                  padding: '16px 18px',
                  border: pack.popular ? `0.5px solid ${t.accent}66` : `0.5px solid ${t.separator}`,
                  background: pack.popular
                    ? (t.isDark ? 'rgba(124,58,237,0.08)' : 'rgba(124,58,237,0.04)')
                    : (t.isDark ? 'rgba(255,255,255,0.035)' : '#fff'),
                  position: 'relative' as const,
                  display: 'flex', alignItems: 'center', gap: 14,
                }}
              >
                {/* Left: label + note */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>
                      {pack.label}
                    </span>
                    {pack.popular && (
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px',
                        borderRadius: 20, background: t.accent, color: '#fff',
                        letterSpacing: '0.05em' }}>POPÜLER</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: t.textMuted }}>
                    {pack.credits.toLocaleString('tr-TR')} kredi · {pack.note}
                  </div>
                  {/* highlight chips — top 2 */}
                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                    {pack.highlights.slice(0, 2).map((h, i) => (
                      <span key={i} style={{
                        fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                        background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                        color: t.textSecondary,
                      }}>{h}</span>
                    ))}
                  </div>
                </div>

                {/* Right: price + chevron */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800,
                    color: pack.popular ? t.accent : t.textPrimary,
                    letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
                    ${pack.price}
                  </div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 1 }}>Detay →</div>
                </div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
            fontSize: 11, color: t.textMuted, lineHeight: 1.6 }}>
            Krediler AI görev maliyetlerine karşı düşer. Bakiye sıfırlanınca pipeline durur,
            bildirim gönderilir. Kredilerin son kullanma tarihi yoktur.
          </div>
        </div>
      </div>
    </>
  );
}

function SLabel({ t, text }: { t: T; text: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor,
      letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>
      {text}
    </div>
  );
}

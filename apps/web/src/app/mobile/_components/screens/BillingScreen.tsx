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
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { TokenWalletCard } from '../TokenWalletCard';
import { ClientCreditSummary } from '../ClientCreditSummary';
import { AiCostBreakdownCard } from '../AiCostBreakdownCard';
import { PlanUsagePanel } from '../PlanUsagePanel';
import { isDebugUiMode } from '../mobile-client-config';
import { estimateRemainingPosts } from '@/lib/mobile-customer-copy';
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
    credits: 5000,
    price: 4992,
    label: 'Başlangıç',
    note: '~14 misyon',
    breakdown: [
      { action: 'Misyon stratejisi',                    creditsEach: 60, qty: 14 },
      { action: 'İçerik ideasyonu',                     creditsEach: 90, qty: 14 },
      { action: '16-slot mission üretimi',             creditsEach: 130, qty: 14 },
      { action: 'Meta + Google reklam türevi',         creditsEach: 40, qty: 14 },
      { action: 'Galeri analizi (foto başına)',        creditsEach: 13, qty: 40 },
    ],
    highlights: [
      '14 tam misyon döngüsü / ay',
      '168 organik içerik + 56 reel',
      '14 Meta Ads + 14 Google Ads kreatifi',
      '40 galeri analizi + sınırsız caption',
    ],
  },
  {
    id: 'pack_2000',
    credits: 15000,
    price: 9984,
    label: 'Standart',
    note: '~28 misyon',
    popular: true,
    breakdown: [
      { action: 'Misyon stratejisi',                    creditsEach: 70, qty: 28 },
      { action: 'İçerik ideasyonu',                     creditsEach: 100, qty: 28 },
      { action: '16-slot mission üretimi',             creditsEach: 220, qty: 28 },
      { action: 'Meta + Google reklam türevi',         creditsEach: 50, qty: 28 },
      { action: 'Galeri analizi (foto başına)',        creditsEach: 22, qty: 120 },
    ],
    highlights: [
      '28 tam misyon döngüsü',
      '336 organik içerik + 112 reel',
      '28 Meta Ads + 28 Google Ads kreatifi',
      '120 fotoğraf galeri analizi',
      'Ajans kullanımına uygun büyüme paketi',
    ],
  },
  {
    id: 'pack_5000',
    credits: 40000,
    price: 23008,
    label: 'Pro',
    note: '~65 misyon',
    breakdown: [
      { action: 'Misyon stratejisi',                    creditsEach: 80, qty: 65 },
      { action: 'İçerik ideasyonu',                     creditsEach: 110, qty: 65 },
      { action: '16-slot mission üretimi',             creditsEach: 340, qty: 65 },
      { action: 'Meta + Google reklam türevi',         creditsEach: 60, qty: 65 },
      { action: 'Galeri analizi (foto başına)',        creditsEach: 7, qty: 250 },
    ],
    highlights: [
      '65 tam misyon döngüsü',
      '780 organik içerik + 260 reel',
      '65 Meta Ads + 65 Google Ads kreatifi',
      '250 fotoğraf galeri analizi',
      'Yoğun ajans operasyonu için yüksek hacim',
    ],
  },
];

// ── Pack Detail Modal ─────────────────────────────────────────────────

function PackDetailModal({
  pack,
  t,
  onClose,
  onBuy,
  purchaseEnabled,
}: {
  pack: CreditPack;
  t: T;
  onClose: () => void;
  onBuy: () => void;
  purchaseEnabled: boolean;
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
                ₺{pack.price.toLocaleString('tr-TR')}
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
            onClick={purchaseEnabled ? onBuy : undefined}
            disabled={!purchaseEnabled}
            style={{
              width: '100%', padding: '16px',
              borderRadius: 16, border: 'none',
              cursor: purchaseEnabled ? 'pointer' : 'not-allowed',
              fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em',
              background: purchaseEnabled
                ? `linear-gradient(135deg, ${t.accent}, #5A82A0)`
                : (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
              color: purchaseEnabled ? '#fff' : t.textMuted,
              opacity: purchaseEnabled ? 1 : 0.85,
            }}
          >
            {purchaseEnabled
              ? `${pack.credits.toLocaleString('tr-TR')} Kredi Yükle — ₺${pack.price.toLocaleString('tr-TR')}`
              : 'Online yükleme yakında — destek ekibimizle iletişime geçin'}
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
  const debugMode = isDebugUiMode();
  const purchaseEnabled = debugMode && process.env.NEXT_PUBLIC_CREDIT_PURCHASE_ENABLED === 'true';
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
    if (!purchaseEnabled) return;
    setModalPack(null);
    // Stripe payment intent → pack.id (enabled via NEXT_PUBLIC_CREDIT_PURCHASE_ENABLED)
  };

  return (
    <>
      {modalPack && (
        <PackDetailModal
          pack={modalPack}
          t={t}
          onClose={() => setModalPack(null)}
          onBuy={() => handleBuy(modalPack)}
          purchaseEnabled={purchaseEnabled}
        />
      )}

      <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100,
        transition: 'background 300ms' }}>

        <MobileStackHeader t={t} title="Kredi & Kullanım" onBack={goBack} />

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
            <>
              <TokenWalletCard wallet={wallet} t={t} />
              {!debugMode && remaining !== null && remaining > 0 && (
                <div style={{ ...t.surfaceCard, padding: '14px 16px', marginTop: 10 }}>
                  <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                    Bu ay yaklaşık{' '}
                    <strong style={{ color: t.textPrimary }}>{estimateRemainingPosts(remaining)}</strong>
                    {' '}içerik daha üretebilirsiniz (post + story paketi tahmini).
                  </div>
                </div>
              )}
            </>
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
              debugMode={debugMode}
              t={t}
            />
          </div>
        )}

        {debugMode && usageCost && (
          <div style={{ padding: '20px 24px 0' }}>
            <AiCostBreakdownCard data={usageCost} t={t} />
          </div>
        )}

        {/* Last 30-day summary */}
        {(artifactCount !== null || (debugMode && totalSpent !== null) || (!debugMode && remaining !== null)) && (
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
              {debugMode && totalSpent !== null && (
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

        {/* Credit pack cards — paket detayları; satın alma yalnızca flag ile açılır */}
        <div style={{ padding: '20px 24px 0' }}>
          <SLabel t={t} text={purchaseEnabled ? 'Kredi Yükle' : 'Kredi Paketleri'} />
          {!purchaseEnabled && (
            <div style={{
              marginBottom: 14, padding: '12px 14px', borderRadius: 12,
              background: t.isDark ? 'rgba(77,112,136,0.1)' : 'rgba(77,112,136,0.06)',
              border: `0.5px solid ${t.accentBorder}`,
              fontSize: 13, color: t.textSecondary, lineHeight: 1.55,
            }}>
              Online kredi yükleme yakında aktif olacak. Paket detaylarını inceleyebilir;
              yükleme için destek ekibimizle iletişime geçin.
            </div>
          )}
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
                    ? (t.isDark ? 'rgba(77,112,136,0.08)' : 'rgba(77,112,136,0.04)')
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
                    ₺{pack.price.toLocaleString('tr-TR')}
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

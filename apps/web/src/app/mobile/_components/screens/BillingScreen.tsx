'use client';

/**
 * Kullanım & Plan — lean customer billing.
 * Real data: token wallet (Python) + usage quota / subscription (.NET).
 * Checkout: PayTR iFrame when PAYTR_* env credentials are set.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { TokenWalletCard } from '../TokenWalletCard';
import { ClientCreditSummary } from '../ClientCreditSummary';
import { AiCostBreakdownCard } from '../AiCostBreakdownCard';
import { PlanUsagePanel } from '../PlanUsagePanel';
import { PaytrCheckoutSheet } from '../PaytrCheckoutSheet';
import { isDebugUiMode } from '../mobile-client-config';
import {
  formatOutputLimit,
  getPlanSpec,
  SELLABLE_PACKAGE_PLAN_TIERS,
  type PlanSpec,
} from '@/lib/package-plan-config';
import type { T } from '../theme-context';

const PLAN_LABEL_TR: Record<string, string> = {
  starter: 'Başlangıç',
  growth: 'Büyüme',
  performance: 'Pro', // legacy — not sellable
  executive: 'Executive',
};

function planLabel(plan: PlanSpec): string {
  return PLAN_LABEL_TR[plan.slug] ?? plan.name;
}

function planOneLiner(plan: PlanSpec): string {
  const missions = formatOutputLimit(plan.outputs.missions);
  const content = formatOutputLimit(plan.outputs.socialContent);
  const reels = formatOutputLimit(plan.outputs.reels);
  return `${missions} misyon · ~${content} içerik + ${reels} reel / ay`;
}

export function BillingScreen() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const debugMode = isDebugUiMode();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<PlanSpec | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [iframeToken, setIframeToken] = useState<string | null>(null);
  const [banner, setBanner] = useState<'ok' | 'fail' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const billing = params.get('billing');
    if (billing === 'ok' || billing === 'fail') {
      setBanner(billing);
      params.delete('billing');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
      if (billing === 'ok') {
        void queryClient.invalidateQueries({ queryKey: ['usage-quota'] });
        void queryClient.invalidateQueries({ queryKey: ['usage-cost'] });
      }
    }
  }, [queryClient]);

  const { data: paytrStatus } = useQuery({
    queryKey: ['paytr-status'],
    queryFn: async () => {
      // Next.js BFF — do not use getApiFetchUrl (that proxies to .NET)
      const res = await fetch('/api/paytr/status');
      if (!res.ok) return { enabled: false };
      return (await res.json()) as { enabled: boolean; testMode?: boolean };
    },
    staleTime: 60_000,
  });

  const purchaseEnabled = Boolean(paytrStatus?.enabled);

  const { data: quotaData } = useQuery({
    queryKey: ['usage-quota'],
    queryFn: async () => {
      try {
        return await apiClient.getUsageQuota();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
  });

  const { data: usageCost, isLoading } = useQuery({
    queryKey: ['usage-cost', tenantId, quotaData?.packageSlug],
    queryFn: () => apiClient.getWorkspaceUsageCost(tenantId!, 30, quotaData?.packageSlug),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const wallet = usageCost?.token_wallet;
  const activePlan = useMemo(
    () => getPlanSpec(quotaData?.packageSlug) ?? null,
    [quotaData?.packageSlug],
  );

  const sellablePlans = SELLABLE_PACKAGE_PLAN_TIERS;

  const startCheckout = async (plan: PlanSpec) => {
    if (!purchaseEnabled || !tenantId) return;
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      let email = '';
      let userName = '';
      try {
        const me = await apiClient.getCurrentUserSecurity();
        email = me.email ?? '';
        userName = me.displayName ?? '';
      } catch {
        /* email required — surface error below */
      }
      if (!email.includes('@')) {
        setCheckoutError('Ödeme için hesap e-postası gerekli. Lütfen tekrar giriş yapın.');
        return;
      }

      const res = await fetch('/api/paytr/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          packageSlug: plan.slug,
          email,
          userName,
        }),
      });
      const data = (await res.json()) as {
        iframeToken?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.iframeToken) {
        setCheckoutError(data.message || 'Ödeme başlatılamadı.');
        return;
      }
      setSelected(null);
      setIframeToken(data.iframeToken);
    } catch {
      setCheckoutError('Bağlantı hatası. Tekrar deneyin.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <>
      {iframeToken && (
        <PaytrCheckoutSheet
          iframeToken={iframeToken}
          title="Güvenli ödeme"
          t={t}
          onClose={() => {
            setIframeToken(null);
            void queryClient.invalidateQueries({ queryKey: ['usage-quota'] });
            void queryClient.invalidateQueries({ queryKey: ['usage-cost'] });
          }}
        />
      )}

      {selected && (
        <ConfirmPlanSheet
          plan={selected}
          t={t}
          purchaseEnabled={purchaseEnabled}
          loading={checkoutLoading}
          error={checkoutError}
          onClose={() => {
            setSelected(null);
            setCheckoutError(null);
          }}
          onConfirm={() => void startCheckout(selected)}
        />
      )}

      <div
        style={{
          minHeight: '100dvh',
          background: t.bg,
          paddingBottom: 100,
          transition: 'background 300ms',
        }}
      >
        <MobileStackHeader t={t} title="Kullanım & Plan" onBack={goBack} />

        {banner && (
          <div style={{ padding: '12px 24px 0' }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                fontSize: 13,
                lineHeight: 1.45,
                background:
                  banner === 'ok'
                    ? 'rgba(34,197,94,0.12)'
                    : 'rgba(239,68,68,0.10)',
                color: banner === 'ok' ? t.success : t.danger,
                border: `0.5px solid ${banner === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)'}`,
              }}
            >
              {banner === 'ok'
                ? 'Ödeme alındı. Planınız güncelleniyor…'
                : 'Ödeme tamamlanamadı. Tekrar deneyebilirsiniz.'}
            </div>
          </div>
        )}

        {/* Kredi */}
        <div style={{ padding: '20px 24px 0' }}>
          <SLabel text="Bu ay" />
          {isLoading ? (
            <Skeleton t={t} />
          ) : wallet ? (
            debugMode ? (
              <TokenWalletCard wallet={wallet} t={t} />
            ) : (
              <ClientCreditSummary wallet={wallet} t={t} />
            )
          ) : (
            <div style={{ ...t.surfaceCard, padding: '16px', fontSize: 13, color: t.textMuted }}>
              Kredi bilgisi yüklenemedi.
            </div>
          )}
        </div>

        {/* Aktif plan */}
        <div style={{ padding: '20px 24px 0' }}>
          <SLabel text="Aktif plan" />
          <div className="sa-chrome-card" style={{ padding: '16px 18px' }}>
            {activePlan || quotaData ? (
              <>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: t.textPrimary,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {activePlan ? planLabel(activePlan) : quotaData?.packageName || 'Plan'}
                </div>
                <div style={{ fontSize: 13, color: t.textSecondary, marginTop: 4 }}>
                  {activePlan
                    ? planOneLiner(activePlan)
                    : `${quotaData?.packageSlug ?? ''} · ${quotaData?.status ?? ''}`}
                </div>
                {activePlan && (
                  <div
                    style={{
                      fontSize: 13,
                      color: t.textMuted,
                      marginTop: 8,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    ₺{activePlan.monthlyPriceTry.toLocaleString('tr-TR')} / ay
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: t.textMuted }}>
                Henüz aktif bir plan yok. Aşağıdan seçebilirsiniz.
              </div>
            )}
          </div>
        </div>

        {debugMode && quotaData && (
          <div style={{ padding: '20px 24px 0' }}>
            <PlanUsagePanel
              quota={quotaData}
              wallet={usageCost?.token_wallet}
              packageSlug={quotaData.packageSlug}
              debugMode
              t={t}
            />
          </div>
        )}

        {debugMode && usageCost && (
          <div style={{ padding: '20px 24px 0' }}>
            <AiCostBreakdownCard data={usageCost} t={t} />
          </div>
        )}

        {/* Planlar */}
        <div style={{ padding: '20px 24px 0' }}>
          <SLabel text={purchaseEnabled ? 'Plan seç / yükselt' : 'Planlar'} />
          {!purchaseEnabled && (
            <div
              style={{
                marginBottom: 12,
                padding: '12px 14px',
                borderRadius: 12,
                background: t.isDark ? 'rgba(77,112,136,0.1)' : 'rgba(77,112,136,0.06)',
                border: `0.5px solid ${t.accentBorder}`,
                fontSize: 13,
                color: t.textSecondary,
                lineHeight: 1.5,
              }}
            >
              Online ödeme henüz açılmadı. Plan detaylarını görebilirsiniz; aktivasyon için
              destek ile iletişime geçin.
            </div>
          )}
          {paytrStatus?.testMode && purchaseEnabled && (
            <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 10 }}>
              PayTR test modu açık
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sellablePlans.map((plan) => {
              const isActive = activePlan?.slug === plan.slug;
              const popular = plan.slug === 'growth';
              return (
                <button
                  key={plan.slug}
                  type="button"
                  onClick={() => setSelected(plan)}
                  className="sa-press-row"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    ...t.surfaceCard,
                    padding: '16px 18px',
                    border: popular
                      ? `0.5px solid ${t.accent}66`
                      : (t.surfaceCard.border as string),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: t.textPrimary,
                        }}
                      >
                        {planLabel(plan)}
                      </span>
                      {isActive && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: t.accent,
                            letterSpacing: '0.04em',
                          }}
                        >
                          AKTİF
                        </span>
                      )}
                      {popular && !isActive && (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 20,
                            background: t.gradientAccent,
                            color: '#fff',
                          }}
                        >
                          ÖNERİLEN
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: t.textMuted,
                        marginTop: 4,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {planOneLiner(plan)}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    <div
                      className={popular ? 'sa-chrome-text' : undefined}
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        letterSpacing: '-0.03em',
                        fontVariantNumeric: 'tabular-nums',
                        ...(popular ? {} : { color: t.textPrimary }),
                      }}
                    >
                      ₺{plan.monthlyPriceTry.toLocaleString('tr-TR')}
                    </div>
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>/ ay</div>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => navigate('settings')}
            style={{
              marginTop: 16,
              width: '100%',
              padding: '14px',
              borderRadius: 14,
              border: `0.5px solid ${t.separator}`,
              background: 'transparent',
              color: t.textSecondary,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Destek / ayarlar
          </button>
        </div>
      </div>
    </>
  );
}

function ConfirmPlanSheet({
  plan,
  t,
  purchaseEnabled,
  loading,
  error,
  onClose,
  onConfirm,
}: {
  plan: PlanSpec;
  t: T;
  purchaseEnabled: boolean;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const bullets = [
    planOneLiner(plan),
    `${formatOutputLimit(plan.outputs.socialContent)} organik içerik / ay`,
    `${formatOutputLimit(plan.outputs.reels)} reel kapasitesi`,
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: t.isDark ? '#0D121B' : '#fff',
          borderRadius: '24px 24px 0 0',
          border: `0.5px solid ${t.isDark ? 'rgba(176,196,212,0.14)' : 'rgba(30,63,85,0.10)'}`,
          borderBottom: 'none',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
            }}
          />
        </div>
        <div style={{ padding: '14px 20px 8px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary }}>
            {planLabel(plan)}
          </div>
          <div
            className="sa-chrome-text"
            style={{
              fontSize: 28,
              fontWeight: 800,
              marginTop: 6,
              letterSpacing: '-0.04em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ₺{plan.monthlyPriceTry.toLocaleString('tr-TR')}
            <span style={{ fontSize: 14, fontWeight: 600, color: t.textMuted, marginLeft: 6 }}>
              / ay
            </span>
          </div>
        </div>
        <div style={{ padding: '8px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bullets.map((b) => (
            <div
              key={b}
              style={{
                fontSize: 14,
                color: t.textSecondary,
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <span style={{ color: t.accent, fontWeight: 700 }}>·</span>
              {b}
            </div>
          ))}
          {error && (
            <div style={{ fontSize: 13, color: t.danger, marginTop: 4 }}>{error}</div>
          )}
        </div>
        <div style={{ padding: '0 20px 8px' }}>
          <button
            type="button"
            disabled={!purchaseEnabled || loading}
            onClick={purchaseEnabled ? onConfirm : undefined}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 16,
              border: 'none',
              cursor: purchaseEnabled && !loading ? 'pointer' : 'not-allowed',
              fontSize: 15,
              fontWeight: 800,
              background: purchaseEnabled
                ? t.gradientAccent
                : t.isDark
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(0,0,0,0.06)',
              color: purchaseEnabled ? '#fff' : t.textMuted,
              minHeight: 48,
            }}
          >
            {loading
              ? 'Ödeme hazırlanıyor…'
              : purchaseEnabled
                ? 'PayTR ile öde'
                : 'Online ödeme yakında'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              marginTop: 8,
              padding: '12px',
              border: 'none',
              background: 'transparent',
              color: t.textMuted,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: 44,
            }}
          >
            Vazgeç
          </button>
        </div>
      </div>
    </div>
  );
}

function SLabel({ text }: { text: string }) {
  return <div className="sa-chrome-eyebrow" style={{ marginBottom: 12 }}>{text}</div>;
}

function Skeleton({ t }: { t: T }) {
  return (
    <div
      style={{
        height: 96,
        borderRadius: 16,
        background: t.isDark ? 'rgba(255,255,255,0.04)' : '#f3f4f6',
      }}
    />
  );
}

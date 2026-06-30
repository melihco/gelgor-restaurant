'use client';

import type { CSSProperties } from 'react';
import {
  computePlanEconomics,
  estimatePlanMarginOnRevenuePercent,
  estimatePlanMonthlyApiCostUsd,
  formatOutputLimit,
  formatPlanMonthlyPrice,
  getPlanSpec,
  PACKAGE_PLAN_TIERS,
  PLAN_API_UNIT_COSTS,
  type PlanSpec,
} from '@/lib/package-plan-config';
import type { PlanMonthlyOutputs, UsageQuotaSummary } from '@/types';
import type { TokenWalletSummary } from '@/lib/api-client';

type ThemeSlice = {
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  labelColor: string;
  accent: string;
  warning: string;
  separator: string;
  surfaceCard: CSSProperties;
};

function mapApiOutputs(raw?: UsageQuotaSummary['monthlyOutputs'] | Record<string, number> | null): PlanSpec['outputs'] | null {
  if (!raw) return null;
  const r = raw as Record<string, number>;
  return {
    missions: r.missions ?? r.Missions ?? 0,
    socialContent: r.socialContent ?? r.SocialContent ?? 0,
    galleryAnalysis: r.galleryAnalysis ?? r.GalleryAnalysis ?? 0,
    reels: r.reels ?? r.Reels ?? 0,
    metaAdCreatives: r.metaAdCreatives ?? r.meta_ad_creatives ?? r.MetaAdCreatives ?? 0,
    googleAdCreatives: r.googleAdCreatives ?? r.google_ad_creatives ?? r.GoogleAdCreatives ?? 0,
  };
}

export function PlanUsagePanel({
  quota,
  wallet,
  packageSlug,
  debugMode = false,
  t,
}: {
  quota: UsageQuotaSummary | null | undefined;
  wallet?: TokenWalletSummary | null;
  packageSlug?: string | null;
  debugMode?: boolean;
  t: ThemeSlice;
}) {
  const slug = packageSlug ?? quota?.packageSlug;
  const plan = getPlanSpec(slug);
  const apiOutputs = mapApiOutputs(quota?.monthlyOutputs);
  const outputs = apiOutputs
    ? {
        ...(plan?.outputs ?? apiOutputs),
        ...apiOutputs,
        metaAdCreatives: apiOutputs.metaAdCreatives || plan?.outputs.metaAdCreatives || 0,
        googleAdCreatives: apiOutputs.googleAdCreatives || plan?.outputs.googleAdCreatives || 0,
      }
    : plan?.outputs ?? null;

  const estimatedFullUtilCogs = plan ? estimatePlanMonthlyApiCostUsd(plan) : null;
  const estimatedFullUtilMargin = plan ? estimatePlanMarginOnRevenuePercent(plan) : null;

  const quotaRows = debugMode
    ? (quota
      ? [
          { label: 'Ajan Çalışmaları', metric: quota.agentRuns, color: '#9DBECE' },
          { label: 'Provider Aksiyonlar', metric: quota.providerActions, color: '#60a5fa' },
          { label: 'Canlı Yayın', metric: quota.liveProviderActions, color: '#f59e0b' },
          { label: 'Token Kullanımı', metric: quota.tokens, color: '#34d399' },
        ]
      : plan
        ? [
            { label: 'Ajan Çalışmaları', used: 0, limit: plan.quotas.agentRuns, color: '#9DBECE' },
            { label: 'Provider Aksiyonlar', used: 0, limit: plan.quotas.providerActions, color: '#60a5fa' },
            { label: 'Canlı Yayın', used: 0, limit: plan.quotas.liveProviderActions, color: '#f59e0b' },
            { label: 'Token Kullanımı', used: 0, limit: plan.quotas.llmTokens, color: '#34d399' },
          ].map((r) => ({
            label: r.label,
            metric: {
              used: r.used,
              limit: r.limit,
              isUnlimited: r.limit < 0,
            },
            color: r.color,
          }))
        : [])
    : (quota
      ? [
          { label: 'Kampanya planı', metric: quota.agentRuns, color: '#9DBECE' },
          { label: 'İçerik üretimi', metric: quota.providerActions, color: '#60a5fa' },
          { label: 'SA Kredi', metric: quota.tokens, color: '#34d399' },
        ]
      : plan
        ? [
            { label: 'Kampanya planı', used: 0, limit: plan.quotas.agentRuns, color: '#9DBECE' },
            { label: 'İçerik üretimi', used: 0, limit: plan.quotas.providerActions, color: '#60a5fa' },
            { label: 'SA Kredi', used: 0, limit: plan.quotas.llmTokens, color: '#34d399' },
          ].map((r) => ({
            label: r.label,
            metric: {
              used: r.used,
              limit: r.limit,
              isUnlimited: r.limit < 0,
            },
            color: r.color,
          }))
        : []);

  const economics = plan && wallet?.enabled
    ? computePlanEconomics(plan.monthlyPriceTry, wallet.month_cost_usd, wallet.month_billed_usd)
    : null;

  const cpRatio = wallet?.cost_profit_ratio ?? economics?.costProfitRatio ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {plan && (
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700, color: t.textSecondary }}>{plan.name}</span>
          {' · '}
          {formatPlanMonthlyPrice(plan)}
        </div>
      )}

      {debugMode && (
      <div style={{ ...t.surfaceCard, padding: '14px 16px' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: t.labelColor,
          letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10,
        }}>
          Paketler
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PACKAGE_PLAN_TIERS.map((tier) => {
            const active = tier.slug === slug;
            return (
              <div
                key={tier.slug}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderRadius: 12,
                  background: active
                    ? (t.isDark ? 'rgba(77,112,136,0.12)' : 'rgba(77,112,136,0.06)')
                    : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                  border: active ? `0.5px solid ${t.accent}55` : `0.5px solid ${t.separator}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{tier.name}</div>
                  {active && (
                    <div style={{ fontSize: 10, color: t.accent, marginTop: 2, fontWeight: 600 }}>Aktif plan</div>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: active ? t.accent : t.textSecondary,
                  fontVariantNumeric: 'tabular-nums' }}>
                  ${tier.monthlyPriceUsd}
                  <span style={{ fontSize: 10, fontWeight: 600, color: t.textMuted }}>/ay</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: 10, color: t.textTertiary, lineHeight: 1.45 }}>
          Güncel paketler 16-slot mission üretimine göre yeniden fiyatlandırıldı. Üst paketler daha yüksek kota ve üretim hacmi içerir.
        </div>
        {plan && estimatedFullUtilCogs != null && (
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor, marginBottom: 6,
              letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Tahmini API maliyeti (tam kota)
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary }}>
              ~${estimatedFullUtilCogs.toFixed(2)}/ay
              {estimatedFullUtilMargin != null && (
                <span style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, marginLeft: 8 }}>
                  · liste fiyatına göre marj %{estimatedFullUtilMargin}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 6, lineHeight: 1.45 }}>
              Misyon ~${(PLAN_API_UNIT_COSTS.missionPropose + PLAN_API_UNIT_COSTS.missionProductionCycle).toFixed(2)}
              {' '}(öneri + güncel 16-slot üretim döngüsü) · galeri ${PLAN_API_UNIT_COSTS.galleryVisionAnalysis.toFixed(2)}/foto
            </div>
          </div>
        )}
      </div>
      )}

      {outputs && (
        <div style={{ ...t.surfaceCard, padding: '16px 18px' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: t.labelColor,
            letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12,
          }}>
            Aylık Paket Çıktıları
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { label: 'Misyon', value: outputs.missions },
              { label: 'Organik içerik', value: outputs.socialContent },
              { label: 'Meta reklam', value: outputs.metaAdCreatives },
              { label: 'Google Ads', value: outputs.googleAdCreatives },
              { label: 'Galeri analizi', value: outputs.galleryAnalysis },
              { label: 'Reel', value: outputs.reels },
            ].map((item) => (
              <div key={item.label}>
                <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  {formatOutputLimit(item.value)}
                </div>
              </div>
            ))}
          </div>
          {plan && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plan.outputHighlights.slice(0, 3).map((h) => (
                <div key={h} style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.4 }}>· {h}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {quotaRows.length > 0 && (
        <div style={{ ...t.surfaceCard, padding: '18px' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: t.labelColor,
            letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12,
          }}>
            Plan Kullanımı
          </div>
          {quotaRows.map((q, i) => {
            const used = q.metric.used ?? 0;
            const limit = q.metric.isUnlimited ? Math.max(used, 100) : (q.metric.limit ?? 1);
            const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
            const isHigh = pct > 80;
            const limitLabel = q.metric.isUnlimited ? '∞' : String(q.metric.limit ?? 0);
            return (
              <div key={q.label} style={{ marginBottom: i < quotaRows.length - 1 ? 18 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: t.textSecondary }}>{q.label}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: isHigh ? t.warning : t.textTertiary,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {used} / {limitLabel}
                  </span>
                </div>
                <div style={{
                  height: 4, borderRadius: 2,
                  background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', width: `${pct}%`, borderRadius: 2,
                    background: isHigh ? t.warning : q.color,
                    transition: 'width 0.6s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {debugMode && wallet?.enabled && (
        <div style={{ ...t.surfaceCard, padding: '16px 18px' }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: t.labelColor,
            letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10,
          }}>
            Maliyet – Kar
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted }}>API maliyeti (ay)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.textPrimary, marginTop: 2 }}>
                ${wallet.month_cost_usd.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted }}>Faturalanan (kredi)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.accent, marginTop: 2 }}>
                ${wallet.month_billed_usd.toFixed(2)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted }}>Maliyet / kar oranı</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.textPrimary, marginTop: 2 }}>
                {cpRatio != null ? cpRatio.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: t.textMuted }}>Token marjı</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.accent, marginTop: 2 }}>
                %{wallet.effective_margin_percent}
              </div>
            </div>
          </div>
          {economics?.marginOnRevenuePercent != null && plan && (
            <div style={{ marginTop: 10, fontSize: 10, color: t.textTertiary, lineHeight: 1.45 }}>
              Paket geliri ≈ ${economics.revenueUsd.toFixed(0)} · tahmini operasyon marjı{' '}
              %{economics.marginOnRevenuePercent} (API maliyetine göre)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

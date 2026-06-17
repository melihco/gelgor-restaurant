'use client';

import type { WorkspaceUsageSummary } from '@/lib/api-client';
import {
  categoryLabel,
  formatUsd,
  sortedCategoryEntries,
  usdToTokens,
  MISSION_FULL_CYCLE_ESTIMATE_USD,
} from '@/lib/ai-cost-catalog';
import { TokenWalletCard } from './TokenWalletCard';

const USD_TRY = 32;

interface ThemeTokens {
  isDark: boolean;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  labelColor: string;
  accent: string;
  accentDim: string;
  separator: string;
}

export function AiCostBreakdownCard({
  data,
  t,
  compact,
}: {
  data: WorkspaceUsageSummary;
  t: ThemeTokens;
  compact?: boolean;
}) {
  if (!data) return null;

  const labels = data.category_labels ?? {};
  const periodTotals = data.category_totals ?? {};
  const monthTotals = data.month_category_totals ?? periodTotals;
  const periodLines = sortedCategoryEntries(periodTotals);
  const monthLines = sortedCategoryEntries(monthTotals);
  const markup = data.token_wallet?.markup_multiplier ?? 10;

  const periodTokens = data.token_wallet?.period_spent_tokens
    ?? usdToTokens(data.week_cost_usd, markup);
  const monthTokens = data.token_wallet?.spent_month_tokens
    ?? usdToTokens(data.month_cost_usd ?? data.week_cost_usd, markup);

  return (
    <div style={{ margin: compact ? '8px 0 0' : '12px 22px 0' }}>
      {data.token_wallet?.enabled ? (
        <TokenWalletCard wallet={data.token_wallet} compact={compact} t={t} />
      ) : null}

      <div style={{
        marginTop: data.token_wallet?.enabled ? 10 : 0,
        padding: compact ? '12px 14px' : '16px 18px',
        borderRadius: 16,
        background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
        border: `0.5px solid ${t.separator}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: t.labelColor,
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              AI maliyeti (tüm kalemler)
            </div>
            <div style={{
              fontSize: compact ? 20 : 24, fontWeight: 800, color: t.textPrimary,
              marginTop: 4, letterSpacing: '-0.03em',
            }}>
              {formatUsd(data.month_cost_usd ?? data.week_cost_usd)}
              <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted, marginLeft: 6 }}>
                API / bu ay
              </span>
            </div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
              ≈ {(data.month_cost_usd ?? data.week_cost_usd) * USD_TRY} ₺ API
              {data.token_wallet?.enabled ? (
                <> · {monthTokens.toLocaleString('tr-TR')} SA Kredi</>
              ) : null}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: t.textMuted }}>Son {data.week_days} gün</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.accent }}>
              {formatUsd(data.week_cost_usd)}
            </div>
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
              {data.week_artifact_count} içerik · {data.week_mission_count} mission
            </div>
          </div>
        </div>

        {monthLines.length > 0 ? (
          <CostCategoryList
            title="Bu ay — kategori kırılımı"
            lines={monthLines}
            labels={labels}
            markup={markup}
            t={t}
          />
        ) : periodLines.length > 0 ? (
          <CostCategoryList
            title={`Son ${data.week_days} gün — kategori kırılımı`}
            lines={periodLines}
            labels={labels}
            markup={markup}
            t={t}
          />
        ) : (
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 12, lineHeight: 1.5 }}>
            Henüz kayıtlı AI harcaması yok. Tam misyon döngüsü tahmini:{' '}
            <strong style={{ color: t.textPrimary }}>{formatUsd(MISSION_FULL_CYCLE_ESTIMATE_USD)}</strong>
          </div>
        )}

        {periodLines.length > 0 && monthLines.length > 0 && (
          <CostCategoryList
            title={`Son ${data.week_days} gün`}
            lines={periodLines}
            labels={labels}
            markup={markup}
            t={t}
            compact
          />
        )}

        <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 12, lineHeight: 1.45 }}>
          {data.currency_note ?? 'Tahmini API maliyeti (USD). Strategist, ideation, Feed Director, scene brief ve Feed üretimi dahil.'}
          {data.token_wallet?.enabled ? (
            <> · Müşteri fiyatı ≈ API ×{markup} ({periodTokens.toLocaleString('tr-TR')} kredi / {data.week_days} gün)</>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CostCategoryList({
  title,
  lines,
  labels,
  markup,
  t,
  compact,
}: {
  title: string;
  lines: Array<[string, number]>;
  labels: Record<string, string>;
  markup: number;
  t: ThemeTokens;
  compact?: boolean;
}) {
  const max = Math.max(...lines.map(([, v]) => v), 0.001);

  return (
    <div style={{ marginTop: compact ? 10 : 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
        {lines.map(([key, usd]) => {
          const pct = Math.max(4, (usd / max) * 100);
          const tokens = usdToTokens(usd, markup);
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: t.textPrimary }}>
                  {categoryLabel(key, labels)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, whiteSpace: 'nowrap' }}>
                  {formatUsd(usd)}
                  <span style={{ fontWeight: 500, color: t.textMuted, marginLeft: 4 }}>
                    · {tokens.toLocaleString('tr-TR')} kr
                  </span>
                </span>
              </div>
              <div style={{
                height: 4, borderRadius: 2, overflow: 'hidden',
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%', borderRadius: 2,
                  background: `linear-gradient(90deg, ${t.accent}88, ${t.accent})`,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

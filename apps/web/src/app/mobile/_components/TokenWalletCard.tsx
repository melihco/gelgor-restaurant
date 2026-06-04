'use client';

import type { TokenWalletSummary } from '@/lib/api-client';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR');
}

interface TokenWalletCardProps {
  wallet: TokenWalletSummary;
  compact?: boolean;
  t: {
    isDark: boolean;
    textPrimary: string;
    textMuted: string;
    textTertiary: string;
    labelColor: string;
    accent: string;
    accentDim: string;
    separator: string;
  };
}

export function TokenWalletCard({ wallet, compact, t }: TokenWalletCardProps) {
  if (!wallet?.enabled) return null;

  const pct = wallet.usage_percent ?? 0;
  const atLimit = wallet.remaining_tokens <= 0;
  const tokenName = wallet.token_name || 'SA Kredi';

  return (
    <div style={{
      padding: compact ? '12px 14px' : '16px 18px',
      borderRadius: 16,
      background: t.isDark ? 'rgba(124,58,237,0.08)' : 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(99,102,241,0.04))',
      border: `0.5px solid ${atLimit ? 'rgba(239,68,68,0.4)' : `${t.accent}44`}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {tokenName}
          </div>
          <div style={{ fontSize: compact ? 22 : 26, fontWeight: 800, color: t.textPrimary, marginTop: 4, letterSpacing: '-0.03em' }}>
            {fmt(wallet.remaining_tokens)}
            <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginLeft: 6 }}>kalan</span>
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
            Bu ay {fmt(wallet.spent_month_tokens)} / {fmt(wallet.monthly_grant_tokens)} kullanıldı
            · ≈ {wallet.month_billed_try.toFixed(0)} ₺
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: t.textMuted }}>×{wallet.markup_multiplier} fiyatlandırma</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.accent, marginTop: 4 }}>
            %{wallet.effective_margin_percent} marj
          </div>
          {wallet.cost_profit_ratio != null && (
            <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 2 }}>
              maliyet/kar {wallet.cost_profit_ratio.toLocaleString('tr-TR')}
            </div>
          )}
        </div>
      </div>

      <div style={{
        marginTop: 12, height: 6, borderRadius: 3, overflow: 'hidden',
        background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: atLimit
            ? 'linear-gradient(90deg, #EF4444, #F87171)'
            : `linear-gradient(90deg, ${t.accent}99, ${t.accent})`,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {!compact && Object.keys(wallet.category_tokens ?? {}).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {Object.entries(wallet.category_tokens ?? {}).slice(0, 4).map(([key, val]) => (
            <span key={key} style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
              background: t.accentDim, color: t.accent,
            }}>
              {wallet.category_labels?.[key] ?? key} {fmt(val)}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 10, lineHeight: 1.4 }}>
        {wallet.note_tr}
      </div>
    </div>
  );
}

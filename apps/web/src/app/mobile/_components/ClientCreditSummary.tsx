'use client';

import type { TokenWalletSummary } from '@/lib/api-client';

function fmt(n: number): string {
  return n.toLocaleString('tr-TR');
}

interface ClientCreditSummaryProps {
  wallet: TokenWalletSummary;
  compact?: boolean;
  t: {
    isDark: boolean;
    textPrimary: string;
    textMuted: string;
    textTertiary: string;
    labelColor: string;
    accent: string;
    success?: string;
    warning?: string;
  };
}

/** Production müşteri görünümü — kalan kredi ve kullanım yüzdesi; marj/API detayı yok. */
export function ClientCreditSummary({ wallet, compact, t }: ClientCreditSummaryProps) {
  if (!wallet?.enabled) return null;

  const pct = wallet.usage_percent ?? 0;
  const atLimit = wallet.remaining_tokens <= 0;
  const tokenName = wallet.token_name || 'SA Kredi';
  const lowBalance = wallet.remaining_tokens > 0 && wallet.remaining_tokens <= 200;

  return (
    <div style={{
      padding: compact ? '12px 14px' : '16px 18px',
      borderRadius: 16,
      background: t.isDark
        ? 'rgba(77,112,136,0.08)'
        : 'linear-gradient(135deg, rgba(77,112,136,0.06), rgba(90,130,160,0.04))',
      border: `0.5px solid ${atLimit ? 'rgba(239,68,68,0.4)' : `${t.accent}44`}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
        letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {tokenName}
      </div>
      <div style={{
        fontSize: compact ? 22 : 26, fontWeight: 800, color: t.textPrimary,
        marginTop: 4, letterSpacing: '-0.03em',
      }}>
        {fmt(wallet.remaining_tokens)}
        <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginLeft: 6 }}>kalan</span>
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
        Bu ay {fmt(wallet.spent_month_tokens)} / {fmt(wallet.monthly_grant_tokens)} kullanıldı
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

      {atLimit && (
        <div style={{ fontSize: 11, color: '#EF4444', marginTop: 10, lineHeight: 1.45, fontWeight: 600 }}>
          Kredi limitiniz doldu. Yeni kampanya ve içerik üretimi duraklatıldı.
        </div>
      )}
      {!atLimit && lowBalance && (
        <div style={{ fontSize: 11, color: t.warning ?? '#F59E0B', marginTop: 10, lineHeight: 1.45 }}>
          Krediniz azalıyor — planınızı kontrol edin veya yükleme yapın.
        </div>
      )}
      {!atLimit && !lowBalance && (
        <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 10, lineHeight: 1.4 }}>
          Krediler içerik üretimi ve kampanya planlaması için kullanılır.
        </div>
      )}
    </div>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { IcoBack, IcoCheck } from '../Icons';
import { apiClient } from '@/lib/api-client';
import { TokenWalletCard } from '../TokenWalletCard';
import type { T } from '../theme-context';

const MOCK_PACKAGES = [
  { id: 'starter', name: 'Starter',  monthlyPrice: 299,  agents: 2, features: ['2 AI Ajan', '50 ajan çalışması/ay', '10 provider aksiyon', 'Instagram organik yayın', 'Temel analitik'] },
  { id: 'growth',  name: 'Growth',   monthlyPrice: 699,  agents: 4, features: ['4 AI Ajan', '200 ajan çalışması/ay', '50 provider aksiyon', 'Instagram + Facebook yayın', '📣 Meta Reklam Yönetimi', 'Gelişmiş analitik', 'Öncelikli destek'] },
  { id: 'premium', name: 'Premium',  monthlyPrice: 1299, agents: 8, features: ['8 AI Ajan', '500 ajan çalışması/ay', '200 provider aksiyon', 'Tüm platformlar yayın', '📣 Meta + Google Ads Yönetimi', 'Reel üretimi (Runway)', 'Tüm entegrasyonlar', 'Özel şablonlar', '7/24 Destek'] },
];

const MOCK_USAGE = [
  { label: 'Ajan Çalışmaları',    used: 68,  limit: 200,  color: '#a78bfa', unit: 'run'    },
  { label: 'Provider Aksiyonlar', used: 14,  limit: 50,   color: '#60a5fa', unit: 'action' },
  { label: 'Live Aksiyonlar',     used: 3,   limit: 20,   color: '#34d399', unit: 'action' },
  { label: 'Token Kullanımı',     used: 820, limit: 2000, color: '#f59e0b', unit: 'k'      },
];

export function BillingScreen() {
  const { t } = useTheme();
  const { goBack } = useMobileStore();
  const { tenantId } = useWorkspaceStore();

  const { data: usageCost } = useQuery({
    queryKey: ['usage-cost', tenantId],
    queryFn: () => apiClient.getWorkspaceUsageCost(tenantId!, 30),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: async () => { try { return await apiClient.getPackages(); } catch { return []; } },
    staleTime: 300_000,
  });

  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => { try { return await apiClient.getSubscription(); } catch { return null; } },
    staleTime: 60_000,
  });

  const { data: quotaData } = useQuery({
    queryKey: ['usage-quota'],
    queryFn: async () => { try { return await apiClient.getUsageQuota(); } catch { return null; } },
    staleTime: 60_000,
  });

  // Use real data if available, otherwise mock
  const activePlanId = subscription?.packageId ?? 'growth';
  const pkgs = packages.length > 0 ? packages : MOCK_PACKAGES;

  const usage = quotaData
    ? [
        { label: 'Ajan Çalışmaları',    used: quotaData.agentRuns?.used ?? 0,       limit: quotaData.agentRuns?.limit ?? 200,  color: '#a78bfa', unit: 'run'    },
        { label: 'Provider Aksiyonlar', used: quotaData.providerActions?.used ?? 0,  limit: quotaData.providerActions?.limit ?? 50, color: '#60a5fa', unit: 'action' },
        { label: 'Live Aksiyonlar',     used: quotaData.liveProviderActions?.used ?? 0, limit: quotaData.liveProviderActions?.limit ?? 20, color: '#34d399', unit: 'action' },
        { label: 'Token Kullanımı',     used: quotaData.tokens?.used ?? 0,           limit: quotaData.tokens?.limit ?? 2000,    color: '#f59e0b', unit: 'k'      },
      ]
    : MOCK_USAGE;

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      {/* Header */}
      <div style={{ padding: '56px 24px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={goBack} style={{ ...t.backBtn, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoBack color={t.textSecondary} />
          </button>
          <div>
            <p style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Abonelik</p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>Plan & Kullanım</h1>
          </div>
        </div>
      </div>

      {usageCost?.token_wallet && (
        <div style={{ padding: '20px 24px 0' }}>
          <SLabel t={t} text="Kredi Cüzdanı" />
          <TokenWalletCard wallet={usageCost.token_wallet} t={t} />
        </div>
      )}

      {/* Usage quota */}
      <div style={{ padding: '20px 24px 0' }}>
        <SLabel t={t} text="Bu Ayki Kullanım" />
        <div style={{ ...t.surfaceCard, padding: '18px' }}>
          {usage.map((q, i) => {
            const pct = Math.min(100, Math.round((q.used / Math.max(q.limit, 1)) * 100));
            const isHigh = pct > 80;
            return (
              <div key={q.label} style={{ marginBottom: i < usage.length - 1 ? 18 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: t.textSecondary }}>{q.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isHigh ? t.warning : t.textTertiary, fontVariantNumeric: 'tabular-nums' }}>
                    {q.used} / {q.limit} {q.unit}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: isHigh ? t.warning : q.color, transition: 'width 0.6s ease' }} />
                </div>
                {isHigh && (
                  <div style={{ fontSize: 11, color: t.warning, marginTop: 4 }}>%{pct} kullanıldı — limiti yaklaşıyor</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan cards */}
      <div style={{ padding: '20px 24px 0' }}>
        <SLabel t={t} text="Planlar" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pkgs.map((pkg: any) => {
            const isActive = (pkg.id ?? pkg.packageId ?? pkg.name?.toLowerCase()) === activePlanId ||
                             pkg.name?.toLowerCase() === 'growth';
            const price = pkg.monthlyPrice ?? pkg.priceMonthly ?? 0;
            const features: string[] = (() => {
              if (Array.isArray(pkg.features)) return pkg.features.map(String);
              if (typeof pkg.features === 'string' && pkg.features.trim()) {
                // Try JSON array first, then comma-separated
                try { const p = JSON.parse(pkg.features); if (Array.isArray(p)) return p.map(String); } catch {}
                return pkg.features.split(',').map((f: string) => f.trim()).filter(Boolean);
              }
              // Fallback: match by price range to find closest mock
              const mockByPrice = MOCK_PACKAGES.reduce((best, m) =>
                Math.abs(m.monthlyPrice - price) < Math.abs(best.monthlyPrice - price) ? m : best
              );
              return mockByPrice.features;
            })();

            // "POPÜLER" — show on middle-tier plan (typically Growth or middle price)
            const isPopular = !isActive && Boolean(pkg.isPopular ?? (pkg.name?.toLowerCase() === 'growth'));

            return (
              <div key={pkg.id ?? pkg.name} style={{
                ...t.surfaceCard,
                padding: '20px 18px',
                background: isActive
                  ? (t.isDark
                      ? 'linear-gradient(155deg, rgba(167,139,250,0.16) 0%, rgba(96,165,250,0.06) 60%, rgba(255,255,255,0.02) 100%)'
                      : 'linear-gradient(155deg, rgba(124,58,237,0.10) 0%, rgba(96,165,250,0.04) 60%, rgba(255,255,255,1) 100%)')
                  : (t.isDark ? 'rgba(255,255,255,0.035)' : '#fff'),
                border: isActive ? `0.5px solid ${t.accent}55` : `0.5px solid ${t.separator}`,
                boxShadow: isActive
                  ? (t.isDark ? '0 8px 28px rgba(167,139,250,0.18)' : '0 4px 18px rgba(124,58,237,0.12)')
                  : (t.isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.04)'),
                position: 'relative' as const,
                overflow: 'hidden' as const,
              }}>
                {/* POPÜLER badge — top-right diagonal flag */}
                {isPopular && (
                  <div style={{ position: 'absolute', top: 12, right: 12,
                    padding: '3px 9px', borderRadius: 20,
                    background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                    fontSize: 9, fontWeight: 800, color: '#fff',
                    letterSpacing: '0.05em' }}>
                    POPÜLER
                  </div>
                )}

                {/* Plan name + active badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.01em' }}>
                    {pkg.name}
                  </span>
                  {isActive && (
                    <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                      background: t.accentDim, color: t.accent, fontWeight: 700,
                      letterSpacing: '0.02em' }}>
                      MEVCUT PLAN
                    </span>
                  )}
                </div>

                {/* Big price — premium feel */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
                  <span style={{ fontSize: 36, fontWeight: 800,
                    color: isActive ? t.accent : t.textPrimary,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.04em', lineHeight: 1 }}>
                    ₺{price}
                  </span>
                  <span style={{ fontSize: 13, color: t.textMuted, fontWeight: 500 }}>/ay</span>
                </div>

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
                  {features.map((f: string, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <IcoCheck size={14} color={isActive ? t.accent : t.success} strokeWidth={2.5} />
                      <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.4 }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* Full-width upgrade button — premium tap target */}
                {!isActive && (
                  <button style={{
                    width: '100%', padding: '13px',
                    borderRadius: 14, cursor: 'pointer',
                    fontSize: 14, fontWeight: 700,
                    background: isPopular
                      ? 'linear-gradient(135deg, #7C3AED, #6366F1)'
                      : t.accentDim,
                    border: isPopular ? 'none' : `0.5px solid ${t.accentBorder}`,
                    color: isPopular ? '#fff' : t.accent,
                    boxShadow: isPopular ? '0 3px 14px rgba(124,58,237,0.35)' : 'none',
                    letterSpacing: '-0.01em',
                  }}>
                    {isPopular ? '✦ ' : ''}{pkg.name}'a Yükselt
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing info */}
      <div style={{ padding: '20px 24px 0' }}>
        <SLabel t={t} text="Fatura Bilgileri" />
        <div style={{ ...t.surfaceGroup }}>
          {[
            { label: 'Fatura Dönemi',      value: '1 Mayıs — 31 Mayıs 2025' },
            { label: 'Sonraki Ödeme',      value: '1 Haziran 2025'           },
            { label: 'Ödeme Yöntemi',      value: '•••• 4242'                },
          ].map((row, i, arr) => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', ...(i < arr.length - 1 ? t.surfaceRow : {}) }}>
              <span style={{ fontSize: 13, color: t.textTertiary }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: t.textPrimary }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SLabel({ t, text }: { t: T; text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>{text}</div>;
}

'use client';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { PageHeader } from '../ui-primitives';

/**
 * Performans ekranı — gerçek Meta/Analytics entegrasyonu gelene kadar
 * müşteriye mock veri göstermiyoruz.
 */
export function Insights() {
  const { t } = useTheme();
  const { navigate } = useMobileStore();

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 96, transition: 'background 300ms' }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
        <PageHeader t={t} eyebrow="Performans" title="Özet Metrikler" />
      </div>

      <div style={{ padding: '32px 24px', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 18, margin: '0 auto 20px',
          background: t.isDark ? 'rgba(96,165,250,0.12)' : 'rgba(59,130,246,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>
          ↗
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em', marginBottom: 10 }}>
          Performans verileri yakında
        </h2>
        <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.6, margin: '0 0 24px' }}>
          Instagram ve Google Analytics bağlantısı kurulduğunda erişim, etkileşim ve
          en iyi içerikleriniz burada görünecek.
        </p>
        <button
          type="button"
          onClick={() => navigate('settings')}
          style={{
            padding: '12px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: t.accent, color: '#fff', fontSize: 14, fontWeight: 700,
          }}
        >
          Entegrasyonları bağla →
        </button>
      </div>
    </div>
  );
}

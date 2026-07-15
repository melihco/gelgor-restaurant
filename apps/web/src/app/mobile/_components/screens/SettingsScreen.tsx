'use client';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { MertcafeAccountSwitcher } from '../MertcafeAccountSwitcher';
import { summarizeMobileIntegrations, formatIntegrationStatusLabel } from '@/lib/mobile-integration-status';
import type { T } from '../theme-context';

// ── Helpers ───────────────────────────────────────────────────────────────────
function SLabel({ text }: { text: string }) {
  return <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>{text}</div>;
}

function Divider({ t }: { t: T }) {
  return <div style={{ height: '0.5px', background: t.separator, margin: '0 18px' }} />;
}

// Premium stroke icons per provider — replaces emoji glyphs
const PROVIDER_ICONS: Record<string, string> = {
  GoogleBusiness:  'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  Instagram:       'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
  GoogleAds:       'M3 11l18-8-4 18-6.5-5.5L3 11zM10.5 15.5L9 20',
  GoogleAnalytics: 'M3 20h18M5 20V12M9 20V8M13 20V4M17 20V10',
};
const PROVIDER_FALLBACK_ICON = 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';

function IntegrationStatusChip({ t, connected, status }: { t: T; connected: boolean; status: string }) {
  const cfg = connected
    ? { bg: t.successDim, border: `${t.success}30`, color: t.success }
    : status === 'Expired'
      ? { bg: t.warningDim, border: `${t.warning}30`, color: t.warning }
      : status === 'Error'
        ? { bg: t.dangerDim, border: `${t.danger}30`, color: t.danger }
        : {
            bg: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            border: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            color: t.textMuted,
          };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10.5, padding: '4px 10px', borderRadius: 20, fontWeight: 700,
      letterSpacing: '0.02em',
      background: cfg.bg, border: `0.5px solid ${cfg.border}`, color: cfg.color,
      flexShrink: 0,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: cfg.color,
        boxShadow: connected ? `0 0 6px ${cfg.color}80` : 'none',
      }} />
      {formatIntegrationStatusLabel(connected ? 'Connected' : status)}
    </span>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function SettingsScreen() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();

  const { data: integrationConnections = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.getIntegrations(),
    staleTime: 60_000,
  });
  const { items: integrationItems } = summarizeMobileIntegrations(integrationConnections);
  const connectedCount = integrationItems.filter((i) => i.connected).length;

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>

      <MobileStackHeader t={t} title="Entegrasyonlar" onBack={goBack} />

      <div style={{ padding: '20px 24px 0' }}>

        {/* Bağlantı özeti */}
        <div className="sa-chrome-card" style={{
          padding: '16px 18px', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="sa-chrome-text" style={{
                fontSize: 26, fontWeight: 800, letterSpacing: '-0.04em',
                fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {connectedCount}/{integrationItems.length}
              </span>
              <span style={{ fontSize: 12, color: t.textTertiary, fontWeight: 500 }}>kanal bağlı</span>
            </div>
            <div style={{
              marginTop: 10, height: 3, borderRadius: 2,
              background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${integrationItems.length ? Math.round((connectedCount / integrationItems.length) * 100) : 0}%`,
                background: t.gradientAccent,
                transition: 'width 400ms cubic-bezier(0.22,1,0.36,1)',
              }} />
            </div>
          </div>
          <div style={{
            width: 44, height: 44, borderRadius: 13, flexShrink: 0,
            background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
              stroke={t.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={PROVIDER_FALLBACK_ICON} />
            </svg>
          </div>
        </div>

        <SLabel text="Yayın Hesabı" />
        {tenantId ? (
          <MertcafeAccountSwitcher t={t} workspaceId={tenantId} compact />
        ) : (
          <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>Çalışma alanı seçili değil.</p>
        )}

        {/* Diğer entegrasyonlar */}
        <SLabel text="Diğer Entegrasyonlar" />
        <div style={{ ...t.surfaceGroup, marginBottom: 24 }}>
          {integrationItems.map((item, i) => (
            <div key={item.provider}>
              {i > 0 && <Divider t={t} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: item.connected ? `${item.color}12` : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                  border: `0.5px solid ${item.connected ? `${item.color}30` : t.separatorStrong}`,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke={item.connected ? item.color : t.textMuted}
                    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={PROVIDER_ICONS[item.provider] ?? PROVIDER_FALLBACK_ICON} />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, letterSpacing: '-0.01em' }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: 11.5, color: t.textTertiary, marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.connected && item.displayName ? item.displayName : item.sub}
                  </div>
                </div>
                <IntegrationStatusChip t={t} connected={item.connected} status={item.status} />
              </div>
            </div>
          ))}
        </div>

        {/* Kullanım & Plan detayı kendi ekranında — burada sadece kısayol */}
        <button
          type="button"
          onClick={() => navigate('billing')}
          className="sa-chrome-card"
          style={{
            width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 24,
            padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke={t.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, letterSpacing: '-0.01em' }}>
              Kullanım & Plan
            </div>
            <div style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 2 }}>
              Kredi, aylık kullanım ve paket detayları
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={t.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

      </div>
    </div>
  );
}

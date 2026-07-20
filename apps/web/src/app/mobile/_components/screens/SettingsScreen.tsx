'use client';
import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { MertcafeAccountSwitcher } from '../MertcafeAccountSwitcher';
import { summarizeMobileIntegrations } from '@/lib/mobile-integration-status';
import {
  MobileIntegrationProviderRow,
  MobileIntegrationsFlash,
  useIntegrationFlash,
  useMobileIntegrationConnectHandlers,
} from '../MobileIntegrationConnect';
import type { T } from '../theme-context';

function SLabel({ text }: { text: string }) {
  return <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>{text}</div>;
}

function Divider({ t }: { t: T }) {
  return <div style={{ height: '0.5px', background: t.separator, margin: '0 18px' }} />;
}

const PROVIDER_FALLBACK_ICON = 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';

export function SettingsScreen() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const publishSectionRef = useRef<HTMLDivElement>(null);
  const { message, flash } = useIntegrationFlash();

  const { data: integrationConnections = [], refetch } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.getIntegrations(),
    staleTime: 60_000,
  });
  const { items: integrationItems } = summarizeMobileIntegrations(integrationConnections);
  const connectedCount = integrationItems.filter((i) => i.connected).length;

  const {
    connectingProvider,
    bulkGoogleBusy,
    handleConnect,
    handleBulkGoogleConnect,
  } = useMobileIntegrationConnectHandlers({
    publishSectionRef,
    onFlash: flash,
  });

  return (
    <div className="sa-stack-screen" style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>

      <MobileStackHeader t={t} title="Entegrasyonlar" onBack={goBack} />

      <div style={{ padding: '20px 24px 0' }}>
        <MobileIntegrationsFlash t={t} message={message} />

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
          <button
            type="button"
            onClick={() => void refetch()}
            aria-label="Entegrasyon durumunu yenile"
            style={{
              width: 44, height: 44, borderRadius: 13, flexShrink: 0,
              background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
              stroke={t.accent} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={PROVIDER_FALLBACK_ICON} />
            </svg>
          </button>
        </div>

        <div ref={publishSectionRef}>
          <SLabel text="Yayın Hesabı" />
          {tenantId ? (
            <MertcafeAccountSwitcher t={t} workspaceId={tenantId} compact />
          ) : (
            <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>Çalışma alanı seçili değil.</p>
          )}
        </div>

        <SLabel text="Diğer Entegrasyonlar" />
        <div style={{ ...t.surfaceGroup, marginBottom: 16 }}>
          {integrationItems.map((item, i) => (
            <div key={item.provider}>
              {i > 0 && <Divider t={t} />}
              <MobileIntegrationProviderRow
                t={t}
                item={item}
                busy={connectingProvider === item.provider}
                onConnect={handleConnect}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={bulkGoogleBusy || Boolean(connectingProvider)}
          onClick={() => void handleBulkGoogleConnect()}
          className="sa-chrome-card"
          style={{
            width: '100%', cursor: bulkGoogleBusy ? 'default' : 'pointer',
            marginBottom: 24, padding: '14px 18px', minHeight: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: t.isDark ? 'rgba(96,165,250,0.08)' : 'rgba(59,130,246,0.06)',
            border: `0.5px solid ${t.isDark ? 'rgba(96,165,250,0.25)' : 'rgba(59,130,246,0.2)'}`,
            color: '#60A5FA', fontSize: 13.5, fontWeight: 700,
          }}
        >
          {bulkGoogleBusy ? 'Google’a yönlendiriliyor…' : 'Tüm Google servislerini bağla'}
        </button>

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

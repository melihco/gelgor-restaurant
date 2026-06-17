'use client';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { IcoBack } from '../Icons';
import { apiClient } from '@/lib/api-client';
import { MertcafeAccountSwitcher } from '../MertcafeAccountSwitcher';
import { PlanUsagePanel } from '../PlanUsagePanel';
import { isDebugUiMode } from '../mobile-client-config';
import { summarizeMobileIntegrations } from '@/lib/mobile-integration-status';
import type { T } from '../theme-context';

// ── Helpers ───────────────────────────────────────────────────────────────────
function SLabel({ t, text }: { t: T; text: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor,
      letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
      {text}
    </div>
  );
}

function Divider({ t }: { t: T }) {
  return <div style={{ height: '0.5px', background: t.separator, margin: '0 18px' }} />;
}

// ── Main screen ───────────────────────────────────────────────────────────────
export function SettingsScreen() {
  const { t } = useTheme();
  const { goBack } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const debugMode = isDebugUiMode();

  const { data: quotaData } = useQuery({
    queryKey: ['usage-quota'],
    queryFn: async () => { try { return await apiClient.getUsageQuota(); } catch { return null; } },
    staleTime: 60_000,
  });

  const { data: usageCost } = useQuery({
    queryKey: ['usage-cost', tenantId, quotaData?.packageSlug],
    queryFn: () => apiClient.getWorkspaceUsageCost(tenantId!, 30, quotaData?.packageSlug),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const { data: integrationConnections = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.getIntegrations(),
    staleTime: 60_000,
  });
  const { items: integrationItems } = summarizeMobileIntegrations(integrationConnections);

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>

      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px',
        borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={goBack} style={{ ...t.backBtn, width: 34, height: 34, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoBack color={t.textSecondary} />
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPrimary,
            letterSpacing: '-0.02em' }}>Entegrasyonlar</h1>
        </div>
      </div>

      <div style={{ padding: '24px 24px 0' }}>

        <SLabel t={t} text="Instagram Yayın (Mertcafe)" />
        {tenantId ? (
          <MertcafeAccountSwitcher t={t} workspaceId={tenantId} compact />
        ) : (
          <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 16 }}>Workspace seçili değil.</p>
        )}

        {/* Diğer entegrasyonlar */}
        <SLabel t={t} text="Diğer Entegrasyonlar" />
        <div style={{ ...t.surfaceGroup, marginBottom: 24 }}>
          {integrationItems.map((item, i) => (
            <div key={item.provider}>
              {i > 0 && <Divider t={t} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  border: `0.5px solid ${t.separator}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: t.textTertiary, marginTop: 1 }}>
                    {item.connected && item.displayName ? item.displayName : item.sub}
                  </div>
                </div>
                {item.connected ? (
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                    background: 'rgba(16,185,129,0.08)', color: '#10B981', fontWeight: 600 }}>Bağlı</span>
                ) : item.status === 'Expired' ? (
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                    background: 'rgba(245,158,11,0.10)', color: '#F59E0B', fontWeight: 600 }}>Yenile</span>
                ) : item.status === 'Error' ? (
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                    background: 'rgba(239,68,68,0.10)', color: '#EF4444', fontWeight: 600 }}>Hata</span>
                ) : (
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20,
                    background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                    color: t.textMuted, fontWeight: 600 }}>Bağlı değil</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <SLabel t={t} text="Kullanım & Plan" />
        <div style={{ marginBottom: 24 }}>
          <PlanUsagePanel
            quota={quotaData ?? undefined}
            wallet={usageCost?.token_wallet}
            packageSlug={quotaData?.packageSlug}
            debugMode={debugMode}
            t={t}
          />
        </div>

      </div>
    </div>
  );
}

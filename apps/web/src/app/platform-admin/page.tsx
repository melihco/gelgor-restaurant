'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Shield } from 'lucide-react';
import { BrandStudioTab } from '@/components/platform-admin/BrandStudioTab';
import { CostTab } from '@/components/platform-admin/CostTab';
import { IntegrationsTab } from '@/components/platform-admin/IntegrationsTab';
import { MissionsTab } from '@/components/platform-admin/MissionsTab';
import { OperationsTab } from '@/components/platform-admin/OperationsTab';
import { OverviewTab } from '@/components/platform-admin/OverviewTab';
import { PlatformAdminChrome } from '@/components/platform-admin/PlatformAdminChrome';
import { SlotCatalogTab } from '@/components/platform-admin/SlotCatalogTab';
import { TenantTab } from '@/components/platform-admin/TenantTab';
import { DataCanvas, PageHeader } from '@/components/platform-admin/admin-ui';
import Label from '@/tailadmin/components/form/Label';
import Input from '@/tailadmin/components/form/input/InputField';
import Button from '@/tailadmin/components/ui/button/Button';
import Badge from '@/tailadmin/components/ui/badge/Badge';
import { useActiveTenantId } from '@/hooks/useActiveTenantId';
import { apiClient } from '@/lib/api-client';
import { canAccessPlatformAdmin } from '@/lib/platform-admin-auth';
import { DEFAULT_TENANT_ID, getRequestContextHeaders } from '@/lib/runtime-config';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { CurrentUserSecurity } from '@/types';

type AdminTab =
  | 'overview'
  | 'brand'
  | 'tenant'
  | 'slots'
  | 'missions'
  | 'cost'
  | 'operations'
  | 'integrations';

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'brand', label: 'Marka Stüdyosu' },
  { id: 'tenant', label: 'Marka Snapshot' },
  { id: 'slots', label: 'Slot Kataloğu' },
  { id: 'missions', label: 'Mission & Üretim' },
  { id: 'cost', label: 'Maliyet' },
  { id: 'operations', label: 'Operasyonlar' },
  { id: 'integrations', label: 'Entegrasyonlar' },
];

async function fetchPlatformAdminSecurity(): Promise<CurrentUserSecurity | null> {
  try {
    const res = await fetch('/api/nexus-backend/security/me', {
      headers: {
        Accept: 'application/json',
        ...getRequestContextHeaders(),
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as CurrentUserSecurity;
  } catch {
    return null;
  }
}

function AccessMessage({
  title,
  description,
}: {
  title: string;
  description: React.ReactNode;
}) {
  return (
    <PlatformAdminChrome>
      <DataCanvas maxWidth="max-w-xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <Shield className="mx-auto h-10 w-10 text-error-500" />
          <h1 className="mt-4 text-xl font-semibold text-gray-800 dark:text-white/90">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </DataCanvas>
    </PlatformAdminChrome>
  );
}

export default function PlatformAdminPage() {
  const activeTenantId = useActiveTenantId();
  const storeTenantId = useWorkspaceStore((s) => s.tenantId);
  const setTenantFromSession = useWorkspaceStore((s) => s.setTenantFromSession);
  const [workspaceId, setWorkspaceId] = useState('');
  const [tab, setTab] = useState<AdminTab>('overview');
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);

  const securityQuery = useQuery({
    queryKey: ['platform-admin-security'],
    queryFn: fetchPlatformAdminSecurity,
    staleTime: 60_000,
    retry: false,
  });

  const resolvedTenantId = useMemo(() => {
    const fromSecurity = securityQuery.data?.tenantId?.trim();
    if (fromSecurity) return fromSecurity;
    if (activeTenantId?.trim()) return activeTenantId.trim();
    if (storeTenantId?.trim()) return storeTenantId.trim();
    if (DEFAULT_TENANT_ID?.trim()) return DEFAULT_TENANT_ID.trim();
    return '';
  }, [securityQuery.data?.tenantId, activeTenantId, storeTenantId]);

  useEffect(() => {
    if (!resolvedTenantId) return;
    setWorkspaceId((current) => (current === resolvedTenantId ? current : resolvedTenantId));
    setTenantFromSession(resolvedTenantId);
  }, [resolvedTenantId, setTenantFromSession]);

  const allowed = useMemo(
    () => canAccessPlatformAdmin(securityQuery.data?.permissions),
    [securityQuery.data?.permissions],
  );

  const waitingForAccessCheck =
    securityQuery.isLoading && !canAccessPlatformAdmin(null);

  const overviewQuery = useQuery({
    queryKey: ['platform-admin-overview', resolvedTenantId],
    queryFn: () => apiClient.getPlatformAdminOverview(),
    enabled: allowed && Boolean(resolvedTenantId),
    staleTime: 30_000,
    retry: false,
  });

  const tenantLabel =
    overviewQuery.data?.tenants[0]?.tenantName
    || overviewQuery.data?.tenants[0]?.brandName
    || securityQuery.data?.tenantName
    || (resolvedTenantId ? `Workspace ${resolvedTenantId.slice(0, 8)}…` : '—');

  if (waitingForAccessCheck) {
    return (
      <PlatformAdminChrome>
        <DataCanvas>
          <p className="text-sm text-gray-500 dark:text-gray-400">Yetki kontrolü…</p>
        </DataCanvas>
      </PlatformAdminChrome>
    );
  }

  if (!allowed && (securityQuery.isError || (securityQuery.isFetched && !securityQuery.data))) {
    return (
      <AccessMessage
        title="Nexus API bağlantısı yok"
        description={(
          <>
            Yetki servisi yanıt vermedi. Yerelde{' '}
            <code className="text-brand-500">cd apps/api/src/Nexus.Api && dotnet run</code> ile
            API&apos;yi başlatın (port 5050).
          </>
        )}
      />
    );
  }

  if (!allowed) {
    return (
      <AccessMessage
        title="Erişim reddedildi"
        description={(
          <>
            Platform admin için <code className="text-brand-500">users.manage</code> veya{' '}
            <code className="text-brand-500">operations.view</code> +{' '}
            <code className="text-brand-500">NEXT_PUBLIC_PLATFORM_ADMIN=true</code> gerekir.
          </>
        )}
      />
    );
  }

  if (!resolvedTenantId) {
    return (
      <PlatformAdminChrome>
        <DataCanvas>
          <p className="text-sm text-gray-500 dark:text-gray-400">Aktif tenant yükleniyor…</p>
        </DataCanvas>
      </PlatformAdminChrome>
    );
  }

  const effectiveWorkspaceId = workspaceId || resolvedTenantId;

  return (
    <PlatformAdminChrome>
      <DataCanvas>
        <PageHeader
          eyebrow="Platform Admin"
          title="Müşteri yönetimi ve operasyon"
          description="Marka metinlerini düzenleyin, mission üretimini tetikleyin, maliyeti izleyin."
          icon={Shield}
          tone="indigo"
          aside={(
            <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <div>
                <span className="text-gray-400">Operatör:</span>{' '}
                {securityQuery.data?.displayName ?? '—'}
              </div>
              <div>
                <span className="text-gray-400">Aktif tenant:</span>{' '}
                <span className="font-medium text-gray-700 dark:text-gray-200">{tenantLabel}</span>
              </div>
              <div>
                <span className="text-gray-400">Workspace:</span>{' '}
                <span className="font-mono text-xs">{effectiveWorkspaceId}</span>
              </div>
            </div>
          )}
        />

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <Label>Aktif workspace</Label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Oturumdaki tenant otomatik seçilir. Farklı bir müşteriye geçmek için UUID değiştirin.
          </p>
          <Input
            className="mt-2 font-mono text-xs"
            value={effectiveWorkspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="Tenant / workspace UUID"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <Button
              key={t.id}
              size="sm"
              variant={tab === t.id ? 'primary' : 'outline'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
          <Badge color="light" size="sm">v2</Badge>
        </div>

        {tab === 'overview' && <OverviewTab overview={overviewQuery.data} />}
        {tab === 'brand' && (
          <BrandStudioTab workspaceId={effectiveWorkspaceId} onWorkspaceIdChange={setWorkspaceId} />
        )}
        {tab === 'tenant' && (
          <TenantTab workspaceId={effectiveWorkspaceId} onWorkspaceIdChange={setWorkspaceId} />
        )}
        {tab === 'slots' && <SlotCatalogTab workspaceId={effectiveWorkspaceId} />}
        {tab === 'missions' && (
          <MissionsTab
            workspaceId={effectiveWorkspaceId}
            selectedMissionId={selectedMissionId}
            onSelectMission={setSelectedMissionId}
            onOpenCost={(missionId) => {
              setSelectedMissionId(missionId);
              setTab('cost');
            }}
          />
        )}
        {tab === 'cost' && (
          <CostTab
            workspaceId={effectiveWorkspaceId}
            selectedMissionId={selectedMissionId}
            onSelectMission={setSelectedMissionId}
          />
        )}
        {tab === 'operations' && <OperationsTab workspaceId={effectiveWorkspaceId} />}
        {tab === 'integrations' && <IntegrationsTab workspaceId={effectiveWorkspaceId} />}
      </DataCanvas>
    </PlatformAdminChrome>
  );
}

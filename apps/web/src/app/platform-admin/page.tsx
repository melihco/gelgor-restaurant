'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Shield } from 'lucide-react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { AdminHero, AdminPageShell } from '@/components/ui/admin-template';
import { BrandStudioTab } from '@/components/platform-admin/BrandStudioTab';
import { CostTab } from '@/components/platform-admin/CostTab';
import { IntegrationsTab } from '@/components/platform-admin/IntegrationsTab';
import { MissionsTab } from '@/components/platform-admin/MissionsTab';
import { OperationsTab } from '@/components/platform-admin/OperationsTab';
import { OverviewTab } from '@/components/platform-admin/OverviewTab';
import { TenantTab } from '@/components/platform-admin/TenantTab';
import { apiClient } from '@/lib/api-client';
import { canAccessPlatformAdmin } from '@/lib/platform-admin-auth';
import { useWorkspaceStore } from '@/stores/workspace-store';

type AdminTab =
  | 'overview'
  | 'brand'
  | 'tenant'
  | 'missions'
  | 'cost'
  | 'operations'
  | 'integrations';

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'brand', label: 'Marka Stüdyosu' },
  { id: 'tenant', label: 'Marka Snapshot' },
  { id: 'missions', label: 'Mission & Üretim' },
  { id: 'cost', label: 'Maliyet' },
  { id: 'operations', label: 'Operasyonlar' },
  { id: 'integrations', label: 'Entegrasyonlar' },
];

export default function PlatformAdminPage() {
  const defaultWorkspace = useWorkspaceStore((s) => s.tenantId);
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspace);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);

  const securityQuery = useQuery({
    queryKey: ['platform-admin-security'],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    staleTime: 60_000,
  });

  const overviewQuery = useQuery({
    queryKey: ['platform-admin-overview'],
    queryFn: () => apiClient.getPlatformAdminOverview(),
    enabled: canAccessPlatformAdmin(securityQuery.data?.permissions),
    staleTime: 30_000,
  });

  const allowed = useMemo(
    () => canAccessPlatformAdmin(securityQuery.data?.permissions),
    [securityQuery.data?.permissions],
  );

  const handleSelectMission = (id: string | null) => {
    setSelectedMissionId(id);
    if (id) setTab('cost');
  };

  if (securityQuery.isLoading) {
    return (
      <AdminPageShell tone="amber">
        <p className="text-white/60">Yetki kontrolü…</p>
      </AdminPageShell>
    );
  }

  if (!allowed) {
    return (
      <AdminPageShell tone="rose">
        <div className="mx-auto max-w-lg rounded-[2rem] border border-rose-400/20 bg-rose-500/5 p-8 text-center">
          <Shield className="mx-auto h-10 w-10 text-rose-300" />
          <h1 className="mt-4 text-xl font-semibold text-white">Erişim reddedildi</h1>
          <p className="mt-2 text-sm text-white/55">
            Platform admin için <code className="text-rose-200">users.manage</code> veya{' '}
            <code className="text-rose-200">operations.view</code> +{' '}
            <code className="text-rose-200">NEXT_PUBLIC_PLATFORM_ADMIN=true</code> gerekir.
          </p>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell tone="amber">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <SmartAgencyLogo variant="auto" autoBreakpoint="md" framed className="!h-8 xl:max-w-[200px]" />
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50">
          AI destekli operator platformu · v2
        </div>
      </div>

      <AdminHero
        eyebrow="Platform Admin"
        title="Müşteri yönetimi, müdahale ve maliyet"
        description="Marka metinlerini AI ile düzenleyin, mission ve üretimi manuel tetikleyin, slot bazında maliyeti izleyin."
        icon={Shield}
        tone="amber"
        aside={(
          <div className="space-y-2 text-sm text-white/60">
            <div><span className="text-white/40">Operatör:</span> {securityQuery.data?.displayName}</div>
            <div><span className="text-white/40">Workspace:</span> <span className="font-mono text-xs">{workspaceId.slice(0, 13)}…</span></div>
          </div>
        )}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Aktif workspace</span>
        <input
          className="min-w-[280px] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white outline-none focus:border-amber-400/40"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          placeholder="Tenant / workspace UUID"
        />
      </div>

      <nav className="mb-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-amber-400/50 bg-amber-400/10 text-amber-100'
                : 'border-white/10 bg-white/5 text-white/60 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewTab overview={overviewQuery.data} />}
      {tab === 'brand' && (
        <BrandStudioTab workspaceId={workspaceId} onWorkspaceIdChange={setWorkspaceId} />
      )}
      {tab === 'tenant' && (
        <TenantTab workspaceId={workspaceId} onWorkspaceIdChange={setWorkspaceId} />
      )}
      {tab === 'missions' && (
        <MissionsTab
          workspaceId={workspaceId}
          selectedMissionId={selectedMissionId}
          onSelectMission={handleSelectMission}
        />
      )}
      {tab === 'cost' && (
        <CostTab
          workspaceId={workspaceId}
          selectedMissionId={selectedMissionId}
          onSelectMission={setSelectedMissionId}
        />
      )}
      {tab === 'operations' && <OperationsTab workspaceId={workspaceId} />}
      {tab === 'integrations' && <IntegrationsTab workspaceId={workspaceId} />}
    </AdminPageShell>
  );
}

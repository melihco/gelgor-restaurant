'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Shield } from 'lucide-react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { AdminHero, AdminPageShell } from '@/components/ui/admin-template';
import { CostTab } from '@/components/platform-admin/CostTab';
import { MissionsTab } from '@/components/platform-admin/MissionsTab';
import { OverviewTab } from '@/components/platform-admin/OverviewTab';
import { TenantTab } from '@/components/platform-admin/TenantTab';
import { apiClient } from '@/lib/api-client';
import { canAccessPlatformAdmin } from '@/lib/platform-admin-auth';
import { useWorkspaceStore } from '@/stores/workspace-store';

type AdminTab = 'overview' | 'tenant' | 'missions' | 'cost';

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'overview', label: 'Genel Bakış' },
  { id: 'tenant', label: 'Müşteri / Marka' },
  { id: 'missions', label: 'Mission & Üretim' },
  { id: 'cost', label: 'Maliyet' },
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
            Platform admin yüzeyi için <code className="text-rose-200">users.manage</code> veya{' '}
            <code className="text-rose-200">operations.view</code> +{' '}
            <code className="text-rose-200">NEXT_PUBLIC_PLATFORM_ADMIN=true</code> gerekir.
          </p>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell tone="amber">
      <div className="mb-6">
        <SmartAgencyLogo variant="auto" autoBreakpoint="md" framed className="!h-8 xl:max-w-[200px]" />
      </div>

      <AdminHero
        eyebrow="Platform Admin v1"
        title="Operasyon & maliyet kontrolü"
        description="Tenant, mission ve slot bazında üretim maliyetini izleyin. Müşteri mobile'dan ayrı operator-only yüzey."
        icon={Shield}
        tone="amber"
        aside={(
          <div className="space-y-2 text-sm text-white/60">
            <div><span className="text-white/40">Kullanıcı:</span> {securityQuery.data?.displayName}</div>
            <div><span className="text-white/40">Rol:</span> {securityQuery.data?.role}</div>
            <div><span className="text-white/40">Tenant:</span> {securityQuery.data?.tenantName}</div>
          </div>
        )}
      />

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
    </AdminPageShell>
  );
}

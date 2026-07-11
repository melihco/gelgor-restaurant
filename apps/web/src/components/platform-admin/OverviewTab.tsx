'use client';

import type { PlatformAdminOverview } from '@smartagency/contracts';
import { Activity, AlertTriangle, Building2, Users } from 'lucide-react';
import { AdminAsideStat, AdminSectionTitle, AdminSurface, MetricsGrid } from '@/components/platform-admin/admin-ui';
import { formatUsd } from '@/lib/ai-cost-catalog';

export function OverviewTab({ overview }: { overview: PlatformAdminOverview | undefined }) {
  const tenant = overview?.tenants[0];
  const health = overview?.health;

  return (
    <div className="space-y-6">
      <MetricsGrid>
        <AdminAsideStat
          label="Aktif tenant"
          value={tenant?.brandName || tenant?.tenantName || '—'}
          helper={tenant?.packageName ?? undefined}
        />
        <AdminAsideStat label="Agent runs (24s)" value={health?.agentRuns24h ?? 0} />
        <AdminAsideStat label="Başarısız job (24s)" value={health?.failedExecutionJobs24h ?? 0} />
        <AdminAsideStat label="Provider fail rate" value={`${Math.round((health?.providerFailureRate ?? 0) * 100)}%`} />
      </MetricsGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSurface>
          <AdminSectionTitle
            title="Operasyon sağlığı"
            subtitle="Son 24 saat execution ve agent aktivitesi"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <StatRow icon={Activity} label="Execution jobs" value={health?.executionJobs24h ?? 0} />
            <StatRow icon={AlertTriangle} label="Failed agent runs" value={health?.failedAgentRuns24h ?? 0} />
            <StatRow icon={Users} label="Kullanıcı sayısı" value={tenant?.usersCount ?? 0} />
            <StatRow icon={Building2} label="Aktif mission" value={tenant?.activeMissionsCount ?? 0} />
          </div>
        </AdminSurface>

        <AdminSurface>
          <AdminSectionTitle title="Kullanım özeti" subtitle="Token ve paket durumu" />
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <Row label="Token (24s)" value={String(health?.tokensUsed24h ?? 0)} />
            <Row label="Artifacts" value={String(tenant?.artifactsCount ?? 0)} />
            <Row label="Paket" value={tenant?.packageName ?? '—'} />
            <Row label="Durum" value={tenant?.status ?? '—'} />
            {overview?.usage?.tokenWallet && (
              <Row
                label="Token cüzdan"
                value={`${overview.usage.tokenWallet.used ?? 0} / ${overview.usage.tokenWallet.limit ?? '∞'}`}
              />
            )}
          </div>
        </AdminSurface>
      </div>

      <AdminSurface>
        <AdminSectionTitle title="Tenant tablosu" subtitle="v1: oturum tenant'ı; v2: cross-tenant registry" count={overview?.tenants.length} />
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Marka</th>
                <th className="px-4 py-3">Paket</th>
                <th className="px-4 py-3">Artifacts</th>
                <th className="px-4 py-3">Missions</th>
                <th className="px-4 py-3">Durum</th>
              </tr>
            </thead>
            <tbody>
              {(overview?.tenants ?? []).map((t) => (
                <tr key={t.tenantId} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{t.tenantName}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.brandName || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.packageName || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.artifactsCount ?? 0}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{t.activeMissionsCount ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs dark:border-gray-700">{t.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Tahmini günlük AI maliyeti workspace usage üzerinden; kesin slot/mission kırılımı Maliyet sekmesinde.
        </p>
      </AdminSurface>
    </div>
  );
}

function StatRow({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <Icon className="h-4 w-4 text-brand-500" />
      <div>
        <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
        <div className="text-lg font-semibold text-gray-800 dark:text-white/90">{value}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0 dark:border-gray-800">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-800 dark:text-white/90">{value}</span>
    </div>
  );
}

export function formatScopeLabel(scope: string): string {
  const map: Record<string, string> = {
    mission_graph: 'Mission graph (LLM)',
    feed_slot: 'Feed slot üretimi',
    integration: 'Entegrasyon (Apify vb.)',
    gallery: 'Galeri',
    other: 'Diğer',
  };
  return map[scope] ?? scope;
}

export function CostMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div>}
    </div>
  );
}

export { formatUsd };

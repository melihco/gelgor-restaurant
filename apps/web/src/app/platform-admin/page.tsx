'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

export default function PlatformAdminPage() {
  const currentWorkspaceId = useWorkspaceStore((state) => state.tenantId);
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId);

  const overviewQuery = useQuery({
    queryKey: ['platform-admin-overview'],
    queryFn: () => apiClient.getPlatformAdminOverview(),
    staleTime: 30_000,
  });

  const brandQuery = useQuery({
    queryKey: ['production-context-snapshot', workspaceId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const overview = overviewQuery.data;
  const production = brandQuery.data;
  const brand = production?.brand;
  const visual = production?.visualContext;

  return (
    <main className="min-h-screen bg-[#07080f] px-6 py-8 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <div className="flex flex-col gap-3">
          <div className="inline-flex w-fit rounded-full border border-violet-400/25 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300">
            Platform Admin
          </div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em]">Replatform Control Surface</h1>
          <p className="max-w-3xl text-sm leading-6 text-white/60">
            Yeni admin yüzeyinin ilk sürümü. Mevcut Nexus, brand-context ve operations verilerini tek ekranda toplar;
            ileride çok-tenant listeleme, brand ekleme ve edit akışları bu yüzeyden genişletilecek.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Current Tenant" value={overview?.currentUser.tenantName ?? '—'} />
          <MetricCard label="Agent Runs 24h" value={overview?.health.agentRuns24h ?? 0} />
          <MetricCard label="Failed Jobs 24h" value={overview?.health.failedExecutionJobs24h ?? 0} />
          <MetricCard label="Users" value={overview?.tenants[0]?.usersCount ?? 0} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Tenant Overview</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                <thead className="bg-white/5 text-white/50">
                  <tr>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Brand</th>
                    <th className="px-4 py-3">Package</th>
                    <th className="px-4 py-3">Artifacts</th>
                    <th className="px-4 py-3">Missions</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.tenants ?? []).map((tenant) => (
                    <tr key={tenant.tenantId} className="border-t border-white/10">
                      <td className="px-4 py-3">{tenant.tenantName}</td>
                      <td className="px-4 py-3">{tenant.brandName || '—'}</td>
                      <td className="px-4 py-3">{tenant.packageName || '—'}</td>
                      <td className="px-4 py-3">{tenant.artifactsCount ?? 0}</td>
                      <td className="px-4 py-3">{tenant.activeMissionsCount ?? 0}</td>
                    </tr>
                  ))}
                  {!overview?.tenants?.length && (
                    <tr>
                      <td className="px-4 py-6 text-white/40" colSpan={5}>
                        Veri bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Brand Snapshot</h2>
            <div className="mt-4 flex gap-3">
              <input
                className="flex-1 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                placeholder="Workspace ID"
              />
            </div>
            <div className="mt-5 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Brand</div>
                <div className="mt-2 text-lg font-semibold">{brand?.brandName ?? '—'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Business Type</div>
                <div className="mt-2 text-sm text-white/80">{brand?.businessType ?? visual?.businessType ?? '—'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Gallery Analysis</div>
                <div className="mt-2 text-sm text-white/80">
                  {Object.keys(production?.galleryAnalysis ?? {}).length}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">AI Visual Flags</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/80">
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    enhance: {brand?.themeAi.aiPhotoEnhance ? 'on' : 'off'}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    gallery: {brand?.themeAi.aiEnhanceGallerySelected ? 'edit' : 'skip'}
                  </span>
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    adaptive: {brand?.themeAi.aiAdaptiveScene ? 'on' : 'off'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Roadmap Hooks</h2>
          <ul className="mt-4 grid gap-3 text-sm text-white/70 md:grid-cols-2">
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4">Cross-tenant tenant/brand registry endpoint</li>
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4">Create brand / bootstrap workspace flow</li>
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4">Package and AI usage override actions</li>
            <li className="rounded-2xl border border-white/10 bg-black/20 p-4">Audit log, rollout flag and deploy health widgets</li>
          </ul>
        </section>
      </div>
    </main>
  );
}

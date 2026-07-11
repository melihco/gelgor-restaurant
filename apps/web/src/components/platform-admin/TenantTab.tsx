'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';

export function TenantTab({
  workspaceId,
  onWorkspaceIdChange,
}: {
  workspaceId: string;
  onWorkspaceIdChange: (id: string) => void;
}) {
  const brandQuery = useQuery({
    queryKey: ['production-context-snapshot', workspaceId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const production = brandQuery.data;
  const brand = production?.brand;
  const visual = production?.visualContext;

  return (
    <div className="space-y-6">
      <AdminSurface>
        <AdminSectionTitle title="Workspace seçici" subtitle="v1: manuel UUID; v2: tenant registry dropdown" />
        <input
          className="w-full max-w-xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-800 dark:text-white/90 outline-none focus:border-brand-400 dark:focus:border-brand-500"
          value={workspaceId}
          onChange={(e) => onWorkspaceIdChange(e.target.value)}
          placeholder="Workspace / tenant UUID"
        />
      </AdminSurface>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSurface>
          <AdminSectionTitle title="Marka kimliği" />
          {brandQuery.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Yükleniyor…</p>}
          <div className="grid gap-3">
            <Field label="Marka" value={brand?.brandName ?? '—'} />
            <Field label="Business type" value={brand?.businessType ?? visual?.businessType ?? '—'} />
            <Field label="Galeri öğeleri" value={String(brand?.gallery?.length ?? 0)} />
            <Field label="Açıklama" value={(brand?.description ?? '').slice(0, 120) || '—'} />
          </div>
        </AdminSurface>

        <AdminSurface>
          <AdminSectionTitle title="Üretim bağlamı" />
          <div className="grid gap-3">
            <Field label="Galeri analizi alanları" value={String(Object.keys(production?.galleryAnalysis ?? {}).length)} />
            <Field label="Referans görseller" value={String(visual?.referenceImageUrls?.length ?? 0)} />
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] p-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">AI görsel bayrakları</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Flag label="Photo enhance" on={Boolean(brand?.themeAi?.aiPhotoEnhance)} />
                <Flag label="Gallery edit" on={Boolean(brand?.themeAi?.aiEnhanceGallerySelected)} />
                <Flag label="Adaptive scene" on={Boolean(brand?.themeAi?.aiAdaptiveScene)} />
              </div>
            </div>
          </div>
        </AdminSurface>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] p-4">
      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">{value}</div>
    </div>
  );
}

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1 ${on ? 'border-success-200 text-success-600 dark:border-success-500/30 dark:text-success-500' : 'border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400'}`}>
      {label}: {on ? 'on' : 'off'}
    </span>
  );
}

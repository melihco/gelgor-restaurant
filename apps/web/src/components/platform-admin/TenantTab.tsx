'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import {
  listAdminTenants,
  reactivateAdminTenant,
  suspendAdminTenant,
} from '@/lib/platform-admin-registry-client';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';
import Button from '@/tailadmin/components/ui/button/Button';

export function TenantTab({
  workspaceId,
  onWorkspaceIdChange,
}: {
  workspaceId: string;
  onWorkspaceIdChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const registryQuery = useQuery({
    queryKey: ['admin-tenant-registry', search],
    queryFn: async () => {
      const result = await listAdminTenants({
        q: search.trim() || undefined,
        limit: 100,
      });
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    staleTime: 30_000,
  });

  const brandQuery = useQuery({
    queryKey: ['production-context-snapshot', workspaceId],
    queryFn: () => apiClient.getProductionBrandContextSnapshot(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const selectedTenant = useMemo(() => {
    const items = registryQuery.data?.items ?? [];
    return items.find((t) => t.id === workspaceId) ?? null;
  }, [registryQuery.data?.items, workspaceId]);

  const lifecycleMutation = useMutation({
    mutationFn: async (action: 'suspend' | 'reactivate') => {
      const result = action === 'suspend'
        ? await suspendAdminTenant(workspaceId)
        : await reactivateAdminTenant(workspaceId);
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
    onSuccess: async (_data, action) => {
      setActionMessage(action === 'suspend' ? 'Tenant askıya alındı.' : 'Tenant yeniden etkinleştirildi.');
      await queryClient.invalidateQueries({ queryKey: ['admin-tenant-registry'] });
    },
    onError: (err) => {
      setActionMessage(err instanceof Error ? err.message : 'İşlem başarısız');
    },
  });

  const production = brandQuery.data;
  const brand = production?.brand;
  const visual = production?.visualContext;
  const tenants = registryQuery.data?.items ?? [];

  return (
    <div className="space-y-6">
      <AdminSurface>
        <AdminSectionTitle
          title="Workspace seçici"
          subtitle="Nexus tenant registry — arama veya UUID"
          count={registryQuery.data?.total}
        />
        <div className="grid gap-3 max-w-xl">
          <input
            className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-800 dark:text-white/90 outline-none focus:border-brand-400 dark:focus:border-brand-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tenant adı / slug / sektör ara…"
          />
          <select
            className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-800 dark:text-white/90 outline-none focus:border-brand-400 dark:focus:border-brand-500"
            value={tenants.some((t) => t.id === workspaceId) ? workspaceId : ''}
            onChange={(e) => {
              if (e.target.value) onWorkspaceIdChange(e.target.value);
            }}
          >
            <option value="">
              {registryQuery.isLoading ? 'Yükleniyor…' : 'Registry’den seç…'}
            </option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.industry ? ` · ${t.industry}` : ''}
                {t.is_active === false ? ' (askıda)' : ''}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-4 py-3 font-mono text-xs text-gray-800 dark:text-white/90 outline-none focus:border-brand-400 dark:focus:border-brand-500"
            value={workspaceId}
            onChange={(e) => onWorkspaceIdChange(e.target.value)}
            placeholder="Workspace / tenant UUID"
          />
          {registryQuery.isError && (
            <p className="text-xs text-error-500">
              Registry yüklenemedi: {registryQuery.error instanceof Error ? registryQuery.error.message : 'hata'}
            </p>
          )}
        </div>
      </AdminSurface>

      {workspaceId && (
        <AdminSurface>
          <AdminSectionTitle title="Tenant yaşam döngüsü" subtitle="Suspend / reactivate (Nexus + Python mirror)" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {selectedTenant
                ? (
                  <>
                    <span className="font-medium text-gray-800 dark:text-white/90">{selectedTenant.name}</span>
                    {' · '}
                    {selectedTenant.plan || 'plan yok'}
                    {' · '}
                    {selectedTenant.is_active === false ? 'askıda' : 'aktif'}
                  </>
                )
                : (
                  <span className="font-mono text-xs">{workspaceId}</span>
                )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!workspaceId || lifecycleMutation.isPending}
              onClick={() => lifecycleMutation.mutate('suspend')}
            >
              Askıya al
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!workspaceId || lifecycleMutation.isPending}
              onClick={() => lifecycleMutation.mutate('reactivate')}
            >
              Yeniden etkinleştir
            </Button>
          </div>
          {actionMessage && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{actionMessage}</p>
          )}
        </AdminSurface>
      )}

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

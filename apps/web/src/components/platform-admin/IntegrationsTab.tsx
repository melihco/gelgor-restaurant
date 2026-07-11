'use client';

import { useQuery } from '@tanstack/react-query';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';
import { fetchAdminIntegrations } from '@/lib/platform-admin-actions-client';

export function IntegrationsTab({ workspaceId }: { workspaceId: string }) {
  const query = useQuery({
    queryKey: ['admin-integrations', workspaceId],
    queryFn: () => fetchAdminIntegrations(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
  });

  const items = query.data ?? [];

  return (
    <div className="space-y-6">
      <AdminSurface>
        <AdminSectionTitle
          title="Entegrasyonlar"
          subtitle="Nexus bağlantıları — oturum tenant'ı ile sınırlı; farklı workspace için header override gerekebilir"
          count={items.length}
        />
        {query.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Yükleniyor…</p>}
        <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.03] text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Hesap</th>
                <th className="px-4 py-3">Son senkron</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-gray-200 dark:border-gray-800">
                  <td className="px-4 py-3 font-medium text-gray-800 dark:text-white/90">{item.provider}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      item.status === 'Connected'
                        ? 'border-success-200 text-success-600 dark:border-success-500/30 dark:text-success-500'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.displayName ?? item.accountId ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {item.lastHealthCheck ? String(item.lastHealthCheck).slice(0, 19) : '—'}
                  </td>
                </tr>
              ))}
              {!query.isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Bağlı entegrasyon yok veya oturum tenant'ı eşleşmiyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          Meta OAuth, Google Ads ve Canva yönetimi için desk Integrations sayfasını kullanın; v2'de buraya taşınacak.
        </p>
      </AdminSurface>
    </div>
  );
}

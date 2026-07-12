'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, RefreshCw, Save, Sparkles } from 'lucide-react';
import {
  AdminSectionTitle,
  AdminSurface,
  EmptyState,
  LoadingSkeleton,
} from '@/components/platform-admin/admin-ui';
import Badge from '@/tailadmin/components/ui/badge/Badge';
import Button from '@/tailadmin/components/ui/button/Button';
import type { ProductionSlotDefinition } from '@/lib/production-slot-catalog';
import {
  bootstrapAdminTenantSlots,
  fetchAdminCatalogSectors,
  fetchAdminSectorSlots,
  fetchAdminTenantSlotAssignments,
  saveAdminTenantSlotAssignments,
} from '@/lib/platform-admin-slot-catalog-client';

const FORMAT_COLORS: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'light'> = {
  post: 'primary',
  story: 'success',
  reel: 'warning',
  carousel: 'info',
};

interface SlotRowState {
  slot_key: string;
  enabled: boolean;
  priority: number;
  assignment_source?: string;
}

export function SlotCatalogTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [sectorId, setSectorId] = useState('beach_club');
  const [rows, setRows] = useState<SlotRowState[]>([]);
  const [status, setStatus] = useState('');
  const [dirty, setDirty] = useState(false);

  const sectorsQuery = useQuery({
    queryKey: ['admin-slot-sectors'],
    queryFn: fetchAdminCatalogSectors,
    staleTime: 120_000,
  });

  const slotsQuery = useQuery({
    queryKey: ['admin-sector-slots', sectorId],
    queryFn: () => fetchAdminSectorSlots(sectorId),
    enabled: Boolean(sectorId),
    staleTime: 60_000,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['admin-tenant-slot-assignments', workspaceId],
    queryFn: () => fetchAdminTenantSlotAssignments(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 15_000,
  });

  const assignmentMap = useMemo(() => {
    const map = new Map<string, { enabled: boolean; priority: number; source?: string }>();
    for (const a of assignmentsQuery.data ?? []) {
      map.set(a.slot_key, {
        enabled: a.enabled,
        priority: a.priority,
        source: a.assignment_source,
      });
    }
    return map;
  }, [assignmentsQuery.data]);

  const mergeRows = useCallback(
    (slots: ProductionSlotDefinition[]) => {
      return slots.map((slot) => {
        const existing = assignmentMap.get(slot.slot_key);
        return {
          slot_key: slot.slot_key,
          enabled: existing?.enabled ?? false,
          priority: existing?.priority ?? slot.sort_order,
          assignment_source: existing?.source,
        };
      });
    },
    [assignmentMap],
  );

  useEffect(() => {
    if (!slotsQuery.data) return;
    setRows(mergeRows(slotsQuery.data));
    setDirty(false);
  }, [slotsQuery.data, mergeRows]);

  const bootstrapMutation = useMutation({
    mutationFn: () => bootstrapAdminTenantSlots(workspaceId, sectorId),
    onSuccess: async (result) => {
      setStatus(
        `Bootstrap OK — sektör ${result.sector_id}: ${result.created} yeni, `
        + `${result.updated} güncellendi, ${result.enabled_count} aktif slot.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['admin-tenant-slot-assignments', workspaceId] });
    },
    onError: (err: Error) => setStatus(`Bootstrap hata: ${err.message}`),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveAdminTenantSlotAssignments(
        workspaceId,
        rows.map((row) => ({
          slot_key: row.slot_key,
          enabled: row.enabled,
          priority: row.priority,
          assignment_source: 'operator' as const,
        })),
      ),
    onSuccess: async () => {
      setStatus('Atamalar kaydedildi.');
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-tenant-slot-assignments', workspaceId] });
    },
    onError: (err: Error) => setStatus(`Kayıt hata: ${err.message}`),
  });

  const enabledCount = rows.filter((r) => r.enabled).length;
  const slots = slotsQuery.data ?? [];
  const slotByKey = useMemo(
    () => new Map(slots.map((s) => [s.slot_key, s])),
    [slots],
  );

  function toggleSlot(slotKey: string) {
    setRows((prev) =>
      prev.map((r) => (r.slot_key === slotKey ? { ...r, enabled: !r.enabled } : r)),
    );
    setDirty(true);
  }

  function enableAllDefaults() {
    setRows((prev) =>
      prev.map((r) => {
        const slot = slotByKey.get(r.slot_key);
        return slot?.enabled_by_default ? { ...r, enabled: true } : r;
      }),
    );
    setDirty(true);
  }

  function disableAll() {
    setRows((prev) => prev.map((r) => ({ ...r, enabled: false })));
    setDirty(true);
  }

  const busy = bootstrapMutation.isPending || saveMutation.isPending;

  return (
    <div className="space-y-6">
      <AdminSurface>
        <AdminSectionTitle
          title="Slot kataloğu"
          subtitle="Sektör slot tanımları ve marka bazlı atama. Üretim hattı Faz 5'te bağlanacak; şimdi operatör ataması."
          action={(
            <Badge color="light" size="sm">
              {enabledCount}
              /
              {slots.length || '—'}
              {' '}
              aktif
            </Badge>
          )}
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Workspace:
          {' '}
          <span className="font-mono">{workspaceId}</span>
          . Fal şablon galerisi (
          <code className="text-brand-500">brand_design_templates</code>
          ) marka vibe ile ayrı üretilir; slot
          {' '}
          <code className="text-brand-500">design_template_type</code>
          {' '}
          köprüsünü tanımlar.
        </p>
      </AdminSurface>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px]">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Sektör</label>
          <select
            className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-800 dark:bg-white/[0.02] dark:text-white/90"
            value={sectorId}
            onChange={(e) => setSectorId(e.target.value)}
            disabled={sectorsQuery.isLoading}
          >
            {(sectorsQuery.data ?? []).map((s) => (
              <option key={s.sector_id} value={s.sector_id}>
                {s.label_tr}
                {' '}
                (
                {s.sector_id}
                )
              </option>
            ))}
          </select>
        </div>

        <Button
          size="sm"
          variant="outline"
          disabled={busy || !workspaceId}
          onClick={() => bootstrapMutation.mutate()}
        >
          {bootstrapMutation.isPending
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            : <Sparkles className="mr-1 h-4 w-4" />}
          Sektör varsayılanlarını ata
        </Button>

        <Button size="sm" variant="outline" disabled={busy || !slots.length} onClick={enableAllDefaults}>
          Varsayılanları aç
        </Button>

        <Button size="sm" variant="outline" disabled={busy || !slots.length} onClick={disableAll}>
          Tümünü kapat
        </Button>

        <Button
          size="sm"
          variant="primary"
          disabled={busy || !dirty || !workspaceId}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            : <Save className="mr-1 h-4 w-4" />}
          Kaydet
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['admin-tenant-slot-assignments', workspaceId] });
            void queryClient.invalidateQueries({ queryKey: ['admin-sector-slots', sectorId] });
          }}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Yenile
        </Button>
      </div>

      {status && (
        <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-300">
          {status}
        </p>
      )}

      <AdminSurface padding="none">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <AdminSectionTitle
            title={`${sectorsQuery.data?.find((s) => s.sector_id === sectorId)?.label_tr ?? sectorId} slotları`}
            count={slots.length}
          />
        </div>

        {slotsQuery.isLoading && (
          <div className="m-6">
            <LoadingSkeleton label="Slotlar yükleniyor…" />
          </div>
        )}

        {!slotsQuery.isLoading && slots.length === 0 && (
          <div className="m-6">
            <EmptyState
              title="Slot bulunamadı"
              description="Migration ve seed çalıştırıldı mı? backend/scripts/seed_production_slot_catalog.py"
            />
          </div>
        )}

        {!slotsQuery.isLoading && slots.length > 0 && (
          <div className="divide-y divide-gray-100 dark:divide-gray-800/80">
            {rows.map((row) => {
              const slot = slotByKey.get(row.slot_key);
              if (!slot) return null;
              const fmtColor = FORMAT_COLORS[slot.format] ?? 'light';
              return (
                <label
                  key={row.slot_key}
                  className="flex cursor-pointer items-start gap-4 px-6 py-4 transition hover:bg-gray-50/80 dark:hover:bg-white/[0.02]"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                    checked={row.enabled}
                    onChange={() => toggleSlot(row.slot_key)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        {slot.label_tr}
                      </span>
                      <Badge color={fmtColor} size="sm">{slot.format}</Badge>
                      <Badge color="light" size="sm">{slot.design_template_type}</Badge>
                      {slot.enabled_by_default && (
                        <Badge color="success" size="sm">varsayılan</Badge>
                      )}
                      {row.assignment_source && (
                        <Badge color="light" size="sm">{row.assignment_source}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {slot.label_en}
                      {' · '}
                      {slot.pipeline}
                      {' · '}
                      <span className="font-mono">{slot.slot_key}</span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-400">
                    P
                    {row.priority}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </AdminSurface>

      {assignmentsQuery.data && assignmentsQuery.data.length > 0 && (
        <AdminSurface>
          <AdminSectionTitle
            title="Tüm atamalar (workspace)"
            count={assignmentsQuery.data.filter((a) => a.enabled).length}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {assignmentsQuery.data
              .filter((a) => a.enabled)
              .slice(0, 24)
              .map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300"
                >
                  <Check className="h-3 w-3 text-success-500" />
                  {a.slot?.label_tr ?? a.slot_key}
                </span>
              ))}
          </div>
        </AdminSurface>
      )}
    </div>
  );
}

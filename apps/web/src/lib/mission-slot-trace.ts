/**
 * Customer Mission Hub — per-slot retry + spend + stuck reason.
 * Tenant-agnostic: join factory attempts with cost rollups.
 */
import { formatUsdCompact } from '@/lib/ai-cost-catalog';
import type { MissionSlotCostRollup } from '@/lib/production-cost-types';

export type SlotTraceCostLike = Pick<
  MissionSlotCostRollup,
  'total_usd' | 'slot_key'
> & {
  idea_index?: number | null;
  slot_role?: string | null;
};

export type SlotTraceFactoryLike = {
  ideaIndex: number;
  slotRole: string;
  attempts?: number | null;
  maxAttempts?: number | null;
  lastError?: string | null;
  status?: string | null;
};

export function matchSlotCostUsd(
  costs: SlotTraceCostLike[] | null | undefined,
  ideaIndex: number | null | undefined,
  slotRole: string | null | undefined,
): number {
  if (!costs?.length) return 0;
  const role = String(slotRole ?? '').trim();
  const idx = typeof ideaIndex === 'number' && Number.isFinite(ideaIndex) ? ideaIndex : null;
  const exact = costs.find((row) => row.idea_index === idx && String(row.slot_role ?? '') === role);
  if (exact && Number.isFinite(exact.total_usd)) return Math.max(0, exact.total_usd);
  if (idx != null && role) {
    const key = `${idx}::${role}`;
    const byKey = costs.find((row) => row.slot_key === key);
    if (byKey && Number.isFinite(byKey.total_usd)) return Math.max(0, byKey.total_usd);
  }
  return 0;
}

export function customerSlotRetryLabel(
  attempts: number | null | undefined,
  maxAttempts: number | null | undefined,
): string {
  const max = Math.max(1, Math.floor(Number(maxAttempts) || 3));
  const n = Math.max(0, Math.floor(Number(attempts) || 0));
  return `deneme ${n}/${max}`;
}

export function customerSlotBlockLabel(input: {
  status?: string | null;
  lastError?: string | null;
}): string | null {
  const err = String(input.lastError ?? '').toLowerCase();
  const st = String(input.status ?? '').toLowerCase();
  if (err.includes('skip-no-fal') || err.includes('reel paused')) {
    return 'Reel kapalı';
  }
  if (
    err.includes('billing')
    || err.includes('kota')
    || err.includes('quota')
    || err.includes('exhausted balance')
  ) {
    return 'Kota kapalı';
  }
  if (st === 'exhausted' || st === 'failed') {
    if (err.includes('galeri') || err.includes('paket yok') || err.includes('foto')) {
      return 'Foto seçilemedi';
    }
    return 'Durdu';
  }
  return null;
}

export function formatCustomerSlotTraceLine(input: {
  attempts?: number | null;
  maxAttempts?: number | null;
  costUsd?: number | null;
  status?: string | null;
  lastError?: string | null;
}): string {
  const retry = customerSlotRetryLabel(input.attempts, input.maxAttempts);
  const spent = formatUsdCompact(Number(input.costUsd) || 0);
  const block = customerSlotBlockLabel(input);
  return block ? `${retry} · ${spent} · ${block}` : `${retry} · ${spent}`;
}

export function lookupFactorySlotTrace(
  slots: SlotTraceFactoryLike[] | null | undefined,
  ideaIndex: number | null | undefined,
  slotRole: string | null | undefined,
): SlotTraceFactoryLike | null {
  if (!slots?.length) return null;
  const role = String(slotRole ?? '');
  const idx = typeof ideaIndex === 'number' ? ideaIndex : null;
  return slots.find((row) => row.ideaIndex === idx && row.slotRole === role) ?? null;
}

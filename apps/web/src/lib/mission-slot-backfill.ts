/**
 * Mission slot backfill — detect manifest gaps after a production run
 * and re-queue only missing / failed slots (not the full 7-pack).
 */
import type { ManifestProductionQueueItem } from '@/lib/auto-produce/build-production-queue';
import type { ProductionSlotRole } from '@/lib/mission-production-manifest';

export type ProductionRunResultRow = {
  id?: string;
  title: string;
  imageUrl: string;
  error?: string;
  publishReady?: boolean;
  rendering?: boolean;
  metadata?: Record<string, unknown>;
};

export function missionSlotRunKey(
  ideaIndex: number,
  role: string,
): string {
  return `${ideaIndex}:${role}`;
}

function rowMatchesQueueItem(
  row: ProductionRunResultRow,
  item: ManifestProductionQueueItem,
): boolean {
  const meta = row.metadata ?? {};
  const ideaIdx = meta.idea_index ?? meta.ideaIndex;
  const role = String(meta.production_role ?? meta.productionRole ?? '');
  return (
    Number(ideaIdx) === item.ideaIndex
    && role === item.assignment.slot_role
  );
}

/** Slots that still need a backfill pass (missing, failed, or not publish-ready). */
export function findMissionSlotBackfillItems(
  queue: ManifestProductionQueueItem[],
  results: ProductionRunResultRow[],
): ManifestProductionQueueItem[] {
  if (!queue.length) return [];

  return queue.filter((item) => {
    const rows = results.filter((r) => rowMatchesQueueItem(r, item));
    if (rows.length === 0) return true;

    const hasRendering = rows.some((r) => r.rendering === true && r.id);
    if (hasRendering) return false;

    const hasReady = rows.some(
      (r) => Boolean(r.id) && !r.error && r.publishReady === true,
    );
    if (hasReady) return false;

    const allFailed = rows.every((r) => !r.id || r.error);
    return allFailed || !hasReady;
  });
}

export function backfillRolesFromItems(
  items: ManifestProductionQueueItem[],
): ProductionSlotRole[] {
  const roles = new Set<ProductionSlotRole>();
  for (const item of items) {
    roles.add(item.assignment.slot_role);
  }
  return [...roles];
}

export function filterQueueForBackfill(
  queue: ManifestProductionQueueItem[],
  backfillItems: ManifestProductionQueueItem[],
): ManifestProductionQueueItem[] {
  if (!backfillItems.length) return [];
  const keys = new Set(
    backfillItems.map((i) => missionSlotRunKey(i.ideaIndex, i.assignment.slot_role)),
  );
  return queue.filter((item) =>
    keys.has(missionSlotRunKey(item.ideaIndex, item.assignment.slot_role)),
  );
}

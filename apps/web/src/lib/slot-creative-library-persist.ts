/**
 * Helpers to load / persist brand×slot creative briefs around template-library gen.
 */

import {
  mergeSlotCreativeIntoCustomization,
  parseSlotCreativeCustomization,
  seedSlotCreativeBrief,
  type SlotCreativeCustomization,
} from '@/lib/slot-creative-customization';
import {
  fetchTenantSlotAssignments,
  upsertTenantSlotAssignments,
  type TenantSlotAssignment,
} from '@/lib/production-slot-catalog';

export type SlotCreativeSeedContext = {
  brandName: string;
  location?: string;
  visualDna?: string;
  brandTone?: string;
};

/** Map catalog_slot_key → raw customization for engine input. */
export function slotCreativeByKeyFromAssignments(
  assignments: TenantSlotAssignment[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of assignments) {
    if (!a.slot_key) continue;
    if (a.customization && typeof a.customization === 'object') {
      out[a.slot_key] = a.customization;
    }
  }
  return out;
}

export async function loadSlotCreativeByKey(
  workspaceId: string,
): Promise<{ byKey: Record<string, unknown>; assignments: TenantSlotAssignment[] }> {
  const assignments = await fetchTenantSlotAssignments(workspaceId).catch(() => []);
  return {
    byKey: slotCreativeByKeyFromAssignments(assignments),
    assignments,
  };
}

/**
 * Seed empty assignment.customization for every enabled slot.
 * Operator briefs are never overwritten. Idempotent for already-seeded rows.
 */
export function buildEmptySlotCreativeUpserts(
  assignments: TenantSlotAssignment[],
  seedCtx: SlotCreativeSeedContext,
): Array<{
  slot_key: string;
  enabled: boolean;
  priority: number;
  assignment_source: 'operator' | 'onboarding' | 'auto_default';
  customization: Record<string, unknown>;
}> {
  const upserts: Array<{
    slot_key: string;
    enabled: boolean;
    priority: number;
    assignment_source: 'operator' | 'onboarding' | 'auto_default';
    customization: Record<string, unknown>;
  }> = [];

  for (const a of assignments) {
    if (!a.enabled || !a.slot_key) continue;
    if (parseSlotCreativeCustomization(a.customization)) continue;

    const slot = a.slot;
    const brief = seedSlotCreativeBrief({
      brandName: seedCtx.brandName,
      location: seedCtx.location,
      visualDna: seedCtx.visualDna,
      brandTone: seedCtx.brandTone,
      slotName: slot?.label_tr || slot?.label_en || a.slot_key,
      slotKey: a.slot_key,
      templateType: slot?.design_template_type || 'campaign_announcement',
      format: slot?.format || 'post',
      falUseCase: typeof slot?.prompt_pack?.fal_use_case === 'string'
        ? String(slot.prompt_pack.fal_use_case)
        : typeof slot?.prompt_pack?.use_case === 'string'
          ? String(slot.prompt_pack.use_case)
          : null,
      seedSource: 'auto_onboarding',
    });

    upserts.push({
      slot_key: a.slot_key,
      enabled: a.enabled,
      priority: a.priority ?? 100,
      assignment_source: (a.assignment_source as 'operator' | 'onboarding' | 'auto_default')
        ?? 'auto_default',
      customization: mergeSlotCreativeIntoCustomization(a.customization ?? null, brief),
    });
  }

  return upserts;
}

/**
 * Fill missing brand×slot customization, then reload byKey for library gen.
 */
export async function ensureSlotCreativeBriefsForAssignments(
  workspaceId: string,
  seedCtx: SlotCreativeSeedContext,
  existingAssignments?: TenantSlotAssignment[],
): Promise<{
  byKey: Record<string, unknown>;
  assignments: TenantSlotAssignment[];
  seededCount: number;
}> {
  const assignments = existingAssignments
    ?? await fetchTenantSlotAssignments(workspaceId).catch(() => []);
  const upserts = buildEmptySlotCreativeUpserts(assignments, seedCtx);
  let seededCount = 0;
  if (upserts.length > 0) {
    const saved = await upsertTenantSlotAssignments(workspaceId, upserts);
    seededCount = saved.length;
  }
  const refreshed = seededCount > 0
    ? await fetchTenantSlotAssignments(workspaceId).catch(() => assignments)
    : assignments;
  return {
    byKey: slotCreativeByKeyFromAssignments(refreshed),
    assignments: refreshed,
    seededCount,
  };
}

/**
 * Persist slot_creative_brief from generated templates onto tenant assignments.
 * Preserves enabled/priority; merges creative fields into customization.
 * Never overwrites operator seed_source briefs.
 */
export async function persistSlotCreativeBriefsFromTemplates(
  workspaceId: string,
  templates: Array<{
    catalog_slot_key?: string | null;
    design_spec?: { slot_creative_brief?: SlotCreativeCustomization | null } | null;
  }>,
  existingAssignments: TenantSlotAssignment[],
): Promise<number> {
  const byKey = new Map(existingAssignments.map((a) => [a.slot_key, a]));
  const upserts: Array<{
    slot_key: string;
    enabled: boolean;
    priority: number;
    assignment_source: 'operator' | 'onboarding' | 'auto_default';
    customization: Record<string, unknown>;
  }> = [];

  for (const t of templates) {
    const key = String(t.catalog_slot_key ?? '').trim();
    const brief = parseSlotCreativeCustomization(t.design_spec?.slot_creative_brief);
    if (!key || !brief) continue;

    const existing = byKey.get(key);
    const existingBrief = parseSlotCreativeCustomization(existing?.customization);
    if (existingBrief?.seed_source === 'operator') continue;

    const customization = mergeSlotCreativeIntoCustomization(
      existing?.customization ?? null,
      brief,
    );
    upserts.push({
      slot_key: key,
      enabled: existing?.enabled ?? true,
      priority: existing?.priority ?? 100,
      assignment_source: (existing?.assignment_source as 'operator' | 'onboarding' | 'auto_default')
        ?? 'auto_default',
      customization,
    });
  }

  if (upserts.length === 0) return 0;
  const saved = await upsertTenantSlotAssignments(workspaceId, upserts);
  return saved.length;
}

/**
 * Copy assignment.customization → design_spec.slot_creative_brief on keyed shells
 * that are missing a purpose brief. Enables hard-pin without regenerating the library.
 * Merges into existing design_spec (PATCH replaces the column).
 */
export async function stampAssignmentBriefsOntoKeyedTemplates(
  workspaceId: string,
  templates: Array<{
    id: string;
    status?: string | null;
    catalog_slot_key?: string | null;
    design_spec?: Record<string, unknown> | null;
  }>,
  assignments: TenantSlotAssignment[],
): Promise<{ stamped: number }> {
  const briefByKey = new Map<string, SlotCreativeCustomization>();
  for (const a of assignments) {
    if (!a.enabled || !a.slot_key) continue;
    const brief = parseSlotCreativeCustomization(a.customization);
    if (brief) briefByKey.set(a.slot_key, brief);
  }
  if (briefByKey.size === 0) return { stamped: 0 };

  const { fetchCrewBackendJson } = await import('@/lib/crew-proxy');
  let stamped = 0;
  for (const t of templates) {
    const status = String(t.status ?? 'active').toLowerCase();
    if (status === 'archived') continue;
    const key = String(t.catalog_slot_key ?? '').trim();
    if (!key || !t.id) continue;
    if (parseSlotCreativeCustomization(t.design_spec?.slot_creative_brief)) continue;
    const brief = briefByKey.get(key);
    if (!brief) continue;

    const mergedSpec = {
      ...(t.design_spec && typeof t.design_spec === 'object' ? t.design_spec : {}),
      slot_creative_brief: brief,
    };
    const res = await fetchCrewBackendJson(
      `/api/v1/design-templates/${workspaceId}/${t.id}`,
      {
        workspaceId,
        method: 'PATCH',
        timeoutMs: 12_000,
        body: { design_spec: mergedSpec },
      },
    ).catch(() => ({ ok: false as const }));
    if (res.ok) stamped += 1;
  }
  return { stamped };
}

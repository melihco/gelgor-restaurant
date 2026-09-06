/**
 * Multi-tenant repair: revive an archived row for the same catalog_slot_key.
 * Never copy another slot's shell — missing key means no pack.
 */
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import {
  invalidateDesignTemplateCache,
  type BrandDesignTemplateRecord,
} from '@/lib/brand-design-template-matcher';
import type { BrandActiveSlot } from '@/lib/brand-active-slot-resolver';
import {
  seedSlotCreativeBrief,
  type SlotCreativeCustomization,
} from '@/lib/slot-creative-customization';
import {
  slotFormatToDesignTemplateFormat,
  type DesignTemplateFormat,
} from '@/lib/brand-design-template-presets';

export interface KeyedTemplateClonePlan {
  catalogSlotKey: string;
  templateType: string;
  templateName: string;
  format: DesignTemplateFormat;
  thumbnailUrl: string | null;
  designSpec: Record<string, unknown>;
  donorId: string;
  donorSource: 'archived_same_key';
}

export interface KeyedTemplateBrandSeed {
  brandName?: string;
  location?: string;
  visualDna?: string;
  brandTone?: string;
}

function slotFormatForTemplate(slotFormat: string): DesignTemplateFormat {
  return slotFormatToDesignTemplateFormat(slotFormat);
}

function purposeBriefForSlot(input: {
  slot: Pick<BrandActiveSlot, 'slotKey' | 'format' | 'designTemplateType' | 'labelTr'>;
  brandSeed?: KeyedTemplateBrandSeed;
  briefByKey?: Map<string, SlotCreativeCustomization>;
}): SlotCreativeCustomization {
  const fromAssignment = input.briefByKey?.get(input.slot.slotKey);
  if (fromAssignment) return fromAssignment;
  return seedSlotCreativeBrief({
    brandName: input.brandSeed?.brandName || 'Brand',
    location: input.brandSeed?.location,
    visualDna: input.brandSeed?.visualDna,
    brandTone: input.brandSeed?.brandTone,
    slotName: input.slot.labelTr || input.slot.slotKey,
    slotKey: input.slot.slotKey,
    templateType: input.slot.designTemplateType || 'campaign_announcement',
    format: input.slot.format,
    seedSource: 'auto_template_gen',
  });
}

function designSpecFromDonor(
  donor: BrandDesignTemplateRecord,
  purposeBrief: SlotCreativeCustomization,
  cloneReason: string,
): Record<string, unknown> {
  const base =
    donor.design_spec && typeof donor.design_spec === 'object'
      ? { ...donor.design_spec }
      : {};
  // Never keep the donor's slot-specific purpose brief — target slot gets its own.
  delete base.slot_creative_brief;
  return {
    ...base,
    slot_creative_brief: purposeBrief,
    cloned_from_template_id: donor.id,
    clone_reason: cloneReason,
  };
}

export function planKeyedDesignTemplateClones(input: {
  enabledSlots: Array<Pick<BrandActiveSlot, 'slotKey' | 'format' | 'designTemplateType' | 'labelTr'>>;
  templates: BrandDesignTemplateRecord[];
  /** Include archived rows as donors (same-key revive). */
  archivedTemplates?: BrandDesignTemplateRecord[];
  maxClones?: number;
  brandSeed?: KeyedTemplateBrandSeed;
  briefByKey?: Map<string, SlotCreativeCustomization>;
}): KeyedTemplateClonePlan[] {
  const maxClones = Math.max(0, Math.min(24, input.maxClones ?? 12));
  const active = input.templates.filter((t) => {
    const st = String(t.status ?? 'active').toLowerCase();
    return st === 'active' || st === 'approved';
  });
  const keyedActive = new Set(
    active
      .map((t) => String(t.catalog_slot_key ?? '').trim())
      .filter(Boolean),
  );
  const archived = input.archivedTemplates ?? [];

  const plans: KeyedTemplateClonePlan[] = [];
  for (const slot of input.enabledSlots) {
    if (plans.length >= maxClones) break;
    const key = String(slot.slotKey ?? '').trim();
    if (!key || keyedActive.has(key)) continue;

    const purposeBrief = purposeBriefForSlot({
      slot,
      brandSeed: input.brandSeed,
      briefByKey: input.briefByKey,
    });

    const archivedSame = archived.find(
      (t) => String(t.catalog_slot_key ?? '').trim() === key,
    );
    if (archivedSame) {
      plans.push({
        catalogSlotKey: key,
        templateType: archivedSame.template_type || slot.designTemplateType || 'campaign_announcement',
        templateName: slot.labelTr || archivedSame.template_name,
        format: slotFormatForTemplate(slot.format),
        thumbnailUrl: archivedSame.thumbnail_url,
        designSpec: designSpecFromDonor(archivedSame, purposeBrief, 'archived_same_key'),
        donorId: archivedSame.id,
        donorSource: 'archived_same_key',
      });
      keyedActive.add(key);
    }
  }
  return plans;
}

export async function ensureKeyedDesignTemplatesForEnabledSlots(input: {
  workspaceId: string;
  enabledSlots: Array<Pick<BrandActiveSlot, 'slotKey' | 'format' | 'designTemplateType' | 'labelTr'>>;
  activeTemplates: BrandDesignTemplateRecord[];
  brandSeed?: KeyedTemplateBrandSeed;
  briefByKey?: Map<string, SlotCreativeCustomization>;
}): Promise<{ cloned: number; keys: string[] }> {
  const workspaceId = String(input.workspaceId ?? '').trim();
  if (!workspaceId || input.enabledSlots.length === 0) {
    return { cloned: 0, keys: [] };
  }

  let archived: BrandDesignTemplateRecord[] = [];
  try {
    const res = await fetchCrewBackendJson<BrandDesignTemplateRecord[]>(
      `/api/v1/design-templates/${workspaceId}?include_archived=true`,
      { workspaceId, timeoutMs: 20_000 },
    );
    if (res.ok && Array.isArray(res.data)) {
      archived = res.data.filter((t) => String(t.status ?? '').toLowerCase() === 'archived');
    }
  } catch {
    archived = [];
  }

  const plans = planKeyedDesignTemplateClones({
    enabledSlots: input.enabledSlots,
    templates: input.activeTemplates,
    archivedTemplates: archived,
    brandSeed: input.brandSeed,
    briefByKey: input.briefByKey,
  });
  if (plans.length === 0) return { cloned: 0, keys: [] };

  const body = {
    archive_existing: false,
    templates: plans.map((p) => ({
      template_type: p.templateType.slice(0, 48),
      template_name: p.templateName.slice(0, 160),
      format: p.format,
      thumbnail_url: p.thumbnailUrl,
      design_spec: p.designSpec,
      catalog_slot_key: p.catalogSlotKey,
    })),
  };

  const upsert = await fetchCrewBackendJson<unknown[]>(
    `/api/v1/design-templates/${workspaceId}/bulk`,
    {
      workspaceId,
      method: 'POST',
      timeoutMs: 45_000,
      body,
    },
  );
  if (!upsert.ok) {
    console.warn(
      `[ensure-keyed-templates] bulk upsert failed workspace=${workspaceId} `
      + `status=${upsert.status} error=${upsert.error ?? 'unknown'}`,
    );
    return { cloned: 0, keys: [] };
  }

  invalidateDesignTemplateCache(workspaceId);
  const keys = plans.map((p) => p.catalogSlotKey);
  console.log(
    `[ensure-keyed-templates] cloned ${keys.length} keyed shells for ${workspaceId}: `
    + keys.slice(0, 8).join(','),
  );
  return { cloned: keys.length, keys };
}

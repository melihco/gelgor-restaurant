/**
 * Derive Fal onboarding presets from DB slot catalog (tenant assignments).
 */

import {
  DESIGN_TEMPLATE_INTENT_BY_TYPE,
  type DesignTemplateFormat,
  type DesignTemplatePreset,
  type DesignTemplateType,
  resolveDesignTemplatePresets,
} from '@/lib/brand-design-template-presets';
import { DESIGN_TEMPLATE_TYPE_LABELS } from '@/lib/fal-archetype-gallery';
import {
  bootstrapTenantSlotAssignments,
  fetchSectorSlotDefinitions,
  fetchTenantSlotAssignments,
  resolveSectorSlotsWithPackFallback,
  type ProductionSlotDefinition,
} from '@/lib/production-slot-catalog';
import {
  resolveBrandSlotFacilities,
  synthesizeSectorSlotDefinitions,
} from '@/lib/sector-slot-pack';

/** Default onboarding preview count — balances cost vs catalog coverage. */
export const ONBOARDING_CATALOG_TEMPLATE_CAP = 12;

const LOGO_FORWARD_TYPES = new Set<DesignTemplateType>([
  'campaign_announcement',
  'seasonal_promo',
  'announcement_formal',
  'brand_identity',
  'event_special',
  'reel_cover',
]);

const ASSET_TYPES_BY_TEMPLATE: Partial<Record<DesignTemplateType, string[]>> = {
  menu_highlight: ['food_drink_photo', 'product_image'],
  venue_showcase: ['venue_reference'],
  social_proof: ['venue_reference', 'food_drink_photo'],
  daily_story: ['venue_reference', 'food_drink_photo', 'product_image'],
  brand_identity: ['venue_reference', 'product_image'],
  campaign_announcement: ['venue_reference', 'product_image', 'food_drink_photo'],
  event_special: ['venue_reference', 'food_drink_photo'],
  seasonal_promo: ['venue_reference', 'product_image', 'food_drink_photo'],
  announcement_formal: ['venue_reference'],
  reel_cover: ['venue_reference', 'food_drink_photo', 'product_image'],
};

function slotFormatToDesignFormat(format: string): DesignTemplateFormat {
  if (format === 'reel') return 'reel_cover';
  if (format === 'story') return 'story';
  return 'post';
}

const GENERIC_ONBOARDING_COPY = resolveDesignTemplatePresets('');

function sampleCopyForType(templateType: DesignTemplateType): {
  headline: string;
  subtitle?: string;
} {
  const preset = GENERIC_ONBOARDING_COPY.find((p) => p.templateType === templateType);
  if (preset?.sampleHeadline) {
    return { headline: preset.sampleHeadline, subtitle: preset.sampleSubtitle };
  }
  const meta = DESIGN_TEMPLATE_TYPE_LABELS[templateType];
  if (templateType === 'social_proof') {
    return { headline: '"Harika bir deneyim"', subtitle: '— Mutlu misafirimiz' };
  }
  if (meta?.tr) {
    const base = meta.tr.replace(/duyurusu$/i, '').trim();
    return {
      headline: base === 'Kampanya' ? 'Özel Kampanya' : base || 'Keşfetmeye Hazır mısın?',
      subtitle: templateType === 'announcement_formal' ? 'Bilgilerinize' : 'Sınırlı süre',
    };
  }
  return { headline: 'Keşfetmeye Hazır mısın?' };
}

export function buildDesignPresetFromCatalogSlot(
  slot: ProductionSlotDefinition,
): DesignTemplatePreset {
  const templateType = slot.design_template_type as DesignTemplateType;
  const copy = sampleCopyForType(templateType);
  const keywords = [
    slot.label_tr,
    slot.label_en,
    ...(Array.isArray(slot.match_signals?.keywords)
      ? (slot.match_signals.keywords as string[])
      : []),
    slot.slot_key.replace(/_/g, ' '),
  ].filter(Boolean).join(' ');

  return {
    templateType,
    name: slot.label_tr,
    format: slotFormatToDesignFormat(slot.format),
    intent: DESIGN_TEMPLATE_INTENT_BY_TYPE[templateType] ?? 'campaign',
    sampleHeadline: copy.headline,
    sampleSubtitle: copy.subtitle,
    preferredAssetTypes: ASSET_TYPES_BY_TEMPLATE[templateType] ?? ['venue_reference', 'product_image'],
    matchKeywords: keywords.slice(0, 220),
    prominentLogo: LOGO_FORWARD_TYPES.has(templateType),
    catalogSlotKey: slot.slot_key,
  };
}

/**
 * Legacy sector presets carry no `catalogSlotKey`, so brands onboarded via the
 * legacy fallback produced templates with an empty `catalog_slot_key` — which
 * left production unable to hard-pin them (1A). Backfill each legacy preset with
 * the sector's canonical enabled slot for its (templateType + format), matching
 * format so we never bind a post template to a story slot. Sector-driven, no
 * tenant branch. Presets that already carry a key are left untouched.
 */
export function attachCatalogKeysToLegacyPresets(
  sectorId: string,
  presets: DesignTemplatePreset[],
): DesignTemplatePreset[] {
  const sectorSlots = synthesizeSectorSlotDefinitions(sectorId);
  if (sectorSlots.length === 0) return presets;

  const claimed = new Set<string>();
  return presets.map((preset) => {
    if (preset.catalogSlotKey) {
      claimed.add(preset.catalogSlotKey);
      return preset;
    }
    const slot = sectorSlots.find(
      (s) =>
        !claimed.has(s.slot_key) &&
        s.design_template_type === preset.templateType &&
        slotFormatToDesignFormat(s.format) === preset.format,
    );
    if (!slot) return preset;
    claimed.add(slot.slot_key);
    return { ...preset, catalogSlotKey: slot.slot_key };
  });
}

/**
 * Pick a diverse subset for onboarding: at least one slot per design_template_type,
 * then fill by catalog order up to cap.
 */
export function selectCatalogSlotsForOnboarding(
  slots: ProductionSlotDefinition[],
  cap = ONBOARDING_CATALOG_TEMPLATE_CAP,
): ProductionSlotDefinition[] {
  if (slots.length <= cap) return slots;

  const seenTypes = new Set<string>();
  const picked: ProductionSlotDefinition[] = [];

  for (const slot of slots) {
    if (seenTypes.has(slot.design_template_type)) continue;
    seenTypes.add(slot.design_template_type);
    picked.push(slot);
  }
  for (const slot of slots) {
    if (picked.length >= cap) break;
    if (picked.some((s) => s.slot_key === slot.slot_key)) continue;
    picked.push(slot);
  }
  return picked.slice(0, cap);
}

export interface ResolveCatalogPresetsResult {
  presets: DesignTemplatePreset[];
  sectorId: string;
  source: 'catalog' | 'pack_fallback' | 'legacy_fallback';
  enabledSlotCount: number;
  selectedSlotCount: number;
  bootstrapped: boolean;
}

/**
 * Bootstrap tenant slot assignments (if needed), then build Fal presets from enabled catalog slots.
 * Falls back to legacy 10-type sector presets when catalog is empty.
 */
export async function resolveOnboardingDesignPresetsFromCatalog(
  workspaceId: string,
  sectorId: string,
  options?: {
    cap?: number;
    limit?: number;
    slotFacilities?: Record<string, unknown> | null;
  },
): Promise<ResolveCatalogPresetsResult> {
  let bootstrapped = false;
  const facilities = resolveBrandSlotFacilities(options?.slotFacilities);
  let assignments = await fetchTenantSlotAssignments(workspaceId, { enabledOnly: true });

  if (assignments.length === 0) {
    const boot = await bootstrapTenantSlotAssignments(workspaceId, sectorId);
    bootstrapped = Boolean(boot && boot.enabled_count > 0);
    assignments = await fetchTenantSlotAssignments(workspaceId, { enabledOnly: true });
  }

  const slotDefs: ProductionSlotDefinition[] = assignments
    .map((a) => a.slot)
    .filter((s): s is ProductionSlotDefinition => Boolean(s))
    .sort((a, b) => {
      const pa = assignments.find((x) => x.slot_key === a.slot_key)?.priority ?? a.sort_order;
      const pb = assignments.find((x) => x.slot_key === b.slot_key)?.priority ?? b.sort_order;
      return pa - pb;
    });

  let enabledSlots = slotDefs;
  let source: ResolveCatalogPresetsResult['source'] = 'catalog';

  if (enabledSlots.length === 0) {
    const dbSlots = await fetchSectorSlotDefinitions(workspaceId, sectorId, { facilities });
    enabledSlots = dbSlots.filter((s) => s.enabled_by_default);
    if (enabledSlots.length > 0) {
      source = dbSlots.length > 0 ? 'catalog' : 'pack_fallback';
    }
  }

  if (enabledSlots.length === 0) {
    enabledSlots = resolveSectorSlotsWithPackFallback(sectorId, [], facilities)
      .filter((s) => s.enabled_by_default);
    if (enabledSlots.length > 0) source = 'pack_fallback';
  }

  if (enabledSlots.length === 0) {
    const legacy = attachCatalogKeysToLegacyPresets(
      sectorId,
      resolveDesignTemplatePresets(sectorId),
    );
    const limited = typeof options?.limit === 'number' ? legacy.slice(0, options.limit) : legacy;
    return {
      presets: limited,
      sectorId,
      source: 'legacy_fallback',
      enabledSlotCount: 0,
      selectedSlotCount: limited.length,
      bootstrapped,
    };
  }

  const cap = typeof options?.limit === 'number'
    ? options.limit
    : (options?.cap ?? ONBOARDING_CATALOG_TEMPLATE_CAP);
  const selected = selectCatalogSlotsForOnboarding(enabledSlots, cap);
  const presets = selected.map(buildDesignPresetFromCatalogSlot);

  return {
    presets,
    sectorId,
    source,
    enabledSlotCount: enabledSlots.length,
    selectedSlotCount: presets.length,
    bootstrapped,
  };
}

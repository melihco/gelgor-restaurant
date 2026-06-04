/**
 * Brand Template Library — her markanın 5 standart tasarım slotu.
 *
 * Mission Hub / auto-produce bu kütüphaneden seçim yapar.
 * Showcase marka bazlı 5 tasarım gösterir.
 *
 * Persisted: brand_contexts.brand_theme.template_library (JSONB)
 */
import type { ContentIntent } from './brand-motion-profile';
import type { RemotionCompositionId } from './brand-motion-profile';
import type { StoryCompositionId } from '@/remotion/types';
import type { ProductionSlotRole } from './mission-production-manifest';
import { AGENCY_BRAND_KITS, getBrandKit } from './agency-brand-kits';
import {
  POSTER_TEMPLATE_CATALOG,
  POSTER_TEMPLATE_BY_ID,
} from './poster-template-catalog';
import type { PosterLayoutFamily } from './poster-template-types';
import {
  REMOTION_TEMPLATE_CATALOG,
  REMOTION_TEMPLATE_BY_ID,
  getRemotionTemplate,
} from './remotion-template-catalog';
import type { RemotionLayoutFamily } from './remotion-template-types';
import { resolveKitForSector } from './remotion-template-registry';
import { hashTenantSeed, tenantKitSeed, tenantSlotSeed } from './tenant-template-seed';
import { resolveTextOverlayPrefs } from './brand-text-overlay-prefs';
import { rankPosterFamiliesForSector } from './poster-quality';

export type BrandTemplateSlotFormat = 'story' | 'post' | 'poster';

export interface BrandTemplateLibrarySlot {
  slot: 1 | 2 | 3 | 4 | 5;
  key: string;
  labelTr: string;
  labelEn: string;
  format: BrandTemplateSlotFormat;
  useCase: 'daily' | 'event' | 'campaign' | 'editorial' | 'social_proof';
  storyTemplateId?: string;
  posterTemplateId?: string;
  legacyComposition?: StoryCompositionId;
  enabled: boolean;
}

export interface BrandTemplateLibrary {
  version: 1;
  kitId: string;
  slots: BrandTemplateLibrarySlot[];
  derivedAt: string;
  locked: boolean;
  /** Tenant that owns this derivation — re-derive when tenant changes */
  tenantId?: string;
}

interface SlotSpec {
  slot: 1 | 2 | 3 | 4 | 5;
  key: string;
  labelTr: string;
  labelEn: string;
  format: BrandTemplateSlotFormat;
  useCase: BrandTemplateLibrarySlot['useCase'];
  storyFamilies?: RemotionLayoutFamily[];
  posterFamilies?: PosterLayoutFamily[];
  legacyComposition?: StoryCompositionId;
  intents: ContentIntent[];
  treatments?: string[];
}

export const BRAND_LIBRARY_SLOT_SPECS: SlotSpec[] = [
  {
    slot: 1,
    key: 'daily_story',
    labelTr: 'Günlük Story',
    labelEn: 'Daily Story',
    format: 'story',
    useCase: 'daily',
    storyFamilies: ['editorial_bottom', 'minimal_luxury', 'asymmetric_editorial', 'frosted_glass', 'location_pin'],
    intents: ['daily_moment', 'product_spotlight', 'educational'],
    treatments: ['pure_photo', 'daily', 'menu'],
  },
  {
    slot: 2,
    key: 'event_story',
    labelTr: 'Etkinlik Story',
    labelEn: 'Event Story',
    format: 'story',
    useCase: 'event',
    storyFamilies: ['event_ticket', 'campaign_hero', 'bold_impact'],
    legacyComposition: 'SpecStory',
    intents: ['event', 'invitation', 'announcement'],
    treatments: ['story_event', 'event', 'event_announcement', 'dj'],
  },
  {
    slot: 3,
    key: 'campaign_post',
    labelTr: 'Kampanya Post',
    labelEn: 'Campaign Post',
    format: 'post',
    useCase: 'campaign',
    posterFamilies: ['promo_split', 'restaurant_feature', 'editorial_date', 'event_masthead', 'gala_invite'],
    intents: ['campaign_offer'],
    treatments: ['campaign_offer', 'promo', 'offer'],
  },
  {
    slot: 4,
    key: 'editorial_story',
    labelTr: 'Editorial Story',
    labelEn: 'Editorial Story',
    format: 'story',
    useCase: 'editorial',
    storyFamilies: ['split_panel', 'magazine_cover', 'minimal_luxury', 'noir_editorial', 'asymmetric_editorial'],
    intents: ['announcement', 'product_spotlight'],
    treatments: ['feature', 'editorial', 'chef', 'spotlight'],
  },
  {
    slot: 5,
    key: 'social_proof',
    labelTr: 'Sosyal Kanıt',
    labelEn: 'Social Proof',
    format: 'story',
    useCase: 'social_proof',
    storyFamilies: ['gallery_series', 'diptych_collage', 'mosaic_pinterest', 'polaroid_stack', 'quote_card', 'editorial_bottom'],
    legacyComposition: 'GallerySeriesStory',
    intents: ['social_proof'],
    treatments: ['social_proof', 'review', 'ugc'],
  },
];

function sectorMatchesTemplate(sector: string, templateSectors: string[]): boolean {
  const norm = sector.toLowerCase().replace(/\s+/g, '_');
  return templateSectors.some(
    (s) => norm.includes(s.split('_')[0]!) || s.includes(norm.split('_')[0]!),
  );
}

function pickStoryTemplate(
  sector: string,
  families: RemotionLayoutFamily[],
  seed: number,
  avoidIds: string[] = [],
): string | undefined {
  const sectorPool = REMOTION_TEMPLATE_CATALOG.filter((t) => sectorMatchesTemplate(sector, t.sectors));
  const pool = sectorPool.length >= 5 ? sectorPool : REMOTION_TEMPLATE_CATALOG;
  const allMatches = families.flatMap((family) => pool.filter((t) => t.family === family));
  const unique = Array.from(new Map(allMatches.map((t) => [t.id, t])).values());
  const available = avoidIds.length
    ? unique.filter((t) => !avoidIds.includes(t.id))
    : unique;
  const pickFrom = available.length ? available : unique;
  if (pickFrom.length) return pickFrom[seed % pickFrom.length]!.id;
  return pool[seed % pool.length]?.id;
}

function pickPosterTemplate(
  sector: string,
  families: PosterLayoutFamily[],
  seed: number,
  avoidIds: string[] = [],
  copy?: { headline?: string; caption?: string; textOverlayDensity?: 'minimal' | 'medium' | 'dense' },
): string | undefined {
  const orderedFamilies = rankPosterFamiliesForSector(
    sector,
    families,
    copy?.headline ?? '',
    copy?.caption ?? '',
    copy?.textOverlayDensity,
  );
  const sectorPool = POSTER_TEMPLATE_CATALOG.filter((t) => sectorMatchesTemplate(sector, t.sectors));
  const pool = sectorPool.length >= 3 ? sectorPool : POSTER_TEMPLATE_CATALOG;
  const allMatches = orderedFamilies.flatMap((family) => pool.filter((t) => t.family === family));
  const unique = Array.from(new Map(allMatches.map((t) => [t.id, t])).values());
  const available = avoidIds.length
    ? unique.filter((t) => !avoidIds.includes(t.id))
    : unique;
  const pickFrom = available.length ? available : unique;
  if (pickFrom.length) return pickFrom[seed % pickFrom.length]!.id;
  return pool[seed % pool.length]?.id;
}

/** Catalog templates must render via SpecStory + templateId — legacy compositions ignore variants. */
export function compositionIdForStoryTemplate(
  storyTemplateId: string | undefined,
  slot: BrandTemplateLibrarySlot,
): RemotionCompositionId {
  if (storyTemplateId && REMOTION_TEMPLATE_BY_ID.has(storyTemplateId)) {
    return 'SpecStory';
  }
  if (slot.legacyComposition) return slot.legacyComposition;
  if (storyTemplateId) {
    return getRemotionTemplate(storyTemplateId)?.legacyComposition ?? 'SpecStory';
  }
  return 'SpecStory';
}

function storyTemplateSeed(input: {
  ideaIndex?: number;
  slotNumber: number;
  avoidCount?: number;
  salt?: string;
}): number {
  const base = (input.ideaIndex ?? 0) * 11 + (input.slotNumber - 1) * 17 + (input.avoidCount ?? 0) * 5;
  if (input.salt) return base + (hashTenantSeed(input.salt, 'story_pick') % 997);
  return base;
}

export function deriveBrandTemplateLibrary(input: {
  kitId?: string;
  sector: string;
  motionStyle?: string;
  tenantId?: string;
}): BrandTemplateLibrary {
  const kitSeed = tenantKitSeed(input.tenantId);
  const kitId = input.kitId ?? resolveKitForSector(input.sector, kitSeed);
  const kit = getBrandKit(kitId);
  const sector = kit?.sector ?? input.sector;

  const slots: BrandTemplateLibrarySlot[] = BRAND_LIBRARY_SLOT_SPECS.map((spec) => {
    const slotSeed = tenantSlotSeed(input.tenantId, spec.slot);
    const storyTemplateId = spec.storyFamilies
      ? pickStoryTemplate(sector, spec.storyFamilies, slotSeed)
      : undefined;
    const posterTemplateId = spec.posterFamilies
      ? pickPosterTemplate(sector, spec.posterFamilies, slotSeed)
      : undefined;

    return {
      slot: spec.slot,
      key: spec.key,
      labelTr: spec.labelTr,
      labelEn: spec.labelEn,
      format: spec.format,
      useCase: spec.useCase,
      storyTemplateId,
      posterTemplateId,
      legacyComposition: spec.legacyComposition,
      enabled: true,
    };
  });

  return {
    version: 1,
    kitId,
    slots,
    derivedAt: new Date().toISOString(),
    locked: false,
    tenantId: input.tenantId,
  };
}

export function parseBrandTemplateLibraryFromTheme(
  theme: Record<string, unknown> | null | undefined,
): BrandTemplateLibrary | null {
  if (!theme) return null;
  const raw = (theme.template_library ?? theme.templateLibrary) as BrandTemplateLibrary | undefined;
  if (!raw?.slots?.length) return null;
  const validSlots = raw.slots.filter(
    (s) => s && typeof s.key === 'string' && typeof s.format === 'string',
  );
  if (!validSlots.length) return null;
  return { ...raw, slots: validSlots };
}

/** Merge operator-saved slots with kit defaults so partial saves still apply in production. */
export function mergeTemplateLibraryWithBaseline(
  saved: BrandTemplateLibrary,
  baseline: BrandTemplateLibrary,
): BrandTemplateLibrary {
  const byKey = new Map(saved.slots.map((s) => [s.key, s]));
  const slots = BRAND_LIBRARY_SLOT_SPECS.map((spec) => {
    const savedSlot = byKey.get(spec.key);
    const baseSlot = baseline.slots.find((s) => s.key === spec.key);
    if (savedSlot) {
      return {
        ...(baseSlot ?? savedSlot),
        ...savedSlot,
        slot: spec.slot,
        key: spec.key,
        labelTr: savedSlot.labelTr || spec.labelTr,
        labelEn: savedSlot.labelEn || spec.labelEn,
        format: spec.format,
        useCase: savedSlot.useCase || spec.useCase,
      };
    }
    return baseSlot ?? baseline.slots[spec.slot - 1]!;
  });
  const extraStory = saved.slots.filter(
    (s) => s.format === 'story' && s.enabled && s.storyTemplateId && !slots.some((m) => m.key === s.key),
  );
  return validateLibrarySlotIds({
    ...baseline,
    ...saved,
    slots: [...slots, ...extraStory],
    tenantId: saved.tenantId ?? baseline.tenantId,
  });
}

export function ensureBrandTemplateLibrary(
  theme: Record<string, unknown> | null | undefined,
  input: { sector: string; kitId?: string; motionStyle?: string; tenantId?: string },
): BrandTemplateLibrary {
  const baseline = deriveBrandTemplateLibrary(input);
  const existing = parseBrandTemplateLibraryFromTheme(theme);
  if (existing?.locked) {
    return validateLibrarySlotIds(mergeTemplateLibraryWithBaseline(existing, baseline));
  }
  if (
    existing
    && existing.tenantId
    && input.tenantId
    && existing.tenantId === input.tenantId
  ) {
    return validateLibrarySlotIds(mergeTemplateLibraryWithBaseline(existing, baseline));
  }
  return baseline;
}

/** Story template IDs bound to this kit (5 slots) */
export function libraryStoryTemplateIds(library: BrandTemplateLibrary): string[] {
  return library.slots
    .filter((s) => s.enabled && s.storyTemplateId)
    .map((s) => s.storyTemplateId!);
}

export function hydrateKitTemplateIdsFromLibrary(): void {
  for (const kit of AGENCY_BRAND_KITS) {
    const library = deriveBrandTemplateLibrary({ kitId: kit.id, sector: kit.sector });
    kit.templateIds = libraryStoryTemplateIds(library);
  }
}

export function selectBrandLibrarySlot(
  library: BrandTemplateLibrary,
  input: {
    intent?: ContentIntent;
    treatment?: string;
    ideaIndex?: number;
    format?: BrandTemplateSlotFormat;
  },
): BrandTemplateLibrarySlot {
  const treatment = (input.treatment ?? '').toLowerCase();
  let enabled = library.slots.filter((s) => s.enabled);
  if (input.format) {
    const formatMatches = enabled.filter((s) => s.format === input.format);
    if (formatMatches.length) enabled = formatMatches;
  }

  const matchedSlots: BrandTemplateLibrarySlot[] = [];
  for (const spec of BRAND_LIBRARY_SLOT_SPECS) {
    if (input.intent && spec.intents.includes(input.intent)) {
      const slot = enabled.find((s) => s.key === spec.key);
      if (slot && !matchedSlots.some((m) => m.key === slot.key)) matchedSlots.push(slot);
    }
  }
  for (const spec of BRAND_LIBRARY_SLOT_SPECS) {
    if (spec.treatments?.some((t) => treatment.includes(t))) {
      const slot = enabled.find((s) => s.key === spec.key);
      if (slot && !matchedSlots.some((m) => m.key === slot.key)) matchedSlots.push(slot);
    }
  }

  if (matchedSlots.length) {
    // Generic daily/product ideas: rotate across all story slots for visual diversity
    const isGenericStory =
      input.format === 'story'
      && (input.intent === 'daily_moment' || input.intent === 'product_spotlight' || matchedSlots.length === 1);
    if (isGenericStory) {
      const storySlots = enabled.filter((s) => s.format === 'story');
      if (storySlots.length > 1) {
        return storySlots[(input.ideaIndex ?? 0) % storySlots.length]!;
      }
    }
    return matchedSlots[(input.ideaIndex ?? 0) % matchedSlots.length]!;
  }

  if (input.format === 'post') {
    const post = enabled.find((s) => s.format === 'post');
    if (post) return post;
  }

  const idx = (input.ideaIndex ?? 0) % enabled.length;
  return enabled[idx] ?? library.slots[0]!;
}

export function resolveProductionTemplate(input: {
  library: BrandTemplateLibrary;
  sector?: string;
  intent?: ContentIntent;
  treatment?: string;
  ideaIndex?: number;
  format?: BrandTemplateSlotFormat;
  usedTemplateIds?: string[];
  /** APO-4 — promo vs editorial poster family routing */
  headline?: string;
  caption?: string;
  brandTheme?: Record<string, unknown> | null;
}): {
  slot: BrandTemplateLibrarySlot;
  storyTemplateId?: string;
  posterTemplateId?: string;
  compositionId: RemotionCompositionId;
  kitId: string;
} {
  const slot = selectBrandLibrarySlot(input.library, input);
  const slotSpec = getSlotSpec(slot.key);
  const avoidIds = input.usedTemplateIds ?? [];
  const seed = storyTemplateSeed({
    ideaIndex: input.ideaIndex,
    slotNumber: slot.slot,
    avoidCount: avoidIds.length,
    salt: input.sector,
  });
  const sector = input.sector ?? '';

  let storyTemplateId = slot.storyTemplateId;
  // Marka slotunda tanımlı Remotion şablonu sabit kalır; yalnızca boş slotta otomatik seçim yapılır.
  if (slot.format === 'story' && slotSpec?.storyFamilies?.length && !storyTemplateId) {
    storyTemplateId = pickStoryTemplate(sector, slotSpec.storyFamilies, seed, avoidIds) ?? storyTemplateId;
  }
  const textOverlayDensity = resolveTextOverlayPrefs(input.brandTheme ?? null).density;
  const copyHint = {
    headline: input.headline,
    caption: input.caption,
    textOverlayDensity,
  };
  let posterTemplateId = slot.posterTemplateId;
  const posterFamilies = slotSpec?.posterFamilies;
  if (posterFamilies?.length && (slot.format === 'post' || input.format === 'story') && !posterTemplateId) {
    posterTemplateId = pickPosterTemplate(sector, posterFamilies, seed, avoidIds, copyHint)
      ?? posterTemplateId;
  }

  let compositionId = compositionIdForStoryTemplate(storyTemplateId, slot);

  if (slot.format === 'post' && posterTemplateId) {
    compositionId = 'SpecPosterPost';
  }

  return {
    slot,
    storyTemplateId,
    posterTemplateId,
    compositionId,
    kitId: input.library.kitId,
  };
}

export function librarySlotToCatalogEntry(
  slot: BrandTemplateLibrarySlot,
  kitId: string,
): Record<string, unknown> | null {
  if (slot.format === 'post' && slot.posterTemplateId) {
    const poster = POSTER_TEMPLATE_BY_ID.get(slot.posterTemplateId);
    if (!poster) return null;
    return {
      kind: 'poster',
      id: slot.posterTemplateId,
      slotKey: slot.key,
      slotLabel: slot.labelTr,
      slotNumber: slot.slot,
      kitId,
      family: poster.family,
      collection: poster.collection,
      nameTr: `${slot.labelTr} · ${poster.nameTr}`,
      nameEn: `${slot.labelEn} · ${poster.nameEn}`,
      descTr: poster.descTr,
      tags: [...poster.tags, slot.useCase],
      formats: ['post'],
      useCase: slot.useCase,
    };
  }

  const storyId = slot.storyTemplateId;
  if (!storyId) return null;
  const story = REMOTION_TEMPLATE_BY_ID.get(storyId);
  if (!story) return null;
  return {
    kind: 'story',
    id: storyId,
    slotKey: slot.key,
    slotLabel: slot.labelTr,
    slotNumber: slot.slot,
    kitId,
    family: story.family,
    collection: story.collection,
    nameTr: `${slot.labelTr} · ${story.nameTr}`,
    nameEn: `${slot.labelEn} · ${story.nameEn}`,
    descTr: story.descTr,
    tags: [...story.tags, slot.useCase],
    formats: ['story'],
    useCase: slot.useCase,
    legacyComposition: slot.legacyComposition ?? story.legacyComposition,
  };
}

export function libraryToCatalogTemplates(
  library: BrandTemplateLibrary,
): Array<Record<string, unknown>> {
  return library.slots
    .map((slot) => librarySlotToCatalogEntry(slot, library.kitId))
    .filter((e): e is Record<string, unknown> => Boolean(e));
}

export function getSlotSpec(slotKey: string) {
  return BRAND_LIBRARY_SLOT_SPECS.find((s) => s.key === slotKey);
}

/** Map mission slot / intent → brand library story slot key (Marka Detayı 5'li kütüphane). */
export function mapProductionContextToLibrarySlotKey(input: {
  slotRole?: ProductionSlotRole | string;
  intent?: ContentIntent;
  treatment?: string;
  templateUseCase?: string;
  hasEventDetails?: boolean;
}): string | undefined {
  const role = String(input.slotRole ?? '');
  if (role === 'campaign_story_motion') return 'event_story';

  const treatment = (input.treatment ?? '').toLowerCase();
  const useCase = (input.templateUseCase ?? '').toLowerCase();

  if (input.hasEventDetails) return 'event_story';
  if (input.intent === 'event' || input.intent === 'invitation' || input.intent === 'announcement') {
    return 'event_story';
  }
  if (input.intent === 'social_proof' || /social_proof|review|ugc|testimonial/.test(treatment)) {
    return 'social_proof';
  }
  if (input.intent === 'campaign_offer' || /campaign|promo|offer/.test(useCase)) {
    return 'event_story';
  }
  if (input.intent === 'product_spotlight' || /editorial|feature|chef|spotlight/.test(treatment)) {
    return 'editorial_story';
  }
  return undefined;
}

export interface BrandStoryProductionPick {
  slot: BrandTemplateLibrarySlot;
  storyTemplateId: string;
  compositionId: RemotionCompositionId;
  kitId: string;
  intent: ContentIntent;
  templateNameTr: string;
  libraryLocked: boolean;
}

function storyPickFromSlot(
  library: BrandTemplateLibrary,
  slot: BrandTemplateLibrarySlot,
  intent: ContentIntent,
): BrandStoryProductionPick | null {
  const storyTemplateId = slot.storyTemplateId;
  if (!storyTemplateId || !slot.enabled || slot.format !== 'story') return null;
  const tpl = getRemotionTemplate(storyTemplateId);
  return {
    slot,
    storyTemplateId,
    compositionId: compositionIdForStoryTemplate(storyTemplateId, slot),
    kitId: library.kitId,
    intent,
    templateNameTr: tpl?.nameTr ?? slot.labelTr,
    libraryLocked: Boolean(library.locked),
  };
}

/**
 * Remotion story render — brand template library is source of truth when locked or slot mapped.
 */
export function resolveBrandStoryProductionTemplate(input: {
  library: BrandTemplateLibrary;
  sector?: string;
  intent?: ContentIntent;
  treatment?: string;
  ideaIndex?: number;
  usedTemplateIds?: string[];
  headline?: string;
  caption?: string;
  slotRole?: ProductionSlotRole | string;
  librarySlotKey?: string;
  templateUseCase?: string;
  hasEventDetails?: boolean;
}): BrandStoryProductionPick {
  const intent = input.intent ?? 'daily_moment';
  const sector = input.sector ?? '';

  if (input.librarySlotKey) {
    const slot = input.library.slots.find(
      (s) => s.key === input.librarySlotKey && s.enabled && s.format === 'story',
    );
    if (slot) {
      const direct = storyPickFromSlot(input.library, slot, intent);
      if (direct) return direct;
    }
  }

  const mappedKey = mapProductionContextToLibrarySlotKey({
    slotRole: input.slotRole,
    intent,
    treatment: input.treatment,
    templateUseCase: input.templateUseCase,
    hasEventDetails: input.hasEventDetails,
  });
  if (mappedKey) {
    const slot = input.library.slots.find(
      (s) => s.key === mappedKey && s.enabled && s.format === 'story',
    );
    if (slot) {
      const direct = storyPickFromSlot(input.library, slot, intent);
      if (direct) return direct;
    }
  }

  const production = resolveProductionTemplate({
    library: input.library,
    sector,
    intent,
    treatment: input.treatment,
    ideaIndex: input.ideaIndex,
    format: 'story',
    usedTemplateIds: input.usedTemplateIds,
    headline: input.headline,
    caption: input.caption,
  });

  const storyTemplateId = production.storyTemplateId
    ?? pickStoryTemplate(sector, ['editorial_bottom'], input.ideaIndex ?? 0)
    ?? 'remotion_editorial_bottom_01';
  const tpl = getRemotionTemplate(storyTemplateId);

  return {
    slot: production.slot,
    storyTemplateId,
    compositionId: production.compositionId,
    kitId: production.kitId,
    intent,
    templateNameTr: tpl?.nameTr ?? production.slot.labelTr,
    libraryLocked: Boolean(input.library.locked),
  };
}

/** Composition: catalog templateId wins; legacy compositions only when no catalog id. */
export function resolveStoryCompositionForBrandTemplate(input: {
  storyTemplateId: string;
  slot: BrandTemplateLibrarySlot;
  slotRole?: ProductionSlotRole | string;
  forceEvent?: boolean;
}): StoryCompositionId {
  if (REMOTION_TEMPLATE_BY_ID.has(input.storyTemplateId)) {
    const fromCatalog = compositionIdForStoryTemplate(input.storyTemplateId, input.slot);
    if (fromCatalog === 'SpecStory') return 'SpecStory';
    if (input.slot.legacyComposition) return input.slot.legacyComposition;
    return fromCatalog as StoryCompositionId;
  }
  if (input.forceEvent && input.slot.key === 'event_story') {
    return 'EventAnnouncementStory';
  }
  const role = String(input.slotRole ?? '');
  if (role === 'campaign_story_motion') return 'CampaignHeroStory';
  return (input.slot.legacyComposition ?? 'SpecStory') as StoryCompositionId;
}

export interface TemplateOption {
  id: string;
  label: string;
  family: string;
}

export function listStoryTemplateOptions(sector: string, slotKey: string): TemplateOption[] {
  const spec = getSlotSpec(slotKey);
  const families = spec?.storyFamilies ?? [];
  const sectorPool = REMOTION_TEMPLATE_CATALOG.filter((t) => sectorMatchesTemplate(sector, t.sectors));
  const pool = sectorPool.length >= 5 ? sectorPool : REMOTION_TEMPLATE_CATALOG;
  const filtered = families.length ? pool.filter((t) => families.includes(t.family)) : pool;
  const list = (filtered.length ? filtered : pool).slice(0, 20);
  return list.map((t) => ({ id: t.id, label: t.nameTr, family: t.family }));
}

export function listPosterTemplateOptions(sector: string, slotKey: string): TemplateOption[] {
  const spec = getSlotSpec(slotKey);
  const families = spec?.posterFamilies ?? ['promo_split'];
  const sectorPool = POSTER_TEMPLATE_CATALOG.filter((t) => sectorMatchesTemplate(sector, t.sectors));
  const pool = sectorPool.length >= 3 ? sectorPool : POSTER_TEMPLATE_CATALOG;
  const filtered = pool.filter((t) => families.includes(t.family));
  const list = (filtered.length ? filtered : pool).slice(0, 15);
  return list.map((t) => ({ id: t.id, label: t.nameTr, family: t.family }));
}

export function patchLibrarySlot(
  library: BrandTemplateLibrary,
  slotKey: string,
  patch: Partial<Pick<BrandTemplateLibrarySlot, 'storyTemplateId' | 'posterTemplateId' | 'enabled'>>,
): BrandTemplateLibrary {
  return validateLibrarySlotIds({
    ...library,
    locked: true,
    derivedAt: new Date().toISOString(),
    slots: library.slots.map((s) => (s.key === slotKey ? { ...s, ...patch } : s)),
  });
}

export function validateLibrarySlotIds(library: BrandTemplateLibrary): BrandTemplateLibrary {
  return {
    ...library,
    slots: library.slots.map((slot) => ({
      ...slot,
      storyTemplateId: slot.storyTemplateId && REMOTION_TEMPLATE_BY_ID.has(slot.storyTemplateId)
        ? slot.storyTemplateId
        : pickStoryTemplate(getBrandKit(library.kitId)?.sector ?? 'general_business', ['editorial_bottom'], slot.slot - 1),
      posterTemplateId: slot.posterTemplateId && POSTER_TEMPLATE_BY_ID.has(slot.posterTemplateId)
        ? slot.posterTemplateId
        : slot.format === 'post'
          ? pickPosterTemplate(getBrandKit(library.kitId)?.sector ?? 'general_business', ['promo_split'], slot.slot - 1)
          : undefined,
    })),
  };
}

// Bind 5 library story templates to each agency kit
for (const kit of AGENCY_BRAND_KITS) {
  const library = deriveBrandTemplateLibrary({ kitId: kit.id, sector: kit.sector });
  kit.templateIds = libraryStoryTemplateIds(library);
}

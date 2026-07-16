/**
 * Brand design template matcher (production-side).
 *
 * At mission production time, selects the brand's onboarding-generated design
 * template that best fits a slot (by intent + format) and returns a concise
 * brand-consistency directive plus the template's preferred gallery reference.
 * This keeps every produced post/story/reel aligned with the locked,
 * brand-approved design set without overriding the slot's actual content.
 */

import {
  filterDesignTemplatesToActiveSlots,
  type BrandActiveSlotSet,
} from '@/lib/brand-active-slot-resolver';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import type { TypographyVibe } from '@/types/brand-theme';

export interface BrandDesignTemplateRecord {
  id: string;
  template_type: string;
  template_name: string;
  format: string;
  thumbnail_url: string | null;
  catalog_slot_key?: string | null;
  usage_count?: number;
  design_spec: {
    prompt?: string;
    vibe?: TypographyVibe;
    brandColors?: { primary: string; accent: string };
    sampleHeadline?: string;
    galleryRef?: string | null;
    intent?: string;
    prominentLogo?: boolean;
    [key: string]: unknown;
  };
  status: string;
}

export interface MatchedDesignTemplate {
  id: string;
  templateType: string;
  templateName: string;
  format: string;
  vibe?: TypographyVibe;
  galleryRef: string | null;
  prominentLogo: boolean;
  /** Onboarding GPT-image prompt — preview-only; do not inject verbatim in production. */
  designSpecPrompt: string | null;
  thumbnailUrl: string | null;
  brandColors: { primary: string; accent: string } | null;
  logoUrl: string | undefined;
  specialDay?: { name: string; mmdd?: string; category?: string };
  /** Short directive injected into the design prompt for brand consistency. */
  directive: string;
  /** Preview placeholder headline — forbidden in production output. */
  sampleHeadline?: string | null;
  sampleSubtitle?: string | null;
  layoutPattern?: string | null;
  designBriefDirectives?: string[];
  canvaArchetypeId?: string | null;
  canvaArchetypeName?: string | null;
  /**
   * How the template was bound to the slot:
   * - `hard`   — exact `catalog_slot_key` match with compatible format (1A pin)
   * - `soft`   — type/use-case scored match (no catalog key on template or mission)
   * - `format_fallback` — last-resort same-format template
   */
  matchQuality: DesignTemplateMatchQuality;
}

export type DesignTemplateMatchQuality = 'hard' | 'soft' | 'format_fallback';

/** Why a requested catalog_slot_key hard pin failed (Faz B telemetry). */
export type CatalogHardPinMissReason =
  | 'empty_active_set'
  | 'missing_template'
  | 'format_mismatch'
  | 'off_season';

export interface CatalogHardPinMiss {
  reason: CatalogHardPinMissReason;
  catalogSlotKey: string;
  /** Formats of templates that share this catalog key (when any). */
  foundFormats: string[];
}

/** Production slot format → design-template formats considered compatible. */
function compatibleFormats(format: 'story' | 'post' | 'reel'): string[] {
  switch (format) {
    case 'post':
      return ['post'];
    case 'story':
      return ['story'];
    case 'reel':
      return ['reel_cover', 'story'];
    default:
      return [format];
  }
}

/** Calendar / ideation announcement_type → onboarding design template_type (priority order). */
const ANNOUNCEMENT_TO_TEMPLATE_TYPES: Record<string, string[]> = {
  event_teaser: ['event_special', 'campaign_announcement', 'reel_cover'],
  event_announcement: ['event_special', 'campaign_announcement'],
  offer_campaign: ['campaign_announcement', 'seasonal_promo'],
  product_reveal: ['menu_highlight', 'campaign_announcement', 'brand_identity'],
  product_showcase: ['menu_highlight', 'venue_showcase'],
  social_proof: ['social_proof', 'announcement_formal'],
  venue_showcase: ['venue_showcase', 'brand_identity', 'daily_story'],
  behind_the_scenes: ['daily_story', 'venue_showcase'],
  educational_post: ['daily_story', 'announcement_formal'],
  brand_awareness: ['brand_identity', 'venue_showcase'],
  campaign_offer: ['campaign_announcement', 'seasonal_promo'],
  daily_story: ['daily_story', 'venue_showcase'],
  announcement: ['announcement_formal', 'campaign_announcement'],
};

/** Brand Template Library slot keys → design template_type candidates. */
const LIBRARY_SLOT_TO_TEMPLATE_TYPES: Record<string, string[]> = {
  daily_story: ['daily_story', 'venue_showcase'],
  event_story: ['event_special', 'campaign_announcement'],
  campaign_post: ['campaign_announcement', 'seasonal_promo'],
  editorial_story: ['brand_identity', 'venue_showcase', 'menu_highlight'],
  social_proof: ['social_proof'],
  social_proof_post: ['social_proof', 'announcement_formal'],
  ad_creative_post: ['campaign_announcement', 'announcement_formal'],
};

const DEFAULT_TEMPLATE_TYPES_BY_FORMAT: Record<'story' | 'post' | 'reel', string[]> = {
  post: ['campaign_announcement', 'announcement_formal', 'brand_identity', 'venue_showcase'],
  story: ['daily_story', 'event_special', 'venue_showcase', 'social_proof'],
  reel: ['reel_cover', 'event_special', 'daily_story', 'campaign_announcement'],
};

function normalizeSignalToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function dedupeTypes(types: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const type of types) {
    const key = type.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export interface DesignTemplateMatchSignals {
  librarySlotKey?: string | null;
  slotRole?: string;
  caption?: string;
  headline?: string;
  announcementType?: string | null;
  templateUseCase?: string | null;
  format?: 'story' | 'post' | 'reel';
}

/**
 * Resolve candidate onboarding design template_types for a production slot.
 * Exported for tests and telemetry — single SSOT for matcher routing.
 */
export function resolveDesignTemplateCandidateTypes(
  input: DesignTemplateMatchSignals,
): string[] {
  const format = input.format ?? 'post';
  const announcement = normalizeSignalToken(input.announcementType);
  const useCase = normalizeSignalToken(input.templateUseCase);
  const libraryKey = normalizeSignalToken(input.librarySlotKey);
  const role = normalizeSignalToken(input.slotRole);
  const hay = [
    libraryKey,
    role,
    announcement,
    useCase,
    String(input.headline ?? ''),
    String(input.caption ?? ''),
  ].join(' ').toLowerCase();

  const fromAnnouncement = ANNOUNCEMENT_TO_TEMPLATE_TYPES[announcement]
    ?? ANNOUNCEMENT_TO_TEMPLATE_TYPES[useCase];
  if (fromAnnouncement?.length) {
    return dedupeTypes([...fromAnnouncement, ...DEFAULT_TEMPLATE_TYPES_BY_FORMAT[format]]);
  }

  const fromLibrary = LIBRARY_SLOT_TO_TEMPLATE_TYPES[libraryKey];
  if (fromLibrary?.length) {
    return dedupeTypes([...fromLibrary, ...DEFAULT_TEMPLATE_TYPES_BY_FORMAT[format]]);
  }

  if (format === 'reel' || /reel|video|motion|fal_reel/.test(hay)) {
    return dedupeTypes(['reel_cover', 'event_special', 'daily_story', 'campaign_announcement']);
  }
  if (/campaign|ad_creative|promo|indirim|discount|offer|fırsat|teklif|%|kampanya/.test(hay)) {
    return dedupeTypes(['campaign_announcement', 'seasonal_promo', 'announcement_formal']);
  }
  if (/event|etkinlik|dj|gece|night|live set|line.?up|party|parti/.test(hay)) {
    return dedupeTypes(['event_special', 'campaign_announcement', 'daily_story']);
  }
  if (/social_proof|proof|review|yorum|memnuniyet/.test(hay)) {
    return dedupeTypes(['social_proof', 'announcement_formal']);
  }
  if (/menu|product|ürün|tabak|lezzet|cocktail|kokteyl/.test(hay)) {
    return dedupeTypes(['menu_highlight', 'venue_showcase', 'campaign_announcement']);
  }
  if (/duyuru|announcement|bilgilendirme|resmi|önemli/.test(hay)) {
    return dedupeTypes(['announcement_formal', 'campaign_announcement']);
  }
  if (/venue|mekan|atmosfer|showcase|vitrin/.test(hay)) {
    return dedupeTypes(['venue_showcase', 'daily_story', 'brand_identity']);
  }
  if (/seasonal|sezon|yaz|kış|mevsim/.test(hay)) {
    return dedupeTypes(['seasonal_promo', 'campaign_announcement']);
  }
  if (/editorial|brand|identity|kimlik/.test(hay)) {
    return dedupeTypes(['brand_identity', 'venue_showcase']);
  }

  return dedupeTypes(DEFAULT_TEMPLATE_TYPES_BY_FORMAT[format]);
}

function catalogKeyOf(record: BrandDesignTemplateRecord): string | null {
  return (
    record.catalog_slot_key
    ?? (record.design_spec?.catalogSlotKey as string | undefined)
    ?? null
  );
}

/** True when a special-day template is out of its ±window (must never fire off-date). */
function isOffSeasonSpecialDay(record: BrandDesignTemplateRecord): boolean {
  if (record.template_type !== 'event_special') return false;
  const sd = record.design_spec?.specialDay as { mmdd?: string } | undefined;
  const days = daysUntilMMDD(sd?.mmdd);
  if (days === null) return false; // generic event template — always eligible
  return days > SPECIAL_DAY_WINDOW;
}

function scoreDesignTemplateRecord(
  record: BrandDesignTemplateRecord,
  candidates: string[],
  formats: string[],
  catalogSlotKey?: string | null,
): number {
  // Format gate — a story template must never win a post slot (and vice versa).
  // reel↔reel_cover/story compatibility is encoded in `compatibleFormats`.
  if (!formats.includes(record.format)) return 0;

  // Off-season special-day templates are excluded outright so a national/religious
  // day poster can't hijack an ordinary event/teaser slot months early.
  if (isOffSeasonSpecialDay(record)) return 0;

  const typeRank = candidates.indexOf(record.template_type);

  const catalogKey = catalogKeyOf(record);
  const catalogMatch = catalogSlotKey && catalogKey === catalogSlotKey ? 80 : 0;

  const proximity = record.template_type === 'event_special'
    ? Math.max(0, specialDayProximityBonus(record))
    : 0;
  const hasPreview = Boolean(record.thumbnail_url);
  const hasRecipe = Boolean(record.design_spec?.prompt);
  const usageBoost = Math.min(5, Math.floor(Number(record.usage_count ?? 0) / 3));

  return (
    catalogMatch +
    (typeRank >= 0 ? (candidates.length - typeRank) * 10 : 0) +
    8 + // format already validated above
    (hasPreview ? 24 : 0) +
    (hasRecipe ? 4 : 0) +
    usageBoost +
    proximity
  );
}

/**
 * 1A hard pin — the slot's own `catalog_slot_key` template wins outright when
 * its format is compatible. Bad data (e.g. a `post` template keyed to a `story`
 * slot) is rejected so it falls through to the soft path instead of silently
 * rendering the wrong shell.
 */
function findCatalogKeyHardMatch(
  active: BrandDesignTemplateRecord[],
  formats: string[],
  catalogSlotKey: string | null | undefined,
): BrandDesignTemplateRecord | null {
  if (!catalogSlotKey) return null;
  let best: { record: BrandDesignTemplateRecord; score: number } | null = null;
  for (const record of active) {
    if (catalogKeyOf(record) !== catalogSlotKey) continue;
    if (!formats.includes(record.format)) continue;
    if (isOffSeasonSpecialDay(record)) continue;
    const score =
      (record.thumbnail_url ? 2 : 0) + (record.design_spec?.prompt ? 1 : 0);
    if (!best || score > best.score) best = { record, score };
  }
  return best?.record ?? null;
}

/**
 * Diagnose a hard-pin miss for ops/telemetry. Pure — no network.
 * Call when `catalogSlotKey` was requested but `findCatalogKeyHardMatch` returned null.
 */
export function diagnoseCatalogHardPinMiss(
  active: BrandDesignTemplateRecord[],
  format: 'story' | 'post' | 'reel',
  catalogSlotKey: string,
): CatalogHardPinMiss {
  const key = catalogSlotKey.trim();
  if (active.length === 0) {
    return { reason: 'empty_active_set', catalogSlotKey: key, foundFormats: [] };
  }
  const formats = compatibleFormats(format);
  const keyed = active.filter((r) => catalogKeyOf(r) === key);
  if (keyed.length === 0) {
    return { reason: 'missing_template', catalogSlotKey: key, foundFormats: [] };
  }
  const foundFormats = [...new Set(keyed.map((r) => r.format))];
  const formatOk = keyed.filter((r) => formats.includes(r.format));
  if (formatOk.length === 0) {
    return { reason: 'format_mismatch', catalogSlotKey: key, foundFormats };
  }
  const seasonOk = formatOk.filter((r) => !isOffSeasonSpecialDay(r));
  if (seasonOk.length === 0) {
    return { reason: 'off_season', catalogSlotKey: key, foundFormats };
  }
  // Defensive — keyed + format + season should have been a hard match.
  return { reason: 'missing_template', catalogSlotKey: key, foundFormats };
}

function pickBestDesignTemplate(
  active: BrandDesignTemplateRecord[],
  candidates: string[],
  formats: string[],
  catalogSlotKey?: string | null,
): { record: BrandDesignTemplateRecord; score: number } | null {
  let best: { record: BrandDesignTemplateRecord; score: number } | null = null;
  for (const record of active) {
    const score = scoreDesignTemplateRecord(record, candidates, formats, catalogSlotKey);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { record, score };
  }
  return best;
}

/** Last resort — any active template with compatible format + preview. */
function pickFormatFallbackTemplate(
  active: BrandDesignTemplateRecord[],
  formats: string[],
): BrandDesignTemplateRecord | null {
  let best: { record: BrandDesignTemplateRecord; score: number } | null = null;
  for (const record of active) {
    if (!formats.includes(record.format)) continue;
    if (isOffSeasonSpecialDay(record)) continue;
    const score =
      (record.thumbnail_url ? 30 : 0) +
      (record.design_spec?.prompt ? 6 : 0) +
      Math.min(4, Math.floor(Number(record.usage_count ?? 0) / 5));
    if (!best || score > best.score) best = { record, score };
  }
  return best?.record ?? null;
}

export interface BrandDesignTemplateSelection {
  record: BrandDesignTemplateRecord;
  matchQuality: DesignTemplateMatchQuality;
  /** Populated when a catalog key was requested but hard pin failed and soft was allowed. */
  hardPinMiss?: CatalogHardPinMiss;
}

export interface SelectBrandDesignTemplateInput {
  slotRole: string;
  librarySlotKey?: string | null;
  format: 'story' | 'post' | 'reel';
  caption?: string;
  headline?: string;
  announcementType?: string | null;
  templateUseCase?: string | null;
  catalogSlotKey?: string | null;
  /**
   * Faz B default: when `catalogSlotKey` is set and hard pin fails, return null
   * (fail-closed) so production does not silently bind a foreign template.
   * Set true only for migration/debug.
   */
  allowSoftFallbackWhenHardMiss?: boolean;
}

/**
 * Pure selection SSOT — no network. Picks the best active template for a slot:
 * 1A hard pin (catalog_slot_key, format-validated) → soft scored match →
 * 2B same-format fallback.
 *
 * Faz B: if `catalogSlotKey` is present and hard pin misses, fail closed unless
 * `allowSoftFallbackWhenHardMiss` is explicitly true.
 */
export function selectBrandDesignTemplate(
  active: BrandDesignTemplateRecord[],
  opts: SelectBrandDesignTemplateInput,
): BrandDesignTemplateSelection | null {
  if (active.length === 0) return null;

  const formats = compatibleFormats(opts.format);
  const catalogKey = String(opts.catalogSlotKey ?? '').trim() || null;
  const candidates = resolveDesignTemplateCandidateTypes({
    librarySlotKey: opts.librarySlotKey,
    slotRole: opts.slotRole,
    caption: opts.caption,
    headline: opts.headline,
    announcementType: opts.announcementType,
    templateUseCase: opts.templateUseCase,
    format: opts.format,
  });

  // 1A — hard pin on the slot's own catalog_slot_key (format-validated).
  const hardMatch = findCatalogKeyHardMatch(active, formats, catalogKey);
  if (hardMatch) {
    console.log(
      `[design-matcher] hard pin catalog_slot_key=${catalogKey} → "${hardMatch.template_name}" (${hardMatch.template_type})`,
    );
    return { record: hardMatch, matchQuality: 'hard' };
  }

  // Faz B — catalog key requested but no valid hard pin: do not soft-bind a
  // foreign template (same-colors / wrong-geometry leak across brands).
  if (catalogKey) {
    const miss = diagnoseCatalogHardPinMiss(active, opts.format, catalogKey);
    console.warn(
      `[design-matcher] hard pin MISS catalog_slot_key=${catalogKey} reason=${miss.reason}` +
        (miss.foundFormats.length ? ` found_formats=${miss.foundFormats.join(',')}` : '') +
        ` role=${opts.slotRole} format=${opts.format}` +
        (opts.allowSoftFallbackWhenHardMiss ? ' (soft fallback allowed)' : ' (fail-closed)'),
    );
    if (!opts.allowSoftFallbackWhenHardMiss) {
      return null;
    }
    const scored = pickBestDesignTemplate(active, candidates, formats, catalogKey);
    if (scored) {
      return { record: scored.record, matchQuality: 'soft', hardPinMiss: miss };
    }
    const fallbackRecord = pickFormatFallbackTemplate(active, formats);
    if (fallbackRecord) {
      return { record: fallbackRecord, matchQuality: 'format_fallback', hardPinMiss: miss };
    }
    return null;
  }

  // Soft — type/use-case scored match (only when no catalog key on the slot).
  const scored = pickBestDesignTemplate(active, candidates, formats, catalogKey);
  if (scored) {
    return { record: scored.record, matchQuality: 'soft' };
  }

  // 2B — last-resort same-format fallback so production never stalls; flagged weak.
  const fallbackRecord = pickFormatFallbackTemplate(active, formats);
  if (fallbackRecord) {
    console.log(
      `[design-matcher] format fallback → "${fallbackRecord.template_name}" (${fallbackRecord.template_type})`,
    );
    return { record: fallbackRecord, matchQuality: 'format_fallback' };
  }

  return null;
}

function buildDirective(record: BrandDesignTemplateRecord): string {
  const vibe = record.design_spec?.vibe;
  const archetype = record.design_spec?.canvaArchetypeName ?? record.design_spec?.canvaArchetypeId;
  const layout = record.design_spec?.layoutPattern;
  return [
    `Stay visually consistent with the brand's locked "${record.template_name}" template`,
    vibe ? `(${vibe} style)` : '',
    archetype ? `— Canva archetype "${archetype}"` : '',
    layout ? `layout: ${String(layout).slice(0, 120)}` : '',
    '— same typographic personality, color treatment and layout language as the brand identity, applied to this post.',
  ].filter(Boolean).join(' ');
}

/** Days from today to the next occurrence of an MM-DD (or null if unparseable). */
function daysUntilMMDD(mmdd: string | undefined, from = new Date()): number | null {
  if (!mmdd) return null;
  const [m, d] = mmdd.split('-').map((n) => parseInt(n, 10));
  if (!m || !d) return null;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let target = new Date(today.getFullYear(), m - 1, d);
  if (target < today) target = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Window (days) within which a special-day template is considered "in season". */
const SPECIAL_DAY_WINDOW = 14;

function specialDayProximityBonus(record: BrandDesignTemplateRecord): number {
  const sd = record.design_spec?.specialDay as { mmdd?: string } | undefined;
  const days = daysUntilMMDD(sd?.mmdd);
  if (days === null) return 0;
  if (days <= SPECIAL_DAY_WINDOW) {
    // Strongly prefer the imminent occasion; closer = higher (caps the type rank).
    return 100 + (SPECIAL_DAY_WINDOW - days);
  }
  // Out of season — heavily deprioritize so it never fires off-date.
  return -50;
}

let warnedMissing = false;

/**
 * Per-workspace short-lived template list cache. A single mission drain binds
 * templates for 8–12 slots; without this every slot repeats the same backend
 * fetch (and a transient failure silently drops the template lock for that slot).
 */
const templateListCache = new Map<string, { at: number; data: BrandDesignTemplateRecord[] }>();
const TEMPLATE_LIST_CACHE_TTL_MS = 60_000;

async function fetchDesignTemplateList(
  workspaceId: string,
): Promise<BrandDesignTemplateRecord[] | null> {
  const cached = templateListCache.get(workspaceId);
  if (cached && Date.now() - cached.at < TEMPLATE_LIST_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetchCrewBackendJson<BrandDesignTemplateRecord[]>(
    `/api/v1/design-templates/${workspaceId}`,
    { workspaceId, timeoutMs: 30_000 },
  );
  if (!res.ok) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        `[design-matcher] design-templates fetch failed workspace=${workspaceId} ` +
          `status=${res.status} error=${res.error ?? 'unknown'}`,
      );
    }
    // Stale cache beats losing the brand template lock mid-mission.
    return cached?.data ?? null;
  }
  const data = Array.isArray(res.data) ? res.data : [];
  templateListCache.set(workspaceId, { at: Date.now(), data });
  return data;
}

/** Test/ops hook — drop the cached template list (e.g. after template CRUD). */
export function invalidateDesignTemplateCache(workspaceId?: string): void {
  if (workspaceId) templateListCache.delete(workspaceId);
  else templateListCache.clear();
}

/**
 * Fetch the brand's active design templates and pick the best match for a slot.
 * Returns null when no design set exists (brand pre-dates the feature) so
 * callers fall back to default behavior with zero change.
 */
export async function matchDesignTemplateToSlot(
  workspaceId: string,
  opts: {
    slotRole: string;
    librarySlotKey: string | null | undefined;
    format: 'story' | 'post' | 'reel';
    caption?: string;
    headline?: string;
    announcementType?: string | null;
    templateUseCase?: string | null;
    catalogSlotKey?: string | null;
    /** When set, templates bound to disabled catalog slots are excluded. */
    brandActiveSlots?: BrandActiveSlotSet | null;
    /** Escape hatch — see SelectBrandDesignTemplateInput. */
    allowSoftFallbackWhenHardMiss?: boolean;
  },
): Promise<MatchedDesignTemplate | null> {
  const records = await fetchDesignTemplateList(workspaceId);
  if (!records || records.length === 0) {
    return null;
  }

  let active = records.filter((t) => t.status === 'active' || t.status === 'approved');
  if (opts.brandActiveSlots) {
    active = filterDesignTemplatesToActiveSlots(active, opts.brandActiveSlots);
  }
  if (active.length === 0) return null;

  const catalogKey = String(opts.catalogSlotKey ?? '').trim() || null;
  if (
    !catalogKey
    && opts.brandActiveSlots
    && opts.brandActiveSlots.enabledSlotKeys.size > 0
  ) {
    console.warn(
      `[design-matcher] catalog_slot_key missing while brand has ` +
        `${opts.brandActiveSlots.enabledSlotKeys.size} active catalog slots — soft match only ` +
        `role=${opts.slotRole} format=${opts.format}`,
    );
  }

  const selection = selectBrandDesignTemplate(active, {
    slotRole: opts.slotRole,
    librarySlotKey: opts.librarySlotKey,
    format: opts.format,
    caption: opts.caption,
    headline: opts.headline,
    announcementType: opts.announcementType,
    templateUseCase: opts.templateUseCase,
    catalogSlotKey: opts.catalogSlotKey,
    allowSoftFallbackWhenHardMiss: opts.allowSoftFallbackWhenHardMiss,
  });
  if (!selection) return null;

  const { matchQuality } = selection;
  const r = selection.record;
  const sd = r.design_spec ?? {};
  const sdSpecial = sd.specialDay as { name?: string; mmdd?: string; category?: string } | undefined;
  const colors = sd.brandColors as { primary?: string; accent?: string } | undefined;
  return {
    id: r.id,
    templateType: r.template_type,
    templateName: r.template_name,
    format: r.format,
    vibe: sd.vibe,
    galleryRef: (sd.galleryRef as string | null | undefined) ?? null,
    prominentLogo: Boolean(sd.prominentLogo),
    designSpecPrompt: typeof sd.prompt === 'string' ? sd.prompt : null,
    thumbnailUrl: r.thumbnail_url ?? null,
    brandColors:
      colors?.primary && colors?.accent
        ? { primary: colors.primary, accent: colors.accent }
        : null,
    logoUrl: typeof sd.logoUrl === 'string' ? sd.logoUrl : undefined,
    specialDay: sdSpecial?.name
      ? { name: sdSpecial.name, mmdd: sdSpecial.mmdd, category: sdSpecial.category }
      : undefined,
    directive: buildDirective(r),
    sampleHeadline: typeof sd.sampleHeadline === 'string' ? sd.sampleHeadline : null,
    sampleSubtitle: typeof sd.sampleSubtitle === 'string' ? sd.sampleSubtitle : null,
    layoutPattern: typeof sd.layoutPattern === 'string' ? sd.layoutPattern : null,
    designBriefDirectives: Array.isArray(sd.designBriefDirectives)
      ? sd.designBriefDirectives.filter((line): line is string => typeof line === 'string')
      : [],
    canvaArchetypeId: typeof sd.canvaArchetypeId === 'string' ? sd.canvaArchetypeId : null,
    canvaArchetypeName: typeof sd.canvaArchetypeName === 'string' ? sd.canvaArchetypeName : null,
    matchQuality,
  };
}

/** Fire-and-forget usage increment so popular templates surface in analytics. */
export async function recordDesignTemplateUsage(
  workspaceId: string,
  templateId: string,
): Promise<void> {
  try {
    await fetchCrewBackendJson(
      `/api/v1/design-templates/${workspaceId}/${templateId}`,
      {
        workspaceId,
        method: 'PATCH',
        timeoutMs: 6_000,
        body: { increment_usage: true },
      },
    );
  } catch {
    /* non-fatal */
  }
}

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
  /** Onboarding GPT-image prompt — layout lock for production. */
  designSpecPrompt: string | null;
  thumbnailUrl: string | null;
  brandColors: { primary: string; accent: string } | null;
  logoUrl: string | undefined;
  specialDay?: { name: string; mmdd?: string; category?: string };
  /** Short directive injected into the design prompt for brand consistency. */
  directive: string;
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

function scoreDesignTemplateRecord(
  record: BrandDesignTemplateRecord,
  candidates: string[],
  formats: string[],
  catalogSlotKey?: string | null,
): number {
  const formatOk = formats.includes(record.format);
  const typeRank = candidates.indexOf(record.template_type);
  if (typeRank < 0 && !formatOk) return 0;

  const catalogKey = record.catalog_slot_key
    ?? (record.design_spec?.catalogSlotKey as string | undefined)
    ?? null;
  const catalogMatch = catalogSlotKey && catalogKey === catalogSlotKey ? 80 : 0;

  const proximity = record.template_type === 'event_special'
    ? specialDayProximityBonus(record)
    : 0;
  const hasPreview = Boolean(record.thumbnail_url);
  const hasRecipe = Boolean(record.design_spec?.prompt);
  const usageBoost = Math.min(5, Math.floor(Number(record.usage_count ?? 0) / 3));

  return (
    catalogMatch +
    (typeRank >= 0 ? (candidates.length - typeRank) * 10 : 0) +
    (formatOk ? 8 : 0) +
    (hasPreview ? 24 : 0) +
    (hasRecipe ? 4 : 0) +
    usageBoost +
    proximity
  );
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
    const score =
      (record.thumbnail_url ? 30 : 0) +
      (record.design_spec?.prompt ? 6 : 0) +
      Math.min(4, Math.floor(Number(record.usage_count ?? 0) / 5));
    if (!best || score > best.score) best = { record, score };
  }
  return best?.record ?? null;
}

function buildDirective(record: BrandDesignTemplateRecord): string {
  const vibe = record.design_spec?.vibe;
  return [
    `Stay visually consistent with the brand's locked "${record.template_name}" template`,
    vibe ? `(${vibe} style)` : '',
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
  },
): Promise<MatchedDesignTemplate | null> {
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
    return null;
  }
  if (!Array.isArray(res.data) || res.data.length === 0) {
    return null;
  }

  let active = res.data.filter((t) => t.status === 'active' || t.status === 'approved');
  if (opts.brandActiveSlots) {
    active = filterDesignTemplatesToActiveSlots(active, opts.brandActiveSlots);
  }
  if (active.length === 0) return null;

  const formats = compatibleFormats(opts.format);
  const candidates = resolveDesignTemplateCandidateTypes({
    librarySlotKey: opts.librarySlotKey,
    slotRole: opts.slotRole,
    caption: opts.caption,
    headline: opts.headline,
    announcementType: opts.announcementType,
    templateUseCase: opts.templateUseCase,
    format: opts.format,
  });

  let best = pickBestDesignTemplate(active, candidates, formats, opts.catalogSlotKey);
  if (!best) {
    const fallbackRecord = pickFormatFallbackTemplate(active, formats);
    if (fallbackRecord) {
      best = {
        record: fallbackRecord,
        score: scoreDesignTemplateRecord(
          fallbackRecord,
          candidates,
          formats,
          opts.catalogSlotKey,
        ) || 1,
      };
      console.log(
        `[design-matcher] format fallback → "${fallbackRecord.template_name}" (${fallbackRecord.template_type})`,
      );
    }
  }

  if (!best) return null;

  const r = best.record;
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

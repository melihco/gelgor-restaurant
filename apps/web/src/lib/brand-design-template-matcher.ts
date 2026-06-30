/**
 * Brand design template matcher (production-side).
 *
 * At mission production time, selects the brand's onboarding-generated design
 * template that best fits a slot (by intent + format) and returns a concise
 * brand-consistency directive plus the template's preferred gallery reference.
 * This keeps every produced post/story/reel aligned with the locked,
 * brand-approved design set without overriding the slot's actual content.
 */

import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import type { TypographyVibe } from '@/types/brand-theme';

export interface BrandDesignTemplateRecord {
  id: string;
  template_type: string;
  template_name: string;
  format: string;
  thumbnail_url: string | null;
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

/**
 * Map a library slot key / slot role to candidate design template_types, in
 * priority order. Mirrors the onboarding preset taxonomy.
 */
function candidateTypesForSlot(
  librarySlotKey: string | null | undefined,
  slotRole: string,
  caption?: string,
): string[] {
  const key = (librarySlotKey ?? '').toLowerCase();
  const role = (slotRole ?? '').toLowerCase();
  const cap = (caption ?? '').toLowerCase();
  const hay = `${key} ${role} ${cap}`;

  if (/campaign|ad_creative|promo|indirim|discount|offer|fırsat|teklif|%/.test(hay)) {
    return ['campaign_announcement', 'seasonal_promo', 'announcement_formal'];
  }
  if (/event|etkinlik|dj|gece|night|live set|line.?up|party|parti/.test(hay)) {
    return ['event_special', 'daily_story', 'campaign_announcement'];
  }
  if (/social_proof|proof|review|yorum|memnuniyet/.test(hay)) {
    return ['social_proof'];
  }
  if (/menu|product|ürün|tabak|lezzet/.test(hay)) {
    return ['menu_highlight', 'venue_showcase'];
  }
  if (/duyuru|announcement|bilgilendirme|resmi/.test(hay)) {
    return ['announcement_formal', 'campaign_announcement'];
  }
  if (/venue|mekan|atmosfer|showcase|vitrin/.test(hay)) {
    return ['venue_showcase', 'daily_story'];
  }
  if (/reel|video|motion/.test(hay)) {
    return ['reel_cover', 'daily_story'];
  }
  if (/seasonal|sezon|yaz|kış|mevsim/.test(hay)) {
    return ['seasonal_promo', 'campaign_announcement'];
  }
  if (/editorial|brand|identity|kimlik/.test(hay)) {
    return ['brand_identity', 'venue_showcase'];
  }
  return ['daily_story', 'venue_showcase', 'campaign_announcement'];
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
  },
): Promise<MatchedDesignTemplate | null> {
  const res = await fetchCrewBackendJson<BrandDesignTemplateRecord[]>(
    `/api/v1/design-templates/${workspaceId}`,
    { workspaceId, timeoutMs: 8_000 },
  );
  if (!res.ok || !Array.isArray(res.data) || res.data.length === 0) {
    if (!res.ok && !warnedMissing) {
      warnedMissing = true;
      console.log('[design-matcher] no design templates available (skipping)');
    }
    return null;
  }

  const active = res.data.filter((t) => t.status === 'active');
  if (active.length === 0) return null;

  const formats = compatibleFormats(opts.format);
  const candidates = candidateTypesForSlot(opts.librarySlotKey, opts.slotRole, opts.caption);

  // Score: prefer exact template_type priority + format compatibility. For
  // event_special templates, a date-proximity bonus surfaces the right occasion
  // when its special day is near (and suppresses it off-date).
  let best: { record: BrandDesignTemplateRecord; score: number } | null = null;
  for (const record of active) {
    const formatOk = formats.includes(record.format);
    const typeRank = candidates.indexOf(record.template_type);
    if (typeRank < 0 && !formatOk) continue;
    const proximity = record.template_type === 'event_special'
      ? specialDayProximityBonus(record)
      : 0;
    const hasPreview = Boolean(record.thumbnail_url);
    const hasRecipe = Boolean(record.design_spec?.prompt);
    const score =
      (typeRank >= 0 ? (candidates.length - typeRank) * 10 : 0) +
      (formatOk ? 5 : 0) +
      (hasPreview ? 20 : 0) +
      (hasRecipe ? 2 : 0) +
      proximity;
    if (score <= 0) continue;
    if (!best || score > best.score) best = { record, score };
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

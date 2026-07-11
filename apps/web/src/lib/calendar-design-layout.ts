/**
 * Calendar design layout routing — announcement × format × sector → Canva archetype.
 *
 * MULTI-TENANT: No brand UUID branches. Sector overrides use canonical sector slugs only.
 * Mirrors S1 intensity routing in fal-design-intensity.ts.
 */

import {
  getCanvaArchetype,
  type CanvaArchetypeId,
} from '@/lib/canva-archetype-catalog';
import type { FalDesignChannel } from '@/lib/fal-design-intensity';
import { normalizeSectorId } from '@/lib/sector-production-profile';
import type { RemotionLayoutFamily } from '@/lib/remotion-template-types';

/** Calendar / ideation field — maps 1:1 to Canva archetype ids. */
export type CalendarDesignLayoutFamily = CanvaArchetypeId;

export type CalendarLayoutChannel = Extract<FalDesignChannel, 'story' | 'post'>;

const DEFAULT_CALENDAR_LAYOUT: Record<string, Partial<Record<CalendarLayoutChannel, CanvaArchetypeId>>> = {
  product_reveal: { story: 'cinematic_full_bleed', post: 'product_hero_card' },
  venue_showcase: { story: 'cinematic_full_bleed', post: 'split_feature_panel' },
  behind_the_scenes: { story: 'polaroid_memory', post: 'magazine_cover_drop' },
  event_teaser: { story: 'editorial_date_masthead', post: 'event_ticket_stub' },
  offer_campaign: { story: 'campaign_hero_block', post: 'promo_price_stack' },
  social_proof: { story: 'frosted_quote_card', post: 'social_proof_banner' },
};

/** Sector-specific layout overrides — tenant-agnostic vertical playbooks. */
const SECTOR_CALENDAR_LAYOUT_OVERRIDES: Record<
  string,
  Partial<Record<string, Partial<Record<CalendarLayoutChannel, CanvaArchetypeId>>>>
> = {
  beach_club: {
    event_teaser: { story: 'neon_night_promo', post: 'diagonal_brand_split' },
    product_reveal: { story: 'cinematic_full_bleed', post: 'product_hero_card' },
    offer_campaign: { story: 'diagonal_brand_split', post: 'campaign_hero_block' },
  },
  local_products_shop: {
    product_reveal: { story: 'product_hero_card', post: 'graphic_shape_stack' },
    behind_the_scenes: { story: 'polaroid_memory', post: 'before_after_diptych' },
    social_proof: { story: 'frosted_quote_card', post: 'location_pin_card' },
  },
  hotel_resort: {
    event_teaser: { story: 'editorial_date_masthead', post: 'event_ticket_stub' },
    venue_showcase: { story: 'cinematic_full_bleed', post: 'magazine_cover_drop' },
    offer_campaign: { story: 'campaign_hero_block', post: 'promo_price_stack' },
  },
  restaurant_cafe: {
    product_reveal: { story: 'product_hero_card', post: 'split_feature_panel' },
    offer_campaign: { story: 'campaign_hero_block', post: 'promo_price_stack' },
    social_proof: { story: 'frosted_quote_card', post: 'social_proof_banner' },
  },
  nightclub_lounge: {
    event_teaser: { story: 'neon_night_promo', post: 'diagonal_brand_split' },
    offer_campaign: { story: 'diagonal_brand_split', post: 'campaign_hero_block' },
  },
};

/** Canva archetype → Remotion layout_family_hint for production-stack diversity. */
export const CANVA_TO_REMOTION_LAYOUT: Partial<Record<CanvaArchetypeId, RemotionLayoutFamily>> = {
  cinematic_full_bleed: 'cinematic_center',
  product_hero_card: 'editorial_product_stage',
  split_feature_panel: 'split_panel',
  magazine_cover_drop: 'magazine_cover',
  polaroid_memory: 'polaroid_single',
  editorial_date_masthead: 'magazine_cover',
  event_ticket_stub: 'event_ticket',
  campaign_hero_block: 'campaign_hero',
  promo_price_stack: 'campaign_hero',
  frosted_quote_card: 'frosted_glass',
  social_proof_banner: 'quote_card',
  diagonal_brand_split: 'bold_impact',
  neon_night_promo: 'neon_night',
  graphic_shape_stack: 'bento_story',
  before_after_diptych: 'diptych_collage',
  location_pin_card: 'location_pin',
  noir_editorial: 'noir_editorial',
  gallery_carousel_tease: 'gallery_series',
};

function normalizeAnnouncementKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeLayoutChannel(channel: CalendarLayoutChannel): CalendarLayoutChannel {
  return channel === 'story' ? 'story' : 'post';
}

export function isKnownCalendarDesignLayoutFamily(value: unknown): value is CalendarDesignLayoutFamily {
  return typeof value === 'string' && Boolean(getCanvaArchetype(value));
}

export function remotionLayoutHintForCanvaArchetype(
  archetypeId: CanvaArchetypeId,
): RemotionLayoutFamily {
  return CANVA_TO_REMOTION_LAYOUT[archetypeId] ?? 'split_panel';
}

function resolveFromMatrix(
  announcementType: string,
  channel: CalendarLayoutChannel,
  sector?: string,
): CanvaArchetypeId | null {
  const key = normalizeAnnouncementKey(announcementType);
  if (!key) return null;

  const sectorKey = normalizeSectorId(sector ?? '') || 'default';
  const sectorOverride = SECTOR_CALENDAR_LAYOUT_OVERRIDES[sectorKey]?.[key]?.[channel];
  if (sectorOverride) return sectorOverride;

  return DEFAULT_CALENDAR_LAYOUT[key]?.[channel] ?? null;
}

/**
 * Resolve calendar design layout for a content_calendar row or enriched ideation slot.
 * Priority: explicit design_layout_family → sector announcement matrix → split_feature_panel.
 */
export function resolveCalendarDesignLayout(input: {
  announcementType: string;
  channel: CalendarLayoutChannel;
  sector?: string;
  explicitLayoutFamily?: string | null;
}): {
  canvaArchetypeId: CanvaArchetypeId;
  layoutFamilyHint: RemotionLayoutFamily;
  source: string;
} {
  const channel = normalizeLayoutChannel(input.channel);
  const explicit = String(input.explicitLayoutFamily ?? '').trim();
  if (explicit && isKnownCalendarDesignLayoutFamily(explicit)) {
    const archetype = explicit as CanvaArchetypeId;
    return {
      canvaArchetypeId: archetype,
      layoutFamilyHint: remotionLayoutHintForCanvaArchetype(archetype),
      source: 'calendar:design_layout_family',
    };
  }

  const fromMatrix = resolveFromMatrix(input.announcementType, channel, input.sector);
  if (fromMatrix) {
    const sectorKey = normalizeSectorId(input.sector ?? '') || 'default';
    const key = normalizeAnnouncementKey(input.announcementType);
    const sectorSpecific = SECTOR_CALENDAR_LAYOUT_OVERRIDES[sectorKey]?.[key]?.[channel];
    return {
      canvaArchetypeId: fromMatrix,
      layoutFamilyHint: remotionLayoutHintForCanvaArchetype(fromMatrix),
      source: sectorSpecific
        ? `sector_matrix:${sectorKey}:${key}`
        : `announcement_matrix:${key}`,
    };
  }

  const fallback: CanvaArchetypeId = 'split_feature_panel';
  return {
    canvaArchetypeId: fallback,
    layoutFamilyHint: remotionLayoutHintForCanvaArchetype(fallback),
    source: 'default_split_feature_panel',
  };
}

export function readIdeaDesignLayoutFamily(idea: Record<string, unknown>): string {
  return String(
    idea.design_layout_family
    ?? idea.designLayoutFamily
    ?? (idea.visual_production_spec as Record<string, unknown> | undefined)?.design_layout_family
    ?? '',
  ).trim();
}

/** Only user/agent-locked layout from calendar row — derived matrix hints do not block sector routing. */
export function readExplicitCalendarDesignLayoutFamily(idea: Record<string, unknown>): string {
  const source = String(idea.design_layout_source ?? '').trim();
  if (source === 'calendar:design_layout_family') {
    return readIdeaDesignLayoutFamily(idea);
  }
  if (idea.design_layout_locked === true) {
    return readIdeaDesignLayoutFamily(idea);
  }
  return '';
}

export function calendarLayoutChannelFromIdea(idea: Record<string, unknown>): CalendarLayoutChannel {
  const fmt = String(idea.format ?? idea.content_kind ?? idea.content_type ?? '').toLowerCase();
  return fmt.includes('story') ? 'story' : 'post';
}

/** Persist resolved layout fields on a production idea record. */
export function applyCalendarDesignLayoutToIdea(
  idea: Record<string, unknown>,
  layout: ReturnType<typeof resolveCalendarDesignLayout>,
): Record<string, unknown> {
  const existingVps = typeof idea.visual_production_spec === 'object' && idea.visual_production_spec
    ? { ...(idea.visual_production_spec as Record<string, unknown>) }
    : {};
  return {
    ...idea,
    design_layout_family: layout.canvaArchetypeId,
    design_layout_source: layout.source,
    design_layout_locked: layout.source === 'calendar:design_layout_family',
    layout_family_hint: layout.layoutFamilyHint,
    visual_production_spec: {
      ...existingVps,
      design_layout_family: layout.canvaArchetypeId,
      canva_archetype: layout.canvaArchetypeId,
    },
  };
}

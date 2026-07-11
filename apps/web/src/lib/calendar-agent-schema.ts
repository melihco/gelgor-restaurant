/**
 * content_calendar agent field hints — SSOT for optional plan fields (S3 design_layout_family).
 */

import {
  resolveCalendarDesignLayout,
  type CalendarLayoutChannel,
} from '@/lib/calendar-design-layout';
import type { CanvaArchetypeId } from '@/lib/canva-archetype-catalog';

/** Optional fields agents may set on each calendar plan row. */
export const CALENDAR_PLAN_OPTIONAL_FIELDS = [
  'design_layout_family',
  'announcement_type',
  'event_name',
  'tagline',
  'content_brief',
  'photo_mood',
  'date',
  'time',
  'format',
  'venue_area',
  'dj_lineup',
  'artist_name',
] as const;

const KNOWN_ARCHETYPES: CanvaArchetypeId[] = [
  'cinematic_full_bleed',
  'product_hero_card',
  'split_feature_panel',
  'editorial_date_masthead',
  'event_ticket_stub',
  'neon_night_promo',
  'campaign_hero_block',
  'promo_price_stack',
  'diagonal_brand_split',
  'frosted_quote_card',
  'social_proof_banner',
  'magazine_cover_drop',
  'polaroid_memory',
  'graphic_shape_stack',
];

/**
 * Agent guidance block — inject into content_calendar task prompts.
 * Sector-agnostic list; matrix resolves per tenant sector at production time.
 */
export function buildContentCalendarLayoutAgentHint(sector?: string): string {
  const samples = [
    { announcement_type: 'product_reveal', format: 'story' },
    { announcement_type: 'event_teaser', format: 'story' },
    { announcement_type: 'offer_campaign', format: 'post' },
  ].map((row) => {
    const layout = resolveCalendarDesignLayout({
      announcementType: row.announcement_type,
      channel: row.format as CalendarLayoutChannel,
      sector,
    });
    return `${row.announcement_type} (${row.format}) → design_layout_family: "${layout.canvaArchetypeId}"`;
  });

  return [
    'Optional per-row field: design_layout_family (Canva archetype id).',
    'When omitted, production derives layout from announcement_type + format + sector.',
    'Allowed values:',
    KNOWN_ARCHETYPES.map((id) => `- ${id}`).join('\n'),
    'Suggested defaults for this sector:',
    ...samples.map((s) => `- ${s}`),
  ].join('\n');
}

/** Normalize agent-supplied design_layout_family on a raw calendar plan row. */
export function normalizeCalendarPlanDesignLayout(
  plan: Record<string, unknown>,
  sector?: string,
): Record<string, unknown> {
  const explicit = String(plan.design_layout_family ?? plan.designLayoutFamily ?? '').trim();
  if (explicit) {
    return {
      ...plan,
      design_layout_family: explicit,
      design_layout_locked: true,
    };
  }

  const announcement = String(
    plan.announcement_type ?? plan.type ?? plan.template_use_case ?? '',
  ).trim();
  const fmt = String(plan.format ?? 'post').toLowerCase();
  const channel: CalendarLayoutChannel = fmt.includes('story') ? 'story' : 'post';
  const layout = resolveCalendarDesignLayout({
    announcementType: announcement,
    channel,
    sector,
  });

  return {
    ...plan,
    design_layout_family: layout.canvaArchetypeId,
    design_layout_source: layout.source,
  };
}

/**
 * Curated Agency showcase — 12 strongest templates (Sprint 1 vibe upgrade).
 * One standout variant per layout family; ordered for visual variety in showcase.
 */
export const AGENCY_VIBE_PICK_TEMPLATE_IDS = [
  'remotion_vibe_fullscreen_04',
  'remotion_quote_card_01',
  'remotion_location_pin_01',
  'remotion_neon_night_02',
  'remotion_bento_story_01',
  'remotion_event_ticket_03',
  'remotion_asymmetric_editorial_02',
  'remotion_minimal_luxury_01',
  'remotion_mosaic_pinterest_03',
  'remotion_neon_night_01',
  'remotion_vibe_fullscreen_01',
  'remotion_bento_story_06',
] as const;

export type AgencyVibePickId = (typeof AGENCY_VIBE_PICK_TEMPLATE_IDS)[number];

const PICK_SET = new Set<string>(AGENCY_VIBE_PICK_TEMPLATE_IDS);

export function isAgencyVibePick(templateId: string): boolean {
  return PICK_SET.has(templateId);
}

/** Preserve curated order when filtering catalog rows. */
export function sortByVibePickOrder<T extends { id: string }>(items: T[]): T[] {
  const rank = new Map<string, number>(
    AGENCY_VIBE_PICK_TEMPLATE_IDS.map((id, i) => [id, i]),
  );
  return [...items].sort((a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999));
}

export function filterAgencyVibePicks<T extends { id: string }>(items: T[]): T[] {
  return sortByVibePickOrder(items.filter((t) => PICK_SET.has(t.id)));
}

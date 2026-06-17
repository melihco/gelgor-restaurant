/**
 * Agency featured story templates — showcase / dropdown öne çıkanlar.
 * Tüm katalog artık collection=Agency; bu liste "editör seçkisi" (22 aile × 1 varyant).
 */
import { AGENCY_FEATURED_STORY_TEMPLATE_IDS } from './agency-template-standard';

export const AGENCY_VIBE_PICK_TEMPLATE_IDS = AGENCY_FEATURED_STORY_TEMPLATE_IDS;

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

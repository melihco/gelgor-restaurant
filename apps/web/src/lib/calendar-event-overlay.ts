/**
 * Calendar event overlay — multi-line date/time/tagline for event announcement slots.
 * S4: poster-quality stacked typography; date/time in overlay layer, not baked into photo.
 */

import type { CanvaArchetypeId } from '@/lib/canva-archetype-catalog';

export const EVENT_CALENDAR_ANNOUNCEMENTS = new Set([
  'event_teaser',
  'event_announcement',
  'event',
]);

export const EVENT_POSTER_ARCHETYPES = new Set<CanvaArchetypeId>([
  'editorial_date_masthead',
  'event_ticket_stub',
  'neon_night_promo',
  'campaign_hero_block',
]);

export function isEventCalendarAnnouncement(type: string): boolean {
  const key = type.trim().toLowerCase().replace(/\s+/g, '_');
  return EVENT_CALENDAR_ANNOUNCEMENTS.has(key);
}

export function isEventPosterArchetype(archetypeId: string | null | undefined): boolean {
  return Boolean(archetypeId && EVENT_POSTER_ARCHETYPES.has(archetypeId as CanvaArchetypeId));
}

function readEventDetails(idea: Record<string, unknown>): Record<string, unknown> {
  const raw = idea.event_details;
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function pickLine(...values: unknown[]): string {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

/**
 * Build stacked overlay copy for event calendar rows.
 * headline = event title; subtitle = date/time + tagline (multi-line via separator).
 */
export function resolveCalendarEventOverlay(input: {
  idea: Record<string, unknown>;
  announcementType: string;
  headline: string;
  canvaArchetypeId?: string | null;
}): {
  headline: string;
  subtitle?: string;
  directives: string[];
} | null {
  if (!isEventCalendarAnnouncement(input.announcementType)) return null;

  const ev = readEventDetails(input.idea);
  const eventHeadline = pickLine(
    input.headline,
    input.idea.concept_title,
    input.idea.event_name,
  );
  if (!eventHeadline) return null;

  const dateLine = pickLine(ev.date, input.idea.publish_schedule_day, input.idea.date);
  const timeLine = pickLine(ev.time, input.idea.publish_schedule_time);
  const scheduleLine = [dateLine, timeLine].filter(Boolean).join(' · ');

  const supportLine = pickLine(
    ev.tagline,
    ev.artist_name,
    ev.lineup,
    ev.dj,
    input.idea.tagline,
    input.idea.subline,
  );

  const subtitle = [scheduleLine, supportLine].filter(Boolean).join(' | ').slice(0, 96) || undefined;

  const archetype = String(input.canvaArchetypeId ?? '').trim();
  const posterLayout = isEventPosterArchetype(archetype);

  const directives = [
    'EVENT OVERLAY (multi-line): Render a designed typography STACK — never environmental text baked into the photo.',
    `Line 1 (headline): "${eventHeadline.slice(0, 56)}" — largest display type, upper or center-left zone.`,
    scheduleLine
      ? `Line 2 (date/time): "${scheduleLine.slice(0, 48)}" — clear readable row beneath headline.`
      : 'Line 2 (date/time): reserve a readable date/time row when schedule is known.',
    supportLine
      ? `Line 3 (support): "${supportLine.slice(0, 48)}" — tagline, DJ, or lineup hint; smaller than line 2.`
      : undefined,
    posterLayout
      ? 'Poster/event layout — agency concert-flyer energy: hierarchy must read at phone preview size.'
      : 'Keep event metadata in designed overlay blocks only — not painted on walls, tables, or signage in the photo.',
  ].filter((line): line is string => Boolean(line));

  return {
    headline: eventHeadline,
    subtitle,
    directives,
  };
}

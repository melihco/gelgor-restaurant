import { describe, expect, it } from 'vitest';
import {
  isEventCalendarAnnouncement,
  isEventPosterArchetype,
  resolveCalendarEventOverlay,
} from '@/lib/calendar-event-overlay';

describe('resolveCalendarEventOverlay', () => {
  it('returns null for non-event announcement types', () => {
    expect(
      resolveCalendarEventOverlay({
        idea: { concept_title: 'Summer Menu' },
        announcementType: 'product_reveal',
        headline: 'Summer Menu',
      }),
    ).toBeNull();
  });

  it('builds multi-line subtitle and directives for event teaser', () => {
    const result = resolveCalendarEventOverlay({
      idea: {
        concept_title: 'Sunset Sessions',
        event_details: {
          date: 'July 12',
          time: '21:00',
          artist_name: 'DJ Nova',
        },
      },
      announcementType: 'event_teaser',
      headline: 'Sunset Sessions',
      canvaArchetypeId: 'neon_night_promo',
    });

    expect(result).not.toBeNull();
    expect(result?.headline).toBe('Sunset Sessions');
    expect(result?.subtitle).toContain('July 12');
    expect(result?.subtitle).toContain('DJ Nova');
    expect(result?.directives.some((d) => d.includes('EVENT OVERLAY'))).toBe(true);
    expect(result?.directives.some((d) => d.includes('Poster/event layout'))).toBe(true);
  });

  it('uses tagline from idea when event_details is empty', () => {
    const result = resolveCalendarEventOverlay({
      idea: { tagline: 'Live on the terrace' },
      announcementType: 'event',
      headline: 'Friday Night',
    });
    expect(result?.subtitle).toContain('Live on the terrace');
  });
});

describe('event helpers', () => {
  it('detects event announcements and poster archetypes', () => {
    expect(isEventCalendarAnnouncement('event_teaser')).toBe(true);
    expect(isEventCalendarAnnouncement('offer_campaign')).toBe(false);
    expect(isEventPosterArchetype('event_ticket_stub')).toBe(true);
    expect(isEventPosterArchetype('cinematic_full_bleed')).toBe(false);
  });
});

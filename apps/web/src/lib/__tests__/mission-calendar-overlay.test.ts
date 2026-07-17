import { describe, expect, it } from 'vitest';
import {
  applyCalendarProductionEnrichment,
  applyCalendarScheduleOverlay,
  buildMissionProductionIdeas,
  ensureWeeklyFormatCoverage,
  isContentScopedProductionPool,
  mergeCalendarPlansForProduction,
} from '@/lib/mission-production-plan';
import { CALENDAR_PRODUCTION_IDEA_INDEX_BASE } from '@/lib/calendar-production-pack';

describe('applyCalendarProductionEnrichment', () => {
  const ideation = [
    {
      concept_title: 'Erken Hasat Zeytinyağı',
      caption_draft: 'Datça zeytinyağı hikayesi.',
      content_type: 'instagram_post',
      hashtags: ['#Datça'],
    },
    {
      headline: 'Hafta Sonu Brunch',
      caption_draft: 'Brunch menüsü duyurusu.',
      content_type: 'instagram_story',
    },
  ];

  const calendarPlans = [
    {
      event_name: 'Erken Hasat Zeytinyağı',
      format: 'post',
      day: 'Fri',
      time: '10:00',
      announcement_type: 'product_launch',
      content_brief: 'Premium early harvest olive oil launch brief.',
      photo_mood: 'sunlit grove, golden hour',
    },
    {
      title: 'Hafta Sonu Brunch',
      format: 'story',
      date: '2026-06-28',
      time: '11:00',
      photo_mood: 'warm brunch terrace',
    },
  ];

  it('enriches matched ideation with calendar brief, mood, and schedule', () => {
    const { ideas } = applyCalendarProductionEnrichment(ideation, calendarPlans);

    expect(ideas).toHaveLength(2);
    expect(ideas[0]?.calendar_enriched).toBe(true);
    expect(ideas[0]?.content_brief).toBe('Premium early harvest olive oil launch brief.');
    expect(ideas[0]?.photo_mood).toBe('sunlit grove, golden hour');
    expect(ideas[0]?.publish_schedule_day).toBe('Fri');
    expect(ideas[0]?.publish_schedule_time).toBe('10:00');
    expect(ideas[0]?.fal_design_hint).toContain('sunlit grove');
  });

  it('keeps the ideation publish caption — visual brief never becomes caption_draft', () => {
    const { ideas } = applyCalendarProductionEnrichment(ideation, calendarPlans);

    // Real ideation copy stays as the feed caption for both sectors' content shapes.
    expect(ideas[0]?.caption_draft).toBe('Datça zeytinyağı hikayesi.');
    expect(ideas[0]?.caption).toBe('Datça zeytinyağı hikayesi.');
    expect(ideas[1]?.caption_draft).toBe('Brunch menüsü duyurusu.');
    // The scene-describing brief stays in content_brief / VPS only.
    expect(ideas[0]?.caption_draft).not.toContain('launch brief');
  });

  it('preserves ideation marketing title when calendar event_name differs', () => {
    const ideation = [
      {
        concept_title: 'Dive into OUR SUNSET RITUAL!!',
        headline: 'Join us for a taste',
        caption_draft: 'Join us for a taste of paradise at sunset.',
        content_type: 'instagram_post',
      },
    ];
    const calendarPlans = [
      {
        event_name: 'Join us for a taste',
        idea_index: 0,
        format: 'post',
        day: 'Fri',
        content_brief: 'Sunset terrace mood — chairs facing the Aegean.',
        photo_mood: 'golden hour terrace',
      },
    ];
    const { ideas } = applyCalendarProductionEnrichment(ideation, calendarPlans);
    expect(ideas[0]?.headline).toBe('Dive into OUR SUNSET RITUAL!!');
    expect(ideas[0]?.concept_title).toBe('Dive into OUR SUNSET RITUAL!!');
    expect(ideas[0]?.content_brief).toBe('Sunset terrace mood — chairs facing the Aegean.');
    expect(ideas[0]?.calendar_enriched).toBe(true);
  });

  it('returns orphan calendar rows when no ideation headline match', () => {
    const orphanCalendar = [
      ...calendarPlans,
      {
        event_name: 'Weekend DJ Nights',
        tagline: 'Get ready for the beats!',
        content_brief: 'Vibrant DJ night announcement by the beach.',
        photo_mood: 'dynamic colorful crowd enjoying music',
        format: 'story',
        day: 'Sat',
        time: '20:00',
        announcement_type: 'event_teaser',
        priority: 'recommended',
      },
    ];
    const { ideas, orphanCalendarIdeas } = applyCalendarProductionEnrichment(
      ideation,
      orphanCalendar,
    );
    expect(ideas).toHaveLength(2);
    expect(orphanCalendarIdeas).toHaveLength(1);
    expect(orphanCalendarIdeas[0]?.headline).toBe('Weekend DJ Nights');
    expect(orphanCalendarIdeas[0]?.source_track).toBe('calendar');
    expect(orphanCalendarIdeas[0]?.idea_index).toBe(CALENDAR_PRODUCTION_IDEA_INDEX_BASE + 2);
  });
});

describe('mergeCalendarPlansForProduction', () => {
  it('keeps ideation-only pool when calendar orphan does not match', () => {
    const production = mergeCalendarPlansForProduction(
      [{ concept_title: 'Generic post', content_type: 'instagram_post', caption_draft: 'x' }],
      [{
        event_name: 'Fresh Seafood Menu Launch',
        format: 'post',
        content_brief: 'Showcase the new seafood menu with ocean bounty.',
        photo_mood: 'elegant seafood plating',
        announcement_type: 'product_reveal',
        day: 'Wed',
        time: '12:00',
      }],
      'agency',
    );
    expect(production).toHaveLength(1);
    expect(production[0]?.production_scope).toBe('ideation');
    expect(production.some((row) => row.headline === 'Fresh Seafood Menu Launch')).toBe(false);
  });

  it('enriches matched ideation without adding a calendar twin row', () => {
    const production = mergeCalendarPlansForProduction(
      [{ concept_title: 'Sunset Ritual', content_type: 'instagram_post', caption_draft: 'golden hour' }],
      [{
        event_name: 'Sunset Ritual',
        format: 'post',
        content_brief: 'Calendar publish brief.',
        day: 'Fri',
        time: '18:00',
      }],
    );
    expect(production).toHaveLength(1);
    expect(production[0]?.production_scope).toBe('ideation');
    expect(production[0]?.calendar_enriched).toBe(true);
    expect(production[0]?.content_brief).toBe('Calendar publish brief.');
    expect(production[0]?.publish_schedule_day).toBe('Fri');
  });

  it('idea_count pool is not padded or trimmed by ensureWeeklyFormatCoverage', () => {
    const production = mergeCalendarPlansForProduction(
      Array.from({ length: 10 }, (_, i) => ({
        concept_title: `Idea ${i}`,
        content_type: 'instagram_post',
        caption_draft: `caption ${i}`,
      })),
      Array.from({ length: 12 }, (_, i) => ({
        event_name: `Idea ${i}`,
        format: 'post',
        content_brief: `brief ${i}`,
        day: 'Mon',
        time: '10:00',
        idea_index: i < 10 ? i : undefined,
      })),
    );
    expect(production.length).toBe(10);
    expect(isContentScopedProductionPool(production)).toBe(true);
    const passThrough = ensureWeeklyFormatCoverage(production, production, 'agency');
    expect(passThrough.length).toBe(10);
  });
});

describe('applyCalendarScheduleOverlay (compat)', () => {
  it('returns enriched ideation rows only', () => {
    const result = applyCalendarScheduleOverlay(
      [{ concept_title: 'Match Me', caption_draft: 'old', content_type: 'instagram_post' }],
      [{ event_name: 'Match Me', format: 'post', content_brief: 'New brief from calendar.' }],
    );
    expect(result[0]?.content_brief).toBe('New brief from calendar.');
  });
});

describe('buildMissionProductionIdeas with calendar overlay', () => {
  it('enriches matched ideation and drops orphan calendar from production pool', () => {
    const nodes = [
      {
        node_key: 'content_ideation',
        task_type: 'content_ideation',
        status: 'completed',
        output_summary: JSON.stringify([
          {
            concept_title: 'Tek fikir',
            caption_draft: 'Caption korunmalı.',
            content_type: 'instagram_post',
          },
        ]),
      },
      {
        node_key: 'content_calendar',
        task_type: 'content_calendar',
        status: 'completed',
        output_summary: JSON.stringify([
          {
            event_name: 'Tek fikir',
            format: 'post',
            day: 'Mon',
            time: '09:00',
            content_brief: 'Calendar brief wins when richer.',
          },
          {
            event_name: 'Weekend DJ Nights',
            format: 'story',
            content_brief: 'DJ night at the beach.',
            announcement_type: 'event_teaser',
          },
        ]),
      },
    ];

    const production = buildMissionProductionIdeas({ nodes });
    const matched = production.find((row) => row.concept_title === 'Tek fikir');

    expect(production).toHaveLength(1);
    expect(matched?.publish_schedule_day).toBe('Mon');
    expect(matched?.content_brief).toBe('Calendar brief wins when richer.');
    expect(matched?.caption_draft).toBe('Caption korunmalı.');
    expect(production.some((row) => row.headline === 'Weekend DJ Nights')).toBe(false);
  });
});

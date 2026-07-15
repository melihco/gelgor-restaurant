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
  it('returns ideation + orphan calendar rows without weekly format backfill', () => {
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
    const calendarRow = production.find((row) => row.headline === 'Fresh Seafood Menu Launch');
    expect(calendarRow).toBeDefined();
    expect(calendarRow?.calendar_gallery_designed).toBe(true);
    expect(production).toHaveLength(2);
  });

  it('also produces matched calendar plans as separate rows (additive)', () => {
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
    expect(production).toHaveLength(2);
    expect(production.filter((row) => row.production_scope === 'ideation')).toHaveLength(1);
    expect(production.filter((row) => row.production_scope === 'calendar_plan')).toHaveLength(1);
    expect(production.find((row) => row.production_scope === 'ideation')?.calendar_enriched).toBe(true);
  });

  it('isContentScopedProductionPool detects additive rows so weekly trim is skipped', () => {
    const production = mergeCalendarPlansForProduction(
      Array.from({ length: 10 }, (_, i) => ({
        concept_title: `Idea ${i}`,
        content_type: 'instagram_post',
        caption_draft: `caption ${i}`,
      })),
      Array.from({ length: 12 }, (_, i) => ({
        event_name: `Cal ${i}`,
        format: 'post',
        content_brief: `brief ${i}`,
        day: 'Mon',
        time: '10:00',
      })),
    );
    expect(production.length).toBe(22);
    expect(isContentScopedProductionPool(production)).toBe(true);
    // Regression: weekly coverage must not be applied by callers on content-scoped pools.
    // If mis-applied it would shrink toward package geometry (~12-16).
    const wronglyTrimmed = ensureWeeklyFormatCoverage(production, production, 'agency');
    expect(wronglyTrimmed.length).toBeLessThan(production.length);
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
  it('uses calendar brief on matched rows and orphans in production pool', () => {
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
    const orphan = production.find((row) => row.headline === 'Weekend DJ Nights');
    const calendarMatched = production.find(
      (row) => row.production_scope === 'calendar_plan',
    );

    expect(production).toHaveLength(3);
    expect(matched?.publish_schedule_day).toBe('Mon');
    expect(matched?.content_brief).toBe('Calendar brief wins when richer.');
    expect(orphan?.source_track).toBe('calendar');
    expect(calendarMatched?.content_brief).toBe('Calendar brief wins when richer.');
  });
});

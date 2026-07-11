import { describe, expect, it } from 'vitest';
import {
  appendCalendarProductionIdeas,
  buildCalendarFalSceneHint,
  buildCalendarProductionIdeas,
  buildCalendarProductionQueue,
  calendarGalleryMatchCaption,
  CALENDAR_PRODUCTION_IDEA_INDEX_BASE,
  isCalendarProductionIdea,
  normalizeCalendarPlanToProductionIdea,
  resolveCalendarSlotAssignment,
} from '@/lib/calendar-production-pack';

const meetTheMakerPlan = {
  event_name: 'Meet the Maker: Local Artisans',
  tagline: 'Discover the stories behind our products',
  content_brief: "Introduce the 'Meet the Maker' series showcasing local artisans and their craftsmanship.",
  photo_mood: 'cozy artisan workshop or studio vibe',
  date: 'July 1, 2026',
  time: '2 PM',
  format: 'story',
  announcement_type: 'event_teaser',
  priority: 'recommended',
};

describe('calendar-production-pack', () => {
  it('normalizes calendar row with headline, caption, vibe, schedule, and track metadata', () => {
    const idea = normalizeCalendarPlanToProductionIdea(meetTheMakerPlan, 1);
    expect(idea.idea_index).toBe(CALENDAR_PRODUCTION_IDEA_INDEX_BASE + 1);
    expect(idea.source_track).toBe('calendar');
    expect(idea.headline).toBe('Meet the Maker: Local Artisans');
    expect(idea.caption_draft).toContain('Meet the Maker');
    expect(idea.photo_mood).toBe('cozy artisan workshop or studio vibe');
    expect(idea.calendar_announcement_type).toBe('event_teaser');
    expect(idea.content_kind).toBe('instagram_story');
    expect(idea.posting_time_suggestion).toContain('July 1, 2026');
  });

  it('builds fal scene hint from announcement type, mood, and brief', () => {
    const idea = normalizeCalendarPlanToProductionIdea(meetTheMakerPlan, 0);
    const hint = buildCalendarFalSceneHint(idea);
    expect(hint).toContain('event teaser');
    expect(hint).toContain('cozy artisan workshop');
    expect(hint).toContain('Discover the stories');
  });

  it('routes calendar story event teaser to fal_story motion pipeline', () => {
    const ideas = buildCalendarProductionIdeas([meetTheMakerPlan]);
    const queue = buildCalendarProductionQueue(ideas);
    expect(queue).toHaveLength(1);
    expect(queue[0]!.assignment.slot_role).toBe('campaign_story_motion');
    expect(queue[0]!.assignment.pipeline).toBe('fal_story');
    expect(queue[0]!.assignment.library_slot_key).toBe('event_story');
    expect(queue[0]!.assignment.layout_family_hint).toBe('magazine_cover');
    expect(queue[0]!.assignment.fal_design_hint).toContain('layout:editorial_date_masthead');
    expect(ideas[0]!.design_layout_family).toBe('editorial_date_masthead');
  });

  it('routes calendar product story to gallery-designed fal with product layout', () => {
    const idea = normalizeCalendarPlanToProductionIdea({
      event_name: 'New Citrus Cocktail Launch',
      tagline: 'Taste the essence of Bodrum',
      content_brief: 'Showcase our refreshing new citrus cocktail featuring local Bodrum mandarins.',
      photo_mood: 'bright and inviting bar scene with a focus on the cocktail',
      format: 'story',
      announcement_type: 'product_reveal',
    }, 0);
    const queue = buildCalendarProductionQueue([idea]);
    expect(queue[0]!.assignment.slot_role).toBe('campaign_story_motion');
    expect(queue[0]!.assignment.pipeline).toBe('fal_story');
    expect(idea.calendar_gallery_designed).toBe(true);
    expect(idea.design_layout_family).toBe('cinematic_full_bleed');
    expect(queue[0]!.assignment.layout_family_hint).toBe('cinematic_center');
  });

  it('routes calendar event story to fal_story motion slot', () => {
    const idea = normalizeCalendarPlanToProductionIdea({
      event_name: 'Sunset DJ Night',
      tagline: 'Live on the terrace',
      format: 'story',
      announcement_type: 'event_teaser',
      date: 'July 12',
      time: '21:00',
    }, 1);
    const assignment = resolveCalendarSlotAssignment(idea, 0);
    expect(assignment.slot_role).toBe('campaign_story_motion');
    expect(assignment.pipeline).toBe('fal_story');
    expect(assignment.library_slot_key).toBe('event_story');
  });
  it('builds gallery match caption from brief + mood + tagline', () => {
    const idea = normalizeCalendarPlanToProductionIdea(meetTheMakerPlan, 0);
    const matchCaption = calendarGalleryMatchCaption(idea);
    expect(matchCaption).toContain('Meet the Maker');
    expect(matchCaption).toContain('cozy artisan workshop');
    expect(matchCaption).toContain('Discover the stories');
  });

  it('does not append additive calendar production ideas (schedule overlay only)', () => {
    const ideation = [{ idea_index: 0, headline: 'Weekly post', source_node: 'content_ideation' }];
    const mergedOnce = appendCalendarProductionIdeas(ideation, [meetTheMakerPlan]);
    const mergedTwice = appendCalendarProductionIdeas(
      [...ideation, ...buildCalendarProductionIdeas([meetTheMakerPlan])],
      [meetTheMakerPlan],
    );
    expect(mergedOnce).toHaveLength(1);
    expect(mergedTwice).toHaveLength(2);
    expect(isCalendarProductionIdea(mergedOnce[0]!)).toBe(false);
  });

  it('detects calendar-enriched ideation rows from mergeCalendarPlansForProduction', () => {
    const enriched = {
      idea_index: 2,
      headline: 'Meet the Maker',
      source_node: 'content_ideation',
      calendar_enriched: true,
      calendar_plan_index: 0,
      calendar_gallery_designed: true,
    };
    expect(isCalendarProductionIdea(enriched)).toBe(true);
  });
});

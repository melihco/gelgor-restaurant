/**
 * content_calendar → production enrichment + additive calendar production rows.
 *
 * Calendar plans enrich matched ideation (brief, mood, format, schedule) AND each
 * calendar plan is also produced as its own row (matched or orphan). Volume is
 * ideation count + calendar count — not weekly geometry.
 */
import { calendarItemFormat, calendarItemHeadline } from '@/lib/content-calendar-artifact-link';
import {
  CALENDAR_GALLERY_DESIGN_INTENSITY,
  resolveCalendarFalDesignIntensity,
  type FalDesignChannel,
} from '@/lib/fal-design-intensity';
import {
  pipelineForSlotRole,
  type ProductionAssignment,
  type ProductionSlotRole,
} from '@/lib/mission-production-manifest';
import {
  applyCalendarDesignLayoutToIdea,
  calendarLayoutChannelFromIdea,
  readExplicitCalendarDesignLayoutFamily,
  resolveCalendarDesignLayout,
} from '@/lib/calendar-design-layout';
import { normalizeCalendarPlanDesignLayout } from '@/lib/calendar-agent-schema';
import { detectIdeaPackageFormat } from '@/lib/weekly-publish-package';
import { applyMissionFalStoryAssignment } from '@/lib/mission-remotion-story';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';

/** Avoid collision with ideation idea_index 0–15 in production_jobs. */
export const CALENDAR_PRODUCTION_IDEA_INDEX_BASE = 1000;

/** Max calendar plan rows parsed per mission (ideation + orphan calendar can exceed weekly 16). */
export const MAX_CALENDAR_PLANS_PER_MISSION = 32;

export type CalendarAnnouncementType =
  | 'venue_showcase'
  | 'product_reveal'
  | 'event_teaser'
  | 'offer_campaign'
  | 'social_proof'
  | 'behind_the_scenes'
  | string;

function calendarFormatToContentType(fmt: string): string {
  const f = fmt.toLowerCase().replace(/^instagram_/, '');
  if (f.includes('reel')) return 'instagram_reel';
  if (f.includes('carousel')) return 'instagram_carousel';
  if (f.includes('story')) return 'instagram_story';
  return 'instagram_post';
}

function normalizeCalendarDay(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}T12:00:00Z`);
    if (!Number.isNaN(d.getTime())) {
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] ?? s;
    }
  }
  return s.split(/[\s,·]/)[0]?.trim() ?? s;
}

export function isCalendarProductionIdea(idea: Record<string, unknown>): boolean {
  if (idea.calendar_enriched === true) return true;
  if (idea.calendar_gallery_designed === true) return true;
  if (idea.calendar_slot_backfill === true) return true;
  const scope = String(idea.production_scope ?? '');
  if (scope === 'calendar_orphan' || scope === 'calendar_plan') return true;
  if (typeof idea.calendar_plan_index === 'number') return true;
  if (String(idea.source_track ?? '') === 'calendar') return true;
  if (String(idea.source_node ?? '') !== 'content_calendar') return false;
  const idx = idea.idea_index;
  return typeof idx === 'number' && idx >= CALENDAR_PRODUCTION_IDEA_INDEX_BASE;
}

export function calendarAnnouncementLabel(type: string): string {
  const map: Record<string, string> = {
    venue_showcase: 'venue showcase — highlight the space and atmosphere',
    product_reveal: 'product reveal — hero the item with premium product-forward framing',
    event_teaser: 'event teaser — build anticipation with date/time energy',
    offer_campaign: 'offer campaign — bold promo layout with urgency and clarity',
    social_proof: 'social proof — testimonial or UGC-style trust signal',
    behind_the_scenes: 'behind the scenes — authentic craft/process moment',
  };
  const key = type.toLowerCase().replace(/\s+/g, '_');
  return map[key] ?? `announcement card (${type || 'editorial'})`;
}

export function buildCalendarFalSceneHint(idea: Record<string, unknown>): string {
  const announcement = String(
    idea.calendar_announcement_type ?? idea.template_use_case ?? '',
  ).trim().toLowerCase();
  const mood = String(idea.photo_mood ?? idea.mood ?? idea.visual_direction ?? '').trim();
  const brief = String(
    idea.content_brief ?? idea.caption_draft ?? idea.caption ?? '',
  ).trim();
  const tagline = String(idea.tagline ?? idea.subline ?? '').trim();
  const venue = String(
    (idea.event_details as Record<string, unknown> | undefined)?.venue_area ?? idea.venue_area ?? '',
  ).trim();

  return [
    announcement ? calendarAnnouncementLabel(announcement) : '',
    mood ? `visual mood: ${mood}` : '',
    tagline ? `tagline: ${tagline}` : '',
    venue ? `venue focus: ${venue}` : '',
    brief ? `brief: ${brief.slice(0, 220)}` : '',
  ].filter(Boolean).join(' | ').slice(0, 320);
}

function librarySlotForAnnouncement(type: string): string | undefined {
  const key = type.toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    event_teaser: 'event_story',
    event_announcement: 'event_story',
    offer_campaign: 'campaign_post',
    campaign_offer: 'campaign_post',
    social_proof: 'social_proof_post',
    product_reveal: 'campaign_post',
    product_showcase: 'campaign_post',
    venue_showcase: 'editorial_story',
    behind_the_scenes: 'daily_story',
    brand_awareness: 'editorial_story',
    announcement: 'campaign_post',
    educational_post: 'daily_story',
    daily_story: 'daily_story',
  };
  return map[key];
}

export function calendarGalleryMatchCaption(idea: Record<string, unknown>): string {
  const brief = String(idea.content_brief ?? idea.caption_draft ?? idea.caption ?? '').trim();
  const mood = String(idea.photo_mood ?? idea.mood ?? idea.visual_direction ?? '').trim();
  const headline = String(idea.headline ?? idea.concept_title ?? '').trim();
  const tagline = String(idea.tagline ?? idea.subline ?? '').trim();
  return [brief, mood, tagline, headline].filter(Boolean).join(' — ');
}

export { CALENDAR_GALLERY_DESIGN_INTENSITY };

/** Resolve fal intensity for a calendar production idea (announcement-aware). */
export function resolveCalendarSlotDesignIntensity(
  idea: Record<string, unknown>,
  brandTheme: Record<string, unknown> | null | undefined,
  channel: FalDesignChannel,
): { level: typeof CALENDAR_GALLERY_DESIGN_INTENSITY; source: string } {
  return resolveCalendarFalDesignIntensity({
    announcementType: String(
      idea.calendar_announcement_type ?? idea.template_use_case ?? idea.announcement_type ?? '',
    ),
    channel,
    brandTheme,
  });
}

/** Calendar track: gallery photo hero + announcement-aware fal design intensity. */

export function resolveCalendarSlotAssignment(
  idea: Record<string, unknown>,
  storyOrdinal = 0,
): ProductionAssignment {
  const ideaIndex = typeof idea.idea_index === 'number'
    ? idea.idea_index
    : CALENDAR_PRODUCTION_IDEA_INDEX_BASE;
  const announcement = String(
    idea.calendar_announcement_type ?? idea.template_use_case ?? '',
  ).trim().toLowerCase();
  const planIndex = typeof idea.calendar_plan_index === 'number'
    ? idea.calendar_plan_index
    : ideaIndex - CALENDAR_PRODUCTION_IDEA_INDEX_BASE;
  const channel = calendarLayoutChannelFromIdea(idea);
  const layout = resolveCalendarDesignLayout({
    announcementType: announcement,
    channel,
    explicitLayoutFamily: readExplicitCalendarDesignLayoutFamily(idea),
  });

  const pkgFmt = detectIdeaPackageFormat(idea);
  const librarySlotKey = librarySlotForAnnouncement(announcement);
  const sceneHint = buildCalendarFalSceneHint(idea);
  const layoutHint = `${sceneHint} | layout:${layout.canvaArchetypeId}`;

  if (pkgFmt === 'story') {
    const base: ProductionAssignment = {
      idea_index: ideaIndex,
      slot_role: 'campaign_story_motion',
      pipeline: 'fal_story',
      copy_bundle_id: `calendar:${planIndex}`,
      publish_channel: 'instagram_organic',
      library_slot_key: librarySlotKey ?? 'event_story',
      layout_family_hint: layout.layoutFamilyHint,
      fal_design_hint: layoutHint,
      rationale: `calendar_fal_story_${announcement || 'announcement'}`,
    };
    return applyMissionFalStoryAssignment(base, storyOrdinal);
  }

  if (pkgFmt === 'reel') {
    return {
      idea_index: ideaIndex,
      slot_role: 'campaign_reel_motion',
      pipeline: 'fal_reel',
      copy_bundle_id: `calendar:${planIndex}`,
      publish_channel: 'instagram_organic',
      library_slot_key: librarySlotKey,
      layout_family_hint: layout.layoutFamilyHint,
      fal_design_hint: layoutHint,
      rationale: `calendar_fal_reel_${announcement || 'announcement'}`,
    };
  }

  if (pkgFmt === 'carousel') {
    return {
      idea_index: ideaIndex,
      slot_role: 'organic_carousel',
      pipeline: 'carousel_gallery',
      copy_bundle_id: `calendar:${planIndex}`,
      publish_channel: 'instagram_organic',
      library_slot_key: librarySlotKey,
      layout_family_hint: layout.layoutFamilyHint,
      fal_design_hint: sceneHint,
      rationale: `calendar_carousel_${announcement || 'announcement'}`,
    };
  }

  const slotRole: ProductionSlotRole = 'fal_designed_post';
  return {
    idea_index: ideaIndex,
    slot_role: slotRole,
    pipeline: pipelineForSlotRole(slotRole),
    copy_bundle_id: `calendar:${planIndex}`,
    publish_channel: 'instagram_organic',
    library_slot_key: librarySlotKey,
    layout_family_hint: layout.layoutFamilyHint,
    fal_design_hint: layoutHint,
    rationale: `calendar_gallery_designed_${announcement || 'announcement'}_${channel}`,
  };
}

export function normalizeCalendarPlanToProductionIdea(
  plan: Record<string, unknown>,
  planIndex: number,
): Record<string, unknown> {
  const fmt = calendarItemFormat(plan);
  const headline = calendarItemHeadline(plan)
    || String(plan.event_name ?? plan.tagline ?? '').trim();
  const tagline = String(plan.tagline ?? plan.subline ?? '').trim();
  const contentBrief = String(
    plan.content_brief ?? plan.description ?? plan.brief ?? '',
  ).trim();
  // Publish caption = calendar copy or tagline+headline — NEVER the visual brief.
  // The brief is a scene description for gallery matching / fal prompts and flows
  // through content_brief + visual_production_spec (see calendarGalleryMatchCaption).
  const planCaption = String(plan.caption_draft ?? plan.caption ?? '').trim();
  const caption = planCaption
    || [tagline, headline].filter(Boolean).join(' — ')
    || contentBrief;
  const photoMood = String(
    plan.photo_mood ?? plan.visual_direction ?? plan.visual_style ?? plan.visual_mood ?? '',
  ).trim();
  const announcementType = String(
    plan.announcement_type ?? plan.type ?? plan.template_use_case ?? '',
  ).trim().toLowerCase();
  // Language-neutral subject for caption↔gallery matching (same SSOT as ideation).
  const subjectKey = String(plan.subject_key ?? plan.subjectKey ?? '').trim() || undefined;
  const day = normalizeCalendarDay(plan.date ?? plan.day ?? plan.publish_day ?? plan.scheduled_day);
  const time = String(plan.time ?? plan.scheduled_time ?? plan.publish_time ?? '').trim();
  const postingSuggestion = [plan.date, time].filter(Boolean).join(' ').trim();

  const eventDetails: Record<string, unknown> = {};
  const dateStr = String(plan.date ?? '').trim();
  if (dateStr) eventDetails.date = dateStr;
  if (time) eventDetails.time = time;
  if (tagline) eventDetails.tagline = tagline;
  const venueArea = String(plan.venue_area ?? '').trim();
  if (venueArea) eventDetails.venue_area = venueArea;
  const artistLine = String(
    plan.artist_name ?? plan.dj_lineup ?? plan.lineup ?? plan.dj ?? '',
  ).trim();
  if (artistLine) eventDetails.artist_name = artistLine;

  const normalizedPlan = normalizeCalendarPlanDesignLayout(plan);
  const channel = isStoryFormat(fmt) ? 'story' : 'post';
  const userLayoutFamily = String(
    normalizedPlan.design_layout_family ?? plan.design_layout_family ?? plan.designLayoutFamily ?? '',
  ).trim();
  const layout = resolveCalendarDesignLayout({
    announcementType: announcementType,
    channel,
    explicitLayoutFamily: normalizedPlan.design_layout_locked ? userLayoutFamily : undefined,
  });

  const baseIdea: Record<string, unknown> = {
    idea_index: CALENDAR_PRODUCTION_IDEA_INDEX_BASE + planIndex,
    calendar_plan_index: planIndex,
    source_node: 'content_calendar',
    source_track: 'calendar',
    concept_title: headline,
    headline,
    title: headline,
    tagline: tagline || undefined,
    subline: tagline || undefined,
    caption_draft: caption,
    caption,
    content_brief: contentBrief || undefined,
    ...(subjectKey ? { subject_key: subjectKey } : {}),
    content_type: calendarFormatToContentType(fmt),
    content_kind: calendarFormatToContentType(fmt),
    format: channel,
    mood: photoMood || undefined,
    photo_mood: photoMood || undefined,
    visual_direction: photoMood || undefined,
    calendar_announcement_type: announcementType || undefined,
    template_use_case: announcementType || plan.template_use_case,
    calendar_priority: plan.priority ?? plan.must_post ?? null,
    publish_schedule_day: day ?? undefined,
    publish_schedule_time: time || undefined,
    publish_schedule_format: fmt,
    posting_time_suggestion: postingSuggestion || undefined,
    ...(Object.keys(eventDetails).length ? { event_details: eventDetails } : {}),
    visual_production_spec: {
      treatment: 'gallery_designed',
      announcement_type: announcementType,
      photo_mood: photoMood,
      content_brief: contentBrief,
    },
    calendar_gallery_designed: true,
  };

  return applyCalendarDesignLayoutToIdea(baseIdea, layout);
}

function isStoryFormat(fmt: string): boolean {
  return fmt.toLowerCase().includes('story');
}

export function buildCalendarProductionIdeas(
  calendarPlans: Record<string, unknown>[],
): Record<string, unknown>[] {
  return calendarPlans
    .slice(0, 8)
    .map((plan, index) => normalizeCalendarPlanToProductionIdea(plan, index))
    .filter((idea) => Boolean(String(idea.headline ?? '').trim()));
}

export function buildCalendarProductionQueue(
  calendarIdeas: Record<string, unknown>[],
): ManifestProductionQueueItem[] {
  return calendarIdeas.map((idea, queueIndex) => {
    const ideaIndex = typeof idea.idea_index === 'number'
      ? idea.idea_index
      : CALENDAR_PRODUCTION_IDEA_INDEX_BASE + queueIndex;
    const assignment = resolveCalendarSlotAssignment({ ...idea, idea_index: ideaIndex });
    return {
      queueIndex: CALENDAR_PRODUCTION_IDEA_INDEX_BASE + queueIndex,
      ideaIndex,
      idea: { ...idea, idea_index: ideaIndex },
      assignment,
    };
  });
}

export function splitIdeationAndCalendarIdeas(
  ideas: Record<string, unknown>[],
): { ideationIdeas: Record<string, unknown>[]; calendarIdeas: Record<string, unknown>[] } {
  const ideationIdeas: Record<string, unknown>[] = [];
  const calendarIdeas: Record<string, unknown>[] = [];
  for (const idea of ideas) {
    if (isCalendarProductionIdea(idea)) calendarIdeas.push(idea);
    else ideationIdeas.push(idea);
  }
  return { ideationIdeas, calendarIdeas };
}

export function appendCalendarProductionIdeas(
  ideationIdeas: Record<string, unknown>[],
  calendarPlans: Record<string, unknown>[],
): Record<string, unknown>[] {
  if (!calendarPlans.length) return ideationIdeas;
  // Prefer mergeCalendarPlansForProduction at call sites (auto-produce route).
  void calendarPlans;
  return ideationIdeas;
}

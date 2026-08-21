/**
 * IdeaFeedBind SSOT — Hub tagline ↔ gallery match ↔ canvas punchline.
 * Multi-tenant: local_products_shop + beach_club fixtures.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveGalleryMatchCaptionForIdea,
  resolveIdeaFeedBind,
} from '@/lib/idea-feed-bind';
import { applyCalendarProductionEnrichment } from '@/lib/mission-production-plan';

describe('resolveIdeaFeedBind', () => {
  it('locks publishable Hub tagline for gallery + paint (local_products_shop)', () => {
    const idea = {
      calendar_enriched: true,
      calendar_plan_index: 0,
      concept_title: 'Erken Hasat Zeytinyağı',
      tagline: '"Datça\'nın özgün tatları burada."',
      caption_draft: 'Soğuk sıkım zeytinyağı hikayesi.',
      subject_key: 'olive_oil',
      photo_mood: 'sunlit grove',
    };
    const bind = resolveIdeaFeedBind(idea, { brandName: 'Datça Lezzet' });
    expect(bind.taglinePublishable).toBe(true);
    expect(bind.punchlineLockSource).toBe('mission_tagline');
    expect(bind.paintHeadline).toContain('Datça');
    expect(bind.galleryMatchHeadline).toBe(bind.paintHeadline);
    expect(bind.galleryMatchCaption).toContain('Datça');
    expect(bind.galleryMatchCaption).not.toContain('content_brief');
    expect(bind.subjectKey).toBe('olive_oil');
  });

  it('does not lock planning labels as punchline (beach_club)', () => {
    const idea = {
      calendar_enriched: true,
      concept_title: 'Yaz Sezon Serisi',
      tagline: 'Yaz Sezon Serisi',
      caption_draft: 'Sunset cocktails by the shore.',
      subject_key: 'cocktail',
    };
    const bind = resolveIdeaFeedBind(idea, { brandName: 'Marina Beach' });
    // Label-style tagline fails publishability → no mission_tagline lock.
    expect(bind.taglinePublishable).toBe(false);
    expect(bind.punchlineLockSource).toBeNull();
  });

  it('uses tagline for gallery match when concept title differs (beach_club)', () => {
    const idea = {
      source_track: 'calendar',
      concept_title: 'Friday Sunset Ritual',
      tagline: 'Golden hour cocktails by the Aegean.',
      caption_draft: 'Join us for golden hour.',
      mood: 'golden hour terrace',
    };
    const bind = resolveIdeaFeedBind(idea, { brandName: 'Yula Beach' });
    expect(bind.taglinePublishable).toBe(true);
    expect(bind.galleryMatchHeadline.toLowerCase()).toContain('golden hour cocktails');
    expect(bind.galleryMatchHeadline.toLowerCase()).not.toContain('friday sunset ritual');
  });
});

describe('resolveGalleryMatchCaptionForIdea', () => {
  it('leads with tagline and excludes content_brief', () => {
    const caption = resolveGalleryMatchCaptionForIdea({
      calendar_enriched: true,
      tagline: 'Farm to table freshness.',
      caption_draft: 'Weekly harvest boxes.',
      content_brief: 'NEVER INCLUDE THIS STEAK SCENE BRIEF',
      subject_key: 'produce_box',
      photo_mood: 'market stall',
    });
    expect(caption.startsWith('Farm to table')).toBe(true);
    expect(caption).not.toContain('STEAK');
    expect(caption).toContain('Weekly harvest');
  });
});

describe('lock invariant: publishable ⇒ canvas can render it', () => {
  it('exposes a non-empty canvas line whenever the lock is taken', () => {
    const idea = {
      calendar_enriched: true,
      concept_title: 'Sunset ritual',
      tagline: 'Taste the essence of summer.',
      caption_draft: 'Golden hour by the sea.',
    };
    const bind = resolveIdeaFeedBind(idea, { brandName: 'Yula Beach' });
    // Complete noun phrase — not a truncation artifact, so the quote survives.
    expect(bind.taglinePublishable).toBe(true);
    expect(bind.canvasTagline.length).toBeGreaterThan(0);
    expect(bind.paintHeadline).toBe(bind.canvasTagline);
  });

  it('refuses the lock when the quote is a truncation artifact', () => {
    const bind = resolveIdeaFeedBind({
      calendar_enriched: true,
      concept_title: 'Live music teaser',
      tagline: 'Experience the best of live',
      caption_draft: 'Canlı müzik bu akşam.',
    }, { brandName: 'Marina Beach' });
    expect(bind.taglinePublishable).toBe(false);
    expect(bind.canvasTagline).toBe('');
    expect(bind.punchlineLockSource).toBeNull();
  });

  it('keeps gallery scoring identical to the painted line (no batch/drain drift)', () => {
    const idea = {
      source_track: 'calendar',
      concept_title: 'Kahvaltı serisi',
      tagline: 'Sabahın ilk ışığında taze demlenen çay.',
      caption_draft: 'Kahvaltı sofrası hazır.',
      subject_key: 'breakfast_table',
    };
    const bind = resolveIdeaFeedBind(idea, { brandName: 'Datça Kahve' });
    expect(bind.galleryMatchHeadline).toBe(bind.paintHeadline);
  });
});

describe('calendar→idea tagline match', () => {
  it('matches ideation by shared Hub tagline when titles diverge (shop)', () => {
    const ideation = [
      {
        concept_title: 'Wrong concept A',
        caption_draft: 'A',
        content_type: 'instagram_post',
        tagline: 'Balın tadı burada.',
      },
      {
        concept_title: 'Wrong concept B',
        caption_draft: 'B',
        content_type: 'instagram_post',
        tagline: 'Zeytin hasadı başladı.',
      },
    ];
    const plans = [
      {
        event_name: 'Calendar title unrelated',
        tagline: 'Zeytin hasadı başladı.',
        format: 'post',
        day: 'Tue',
        content_brief: 'Olive harvest mood.',
      },
    ];
    const { ideas } = applyCalendarProductionEnrichment(ideation, plans);
    expect(ideas[1]?.calendar_enriched).toBe(true);
    expect(ideas[0]?.calendar_enriched).not.toBe(true);
    expect(String(ideas[1]?.tagline)).toContain('Zeytin');
    expect(ideas[1]?.calendar_match_source).toBe('tagline');
  });

  it('never hijacks an unrelated idea with a quote-less calendar row (beach_club)', () => {
    const ideation = [
      { concept_title: 'Matched', caption_draft: 'x', content_type: 'instagram_post' },
      { concept_title: 'Only Idea', caption_draft: 'y', content_type: 'instagram_story' },
    ];
    const plans = [
      { event_name: 'Matched', format: 'post', content_brief: 'Calendar brief' },
      { event_name: 'Orphan DJ Night', format: 'story', content_brief: 'DJ teaser' },
    ];
    const { ideas, orphanCalendarIdeas } = applyCalendarProductionEnrichment(ideation, plans);

    expect(ideas[0]?.content_brief).toBe('Calendar brief');
    expect(ideas[0]?.calendar_match_source).toBe('title');
    // "Only Idea" must not inherit the DJ concept's brief just because of order.
    expect(ideas[1]?.calendar_enriched).not.toBe(true);
    expect(ideas[1]?.content_brief).toBeUndefined();
    expect(orphanCalendarIdeas).toHaveLength(1);
  });

  it('still delivers a quote-bearing plan by order when titles diverge (shop)', () => {
    const ideation = [
      { concept_title: 'Vitrin hikayesi', caption_draft: 'Doğal ürünler rafta.', content_type: 'instagram_post' },
    ];
    const plans = [
      {
        event_name: 'Farklı başlık',
        tagline: '"Datça\'nın özgün tatları burada."',
        format: 'post',
        day: 'Mon',
        content_brief: 'Product shelf mood.',
      },
    ];
    const { ideas } = applyCalendarProductionEnrichment(ideation, plans);
    expect(ideas[0]?.calendar_enriched).toBe(true);
    expect(ideas[0]?.calendar_match_source).toBe('positional');
    expect(ideas[0]?.tagline).toBe("Datça'nın özgün tatları burada.");
  });
});

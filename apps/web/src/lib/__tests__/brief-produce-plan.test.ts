import { describe, expect, it } from 'vitest';
import {
  buildBriefProduceIdeas,
  clampBriefIdeaCount,
  mapBriefOutputToContentType,
  resolveBriefAnnouncementType,
  validateBriefProduceRequest,
} from '../brief-produce-plan';
import { buildAutoProduceProductionQueue } from '../auto-produce/build-production-queue';
import { resolveProductionProfile } from '../production-profile';
import type { BrandCreativeDirectorOutput } from '../brand-creative-director';

const BCD: BrandCreativeDirectorOutput = {
  headline: 'Datça Ballı Öneri',
  caption: 'Bugün sofraya Datça balı.',
  sceneHint: 'honey jar on wooden table, Aegean light',
  mood: 'warm artisan',
  visualDirection: 'product hero, natural light',
  strategicPurpose: 'product spotlight',
  brandInterpretation: 'ballı ürün hero',
  motionCue: 'slow push-in',
};

describe('validateBriefProduceRequest', () => {
  it('requires workspace + title + valid outputType', () => {
    expect(validateBriefProduceRequest({}).ok).toBe(false);
    expect(validateBriefProduceRequest({ workspaceId: 'w', title: '' }).ok).toBe(false);
    expect(validateBriefProduceRequest({
      workspaceId: 'w',
      title: 'Bal',
      outputType: 'carousel',
    })).toEqual({
      ok: false,
      error: 'outputType must be story, reel, or post',
      status: 400,
    });
    expect(validateBriefProduceRequest({
      workspaceId: 'w',
      title: 'Bal',
      outputType: 'post',
    })).toEqual({ ok: true, workspaceId: 'w' });
  });
});

describe('clampBriefIdeaCount', () => {
  it('clamps to 1..10 like the API', () => {
    expect(clampBriefIdeaCount(undefined)).toBe(1);
    expect(clampBriefIdeaCount('3')).toBe(3);
    expect(clampBriefIdeaCount(0)).toBe(1);
    expect(clampBriefIdeaCount(99)).toBe(10);
  });
});

describe('mapBriefOutputToContentType', () => {
  it('maps UI format tiles to production content_type', () => {
    expect(mapBriefOutputToContentType('post')).toBe('feed_post');
    expect(mapBriefOutputToContentType('story')).toBe('story');
    expect(mapBriefOutputToContentType('reel')).toBe('reel');
  });
});

describe('resolveBriefAnnouncementType', () => {
  it('maps beach_club DJ night copy to event_teaser', () => {
    expect(resolveBriefAnnouncementType({
      title: 'DJ Night',
      extraDirection: 'Live DJ set under the stars',
    })).toBe('event_teaser');
  });

  it('maps local_products_shop shelf copy to product_reveal', () => {
    expect(resolveBriefAnnouncementType({
      title: 'Haftalık reçel vitrini',
      extraDirection: 'Ev yapımı ürünler — reçel ve zeytin',
    })).toBe('product_reveal');
  });
});

describe('buildBriefProduceIdeas', () => {
  it('builds N rule-based ideas for the selected format', () => {
    const ideas = buildBriefProduceIdeas({
      title: 'Yaz Balları',
      extraDirection: 'sıcak ve samimi',
      outputType: 'story',
      count: 3,
      photoUrls: [],
      bcd: null,
    });
    expect(ideas).toHaveLength(3);
    for (const idea of ideas) {
      expect(idea.content_type).toBe('story');
      expect(idea.format).toBe('story');
      expect(idea.publish_schedule_format).toBe('story');
      expect(idea.content_brief).toContain('Yaz Balları');
      expect(idea.headline).toBe('Yaz Balları');
      expect(idea.force_attached_photos).toBeUndefined();
    }
  });

  it('stamps event announcement for beach_club DJ brief', () => {
    const ideas = buildBriefProduceIdeas({
      title: 'DJ Night',
      extraDirection: 'Live DJ set this Friday',
      outputType: 'post',
      count: 1,
      photoUrls: [],
      bcd: null,
    });
    expect(ideas[0]!.calendar_announcement_type).toBe('event_teaser');
    expect(ideas[0]!.format).toBe('post');
  });

  it('stamps product announcement for local_products_shop brief', () => {
    const ideas = buildBriefProduceIdeas({
      title: 'Haftalık reçel vitrini',
      extraDirection: 'Yeni sezon ürünleri rafta',
      outputType: 'post',
      count: 1,
      photoUrls: [],
      bcd: null,
    });
    expect(ideas[0]!.calendar_announcement_type).toBe('product_reveal');
    expect(ideas[0]!.content_brief).toContain('reçel');
  });

  it('uses BCD copy when present and keeps selected content_type', () => {
    const ideas = buildBriefProduceIdeas({
      title: 'ignored when bcd',
      extraDirection: '',
      outputType: 'reel',
      count: 2,
      photoUrls: [],
      bcd: BCD,
    });
    expect(ideas).toHaveLength(2);
    expect(ideas[0]!.headline).toBe('Datça Ballı Öneri');
    expect(ideas[0]!.content_type).toBe('reel');
    expect(ideas[0]!.scene_hint).toBe(BCD.sceneHint);
    expect(ideas[0]!.motion_cue).toBe(BCD.motionCue);
  });

  it('attaches photos and rotates selected_gallery_url by slot', () => {
    const photos = ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'];
    const ideas = buildBriefProduceIdeas({
      title: 'Ürün',
      extraDirection: '',
      outputType: 'post',
      count: 3,
      photoUrls: photos,
      bcd: null,
    });
    expect(ideas[0]!.force_attached_photos).toBe(true);
    expect(ideas[0]!.attached_photo_urls).toEqual(photos);
    expect(ideas[0]!.selected_gallery_url).toBe(photos[0]);
    expect(ideas[1]!.selected_gallery_url).toBe(photos[1]);
    expect(ideas[2]!.selected_gallery_url).toBe(photos[0]);
  });
});

describe('New Brief plan → ad-hoc production queue', () => {
  const profile = resolveProductionProfile({ packageSlug: 'agency' });

  it.each([
    { outputType: 'post' as const, pipeline: 'fal_design', slotRole: 'fal_designed_post', count: 1 },
    { outputType: 'story' as const, pipeline: 'fal_story', slotRole: 'campaign_story_motion', count: 2 },
    { outputType: 'reel' as const, pipeline: 'fal_reel', slotRole: 'fal_reel_motion', count: 3 },
  ])('$outputType × $count → $pipeline', ({ outputType, pipeline, slotRole, count }) => {
    const ideas = buildBriefProduceIdeas({
      title: 'Test konu',
      extraDirection: 'galeri ürün',
      outputType,
      count,
      photoUrls: [],
      bcd: null,
    });
    const queue = buildAutoProduceProductionQueue({
      toProcess: ideas as unknown as Record<string, unknown>[],
      feedDirectorReport: null,
      manifestMissionType: 'organic',
      brandBusinessType: 'local_products_shop',
      maxIdeas: 10,
      productionProfile: profile,
      adHocBrief: true,
    });

    expect(queue).toHaveLength(count);
    for (const item of queue) {
      expect(item.assignment.pipeline).toBe(pipeline);
      expect(item.assignment.slot_role).toBe(slotRole);
      expect(item.assignment.rationale).toMatch(/^ad_hoc_brief_/);
    }
  });

  it('does not open a mission manifest when missionId is absent', () => {
    const ideas = buildBriefProduceIdeas({
      title: 'Tek üretim',
      extraDirection: '',
      outputType: 'post',
      count: 1,
      photoUrls: [],
      bcd: null,
    });
    const queue = buildAutoProduceProductionQueue({
      toProcess: ideas as unknown as Record<string, unknown>[],
      feedDirectorReport: null,
      manifestMissionType: 'organic',
      brandBusinessType: 'local_products_shop',
      maxIdeas: 10,
      productionProfile: profile,
      adHocBrief: true,
    });
    expect(queue).toHaveLength(1);
    expect(queue[0]!.assignment.rationale).toBe('ad_hoc_brief_fal_designed_post');
  });
});

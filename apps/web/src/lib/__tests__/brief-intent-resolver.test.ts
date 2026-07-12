import { describe, expect, it } from 'vitest';

import { resolveBriefIntent, stripBriefFormMetadata } from '../brief-intent-resolver';
import { inferAdHocBriefAssignment } from '../production-pipeline-router';

describe('resolveBriefIntent', () => {
  it('turns a short title into headline + scene hint for fal prompts', () => {
    const intent = resolveBriefIntent({
      title: 'Full Moon',
      extraDirection: 'dolunay gecesi, mistik ve sıcak vibe',
      outputType: 'story',
    });

    expect(intent.headline).toBe('Full Moon');
    expect(intent.sceneHint).toContain('Full Moon');
    expect(intent.sceneHint).toContain('dolunay');
    expect(intent.mood).toBe('mystical atmospheric');
    expect(intent.visualDirection).toBe(intent.sceneHint);
  });

  it('strips form metadata from legacy description blobs', () => {
    const clean = stripBriefFormMetadata(
      'Çıktı tipi: story\nAdet: 3\n\nDolunay partisi',
    );
    expect(clean).toBe('Dolunay partisi');
    expect(clean).not.toContain('Çıktı tipi');
  });
});

describe('inferAdHocBriefAssignment', () => {
  it('routes story briefs to fal_story art-director pipeline', () => {
    const a = inferAdHocBriefAssignment(0, {
      content_type: 'story',
      visual_direction: 'full moon beach night',
    }, '');
    expect(a.slot_role).toBe('campaign_story_motion');
    expect(a.pipeline).toBe('fal_story');
    expect(a.visual_subject_hint).toBe('full moon beach night');
  });

  it('routes reel briefs to fal_reel art-director pipeline', () => {
    const a = inferAdHocBriefAssignment(0, {
      content_type: 'reel',
      visual_direction: 'sunset cocktails',
    }, '');
    expect(a.pipeline).toBe('fal_reel');
  });

  it('routes post briefs to fal_designed_post', () => {
    const a = inferAdHocBriefAssignment(0, {
      content_type: 'feed_post',
      visual_direction: 'menu highlight',
    }, '');
    expect(a.slot_role).toBe('fal_designed_post');
    expect(a.pipeline).toBe('fal_design');
  });
});

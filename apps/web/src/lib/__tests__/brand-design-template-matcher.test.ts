import { describe, it, expect } from 'vitest';
import { resolveDesignTemplateCandidateTypes } from '@/lib/brand-design-template-matcher';

describe('resolveDesignTemplateCandidateTypes', () => {
  it('maps calendar event_teaser to event_special first', () => {
    const types = resolveDesignTemplateCandidateTypes({
      announcementType: 'event_teaser',
      format: 'post',
    });
    expect(types[0]).toBe('event_special');
    expect(types).toContain('campaign_announcement');
  });

  it('maps offer_campaign to campaign templates', () => {
    const types = resolveDesignTemplateCandidateTypes({
      announcementType: 'offer_campaign',
      format: 'post',
    });
    expect(types[0]).toBe('campaign_announcement');
  });

  it('maps library_slot_key campaign_post before caption heuristics', () => {
    const types = resolveDesignTemplateCandidateTypes({
      librarySlotKey: 'campaign_post',
      slotRole: 'fal_designed_post',
      format: 'post',
    });
    expect(types[0]).toBe('campaign_announcement');
  });

  it('maps event_story library key to event_special for story format', () => {
    const types = resolveDesignTemplateCandidateTypes({
      librarySlotKey: 'event_story',
      format: 'story',
    });
    expect(types[0]).toBe('event_special');
  });

  it('maps formal announcement copy to announcement_formal', () => {
    const types = resolveDesignTemplateCandidateTypes({
      headline: 'Önemli Duyuru',
      caption: 'Bilgilerinize sunarız',
      format: 'post',
    });
    expect(types[0]).toBe('announcement_formal');
  });

  it('prefers reel_cover for reel format when role hints reel', () => {
    const types = resolveDesignTemplateCandidateTypes({
      slotRole: 'fal_reel_motion',
      format: 'reel',
    });
    expect(types[0]).toBe('reel_cover');
  });
});

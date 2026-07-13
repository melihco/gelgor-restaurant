import { describe, expect, it } from 'vitest';
import {
  buildArtifactListTitle,
  hasPublishableIdeationHeadline,
  resolveFeedDisplayCaption,
  resolveFeedDisplayHeadline,
} from '@/lib/feed-display-caption';

const MEON = {
  ideationHeadline: 'Hayallerindeki düğün hikayesini yakalayalım!',
  caption:
    'Düğününüzün en özel anlarını ölümsüzleştirmek için buradayız! Bodrum’un büyüleyici atmosferinde hayallerinizi gerçekleştirmeye hazır mısınız? 📸✨ Hemen detayları öğrenin!',
  postingTime: 'Pazartesi 19:00 — Bodrum, Muğla yerel kitlesi için ideal saat',
};

describe('feed display copy — Meon wedding example', () => {
  const organicMeta = {
    production_role: 'organic_post',
    pipeline: 'gallery_photo',
    gallery_sourced: true,
    ideation_headline: MEON.ideationHeadline,
    ideation_caption: MEON.caption,
    caption_draft: MEON.caption,
    posting_time_suggestion: MEON.postingTime,
    brand_name: 'Meon Wedding',
  };

  it('organic post: no separate feed headline (caption only)', () => {
    expect(
      resolveFeedDisplayHeadline({
        metadata: organicMeta,
        content: { caption_draft: MEON.caption },
        title: 'The image shows a wedding venue at sunset',
      }),
    ).toBe('');
  });

  it('organic post: caption comes from ideation, not vision title', () => {
    expect(
      resolveFeedDisplayCaption({
        metadata: organicMeta,
        content: { caption_draft: MEON.caption },
        title: 'The image shows a wedding venue at sunset',
      }),
    ).toBe(MEON.caption);
  });

  it('designed post: overlay headline visible in feed preview', () => {
    const designedMeta = {
      ...organicMeta,
      production_role: 'fal_designed_post',
      pipeline: 'fal_design',
      design_overlay_headline: MEON.ideationHeadline,
    };
    expect(
      resolveFeedDisplayHeadline({
        metadata: designedMeta,
        content: { design_overlay_headline: MEON.ideationHeadline },
      }),
    ).toBe(MEON.ideationHeadline);
  });

  it('artifact list title prefers ideation hook over vision dump', () => {
    expect(
      buildArtifactListTitle({
        ideationHeadline: MEON.ideationHeadline,
        caption: MEON.caption,
        brandName: 'Meon Wedding',
        format: 'post',
      }),
    ).toBe(MEON.ideationHeadline);
  });

  it('rejects vision-analysis as ideation headline', () => {
    expect(
      hasPublishableIdeationHeadline('The image shows a bride and groom on the beach'),
    ).toBe(false);
    expect(hasPublishableIdeationHeadline(MEON.ideationHeadline)).toBe(true);
  });

  it('rejects slot format labels as ideation headline', () => {
    expect(hasPublishableIdeationHeadline('Çiftlik ziyareti story')).toBe(false);
    expect(hasPublishableIdeationHeadline('DJ gecesi reel')).toBe(false);
  });
});

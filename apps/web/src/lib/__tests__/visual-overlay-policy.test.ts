import { describe, expect, it } from 'vitest';

import { isGalleryOnlyVisualPolicy } from '../visual-overlay-policy';
import type { ProductionAssignment } from '../mission-production-manifest';

function assignment(
  partial: Pick<ProductionAssignment, 'slot_role' | 'pipeline'>,
): ProductionAssignment {
  return {
    idea_index: 0,
    slot_role: partial.slot_role,
    pipeline: partial.pipeline,
    copy_bundle_id: 'cb-1',
    publish_channel: 'instagram_organic',
  };
}

describe('visual-overlay-policy (multi-tenant)', () => {
  it('organic_post is gallery-only for any tenant — no UUID branch required', () => {
    const a = assignment({ slot_role: 'organic_post', pipeline: 'gallery_photo' });
    expect(isGalleryOnlyVisualPolicy(a, {})).toBe(true);
  });

  it('designed_post allows overlay layers', () => {
    const a = assignment({ slot_role: 'designed_post', pipeline: 'fal_designed_post' });
    expect(isGalleryOnlyVisualPolicy(a, {})).toBe(false);
  });

  it('lifestyle use-cases stay gallery-only across sectors', () => {
    const a = assignment({ slot_role: 'fal_story_motion', pipeline: 'fal_story' });
    expect(isGalleryOnlyVisualPolicy(a, { template_use_case: 'social_proof' })).toBe(true);
  });
});

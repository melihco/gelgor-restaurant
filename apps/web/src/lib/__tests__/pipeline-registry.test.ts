import { describe, expect, it } from 'vitest';
import {
  PIPELINE_REGISTRY,
  getPipelineDescriptor,
  isFalDesignPipeline,
  isFalOnlyPipeline,
  isFalOnlyPostPipeline,
  isFalOnlyVideoPipeline,
  isFalVideoPipeline,
  isRenderBoundPipeline,
  isVideoPipeline,
} from '@/lib/pipeline-registry';

// Golden reference = the ORIGINAL inline logic that lived in fal-video.ts before
// the registry was introduced. The registry must reproduce these exactly so every
// existing call site (production-loop.ts, production-pipeline-router.ts) is
// behavior-identical.
const goldenFalVideo = (p: string | undefined | null) => {
  const s = String(p ?? '').trim();
  return s === 'fal_story' || s === 'fal_reel' || s === 'runway_reel';
};
const goldenFalDesign = (p: string | undefined | null) => String(p ?? '').trim() === 'fal_design';
const goldenFalOnly = (p: string | undefined | null) => {
  const s = String(p ?? '').trim();
  return s === 'fal_only_story' || s === 'fal_only_post' || s === 'fal_only_reel';
};
const goldenFalOnlyVideo = (p: string | undefined | null) => {
  const s = String(p ?? '').trim();
  return s === 'fal_only_story' || s === 'fal_only_reel';
};
const goldenFalOnlyPost = (p: string | undefined | null) => String(p ?? '').trim() === 'fal_only_post';

// Exhaustive key space: every registry key, padded/cased variants, and edge cases.
const KEYS: (string | undefined | null)[] = [
  ...Object.keys(PIPELINE_REGISTRY),
  '  fal_story  ',
  '  fal_only_post ',
  'unknown_pipeline',
  'FAL_STORY', // case-sensitive: should NOT match (matches golden too)
  '',
  '   ',
  undefined,
  null,
];

describe('pipeline-registry classification parity with legacy fal-video predicates', () => {
  it('isFalVideoPipeline matches the legacy logic for all keys', () => {
    for (const k of KEYS) expect(isFalVideoPipeline(k)).toBe(goldenFalVideo(k));
  });

  it('isFalDesignPipeline matches the legacy logic for all keys', () => {
    for (const k of KEYS) expect(isFalDesignPipeline(k)).toBe(goldenFalDesign(k));
  });

  it('isFalOnlyPipeline matches the legacy logic for all keys', () => {
    for (const k of KEYS) expect(isFalOnlyPipeline(k)).toBe(goldenFalOnly(k));
  });

  it('isFalOnlyVideoPipeline matches the legacy logic for all keys', () => {
    for (const k of KEYS) expect(isFalOnlyVideoPipeline(k)).toBe(goldenFalOnlyVideo(k));
  });

  it('isFalOnlyPostPipeline matches the legacy logic for all keys', () => {
    for (const k of KEYS) expect(isFalOnlyPostPipeline(k)).toBe(goldenFalOnlyPost(k));
  });
});

describe('pipeline-registry descriptors', () => {
  it('every descriptor key matches its map key', () => {
    for (const [key, desc] of Object.entries(PIPELINE_REGISTRY)) {
      expect(desc.key).toBe(key);
    }
  });

  it('classifies the Remotion family as render-bound', () => {
    expect(isRenderBoundPipeline('remotion_story')).toBe(true);
    expect(isRenderBoundPipeline('remotion_poster')).toBe(true);
    // fal/gallery pipelines never compete for the Remotion render gate.
    expect(isRenderBoundPipeline('fal_only_reel')).toBe(false);
    expect(isRenderBoundPipeline('gallery_photo')).toBe(false);
    expect(isRenderBoundPipeline('fal_story')).toBe(false);
  });

  it('marks video pipelines correctly', () => {
    expect(isVideoPipeline('fal_reel')).toBe(true);
    expect(isVideoPipeline('fal_only_story')).toBe(true);
    expect(isVideoPipeline('remotion_story')).toBe(true);
    expect(isVideoPipeline('product_showcase')).toBe(true);
    // Still-image pipelines.
    expect(isVideoPipeline('fal_design')).toBe(false);
    expect(isVideoPipeline('fal_only_post')).toBe(false);
    expect(isVideoPipeline('gallery_photo')).toBe(false);
    expect(isVideoPipeline('remotion_poster')).toBe(false);
  });

  it('returns undefined for unknown keys', () => {
    expect(getPipelineDescriptor('nope')).toBeUndefined();
    expect(getPipelineDescriptor(undefined)).toBeUndefined();
    expect(getPipelineDescriptor('')).toBeUndefined();
  });

  it('treats fal_only post vs video split consistently', () => {
    expect(getPipelineDescriptor('fal_only_post')?.isVideo).toBe(false);
    expect(getPipelineDescriptor('fal_only_story')?.isVideo).toBe(true);
    expect(getPipelineDescriptor('fal_only_reel')?.isVideo).toBe(true);
  });
});

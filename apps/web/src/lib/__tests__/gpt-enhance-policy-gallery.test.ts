import { describe, it, expect } from 'vitest';
import {
  FAL_GROUNDED_GALLERY_MIN_SCORE,
  isWeakGalleryMatch,
  shouldSkipProductionForWeakGallery,
} from '../gpt-enhance-policy';
import { MIN_ACCEPT_SCORE } from '../gallery-photo-matcher';

describe('Fal grounded weak-gallery gate', () => {
  const base = {
    missionProduction: true,
    pickedFromBrandGallery: true,
    referenceIsStock: false,
    hasReference: true,
    pipeline: 'fal_design',
  };

  it('treats score below Fal GIS floor as weak even when adaptiveScene is on', () => {
    expect(FAL_GROUNDED_GALLERY_MIN_SCORE).toBeGreaterThan(MIN_ACCEPT_SCORE);
    expect(
      isWeakGalleryMatch({
        ...base,
        galleryMatchScore: MIN_ACCEPT_SCORE, // 28 — ok for Remotion, weak for Fal
        adaptiveScene: true,
        falGroundedPipeline: true,
      }),
    ).toBe(true);
    expect(
      isWeakGalleryMatch({
        ...base,
        galleryMatchScore: FAL_GROUNDED_GALLERY_MIN_SCORE - 1,
        falGroundedPipeline: true,
      }),
    ).toBe(true);
  });

  it('allows adaptiveScene bypass for non-Fal pipelines', () => {
    expect(
      isWeakGalleryMatch({
        ...base,
        galleryMatchScore: 10,
        adaptiveScene: true,
        falGroundedPipeline: false,
      }),
    ).toBe(false);
  });

  it('skips Fal production on weak gallery regardless of brand_solid fallback', () => {
    expect(
      shouldSkipProductionForWeakGallery({
        ...base,
        galleryMatchScore: 20,
        adaptiveScene: true,
        mediaFallback: 'brand_solid',
        falGroundedPipeline: true,
      }),
    ).toBe(true);
  });

  it('allows near-floor Fal grounded gallery matches without service conflict', () => {
    expect(
      shouldSkipProductionForWeakGallery({
        ...base,
        galleryMatchScore: 48,
        adaptiveScene: true,
        mediaFallback: 'block',
        falGroundedPipeline: true,
      }),
    ).toBe(false);
  });

  it('does not skip Fal when gallery clears the grounded floor', () => {
    expect(
      shouldSkipProductionForWeakGallery({
        ...base,
        galleryMatchScore: FAL_GROUNDED_GALLERY_MIN_SCORE,
        falGroundedPipeline: true,
        mediaFallback: 'block',
      }),
    ).toBe(false);
  });

  it('trusts content ideation selected_gallery_url lock below GIS floor', () => {
    expect(
      shouldSkipProductionForWeakGallery({
        ...base,
        galleryMatchScore: 44,
        falGroundedPipeline: true,
        mediaFallback: 'block',
        agentIdeationGalleryLock: true,
      }),
    ).toBe(false);
  });

  it('still skips ideation lock when caption service conflict', () => {
    expect(
      shouldSkipProductionForWeakGallery({
        ...base,
        galleryMatchScore: 44,
        falGroundedPipeline: true,
        agentIdeationGalleryLock: true,
        captionServiceConflict: true,
      }),
    ).toBe(true);
  });

  it('skips Fal grounded calendar when gallery score is null after brand_solid fallback', () => {
    expect(
      shouldSkipProductionForWeakGallery({
        ...base,
        galleryMatchScore: null,
        adaptiveScene: true,
        mediaFallback: 'brand_solid',
        falGroundedPipeline: true,
      }),
    ).toBe(true);
  });

  it('still skips non-Fal when fallback is block and score < MIN_ACCEPT', () => {
    expect(
      shouldSkipProductionForWeakGallery({
        ...base,
        galleryMatchScore: MIN_ACCEPT_SCORE - 1,
        falGroundedPipeline: false,
        adaptiveScene: false,
        mediaFallback: 'block',
      }),
    ).toBe(true);
  });
});

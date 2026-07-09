import { describe, expect, it } from 'vitest';

import {
  buildHarmonizedPhotoFirstTypographyBlock,
  detectFalPromptConflicts,
  harmonizePhotoFirstDesignPrompt,
  resolveProposedCalendarIntensity,
  simulateFalFeedProduction,
  simulateYulaNewCitrusBeforeAfter,
  YULA_CURRENT_BRAND_THEME,
  YULA_GALLERY_MATCH,
  YULA_NEW_CITRUS_CALENDAR_PLAN,
  YULA_PROPOSED_BRAND_THEME,
  YULA_TOKENS,
  YULA_VISUAL_DNA_SAMPLE,
} from '../fal-production-simulation';

const BASE_INPUT = {
  calendarPlan: YULA_NEW_CITRUS_CALENDAR_PLAN,
  brandName: 'Yula Bodrum',
  sector: 'beach_club',
  brandTheme: YULA_CURRENT_BRAND_THEME,
  visualDna: YULA_VISUAL_DNA_SAMPLE,
  tokens: YULA_TOKENS,
  galleryMatchScore: YULA_GALLERY_MATCH.score,
  galleryUrl: YULA_GALLERY_MATCH.url,
  brandReadinessScore: 85,
};

describe('simulateFalFeedProduction — Yula New Citrus', () => {
  it('current mode: calendar fal slot, photo_first, inferred vibe, harmonized prompt', () => {
    const plan = simulateFalFeedProduction('current', BASE_INPUT);

    expect(plan.slotRole).toBe('fal_designed_post');
    expect(plan.pipeline).toBe('fal_design');
    expect(plan.format).toBe('story');
    expect(plan.engine).toBe('gpt_image_designed');
    expect(plan.intensity).toBe('photo_first');
    expect(plan.intensitySource).toContain('hardcoded');
    expect(plan.vibeSource).toBe('visual_dna.soul');
    expect(plan.resolvedVibe).toBe('handwritten');
    expect(plan.promptConflicts).toHaveLength(0);
    expect(plan.designCardPrompt).toContain('DESIGN INTENSITY: PHOTO-FIRST');
    expect(plan.productionGate.passed).toBe(true);
    expect(plan.artifactMetadata.resolved_vibe).toBeUndefined();
    expect(plan.subtitle).toBe('Taste the essence of Bodrum');
    // English caption locks overlay language — "Kokteyl" → caption-aligned "Cocktail".
    expect(plan.designCardPrompt).toContain('New Citrus Cocktail');
  });

  it('proposed mode: locked warm_coastal vibe, harmonized prompt, trace metadata', () => {
    const plan = simulateFalFeedProduction('proposed', {
      ...BASE_INPUT,
      brandTheme: YULA_PROPOSED_BRAND_THEME,
    });

    expect(plan.resolvedVibe).toBe('warm_coastal');
    expect(plan.vibeSource).toBe('brand_theme.typography_design.vibe');
    expect(plan.intensitySource).toBe('announcement:product_reveal');
    expect(plan.promptConflicts).toHaveLength(0);
    expect(plan.artifactMetadata.resolved_vibe).toBe('warm_coastal');
    expect(plan.artifactMetadata.vibe_source).toBe('brand_theme.typography_design.vibe');
    expect(plan.artifactMetadata.gallery_match_score).toBe(58);
    expect(plan.designCardPrompt).toContain('photo-first');
    expect(plan.designCardPrompt).not.toMatch(/TYPOGRAPHY STANDARD \(MANDATORY\)/);
  });

  it('proposed mode blocks when gallery match is too weak', () => {
    const plan = simulateFalFeedProduction('proposed', {
      ...BASE_INPUT,
      brandTheme: YULA_PROPOSED_BRAND_THEME,
      galleryMatchScore: 12,
    });

    expect(plan.engine).toBe('blocked');
    expect(plan.productionGate.passed).toBe(false);
    expect(plan.productionGate.reason).toContain('gallery_match');
  });

  it('before/after comparison surfaces meaningful deltas', () => {
    const comparison = simulateYulaNewCitrusBeforeAfter();

    expect(comparison.briefId).toBe('yula-new-citrus-cocktail-launch');
    expect(comparison.before.resolvedVibe).toBe('handwritten');
    expect(comparison.after.resolvedVibe).toBe('warm_coastal');

    const fields = comparison.deltas.map((d) => d.field);
    expect(fields).toContain('resolvedVibe');
    expect(fields).toContain('vibeSource');
    expect(fields).toContain('intensitySource');
  });
});

describe('resolveProposedCalendarIntensity', () => {
  it('maps product_reveal to photo_first and offer_campaign to designed', () => {
    expect(resolveProposedCalendarIntensity('product_reveal', 'story', YULA_PROPOSED_BRAND_THEME).level)
      .toBe('photo_first');
    expect(resolveProposedCalendarIntensity('offer_campaign', 'story', YULA_PROPOSED_BRAND_THEME).level)
      .toBe('designed');
  });
});

describe('harmonizePhotoFirstDesignPrompt', () => {
  it('removes conflicting premium headline block for photo_first', () => {
    const noisy = [
      'PHOTO HERO (MAXIMUM): small caption only.',
      'TYPOGRAPHY STANDARD (MANDATORY): Headline "Launch" in neon tube script.',
      'SAFE ZONE (MANDATORY): margins.',
    ].join(' ');

    const cleaned = harmonizePhotoFirstDesignPrompt(noisy, {
      vibe: 'warm_coastal',
      subtitle: 'Taste the essence of Bodrum',
      brandName: 'Yula Bodrum',
    });

    expect(cleaned).not.toContain('TYPOGRAPHY STANDARD (MANDATORY)');
    expect(cleaned).toContain('photo-first');
    expect(cleaned).toContain('Taste the essence of Bodrum');
    expect(detectFalPromptConflicts(cleaned, 'photo_first')).toHaveLength(0);
  });

  it('buildHarmonizedPhotoFirstTypographyBlock avoids headline instructions', () => {
    const lines = buildHarmonizedPhotoFirstTypographyBlock({
      vibe: 'warm_coastal',
      subtitle: 'Taste the essence of Bodrum',
    });
    expect(lines.join(' ')).toContain('Do NOT render a large headline block');
    expect(lines.join(' ')).toContain('tagline');
  });
});

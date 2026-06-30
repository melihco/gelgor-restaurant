import { describe, expect, it } from 'vitest';

import {
  buildDesignedPostDesignCardPrompt,
  buildDesignedVideoReelDesignCardPrompt,
  resolveIdeogramBackgroundStyle,
  resolveTypographyVibeFromContext,
} from '../fal-designer-production';

describe('resolveTypographyVibeFromContext', () => {
  it('prefers tenant typography_design.vibe over caption keywords', () => {
    expect(resolveTypographyVibeFromContext({
      caption: 'DJ night at the bar lounge party',
      headline: 'Summer Party',
      sector: 'nightclub',
      brandVibe: 'minimal_modern',
    })).toBe('minimal_modern');
  });

  it('uses brand DNA soul before crude caption keywords', () => {
    expect(resolveTypographyVibeFromContext({
      caption: 'bar scene cocktail backdrop',
      sector: 'restaurant_bar',
      visualDnaTone: 'bohemian Aegean Bodrum coastal warmth, sun-bleached elegance',
    })).toBe('warm_coastal');
  });

  it('uses post mood before caption keyword tie-break', () => {
    expect(resolveTypographyVibeFromContext({
      caption: 'bar backdrop',
      postMood: 'bright and inviting citrus cocktail launch — premium elegant',
      sector: 'restaurant_bar',
    })).toBe('editorial_serif');
  });
});

describe('buildDesignedPostDesignCardPrompt', () => {
  it('includes scene hint and brand directives for grounded reference edits', () => {
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'editorial_serif',
      headline: 'Sunset Session',
      subtitle: 'Rezervasyon acik',
      caption: 'Rooftop gun batimi etkinligi',
      sceneHint: 'real rooftop sunset crowd with warm ambient light',
      brandColors: { primary: '#123456', accent: '#f59e0b' },
      brandName: 'Demo Club',
      aspectRatio: '9:16',
      brandDirectives: [
        'Template color behavior: Başlık: Accent · Kategori: Accent.',
        'Typography personality should follow the selected template style.',
      ],
    });

    expect(prompt).toContain('real rooftop sunset crowd with warm ambient light');
    expect(prompt).toContain('TYPOGRAPHY STANDARD (MANDATORY)');
    expect(prompt).toContain('Reject amateur output');
    expect(prompt).toContain('PHOTO FIDELITY');
  });

  it('maps Ideogram photo_overlay to gradient_mesh when a gallery reference exists', () => {
    expect(
      resolveIdeogramBackgroundStyle(undefined, 'https://cdn.example.com/venue.jpg'),
    ).toBe('gradient_mesh');
    expect(
      resolveIdeogramBackgroundStyle('photo_overlay', 'https://cdn.example.com/venue.jpg'),
    ).toBe('gradient_mesh');
    expect(resolveIdeogramBackgroundStyle('solid_brand', 'https://cdn.example.com/venue.jpg')).toBe(
      'solid_brand',
    );
  });
});

describe('buildDesignedVideoReelDesignCardPrompt', () => {
  it('frames an art-director designed template while preserving the photo hero zone', () => {
    const prompt = buildDesignedVideoReelDesignCardPrompt({
      vibe: 'retro_poster',
      headline: 'Cheers to Our Happy Customers',
      subtitle: 'Join us!',
      brandColors: { primary: '#0d4f4f', accent: '#f5a623' },
      brandName: 'Yula Bodrum',
      sector: 'beach club',
      aspectRatio: '9:16',
    });

    expect(prompt).toContain('ART DIRECTOR for Yula Bodrum');
    expect(prompt).toContain('beach club');
    expect(prompt).toContain('hand-crafted');
    expect(prompt).toContain('PHOTO HERO ZONE');
    expect(prompt).toContain('Cheers to Our');
    expect(prompt).toContain('ON-CANVAS TEXT CONTRACT');
    expect(prompt).toContain('Headline word order (3 words');
    expect(prompt).toContain('MOTION-READY');
    expect(prompt).toContain('TYPOGRAPHY STANDARD (MANDATORY)');
  });

  it('weaves the brand soul and a special occasion into the brand palette', () => {
    const prompt = buildDesignedVideoReelDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'Anneler Gunu',
      brandColors: { primary: '#0d4f4f', accent: '#f5a623' },
      brandName: 'Sarnic Beach',
      sector: 'beach club',
      aspectRatio: '9:16',
      visualDnaTone: 'bohemian Aegean leisure, warm and bright with hand-painted sun motifs',
      occasion: { name: 'Anneler Gunu', mood: 'warm gratitude, family, soft florals' },
    });

    expect(prompt).toContain('BRAND DNA (general): bohemian Aegean leisure');
    expect(prompt).toContain('OCCASION — Anneler Gunu');
    expect(prompt).toContain('WOVEN INTO');
    expect(prompt).toContain('Never clashing holiday-cliché colors');
  });

  it('includes logo integrity and placement contract when logoUrl is provided', () => {
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'editorial_serif',
      headline: 'Meet Our Culinary Team',
      brandColors: { primary: '#e91e63', accent: '#ffd700' },
      brandName: 'Sarnic Beach',
      sector: 'restaurant',
      aspectRatio: '4:5',
      logoUrl: 'https://cdn.example.com/sarnic-logo.png',
    });

    expect(prompt).toContain('BRAND LOGO CONTRACT');
    expect(prompt).toContain('DO NOT draw, generate');
    expect(prompt).toContain('Photo hero rule');
    expect(prompt).toContain('LOGO ASSET');
    expect(prompt).not.toContain('BRAND MARK (small corner wordmark');
  });
});

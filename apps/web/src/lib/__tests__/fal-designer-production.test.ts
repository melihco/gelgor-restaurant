import { describe, expect, it } from 'vitest';

import {
  buildCreativeDesignBrief,
  buildDesignedPostDesignCardPrompt,
  buildDesignedStoryDesignCardPrompt,
  buildDesignedVideoReelDesignCardPrompt,
  buildIntensityTypographyBlock,
  FAL_PHOTO_WINDOW_COMPOSE_DIRECTIVE,
  FAL_SUBJECT_CLEARANCE_DIRECTIVE,
  resolveFalRequireGroundedGallery,
  resolveIdeogramBackgroundStyle,
  resolveTypographyVibeFromContext,
} from '../fal-designer-production';

describe('resolveFalRequireGroundedGallery', () => {
  it('requires grounded gallery for physical-venue brands with real gallery photos', () => {
    expect(resolveFalRequireGroundedGallery({
      hasRealBrandGallery: true,
      referencePhotoUrl: 'https://yulabodrum.com/galeri/44.webp',
      sector: 'beach_club',
      captionDrivenGenerated: false,
    })).toBe(true);
  });

  it('keeps gallery grounding required even when caption-driven synthetic ref is present', () => {
    expect(resolveFalRequireGroundedGallery({
      hasRealBrandGallery: true,
      referencePhotoUrl: 'https://cdn.example.com/ai-scene.png',
      sector: 'beach_club',
      captionDrivenGenerated: true,
    })).toBe(true);
  });

  it('requires grounded gallery for fal_reel video slots', () => {
    expect(resolveFalRequireGroundedGallery({
      hasRealBrandGallery: true,
      referencePhotoUrl: 'https://yulabodrum.com/galeri/sunset.webp',
      sector: 'beach_club',
      pipeline: 'fal_reel',
      captionDrivenGenerated: false,
    })).toBe(true);
  });
});

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
    expect(prompt).toContain('═══ CREATIVE BRIEF ═══');
    expect(prompt).toContain('═══ HARD CONTRACTS ═══');
    expect(prompt).toContain('Boutique social-agency Art Director brief');
    expect(prompt).toContain('REF BAR:');
    expect(prompt).toContain('TYPE CRAFT:');
    expect(prompt).toContain('TASTE FAIL');
    expect(prompt).toContain('PHOTO×TYPE:');
    expect(prompt).toContain('HARD CONTRACTS');
    expect(prompt).toContain('SUBJECT CLEARANCE (MANDATORY)');
    expect(prompt).toContain(FAL_SUBJECT_CLEARANCE_DIRECTIVE);
    expect(prompt).not.toContain('GRAPHIC ZONE: Upper 38');
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

describe('buildCreativeDesignBrief', () => {
  it('ships craft package (REF / TYPE / SPACE / TASTE) without zone percentages', () => {
    const brief = buildCreativeDesignBrief({
      mode: 'feed_post',
      brand: 'Yula Bodrum',
      sector: 'restaurant_cafe',
      aspect: 'portrait 4:5 feed post (1080×1350)',
      premiumVenue: true,
      vibe: 'warm_coastal',
      visualDnaTone: 'Aegean coastal warmth',
      briefMood: 'sunset terrace dining',
      designIntensityLevel: 'elegant_light',
      headline: 'Sunset Terrace',
    });
    expect(brief).toContain('CREATIVE BRIEF');
    expect(brief).toContain('Boutique social-agency Art Director');
    expect(brief).toContain('REF BAR:');
    expect(brief).toContain('TYPE CRAFT:');
    expect(brief).toContain('SPACE CRAFT:');
    expect(brief).toContain('PHOTO×TYPE:');
    expect(brief).toContain('TASTE FAIL');
    expect(brief).toContain('ONE IDEA: "Sunset Terrace"');
    expect(brief).toContain('Aegean coastal');
    expect(brief).toContain('found surface');
    expect(brief).toContain('color-band ≥25%');
    expect(brief).not.toContain('Canva Pro');
    expect(brief.length).toBeLessThan(1100);
  });

  it('asks designed intensity for graphic craft, not plain photo+text or sandwiches', () => {
    const brief = buildCreativeDesignBrief({
      mode: 'story',
      brand: 'Yula Bodrum',
      sector: 'restaurant_cafe',
      aspect: '1080×1920 vertical portrait frame (9:16 aspect ratio)',
      premiumVenue: true,
      vibe: 'warm_coastal',
      designIntensityLevel: 'designed',
      headline: 'Mutlu Bayramlar',
    });
    expect(brief).toContain('REQUIRED graphic craft');
    expect(brief).toContain('leftover window');
    expect(brief).toContain('paint over the photo');
    expect(brief).toContain('Canva sandwich');
    expect(brief).not.toContain('graphic zone + photo hero strip');
  });
});

describe('buildDesignedStoryDesignCardPrompt', () => {
  it('locks 9:16 Instagram Story language even when aspectRatio is wrongly 4:5', () => {
    const prompt = buildDesignedStoryDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'Join us today',
      subtitle: 'Book your table',
      brandColors: { primary: '#0d4f4f', accent: '#f5a623' },
      brandName: 'Yula Bodrum',
      sector: 'restaurant_cafe',
      aspectRatio: '4:5',
    });

    expect(prompt).toContain('Boutique social-agency Art Director brief for Yula Bodrum');
    expect(prompt).toContain('REF BAR:');
    expect(prompt).toContain('1080×1920 vertical portrait frame (9:16 aspect ratio)');
    expect(prompt).toContain('Instagram Story design');
    expect(prompt).toContain('CREATIVE BRIEF');
    expect(prompt).toContain('HARD CONTRACTS');
    expect(prompt).toContain('ONE IDEA: "Join us today"');
    expect(prompt).not.toContain('4:5 feed post');
    expect(prompt).not.toContain('scroll-stopping feed post');
  });

  it('keeps designed layout families in the protected head even when optional tail is huge', () => {
    const prompt = buildDesignedStoryDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'Mutlu Bayramlar',
      subtitle: 'Sizinle kutluyoruz',
      brandColors: { primary: '#00C5CC', accent: '#f5a25d' },
      brandName: 'Yula Bodrum',
      sector: 'restaurant_cafe',
      aspectRatio: '9:16',
      designIntensityLevel: 'designed',
      layoutFamilySeed: 'restaurant_cafe_event_announcement_story',
      sceneHint: 'real Yula Bodrum coastal celebration atmosphere with carved wood and sea',
      brandDirectives: Array.from({ length: 40 }, (_, i) =>
        `EXTRA DIRECTIVE ${i}: filler text to force optional-tail trim without eating intensity lock.`,
      ),
    });

    expect(prompt).toContain('DESIGN INTENSITY: DESIGNED');
    expect(prompt).toContain('LAYOUT LOCK:');
    expect(prompt).toContain('TYPE CONTAINMENT');
    expect(prompt).toContain('COMPOSE ORDER (MANDATORY)');
    expect(prompt).toContain(FAL_PHOTO_WINDOW_COMPOSE_DIRECTIVE);
    expect(prompt).toContain('GRAPHIC SYSTEM');
    expect(prompt).toMatch(/horizontal sandwich|paint sandwich|Canva sandwich/i);
    expect(prompt).toContain('leftover photo window');
    expect(prompt).toContain('HARD CONTRACTS');
    expect(prompt).toContain('Mutlu Bayramlar');
    expect(prompt.indexOf('LAYOUT LOCK')).toBeLessThan(prompt.indexOf('HARD CONTRACTS'));
  });

  it('keeps BRAND SLOT DESIGN RECIPE in the protected head under designed intensity pressure', () => {
    const recipe = [
      '═══ BRAND SLOT DESIGN RECIPE ═══',
      'Slot: İmza tabak (restaurant_cafe_signature_dish_post) · post · intensity designed.',
      'Design idea for "İmza tabak": make the craft system feel like Yula Bodrum\'s own social studio.',
      'Motifs from brand world: Aegean coastal warmth, carved wood, turquoise accents.',
      'Color craft: use #00C5CC + #f5a25d as intentional accents/plates/rules.',
    ].join(' ');
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'İmza tabak',
      subtitle: 'Yula Bodrum',
      brandColors: { primary: '#00C5CC', accent: '#f5a25d' },
      brandName: 'Yula Bodrum',
      sector: 'restaurant_cafe',
      aspectRatio: '4:5',
      designIntensityLevel: 'designed',
      layoutFamilySeed: 'restaurant_cafe_signature_dish_post',
      brandDirectives: [
        recipe,
        ...Array.from({ length: 30 }, (_, i) =>
          `EXTRA DIRECTIVE ${i}: filler to force optional-tail trim without eating brand recipe.`,
        ),
      ],
    });

    expect(prompt).toContain('BRAND SLOT DESIGN RECIPE');
    expect(prompt).toContain('Yula Bodrum');
    expect(prompt).toContain('LAYOUT LOCK:');
    expect(prompt).toContain('HARD CONTRACTS');
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

    expect(prompt).toContain('Boutique social-agency Art Director brief for Yula Bodrum');
    expect(prompt).toContain('REF BAR: Scorpios');
    expect(prompt).toContain('beach club');
    expect(prompt).toContain('TYPE CRAFT:');
    expect(prompt).toContain('CREATIVE BRIEF');
    expect(prompt).toContain('HARD CONTRACTS');
    expect(prompt).toContain('Cheers to Our');
    expect(prompt).toContain('ON-CANVAS TEXT CONTRACT');
    expect(prompt).toContain('Headline word order (3 words');
    expect(prompt).toContain('MOTION-READY');
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

    expect(prompt).toContain('Brand DNA: bohemian Aegean leisure');
    expect(prompt).toContain('OCCASION — Anneler Gunu');
    expect(prompt).toContain('WOVEN INTO');
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
    expect(prompt).toContain('LOGO ASSET');
    expect(prompt).toContain('RESERVED');
    expect(prompt).not.toContain('BRAND MARK (small corner wordmark');
  });

  it('photo_first story prompt forbids top bands and uses photo-first typography', () => {
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'Summer Festival',
      brandColors: { primary: '#1a1a2e', accent: '#e8c97a' },
      brandName: 'Yula Bodrum',
      sector: 'beach_club',
      aspectRatio: '9:16',
      designIntensityLevel: 'photo_first',
    });

    expect(prompt).toContain('DESIGN INTENSITY: PHOTO-FIRST');
    expect(prompt).toContain('FORBIDDEN: top horizontal color band');
    expect(prompt).toContain('TYPOGRAPHY (photo-first)');
    expect(prompt).toContain('FOUND-SURFACE TYPOGRAPHY (L1 PRIORITY)');
    expect(prompt).toContain('NEVER invent a fake painted panel');
    expect(prompt).not.toContain('TYPOGRAPHY STANDARD (MANDATORY)');
    expect(prompt).toMatch(/SECTOR STYLE \(beach club — photo-first\)|Sun-washed Aegean/);
  });

  it('bold_editorial story prompt demands oversized caps headline', () => {
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'Summer Festival',
      brandColors: { primary: '#1a1a2e', accent: '#e8c97a' },
      brandName: 'Yula Bodrum',
      sector: 'beach_club',
      aspectRatio: '9:16',
      designIntensityLevel: 'bold_editorial',
    });

    expect(prompt).toContain('BOLD EDITORIAL');
    expect(prompt).toMatch(/ALL[- ]CAPS/);
    expect(prompt).toContain('TYPE CONTAINMENT');
    expect(prompt).toContain('LAYOUT LOCK:');
  });
});

describe('buildIntensityTypographyBlock', () => {
  it('photo_first avoids premium mandatory block', () => {
    const lines = buildIntensityTypographyBlock({
      level: 'photo_first',
      vibe: 'warm_coastal',
      headline: 'Summer Festival Launch',
    });
    expect(lines.join(' ')).toContain('Do NOT render a large headline');
    expect(lines.join(' ')).not.toContain('TYPOGRAPHY STANDARD');
  });
});

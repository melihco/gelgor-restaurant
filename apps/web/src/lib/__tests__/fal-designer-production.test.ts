import { describe, expect, it } from 'vitest';

import {
  buildBrandColorSurfaceLock,
  buildBrandSoulLock,
  buildCreativeDesignBrief,
  buildDesignedPostDesignCardPrompt,
  buildDesignedStoryDesignCardPrompt,
  buildDesignedVideoReelDesignCardPrompt,
  buildIntensityTypographyBlock,
  FAL_PHOTO_WINDOW_COMPOSE_DIRECTIVE,
  FAL_SUBJECT_CLEARANCE_DIRECTIVE,
  pickFalLibraryFallbackDirectives,
  resolveFalRequireGroundedGallery,
  resolveIdeogramBackgroundStyle,
  resolveTypographyVibeFromContext,
} from '../fal-designer-production';

describe('buildBrandColorSurfaceLock', () => {
  it('forces brand hex craft fills and bans cream panels at designed intensity', () => {
    const lock = buildBrandColorSurfaceLock({
      primary: '#00C5CC',
      accent: '#f5a25d',
      intensityLevel: 'designed',
      craftActive: true,
    });
    expect(lock).toContain('COLOR SURFACE LOCK');
    expect(lock).toContain('#00C5CC');
    expect(lock).toContain('#f5a25d');
    expect(lock).toMatch(/cream|beige/i);
    expect(lock).toContain('painted system');
  });

  it('keeps a shorter anti-cream lock for photo_first', () => {
    const lock = buildBrandColorSurfaceLock({
      primary: '#112233',
      accent: '#aabbcc',
      intensityLevel: 'photo_first',
      craftActive: false,
    });
    expect(lock).toContain('COLOR SURFACE LOCK');
    expect(lock).toContain('#112233');
    expect(lock).not.toContain('MANDATORY');
  });
});

describe('pickFalLibraryFallbackDirectives', () => {
  it('keeps TEMPLATE PURPOSE ahead of filler when budget is tight', () => {
    const picked = pickFalLibraryFallbackDirectives([
      'EXTRA: long filler that should not crowd purpose',
      '═══ TEMPLATE PURPOSE ═══ Job: Etkinlik duyuru — EVENT ANNOUNCEMENT POSTER.',
      '═══ COPY FIT (TEMPLATE LIBRARY) ═══ HEADLINE budget: max 3 words.',
      '═══ BRAND SLOT DESIGN RECIPE ═══ Slot: Etkinlik · story.',
    ], 500);
    expect(picked[0]).toContain('TEMPLATE PURPOSE');
    expect(picked.some((d) => d.includes('BRAND SLOT DESIGN RECIPE'))).toBe(true);
    expect(picked.join(' ').length).toBeLessThanOrEqual(520);
  });
});

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

  it('requires grounded gallery for restaurant brands even without a pre-bound photo', () => {
    expect(resolveFalRequireGroundedGallery({
      hasRealBrandGallery: true,
      referencePhotoUrl: null,
      sector: 'restaurant_cafe',
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
    // Soft-craft layout language packs sit in the protected head — creative-brief
    // craft tags may trim under finalizeFalPrompt budget; HARD CONTRACTS must remain.
    expect(prompt).toMatch(/TASTE FAIL|PHOTO×TYPE:|TYPE CRAFT:/);
    expect(prompt).toContain('HARD CONTRACTS');
    expect(prompt).toContain('SUBJECT CLEARANCE (MANDATORY)');
    expect(prompt).toContain(FAL_SUBJECT_CLEARANCE_DIRECTIVE);
    expect(prompt).toContain('COLOR SURFACE LOCK');
    expect(prompt).toContain('#123456');
    expect(prompt).toContain('#f59e0b');
    expect(prompt).toMatch(/cream|beige/i);
    expect(prompt).not.toContain('GRAPHIC ZONE: Upper 38');
    expect(prompt).not.toContain('GRAPHIC SYSTEM (REQUIRED)');
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

  it('asks designed intensity for brand+slot craft, not plain photo+text or geometry kits', () => {
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
    expect(brief).toContain('brand+slot craft');
    expect(brief).toContain('paint over the photo');
    expect(brief).toContain('Canva sandwich');
    expect(brief).toMatch(/rail\/L|geometry/i);
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

  it('keeps brand+slot designed intensity in the protected head even when optional tail is huge', () => {
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
    expect(prompt).toMatch(/Canva sandwich|geometry|rail\/L|type_with_brand_rules/i);
    expect(prompt).toContain('HARD CONTRACTS');
    expect(prompt).toContain('Mutlu Bayramlar');
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

  it('keeps BRAND SOUL LOCK (DNA) in protected head when optional tail is trimmed', () => {
    const contract = [
      'BRAND DESIGN CONTRACT: This template set is for Yula Bodrum, sector=restaurant_cafe.',
      'BRAND UNIQUENESS: A stranger should recognize this as Yula Bodrum from color (#00C5CC/#f5a25d), venue photo, and type energy — never a stock restaurant_cafe Canva pack.',
      'VISUAL DNA — PRIMARY DESIGN SOURCE: Aegean coastal warmth with carved wood and turquoise sea glass motifs. Treat this as the highest creative reference after the requested on-canvas text.',
    ].join(' ');
    const recipe = [
      '═══ BRAND SLOT DESIGN RECIPE ═══',
      'Slot: Kokteyl (restaurant_cafe_cocktail_post) · post · intensity designed.',
      'Design idea: a reusable post recipe that could ONLY belong to Yula Bodrum for slot Kokteyl.',
      'Motifs from brand world: Aegean coastal warmth, carved wood, turquoise accents.',
    ].join(' ');
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'İmza Kokteyl',
      subtitle: 'Menü',
      brandColors: { primary: '#00C5CC', accent: '#f5a25d' },
      brandName: 'Yula Bodrum',
      sector: 'restaurant_cafe',
      aspectRatio: '4:5',
      designIntensityLevel: 'designed',
      layoutFamilySeed: 'restaurant_cafe_cocktail_post',
      visualDnaTone: 'Aegean coastal warmth carved wood turquoise',
      brandDirectives: [
        contract,
        recipe,
        '═══ COPY FIT (TEMPLATE LIBRARY) ═══ Paint ONLY the ON-CANVAS TEXT CONTRACT. HEADLINE budget: max 3 words.',
        ...Array.from({ length: 40 }, (_, i) =>
          `EXTRA DIRECTIVE ${i}: long filler ${'x'.repeat(80)} to force optional-tail trim without eating brand soul.`,
        ),
      ],
    });

    expect(prompt).toContain('BRAND SOUL LOCK');
    expect(prompt).toContain('carved wood');
    expect(prompt).toContain('BRAND SLOT DESIGN RECIPE');
    expect(prompt).toContain('HARD CONTRACTS');
    // Soul must appear before generic craft intensity / hard contracts.
    expect(prompt.indexOf('BRAND SOUL LOCK')).toBeLessThan(prompt.indexOf('HARD CONTRACTS'));
    expect(prompt.indexOf('BRAND SOUL LOCK')).toBeLessThan(prompt.indexOf('LAYOUT LOCK:'));
  });

  it('buildBrandSoulLock extracts DNA and uniqueness from brandDirectives', () => {
    const lock = buildBrandSoulLock({
      brandName: 'Yula Bodrum',
      sector: 'restaurant_cafe',
      brandColors: { primary: '#00C5CC', accent: '#f5a25d' },
      brandDirectives: [
        [
          'BRAND DESIGN CONTRACT: This template set is for Yula Bodrum.',
          'BRAND UNIQUENESS: A stranger should recognize this as Yula Bodrum from color (#00C5CC/#f5a25d).',
          'VISUAL DNA — PRIMARY DESIGN SOURCE: Hand-painted sun motifs and warm Aegean leisure. Treat this as highest.',
        ].join(' '),
      ],
    });
    expect(lock).toContain('BRAND SOUL LOCK');
    expect(lock).toContain('Hand-painted sun motifs');
    expect(lock).toContain('Yula Bodrum');
    expect(lock.length).toBeLessThanOrEqual(550);
  });

  it('hard LAYOUT LOCK still applies for nightlife bold packs', () => {
    const prompt = buildDesignedStoryDesignCardPrompt({
      vibe: 'neon_glow',
      headline: 'DJ Night',
      subtitle: 'After dark',
      brandColors: { primary: '#111827', accent: '#F472B6' },
      brandName: 'Club Neon',
      sector: 'nightclub_lounge',
      aspectRatio: '9:16',
      designIntensityLevel: 'designed',
      layoutFamilySeed: 'nightclub_lounge_dj_night_story',
      visualDnaTone: 'neon nightlife after-dark electric energy DJ booth',
      brandDirectives: [
        '═══ BRAND SLOT DESIGN RECIPE ═══ Slot: DJ Night · story · intensity designed.',
      ],
    });

    expect(prompt).toContain('LAYOUT LOCK:');
    expect(prompt).toContain('TYPE CONTAINMENT');
    expect(prompt).toContain(FAL_PHOTO_WINDOW_COMPOSE_DIRECTIVE);
    expect(prompt.indexOf('LAYOUT LOCK')).toBeLessThan(prompt.indexOf('HARD CONTRACTS'));
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
    // Full mission punchline stays contracted (word-order lock matches actual word count).
    expect(prompt).toMatch(/Headline word order \(\d+ words/);
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

    // DNA lives in BRAND SOUL LOCK (protected); brief may still echo Brand DNA when space allows.
    expect(prompt).toMatch(/Brand DNA: bohemian Aegean leisure|Visual DNA[^\n]*bohemian Aegean leisure/);
    expect(prompt).toContain('OCCASION — Anneler Gunu');
    expect(prompt).toContain('WOVEN INTO');
    expect(prompt).toContain('BRAND SOUL LOCK');
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
    expect(prompt).toContain('LOGO CLEARANCE');
    expect(prompt).not.toContain('BRAND MARK (small corner wordmark');
    // The clearance corner must never be described as something paintable —
    // that phrasing is what made live frames ship with a blank plate.
    expect(prompt).not.toMatch(/leave .{0,24}empty/i);
    expect(prompt).not.toMatch(/reserved logo zone/i);
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
    // Coastal pack + vibe language (sector style lines may yield to photo-first harmonize).
    expect(prompt).toMatch(
      /LAYOUT LANGUAGE PACK: coastal_editorial|Sun-washed Mediterranean|Sun-washed Aegean|SECTOR STYLE \(beach club/,
    );
    // photo_first must not hard-lock a craft family (allowlist text may still list families).
    expect(prompt).not.toContain('LAYOUT LOCK:');
    expect(prompt).not.toContain('side_rail_frame');
  });

  it('bold_editorial coastal prompt locks a slot family from the coastal allowlist (not nightlife rail)', () => {
    const prompt = buildDesignedPostDesignCardPrompt({
      vibe: 'warm_coastal',
      headline: 'Summer Festival',
      brandColors: { primary: '#1a1a2e', accent: '#e8c97a' },
      brandName: 'Yula Bodrum',
      sector: 'beach_club',
      aspectRatio: '9:16',
      designIntensityLevel: 'bold_editorial',
      visualDnaTone: 'Aegean coastal vibrant citrus Drink & Chill',
    });

    expect(prompt).toContain('BOLD EDITORIAL');
    expect(prompt).toMatch(/ALL[- ]CAPS/);
    expect(prompt).toContain('LAYOUT LOCK:');
    expect(prompt).toContain('SLOT DIVERSITY LOCK');
    expect(prompt).toMatch(
      /LAYOUT LOCK: use ONLY "(type_with_brand_rules|asymmetric_corner_plate|magazine_cover_overlap|diagonal_soft_cut|editorial_split_soft|inset_photo_frame|l_shape_accent)"/,
    );
    expect(prompt).not.toMatch(/LAYOUT LOCK: use ONLY "side_rail_frame"/);
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MatchedDesignTemplate } from '@/lib/brand-design-template-matcher';

vi.mock('@/lib/brand-design-template-matcher', () => ({
  matchDesignTemplateToSlot: vi.fn(),
  recordDesignTemplateUsage: vi.fn(),
  isRenderableDesignTemplateMatch: (m: { matchQuality?: string } | null | undefined) =>
    !!m && (m.matchQuality === 'hard' || m.matchQuality === 'soft'),
}));

vi.mock('@/lib/media-url', () => ({
  isUsableGalleryPhotoUrl: (u: string) => Boolean(u?.startsWith('https://')),
}));

import { matchDesignTemplateToSlot } from '@/lib/brand-design-template-matcher';
import {
  buildTemplateLayoutDirectives,
  buildTemplateReplicaPrompt,
  bindBrandTemplateForFalProduction,
  allowSoftTemplateFallbackForCatalogPin,
  dropConflictingLayoutDirectives,
  normalizeLibraryPromptForFormat,
  requiresLibraryTemplateReplica,
  pickTemplateReferenceUrls,
  resolveFalTemplateLockOptions,
  templateLayoutReferenceUrl,
  templateReplicaSpecFromBinding,
  type BrandTemplateFalBinding,
} from '@/lib/brand-design-template-production';

const matched: MatchedDesignTemplate = {
  id: 'tmpl-1',
  templateType: 'daily_story',
  templateName: 'Günlük Story',
  format: 'story',
  vibe: 'neon_glow',
  galleryRef: 'https://cdn.example.com/gallery-a.jpg',
  prominentLogo: true,
  designSpecPrompt: 'Bold diagonal panel with neon headline block.',
  thumbnailUrl: 'https://cdn.example.com/preview-daily.jpg',
  brandColors: { primary: '#111', accent: '#f0f' },
  logoUrl: 'https://cdn.example.com/logo.png',
  directive: 'Stay consistent with Günlük Story.',
  sampleHeadline: 'Gün batımı',
  sampleSubtitle: 'Sınırlı süre',
  layoutPattern: 'diagonal_split_photo_left',
  designBriefDirectives: ['Upper headline zone with accent bar'],
  canvaArchetypeId: 'arc-01',
  canvaArchetypeName: 'Diagonal Split',
  matchQuality: 'hard',
};

describe('buildTemplateLayoutDirectives', () => {
  it('includes layout recipe and mission copy without raw preview prompt', () => {
    const dirs = buildTemplateLayoutDirectives(matched, {
      headline: 'Datça erken hasat',
      subtitle: 'Sınırlı stok',
    });
    expect(dirs.some((d) => d.includes('LAYOUT TEMPLATE'))).toBe(true);
    expect(dirs.some((d) => d.includes('MISSION HEADLINE') && d.includes('Datça erken hasat'))).toBe(true);
    expect(dirs.some((d) => d.includes('FORBIDDEN ON-CANVAS TEXT') && d.includes('Gün batımı'))).toBe(true);
    expect(dirs.some((d) => d.includes('Bold diagonal panel'))).toBe(false);
    expect(dirs.some((d) => d.includes('second reference image'))).toBe(false);
    expect(dirs.some((d) => d.includes('TEXT LOCK'))).toBe(true);
  });
});

describe('dropConflictingLayoutDirectives', () => {
  const rotationDirectives = [
    'CANVA ARCHETYPE: Bold Poster (arc-07) — heavy top panel.',
    'GRID ROTATION: Prior post used a heavy brand-color header — this slot must be photo-first. Full-bleed gallery hero, tiny or no headline at bottom edge only.',
    'FORBIDDEN: top horizontal color band, upper brand panel, or poster header block.',
    'Visual DNA: warm amber tones, coastal light.',
  ];

  it('strips archetype/grid rotation lines when a template is locked', () => {
    const out = dropConflictingLayoutDirectives(rotationDirectives, matched);
    expect(out).toEqual(['Visual DNA: warm amber tones, coastal light.']);
  });

  it('passes all directives through when no template matched', () => {
    expect(dropConflictingLayoutDirectives(rotationDirectives, null)).toEqual(rotationDirectives);
  });
});

describe('library template production standard', () => {
  it('allows soft fallback only when catalog is not pinned', () => {
    expect(allowSoftTemplateFallbackForCatalogPin(null)).toBe(true);
    expect(allowSoftTemplateFallbackForCatalogPin('')).toBe(true);
    expect(allowSoftTemplateFallbackForCatalogPin('beach_club_atmosphere_reel')).toBe(false);
  });

  it('requires replica for hard/soft matches only', () => {
    expect(requiresLibraryTemplateReplica(matched)).toBe(true);
    expect(requiresLibraryTemplateReplica({ ...matched, matchQuality: 'soft' })).toBe(true);
    expect(requiresLibraryTemplateReplica({ ...matched, matchQuality: 'format_fallback' })).toBe(false);
    expect(requiresLibraryTemplateReplica(null)).toBe(false);
  });
});

describe('resolveFalTemplateLockOptions', () => {
  it('locks mission copy (no caption rewrite) and bumps grafiker when template matched', () => {
    const opts = resolveFalTemplateLockOptions({
      binding: {
        matched,
        lockedVibe: 'neon_glow',
        referencePhotoUrl: 'https://cdn.example.com/mission.jpg',
        styleReferenceUrl: matched.thumbnailUrl,
        brandDirectives: [],
        brandColors: matched.brandColors,
        logoUrl: matched.logoUrl,
        logoPlacement: null,
        occasion: undefined,
      },
      baseGrafikerMaxRetries: 0,
      defaultCaptionAwareHeadline: true,
    });
    expect(opts.captionAwareHeadline).toBe(false);
    expect(opts.grafikerMaxRetries).toBe(1);
    expect(opts.requireTemplateStyleRef).toBe(false);
  });

  it('keeps defaults when no template matched', () => {
    const opts = resolveFalTemplateLockOptions({
      binding: {
        matched: null,
        lockedVibe: null,
        referencePhotoUrl: null,
        styleReferenceUrl: null,
        brandDirectives: [],
        brandColors: null,
        logoUrl: undefined,
        logoPlacement: null,
        occasion: undefined,
      },
      baseGrafikerMaxRetries: 0,
      defaultCaptionAwareHeadline: true,
    });
    expect(opts.captionAwareHeadline).toBe(true);
    expect(opts.grafikerMaxRetries).toBe(0);
  });
});

describe('pickTemplateReferenceUrls', () => {
  it('returns mission photo only — never template preview thumbnail', () => {
    const urls = pickTemplateReferenceUrls({
      missionPhotoUrl: 'https://cdn.example.com/mission.jpg',
      matched,
      brandReferenceImageUrls: [],
    });
    expect(urls).toEqual(['https://cdn.example.com/mission.jpg']);
  });

  it('falls back to template gallery ref when mission photo missing', () => {
    const urls = pickTemplateReferenceUrls({
      missionPhotoUrl: null,
      matched,
      brandReferenceImageUrls: [],
      visualSourceMode: 'ai_generated',
    });
    expect(urls).toEqual(['https://cdn.example.com/gallery-a.jpg']);
  });

  it('does not fall back to template galleryRef under gallery_only / gallery_enhanced', () => {
    expect(pickTemplateReferenceUrls({
      missionPhotoUrl: null,
      matched,
      brandReferenceImageUrls: [],
      visualSourceMode: 'gallery_only',
    })).toEqual([]);
    expect(pickTemplateReferenceUrls({
      missionPhotoUrl: null,
      matched,
      brandReferenceImageUrls: [],
      visualSourceMode: 'gallery_enhanced',
    })).toEqual([]);
    expect(pickTemplateReferenceUrls({
      missionPhotoUrl: 'https://cdn.example.com/mission.jpg',
      matched,
      brandReferenceImageUrls: [],
      visualSourceMode: 'gallery_only',
    })).toEqual(['https://cdn.example.com/mission.jpg']);
  });
});

describe('templateLayoutReferenceUrl', () => {
  const baseBinding: BrandTemplateFalBinding = {
    matched,
    lockedVibe: 'neon_glow',
    referencePhotoUrl: 'https://cdn.example.com/mission.jpg',
    styleReferenceUrl: 'https://cdn.example.com/preview-daily.jpg',
    brandDirectives: [],
    brandColors: matched.brandColors,
    logoUrl: matched.logoUrl,
    logoPlacement: matched.logoPlacement ?? null,
    occasion: undefined,
  };

  it('returns the template preview for a hard match', () => {
    expect(templateLayoutReferenceUrl(baseBinding)).toBe('https://cdn.example.com/preview-daily.jpg');
  });

  it('returns the template preview for a soft match', () => {
    expect(templateLayoutReferenceUrl({
      ...baseBinding,
      matched: { ...matched, matchQuality: 'soft' },
    })).toBe('https://cdn.example.com/preview-daily.jpg');
  });

  it('returns undefined for format fallback matches — never clone a foreign layout', () => {
    expect(templateLayoutReferenceUrl({
      ...baseBinding,
      matched: { ...matched, matchQuality: 'format_fallback' },
    })).toBeUndefined();
  });

  it('returns undefined when binding has no preview or no match', () => {
    expect(templateLayoutReferenceUrl({ ...baseBinding, styleReferenceUrl: null })).toBeUndefined();
    expect(templateLayoutReferenceUrl({ ...baseBinding, matched: null })).toBeUndefined();
    expect(templateLayoutReferenceUrl(null)).toBeUndefined();
  });
});

describe('template replica prompt', () => {
  const binding: BrandTemplateFalBinding = {
    matched,
    lockedVibe: 'neon_glow',
    referencePhotoUrl: 'https://cdn.example.com/mission.jpg',
    styleReferenceUrl: matched.thumbnailUrl,
    brandDirectives: [],
    brandColors: matched.brandColors,
    logoUrl: matched.logoUrl,
    logoPlacement: matched.logoPlacement ?? null,
    occasion: undefined,
  };

  it('builds a replica spec from a hard-matched binding', () => {
    const spec = templateReplicaSpecFromBinding(binding);
    expect(spec).not.toBeNull();
    expect(spec!.prompt).toBe('Bold diagonal panel with neon headline block.');
    expect(spec!.sampleHeadline).toBe('Gün batımı');
    expect(spec!.forbiddenTexts).toContain('Gün batımı');
  });

  it('rewrites legacy 4:5 feed language on story library prompts at replica time', () => {
    const legacy =
      'You are the in-house ART DIRECTOR for Demo. Design ONE portrait 4:5 feed post (1080×1350): a scroll-stopping feed post — quality. ' +
      'DESIGNER BRIEF: Turn "Hello" into a scroll-stopping feed design — Canva Pro. ' +
      'Match this Pro feed 4:5 template pattern exactly — custom, not stock. ' +
      'PHOTO FRAMING (4:5 feed): Show the ENTIRE gallery photograph within the design.';
    expect(normalizeLibraryPromptForFormat(legacy, 'story')).toContain('9:16 aspect ratio');
    expect(normalizeLibraryPromptForFormat(legacy, 'story')).toContain('Instagram Story');
    expect(normalizeLibraryPromptForFormat(legacy, 'story')).not.toContain('4:5 feed post');
    expect(normalizeLibraryPromptForFormat(legacy, 'story')).toContain('story 9:16');

    const spec = templateReplicaSpecFromBinding({
      ...binding,
      matched: { ...matched, format: 'story', designSpecPrompt: legacy },
    })!;
    expect(spec.prompt).toContain('scroll-stopping Instagram Story');
    expect(spec.prompt).not.toContain('scroll-stopping feed post');
  });

  it('returns null for format fallback or missing stored prompt', () => {
    expect(templateReplicaSpecFromBinding({
      ...binding,
      matched: { ...matched, matchQuality: 'format_fallback' },
    })).toBeNull();
    expect(templateReplicaSpecFromBinding({
      ...binding,
      matched: { ...matched, designSpecPrompt: null },
    })).toBeNull();
    expect(templateReplicaSpecFromBinding(null)).toBeNull();
  });

  it('swaps sample copy with mission copy inside the stored prompt', () => {
    const spec = templateReplicaSpecFromBinding({
      ...binding,
      matched: {
        ...matched,
        designSpecPrompt: 'HEADLINE: "Gün batımı" — SUBTITLE: "Sınırlı süre" on diagonal panel.',
      },
    })!;
    const prompt = buildTemplateReplicaPrompt(spec, {
      headline: 'Datça erken hasat',
      subtitle: 'Bu hafta sonu',
    });
    expect(prompt).toContain('HEADLINE: "Datça erken hasat" — SUBTITLE: "Bu hafta sonu" on diagonal panel.');
    expect(prompt).toContain('MISSION COPY OVERRIDE');
    expect(prompt).toContain('FORBIDDEN TEXT');
    // Sample copy survives only inside the forbidden-list warning, not the layout spec.
    const specBody = prompt.split('\n\n').pop() ?? '';
    expect(specBody).toContain('diagonal panel');
    expect(specBody).not.toContain('Gün batımı');
  });

  it('keeps the stored layout spec and declares no-subtitle when mission has none', () => {
    const spec = templateReplicaSpecFromBinding(binding)!;
    const prompt = buildTemplateReplicaPrompt(spec, { headline: 'Yeni sezon' });
    expect(prompt).toContain('Bold diagonal panel with neon headline block.');
    expect(prompt).toContain('NO SUBTITLE');
    expect(prompt).toContain('"Yeni sezon"');
  });

  it('rewrites sample headline word-order locks to mission headline', () => {
    const prompt = buildTemplateReplicaPrompt(
      {
        prompt:
          'ON-CANVAS TEXT CONTRACT\nHEADLINE: "DJ Night"\nHeadline word order (2 words, do not reorder or misspell): 1="DJ" · 2="Night"\nLayout stays.',
        sampleHeadline: 'DJ Night',
        sampleSubtitle: null,
        forbiddenTexts: ['DJ Night'],
        format: 'post',
        templateName: 'DJ gece teaser',
      },
      { headline: 'Sunset Glow' },
    );
    expect(prompt).toContain('HEADLINE: "Sunset Glow"');
    expect(prompt).toContain('1="Sunset" · 2="Glow"');
    expect(prompt).not.toMatch(/1="DJ" · 2="Night"/);
  });

  it('prefers persisted type_budget over sample-length TYPE ZONE lines', () => {
    const prompt = buildTemplateReplicaPrompt(
      {
        prompt: 'Layout shell with type zone.',
        sampleHeadline: 'Where friends gather forever',
        sampleSubtitle: null,
        typeBudget: {
          headline: { maxChars: 16, maxWords: 2, maxLines: 1 },
          subtitle: null,
          source: 'operator',
        },
        forbiddenTexts: [],
        format: 'post',
      },
      { headline: 'Sunset Glow' },
    );
    expect(prompt).toContain('TYPE ZONE BUDGET (operator): headline ≤16 chars / 2 words');
    expect(prompt).toContain('Library sample headline was "Where friends gather forever"');
    expect(prompt).not.toMatch(/TYPE ZONE BUDGET: headline ≤\d+ chars.*library sample was/);
  });
});

describe('bindBrandTemplateForFalProduction', () => {
  beforeEach(() => {
    vi.mocked(matchDesignTemplateToSlot).mockReset();
  });

  it('returns enriched binding when template matches', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue(matched);
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-yula',
      slotRole: 'fal_reel_motion',
      librarySlotKey: null,
      format: 'reel',
      caption: 'DJ gece seti bu akşam',
      missionReferenceUrl: 'https://cdn.example.com/mission.jpg',
      baseDirectives: ['base'],
      brandColors: { primary: '#000', accent: '#fff' },
      brandVibe: null,
    });
    expect(binding.matched?.templateType).toBe('daily_story');
    expect(binding.lockedVibe).toBe('neon_glow');
    expect(binding.brandColors?.accent).toBe('#f0f');
    expect(binding.brandDirectives.some((d) => d.includes('LAYOUT TEMPLATE'))).toBe(true);
    expect(binding.logoUrl).toBe(matched.logoUrl);
  });

  it('carries design-fit logoPlacement for beach_club includeLogo templates', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue({
      ...matched,
      format: 'post',
      prominentLogo: true,
      canvaArchetypeId: 'cinematic_full_bleed',
      logoPlacement: {
        position: 'top_left',
        zoneHint: 'top-left quiet margin — away from type zone (bottom_right)',
        source: 'archetype',
      },
    });
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-beach-club',
      slotRole: 'fal_designed_post',
      librarySlotKey: null,
      format: 'post',
      missionReferenceUrl: 'https://cdn.example.com/sunset.jpg',
      baseDirectives: [],
      brandColors: { primary: '#007b7f', accent: '#f4a261' },
      brandVibe: 'warm_coastal',
      logoUrl: 'https://cdn.example.com/brand-logo.png',
    });
    expect(binding.logoUrl).toBe('https://cdn.example.com/brand-logo.png');
    expect(binding.logoPlacement?.position).toBe('top_left');
    expect(binding.brandDirectives.some((d) => d.includes('LOGO SEAT'))).toBe(true);
  });

  it('omits brand logo when template includeLogo/prominentLogo is false (beach_club)', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue({
      ...matched,
      prominentLogo: false,
      logoUrl: 'https://cdn.example.com/sarnic-logo.png',
      logoPlacement: {
        position: 'top_right',
        zoneHint: null,
        source: 'archetype',
      },
    });
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-sarnic',
      slotRole: 'fal_designed_post',
      librarySlotKey: null,
      format: 'post',
      missionReferenceUrl: 'https://cdn.example.com/venue.jpg',
      baseDirectives: [],
      brandColors: { primary: '#007b7f', accent: '#f4a261' },
      brandVibe: 'warm_coastal',
      logoUrl: 'https://cdn.example.com/brand-default-logo.png',
    });
    expect(binding.matched?.prominentLogo).toBe(false);
    expect(binding.logoUrl).toBeUndefined();
    expect(binding.logoPlacement).toBeNull();
    expect(binding.brandDirectives.some((d) => d.includes('LOGO OFF'))).toBe(true);
  });

  it('carries design-fit logoPlacement for local_products_shop product hero', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue({
      ...matched,
      format: 'post',
      templateType: 'product_hero',
      templateName: 'Ürün Hero',
      prominentLogo: true,
      canvaArchetypeId: 'product_hero_card',
      logoPlacement: {
        position: 'bottom_right',
        zoneHint: null,
        source: 'archetype',
      },
    });
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-local-shop',
      slotRole: 'fal_designed_post',
      librarySlotKey: null,
      format: 'post',
      missionReferenceUrl: 'https://cdn.example.com/product.jpg',
      baseDirectives: [],
      brandColors: { primary: '#3d2b1f', accent: '#c4a35a' },
      brandVibe: null,
      logoUrl: 'https://cdn.example.com/shop-logo.png',
    });
    expect(binding.logoPlacement?.position).toBe('bottom_right');
    expect(binding.logoPlacement?.source).toBe('archetype');
  });

  it('prefers confirmed brand vibe over template snapshot', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue(matched);
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-beach',
      slotRole: 'fal_designed_post',
      librarySlotKey: null,
      format: 'post',
      missionReferenceUrl: 'https://cdn.example.com/mission.jpg',
      baseDirectives: [],
      brandColors: { primary: '#264653', accent: '#E9C46A' },
      brandVibe: 'warm_coastal',
    });
    expect(binding.lockedVibe).toBe('warm_coastal');
  });

  it('skips binding for ad-hoc brief without catalog pin', async () => {
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-yula',
      slotRole: 'fal_designed_post',
      librarySlotKey: null,
      format: 'post',
      adHocBrief: true,
      missionReferenceUrl: 'https://cdn.example.com/mission.jpg',
      baseDirectives: ['only-base'],
      brandColors: { primary: '#000', accent: '#fff' },
      brandVibe: null,
    });
    expect(binding.matched).toBeNull();
    expect(binding.brandDirectives).toEqual(['only-base']);
    expect(matchDesignTemplateToSlot).not.toHaveBeenCalled();
  });

  it('binds library template for ad-hoc brief when catalog slot is pinned', async () => {
    vi.mocked(matchDesignTemplateToSlot).mockResolvedValue(matched);
    const binding = await bindBrandTemplateForFalProduction({
      workspaceId: 'ws-yula',
      slotRole: 'campaign_story_motion',
      librarySlotKey: null,
      format: 'story',
      catalogSlotKey: 'beach_club_event_announcement_story',
      adHocBrief: true,
      missionReferenceUrl: 'https://cdn.example.com/mission.jpg',
      baseDirectives: ['only-base'],
      brandColors: { primary: '#000', accent: '#fff' },
      brandVibe: null,
    });
    expect(matchDesignTemplateToSlot).toHaveBeenCalled();
    expect(binding.matched?.id).toBe(matched.id);
    expect(binding.styleReferenceUrl).toBe(matched.thumbnailUrl);
  });
});

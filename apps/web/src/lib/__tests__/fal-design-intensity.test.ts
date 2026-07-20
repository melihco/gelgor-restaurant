import { describe, expect, it } from 'vitest';
import {
  CALENDAR_ANNOUNCEMENT_INTENSITY,
  clampDesignIntensityToCeiling,
  resolveCalendarFalDesignIntensity,
  resolveDesignCraftLayoutFamily,
  resolveFalDesignIntensityConfig,
  resolveFalDesignIntensityDirectives,
  resolveFalDesignIntensityForChannel,
  resolveFalDesignIntensityMode,
  resolveFoundSurfaceTypographyDirective,
  resolveSlotFalDesignIntensity,
  readIdeaAnnouncementType,
} from '@/lib/fal-design-intensity';

describe('resolveFalDesignIntensityConfig', () => {
  it('defaults to elegant_light when unset (photo-integrated modern editorial)', () => {
    expect(resolveFalDesignIntensityConfig(null)).toEqual({
      story: 'elegant_light',
      reel: 'elegant_light',
      post: 'elegant_light',
    });
  });

  it('maps legacy textOverlayDensity', () => {
    expect(resolveFalDesignIntensityConfig({
      typography: { textOverlayDensity: 'minimal' },
    })).toEqual({
      story: 'elegant_light',
      reel: 'elegant_light',
      post: 'elegant_light',
    });
    expect(resolveFalDesignIntensityConfig({
      typography: { text_overlay_density: 'dense' },
    }).post).toBe('bold_editorial');
  });

  it('explicit config overrides legacy', () => {
    expect(resolveFalDesignIntensityConfig({
      typography: { textOverlayDensity: 'minimal' },
      fal_design_intensity: { story: 'designed', reel: 'balanced', post: 'photo_first' },
    })).toEqual({
      story: 'designed',
      reel: 'balanced',
      post: 'photo_first',
    });
  });
});

describe('resolveFalDesignIntensityDirectives', () => {
  it('photo_first minimizes overlay language', () => {
    const d = resolveFalDesignIntensityDirectives('photo_first', 'reel');
    expect(d.photoRules.join(' ')).toMatch(/88–95%/);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/FORBIDDEN.*top horizontal/i);
    expect(d.priorityBlock).toMatch(/PHOTO-FIRST/i);
    expect(d.foundSurfaceAnchor).toMatch(/FOUND-SURFACE TYPOGRAPHY \(L1 PRIORITY\)/i);
  });

  it('balanced requires light craft and forbids plain photo+text', () => {
    const d = resolveFalDesignIntensityDirectives('balanced', 'reel');
    expect(d.photoRules.join(' ')).toMatch(/62–80%/);
    expect(d.photoRules.join(' ')).toMatch(/LAYOUT FAMILIES/);
    expect(d.photoRules.join(' ')).toMatch(/CRAFT \(REQUIRED/);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/floating text only/i);
    expect(d.foundSurfaceAnchor).toMatch(/CRAFT-ZONE TYPOGRAPHY/);
    expect(d.foundSurfaceAnchor).toMatch(/photo window/i);
  });

  it('balanced feed_post forbids story-stack and solid color-band splits on 4:5', () => {
    const d = resolveFalDesignIntensityDirectives('balanced', 'feed_post');
    expect(d.photoRules.join(' ')).toMatch(/4:5/);
    expect(d.photoRules.join(' ')).toMatch(/60–78%/);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/story-style/i);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/9:16/);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/sandwich|opaque header/i);
  });

  it('bold_editorial forbids paint sandwich and keeps a clear photo window', () => {
    const d = resolveFalDesignIntensityDirectives('bold_editorial', 'reel');
    expect(d.forbiddenLayouts.join(' ')).toMatch(/sandwich/i);
    expect(d.photoRules.join(' ')).toMatch(/55–75%/);
    expect(d.photoRules.join(' ')).toMatch(/COMPOSE|contain/i);
    expect(d.typographyAnchor).toMatch(/OVERSIZED/i);
    expect(d.foundSurfaceAnchor).toMatch(/CRAFT-ZONE TYPOGRAPHY/);
  });

  it('designed requires graphic craft and forbids paint-over-photo / plain photo+text', () => {
    const d = resolveFalDesignIntensityDirectives('designed', 'reel');
    expect(d.priorityBlock).toMatch(/REQUIRED graphic craft/i);
    expect(d.photoRules.join(' ')).toMatch(/LAYOUT FAMILIES/);
    expect(d.photoRules.join(' ')).toMatch(/GRAPHIC SYSTEM|COMPOSE/i);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/floating text only|photo \+ floating text|paint.*full-bleed/i);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/sandwich/i);
  });

  it('channel resolver reads theme', () => {
    expect(resolveFalDesignIntensityForChannel({
      fal_design_intensity: { post: 'designed' },
    }, 'post')).toBe('designed');
  });
});

describe('resolveFoundSurfaceTypographyDirective', () => {
  it('prioritizes found surfaces at photo_first and elegant_light', () => {
    expect(resolveFoundSurfaceTypographyDirective('photo_first')).toMatch(/L1 PRIORITY/);
    expect(resolveFoundSurfaceTypographyDirective('elegant_light')).toMatch(/L2 PRIORITY/);
    expect(resolveFoundSurfaceTypographyDirective('photo_first')).toMatch(/NEVER invent a fake painted panel/i);
  });

  it('keeps designed/bold type inside craft zones away from the photo window', () => {
    const designed = resolveFoundSurfaceTypographyDirective('designed');
    expect(designed).toMatch(/CRAFT-ZONE TYPOGRAPHY/);
    expect(designed).toMatch(/photo window/i);
    expect(designed).toMatch(/paint slabs/i);
  });
});

describe('resolveFalDesignIntensityMode', () => {
  it('uses reel rules for 9:16 story', () => {
    expect(resolveFalDesignIntensityMode('9:16', false)).toBe('reel');
    expect(resolveFalDesignIntensityMode('4:5', false)).toBe('feed_post');
  });
});

describe('resolveDesignCraftLayoutFamily', () => {
  it('is deterministic per slot seed and diversifies across slots', () => {
    const a = resolveDesignCraftLayoutFamily('restaurant_cafe_signature_dish_post');
    const b = resolveDesignCraftLayoutFamily('restaurant_cafe_dining_ambiance_post');
    const a2 = resolveDesignCraftLayoutFamily('restaurant_cafe_signature_dish_post');
    expect(a).toBe(a2);
    expect(a).not.toBe(b);
  });

  it('respects DNA craft allowlist pool', () => {
    const allow = ['type_with_brand_rules', 'inset_photo_frame'] as const;
    const family = resolveDesignCraftLayoutFamily('any-slot-key', allow);
    expect(allow).toContain(family);
  });
});

describe('clampDesignIntensityToCeiling', () => {
  it('caps proposed intensity at brand ceiling without raising lower proposals', () => {
    expect(clampDesignIntensityToCeiling('designed', 'elegant_light')).toBe('elegant_light');
    expect(clampDesignIntensityToCeiling('photo_first', 'elegant_light')).toBe('photo_first');
    expect(clampDesignIntensityToCeiling('balanced', 'balanced')).toBe('balanced');
  });
});

describe('resolveCalendarFalDesignIntensity', () => {
  const theme = { fal_design_intensity: { story: 'balanced', post: 'designed' } };

  it('maps announcement types and respects brand ceiling on story', () => {
    // product_reveal proposes designed; story ceiling is balanced → capped
    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'product_reveal',
      channel: 'story',
      brandTheme: theme,
    })).toEqual({
      level: 'balanced',
      source: 'announcement:product_reveal+ceiling:brand.story',
    });

    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'offer_campaign',
      channel: 'story',
      brandTheme: theme,
    })).toEqual({
      level: 'balanced',
      source: 'announcement:offer_campaign+ceiling:brand.story',
    });

    // post ceiling is designed — announcement designed passes through
    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'event_teaser',
      channel: 'post',
      brandTheme: theme,
    })).toEqual({ level: 'designed', source: 'announcement:event_teaser' });

    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'social_proof',
      channel: 'post',
      brandTheme: theme,
    })).toEqual({ level: 'balanced', source: 'announcement:social_proof' });
  });

  it('prefers fal_template_production.intensity as ceiling SSOT', () => {
    const panelTheme = {
      fal_design_intensity: { story: 'bold_editorial', post: 'bold_editorial' },
      fal_template_production: {
        intensity: { story: 'elegant_light', reel: 'elegant_light', post: 'elegant_light' },
      },
    };
    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'event_announcement',
      channel: 'story',
      brandTheme: panelTheme,
    })).toEqual({
      level: 'elegant_light',
      source: 'announcement:event_announcement+ceiling:brand.story',
    });
  });

  it('falls back to brand_theme when announcement is unknown', () => {
    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'community_moment',
      channel: 'story',
      brandTheme: theme,
    })).toEqual({ level: 'balanced', source: 'brand_theme.fal_design_intensity.story' });
  });

  it('normalizes announcement keys', () => {
    expect(resolveCalendarFalDesignIntensity({
      announcementType: '  Product Reveal ',
      channel: 'story',
      brandTheme: theme,
    }).source).toBe('announcement:product_reveal+ceiling:brand.story');
  });

  it('exposes CALENDAR_ANNOUNCEMENT_INTENSITY for calendar pack', () => {
    expect(CALENDAR_ANNOUNCEMENT_INTENSITY.product_reveal).toBe('designed');
    expect(CALENDAR_ANNOUNCEMENT_INTENSITY.venue_showcase).toBe('balanced');
    expect(CALENDAR_ANNOUNCEMENT_INTENSITY.offer_campaign).toBe('designed');
  });
});

describe('resolveSlotFalDesignIntensity', () => {
  it('prefers explicit override over calendar routing', () => {
    const idea = { announcement_type: 'product_reveal' };
    expect(resolveSlotFalDesignIntensity({
      idea,
      channel: 'story',
      override: 'bold_editorial',
      isCalendarTrack: true,
    })).toEqual({ level: 'bold_editorial', source: 'explicit_override' });
  });

  it('routes calendar ideas through announcement map with brand ceiling', () => {
    const idea = { calendar_announcement_type: 'offer_campaign' };
    expect(resolveSlotFalDesignIntensity({
      idea,
      channel: 'story',
      brandTheme: { fal_design_intensity: { story: 'designed', reel: 'designed', post: 'designed' } },
      isCalendarTrack: true,
    })).toEqual({ level: 'designed', source: 'announcement:offer_campaign' });

    expect(resolveSlotFalDesignIntensity({
      idea,
      channel: 'story',
      brandTheme: { fal_design_intensity: { story: 'elegant_light', reel: 'elegant_light', post: 'elegant_light' } },
      isCalendarTrack: true,
    })).toEqual({
      level: 'elegant_light',
      source: 'announcement:offer_campaign+ceiling:brand.story',
    });
  });
});

describe('readIdeaAnnouncementType', () => {
  it('reads calendar_announcement_type first', () => {
    expect(readIdeaAnnouncementType({
      calendar_announcement_type: 'event_teaser',
      announcement_type: 'product_reveal',
    })).toBe('event_teaser');
  });
});

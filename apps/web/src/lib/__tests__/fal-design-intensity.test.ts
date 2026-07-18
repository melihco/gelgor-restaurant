import { describe, expect, it } from 'vitest';
import {
  CALENDAR_ANNOUNCEMENT_INTENSITY,
  resolveCalendarFalDesignIntensity,
  resolveFalDesignIntensityConfig,
  resolveFalDesignIntensityDirectives,
  resolveFalDesignIntensityForChannel,
  resolveFalDesignIntensityMode,
  resolveFoundSurfaceTypographyDirective,
  resolveSlotFalDesignIntensity,
  readIdeaAnnouncementType,
} from '@/lib/fal-design-intensity';

describe('resolveFalDesignIntensityConfig', () => {
  it('defaults to balanced when unset', () => {
    expect(resolveFalDesignIntensityConfig(null)).toEqual({
      story: 'balanced',
      reel: 'balanced',
      post: 'balanced',
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

  it('balanced keeps 52–62% photo rule for vertical', () => {
    const d = resolveFalDesignIntensityDirectives('balanced', 'reel');
    expect(d.photoRules.join(' ')).toMatch(/52–62%/);
    expect(d.foundSurfaceAnchor).toMatch(/XOR brand panel/i);
  });

  it('balanced feed_post forbids story-stack composition on 4:5', () => {
    const d = resolveFalDesignIntensityDirectives('balanced', 'feed_post');
    expect(d.photoRules.join(' ')).toMatch(/4:5/);
    expect(d.photoRules.join(' ')).toMatch(/55–70%/);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/story-style/i);
    expect(d.forbiddenLayouts.join(' ')).toMatch(/9:16/);
  });

  it('bold_editorial forbids large photo share', () => {
    const d = resolveFalDesignIntensityDirectives('bold_editorial', 'reel');
    expect(d.forbiddenLayouts.join(' ')).toMatch(/more than 38%/);
    expect(d.typographyAnchor).toMatch(/OVERSIZED/i);
    expect(d.foundSurfaceAnchor).toMatch(/L4–5 OPTIONAL/i);
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

  it('allows brand panels at designed/bold without stacking', () => {
    const designed = resolveFoundSurfaceTypographyDirective('designed');
    expect(designed).toMatch(/OPTIONAL/);
    expect(designed).toMatch(/do NOT stack/i);
  });
});

describe('resolveFalDesignIntensityMode', () => {
  it('uses reel rules for 9:16 story', () => {
    expect(resolveFalDesignIntensityMode('9:16', false)).toBe('reel');
    expect(resolveFalDesignIntensityMode('4:5', false)).toBe('feed_post');
  });
});

describe('resolveCalendarFalDesignIntensity', () => {
  const theme = { fal_design_intensity: { story: 'balanced', post: 'designed' } };

  it('maps announcement types to sector-agnostic defaults', () => {
    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'product_reveal',
      channel: 'story',
      brandTheme: theme,
    })).toEqual({ level: 'photo_first', source: 'announcement:product_reveal' });

    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'offer_campaign',
      channel: 'story',
      brandTheme: theme,
    })).toEqual({ level: 'designed', source: 'announcement:offer_campaign' });

    expect(resolveCalendarFalDesignIntensity({
      announcementType: 'event_teaser',
      channel: 'post',
      brandTheme: theme,
    })).toEqual({ level: 'elegant_light', source: 'announcement:event_teaser' });
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
    }).source).toBe('announcement:product_reveal');
  });

  it('exposes CALENDAR_ANNOUNCEMENT_INTENSITY for calendar pack', () => {
    expect(CALENDAR_ANNOUNCEMENT_INTENSITY.product_reveal).toBe('photo_first');
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

  it('routes calendar ideas through announcement map', () => {
    const idea = { calendar_announcement_type: 'offer_campaign' };
    expect(resolveSlotFalDesignIntensity({
      idea,
      channel: 'story',
      isCalendarTrack: true,
    })).toEqual({ level: 'designed', source: 'announcement:offer_campaign' });
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

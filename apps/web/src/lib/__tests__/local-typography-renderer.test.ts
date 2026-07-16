/**
 * Local typography renderer — pure-logic tests.
 *
 * Covers layout selection, canvas geometry, deterministic contrast QA, Turkish
 * glyph fidelity in the Satori element tree, and the `shouldUseLocalTypography`
 * role matrix. Multi-tenant rule: every color/contrast assertion runs against at
 * least two sectors (`beach_club` + `local_products_shop`) — never a brand id.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { SECTOR_DEFAULT_THEMES } from '@/types/brand-theme';
import {
  buildOverlayElement,
  contrastRatio,
  displayUppercase,
  formatForAspect,
  hexToRgb,
  LOCAL_TYPOGRAPHY_ROLES,
  pickReadableTextColor,
  relativeLuminance,
  resolveCanvasDimensions,
  resolvePanelColors,
  selectLayoutFamily,
  shouldUseLocalTypography,
  type LayoutFamily,
  type OverlayContent,
} from '@/lib/local-typography-renderer';
import { fontsForVibe } from '@/lib/satori-fonts';

const SECTORS = ['beach_club', 'local_products_shop'] as const;

function brandColorsFor(sector: (typeof SECTORS)[number]): { primary: string; accent: string } {
  const theme = SECTOR_DEFAULT_THEMES[sector]!;
  return { primary: theme.palette.primary, accent: theme.palette.accent };
}

/** Recursively collect every string text child in a Satori element tree. */
function collectText(node: unknown): string[] {
  if (node == null) return [];
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (typeof node === 'object' && 'props' in (node as Record<string, unknown>)) {
    const props = (node as { props?: { children?: unknown } }).props;
    return collectText(props?.children);
  }
  return [];
}

/** Recursively collect every style object in a Satori element tree. */
function collectStyles(node: unknown): Record<string, unknown>[] {
  if (node == null || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(collectStyles);
  const out: Record<string, unknown>[] = [];
  const props = (node as { props?: { style?: Record<string, unknown>; children?: unknown } }).props;
  if (props?.style) out.push(props.style);
  if (props?.children) out.push(...collectStyles(props.children));
  return out;
}

afterEach(() => {
  delete process.env.LOCAL_TYPOGRAPHY_ENABLED;
});

describe('hexToRgb', () => {
  it('parses 6-digit and 3-digit hex, rejects garbage', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('0b4f6c')).toEqual({ r: 11, g: 79, b: 108 });
    expect(hexToRgb('not-a-color')).toBeNull();
  });
});

describe('relativeLuminance / contrastRatio', () => {
  it('white on black is the maximum 21:1', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 3);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 3);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });
});

describe('formatForAspect', () => {
  it('maps 9:16 to story, others to post', () => {
    expect(formatForAspect('9:16')).toBe('story');
    expect(formatForAspect('4:5')).toBe('post');
    expect(formatForAspect('1:1')).toBe('post');
  });
});

describe('resolveCanvasDimensions', () => {
  it('returns Instagram-native dimensions per aspect ratio', () => {
    expect(resolveCanvasDimensions('9:16')).toEqual({ width: 1080, height: 1920 });
    expect(resolveCanvasDimensions('4:5')).toEqual({ width: 1080, height: 1350 });
    expect(resolveCanvasDimensions('1:1')).toEqual({ width: 1080, height: 1080 });
  });
});

describe('selectLayoutFamily', () => {
  it('maps campaign_hero story templates to hero_footer (template-library look)', () => {
    expect(selectLayoutFamily({
      format: 'story',
      canvaArchetypeId: 'campaign_hero_block',
      layoutPattern: 'dominant offer headline on brand slab',
    })).toBe('hero_footer');
    expect(selectLayoutFamily({ format: 'story', templateType: 'campaign_announcement' })).toBe('hero_footer');
  });

  it('maps distinct Canva archetypes to distinct geometries (not one shell)', () => {
    expect(selectLayoutFamily({ format: 'story', canvaArchetypeId: 'frosted_quote_card' })).toBe('frosted_quote');
    expect(selectLayoutFamily({ format: 'story', canvaArchetypeId: 'polaroid_memory' })).toBe('polaroid');
    expect(selectLayoutFamily({ format: 'story', canvaArchetypeId: 'neon_night_promo' })).toBe('neon_night');
    expect(selectLayoutFamily({ format: 'story', canvaArchetypeId: 'event_ticket_stub' })).toBe('ticket_stub');
    expect(selectLayoutFamily({ format: 'story', canvaArchetypeId: 'cinematic_full_bleed' })).toBe('cinematic');
    expect(selectLayoutFamily({ format: 'story', canvaArchetypeId: 'noir_editorial' })).toBe('cinematic');
  });

  it('uses vibe for story geometry when archetype is absent (brand personality)', () => {
    expect(selectLayoutFamily({ format: 'story', vibe: 'warm_coastal' })).toBe('frosted_quote');
    expect(selectLayoutFamily({ format: 'story', vibe: 'neon_glow' })).toBe('neon_night');
    expect(selectLayoutFamily({ format: 'story', vibe: 'editorial_serif' })).toBe('cinematic');
    expect(selectLayoutFamily({ format: 'story', vibe: 'retro_poster' })).toBe('bottom_panel');
  });

  it('defaults story to hero_footer; explicit cream slab hint keeps bottom_panel', () => {
    expect(selectLayoutFamily({ format: 'story' })).toBe('hero_footer');
    expect(selectLayoutFamily({ format: 'story', layoutFamilyHint: 'bottom_cream_slab' })).toBe('bottom_panel');
  });

  it('posts honor split/photo_top hints', () => {
    expect(selectLayoutFamily({ format: 'post', layoutFamilyHint: 'split_block' })).toBe('split_panel');
    expect(selectLayoutFamily({ format: 'post', layoutFamilyHint: 'photo_top_stack' })).toBe('photo_top');
  });

  it('promo/event templates default to split panel, others to photo_top', () => {
    expect(selectLayoutFamily({ format: 'post', templateType: 'event_special' })).toBe('split_panel');
    expect(selectLayoutFamily({ format: 'post', templateType: 'daily_post' })).toBe('photo_top');
    expect(selectLayoutFamily({ format: 'post' })).toBe('photo_top');
  });

  it('archetype wins over vibe when both are present', () => {
    expect(selectLayoutFamily({
      format: 'story',
      canvaArchetypeId: 'campaign_hero_block',
      vibe: 'neon_glow',
    })).toBe('hero_footer');
  });
});

describe('contrast QA (multi-sector)', () => {
  it('pickReadableTextColor yields AA-legible text for both sector primaries', () => {
    for (const sector of SECTORS) {
      const { primary } = brandColorsFor(sector);
      const text = pickReadableTextColor(primary);
      expect(contrastRatio(primary, text)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('resolvePanelColors produces AA-legible panels for every layout + sector', () => {
    const families: LayoutFamily[] = [
      'bottom_panel',
      'split_panel',
      'photo_top',
      'hero_footer',
      'frosted_quote',
      'polaroid',
      'neon_night',
      'ticket_stub',
      'cinematic',
    ];
    for (const sector of SECTORS) {
      const brandColors = brandColorsFor(sector);
      for (const family of families) {
        const { panelColor, textColor } = resolvePanelColors(family, brandColors);
        // cinematic / neon render white type on photo/dark scrim — panel vs text is still AA.
        expect(contrastRatio(panelColor, textColor)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('falls back to safe defaults for invalid brand colors', () => {
    const { panelColor, textColor } = resolvePanelColors('split_panel', {
      primary: 'nope',
      accent: 'also-nope',
    });
    expect(contrastRatio(panelColor, textColor)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('buildOverlayElement (Turkish glyph fidelity + geometry)', () => {
  const TURKISH_HEADLINE = 'Şöleni Gümüşlük’te Yaşayın — İçecek İkramı';

  function content(family: LayoutFamily, sector: (typeof SECTORS)[number]): OverlayContent {
    const colors = resolvePanelColors(family, brandColorsFor(sector));
    const fonts = fontsForVibe('warm_coastal');
    const storyFamilies = new Set<LayoutFamily>([
      'bottom_panel',
      'hero_footer',
      'frosted_quote',
      'polaroid',
      'neon_night',
      'ticket_stub',
      'cinematic',
    ]);
    return {
      family,
      format: storyFamilies.has(family) ? 'story' : 'post',
      headline: TURKISH_HEADLINE,
      subtitle: 'Rezervasyon için bize ulaşın',
      overline: 'Sarnıç Beach',
      headingFontFamily: fonts.heading,
      bodyFontFamily: fonts.body,
      ...colors,
    };
  }

  it('renders Turkish diacritics verbatim (no ASCII folding)', () => {
    for (const sector of SECTORS) {
      const el = buildOverlayElement(content('bottom_panel', sector));
      const texts = collectText(el);
      expect(texts).toContain(TURKISH_HEADLINE);
    }
  });

  it('split panel is a 42%-wide side block; photo_top/bottom stack the panel', () => {
    const split = buildOverlayElement(content('split_panel', 'beach_club'));
    const splitStyles = collectStyles(split);
    expect(splitStyles.some((s) => s.width === '42%')).toBe(true);
    expect((split as { props: { style: Record<string, unknown> } }).props.style.flexDirection).toBe('row');

    const bottom = buildOverlayElement(content('bottom_panel', 'beach_club'));
    expect((bottom as { props: { style: Record<string, unknown> } }).props.style.flexDirection).toBe('column');
    expect((bottom as { props: { style: Record<string, unknown> } }).props.style.justifyContent).toBe('flex-end');
  });

  it('frosted / neon / polaroid / ticket geometries diverge structurally', () => {
    const frosted = buildOverlayElement(content('frosted_quote', 'beach_club'));
    expect(collectStyles(frosted).some((s) => String(s.background ?? '').includes('rgba(245'))).toBe(true);

    const neon = buildOverlayElement(content('neon_night', 'local_products_shop'));
    expect(collectStyles(neon).some((s) => s.color === '#FFFFFF')).toBe(true);

    const polaroid = buildOverlayElement(content('polaroid', 'beach_club'));
    expect(collectStyles(polaroid).some((s) => s.background === '#FFFFFF')).toBe(true);

    const ticket = buildOverlayElement(content('ticket_stub', 'local_products_shop'));
    expect(collectStyles(ticket).some((s) => String(s.borderTop ?? '').includes('dashed'))).toBe(true);
  });

  it('overline uppercases with the Turkish dotted-İ when the slot copy is Turkish', () => {
    // Overline itself has no Turkish-specific letters — the headline is the signal.
    expect(displayUppercase('Yeni Hasat', 'Datça Çam Balı — Doğadan Sofranıza')).toBe('YENİ HASAT');
    expect(displayUppercase('İyi Bayramlar')).toBe('İYİ BAYRAMLAR');
    // English copy must never get the tr-TR mapping ("MİSSİON").
    expect(displayUppercase('Summer Festival', "Don't Miss Our Exclusive Summer Festival!")).toBe(
      'SUMMER FESTIVAL',
    );
  });

  it('wires the resolved vibe fonts into the text styles', () => {
    const el = buildOverlayElement(content('photo_top', 'local_products_shop'));
    const fontFamilies = collectStyles(el)
      .map((s) => s.fontFamily)
      .filter(Boolean);
    const fonts = fontsForVibe('warm_coastal');
    expect(fontFamilies).toContain(fonts.heading);
    expect(fontFamilies).toContain(fonts.body);
  });
});

describe('shouldUseLocalTypography (role matrix + flag gate)', () => {
  const LOCAL_ROLES = [
    'campaign_story_motion',
    'fal_story_motion',
    'designed_typography',
    'fal_designed_post',
    'fal_only_story',
    'fal_only_post',
  ];
  const EXCLUDED_ROLES = ['designed_post', 'organic_reel', 'fal_reel', 'campaign_reel_motion'];

  it('returns false whenever the flag is off, regardless of role', () => {
    delete process.env.LOCAL_TYPOGRAPHY_ENABLED;
    for (const role of LOCAL_ROLES) {
      expect(shouldUseLocalTypography(role, 'fal_story')).toBe(false);
    }
  });

  it('routes text-heavy roles to local when enabled', () => {
    process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';
    for (const role of LOCAL_ROLES) {
      expect(shouldUseLocalTypography(role)).toBe(true);
      expect(LOCAL_TYPOGRAPHY_ROLES.has(role)).toBe(true);
    }
  });

  it('keeps hero designed_post and reels on the external pipeline', () => {
    process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';
    for (const role of EXCLUDED_ROLES) {
      expect(shouldUseLocalTypography(role, 'fal_reel')).toBe(false);
    }
  });

  it('honors pipeline-level fallback for fal-only slots without a role', () => {
    process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';
    expect(shouldUseLocalTypography(null, 'fal_only_story')).toBe(true);
    expect(shouldUseLocalTypography(undefined, 'fal_only_post')).toBe(true);
    expect(shouldUseLocalTypography(null, 'fal_reel')).toBe(false);
  });

  it('respects brand production_engines.satori.local_typography_enabled opt-out', () => {
    process.env.LOCAL_TYPOGRAPHY_ENABLED = 'true';
    const disabledTheme = { production_engines: { satori: { local_typography_enabled: false } } };
    expect(shouldUseLocalTypography('designed_typography', 'fal_design', disabledTheme)).toBe(false);
    expect(shouldUseLocalTypography('designed_typography', 'fal_design', {
      production_engines: { satori: { local_typography_enabled: true } },
    })).toBe(true);
  });
});

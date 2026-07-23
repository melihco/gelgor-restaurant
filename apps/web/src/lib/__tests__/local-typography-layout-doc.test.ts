import { describe, expect, it } from 'vitest';
import { seedDesignSpecLayout } from '../design-spec-layout';
import {
  buildLayoutDocOverlayElement,
  normRectToPx,
  resolveLayoutDocCraftColors,
  resolveLocalTypographyLayout,
} from '../local-typography-renderer';

describe('local-typography layout doc', () => {
  it('converts normalized rects to pixel boxes', () => {
    const box = normRectToPx({ x: 0.1, y: 0.2, width: 0.5, height: 0.25 }, 1000, 1000, 0.1);
    expect(box.left).toBe(150);
    expect(box.top).toBe(225);
    expect(box.width).toBe(400);
    expect(box.height).toBe(200);
  });

  it('seeds layout from archetype when persisted layout missing', () => {
    const layout = resolveLocalTypographyLayout({
      canvaArchetypeId: 'split_feature_panel',
      format: 'post',
    });
    expect(layout?.archetypeId).toBe('split_feature_panel');
    expect(layout?.renderPath).toBe('deterministic_compose');
    expect(layout?.textSlots.some((t) => t.role === 'headline')).toBe(true);
  });

  it('builds absolute panel + text nodes from design_spec.layout', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'split_feature_panel',
      format: 'post',
    });
    expect(layout).toBeTruthy();
    const craft = resolveLayoutDocCraftColors('split_feature_panel', {
      primary: '#264653',
      accent: '#f4a261',
    });
    expect(craft.craft).toBe('product');
    expect(craft.panelColor.toLowerCase()).toBe('#f5efe4');
    expect(craft.textColor.toLowerCase()).toBe('#264653');
    const tree = buildLayoutDocOverlayElement({
      layout: layout!,
      dims: { width: 1080, height: 1350 },
      headline: 'Deniz Mahsulleri',
      subtitle: 'Hafta sonu',
      cta: 'Rezervasyon',
      brandName: 'Yula Bodrum',
      panelColor: craft.panelColor,
      textColor: craft.textColor,
      accentColor: craft.accentColor,
      craft: craft.craft,
      headingFontFamily: 'Inter',
      bodyFontFamily: 'Inter',
    });
    const children = (tree.props as { children: unknown[] }).children;
    expect(children.length).toBeGreaterThanOrEqual(3);
    const styles = children.map((c) => (c as { props: { style: { position?: string } } }).props.style);
    expect(styles.every((s) => s.position === 'absolute')).toBe(true);
  });

  it('uses night scrim craft for neon_night_promo (DJ / event)', () => {
    const craft = resolveLayoutDocCraftColors('neon_night_promo', {
      primary: '#212529',
      accent: '#ffc107',
    });
    expect(craft.craft).toBe('neon_accent');
    expect(craft.textColor.toLowerCase()).toBe('#ffffff');
    expect(craft.accentColor.toLowerCase()).toBe('#ffc107');
  });
});

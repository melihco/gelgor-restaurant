import { describe, expect, it } from 'vitest';
import {
  fitCopyIntoLayoutBoxes,
  panelFillForRole,
  planDesignSpecShell,
  resolveShellLayout,
  textColorForPanel,
} from '../design-spec-shell-compose';
import { seedDesignSpecLayout } from '../design-spec-layout';

describe('design-spec-shell-compose', () => {
  it('shop product hero keeps the motto inside the headline box', () => {
    const layout = resolveShellLayout({
      archetypeId: 'product_hero_card',
      format: 'post',
    });
    expect(layout).toBeTruthy();
    const plan = planDesignSpecShell({
      layout: layout!,
      headline: 'Yağın en sakin hali',
      subtitle: 'Natürel sızma',
      brandColors: { primary: '#3d2b1f', accent: '#6b8f3e' },
    });
    expect(plan.fit.fittedHeadline.toLocaleLowerCase('tr-TR')).toMatch(/yağın/);
    expect(plan.fit.fittedHeadline.toLocaleLowerCase('tr-TR')).toMatch(/sakin/);
    expect(plan.texts.some((t) => t.role === 'headline' && t.lines.join(' ').includes('Yağın'))).toBe(true);
    expect(plan.photo.width).toBe(layout!.canvas.width);
    expect(plan.photo.height).toBe(layout!.canvas.height);
    const headlineBox = plan.texts.find((t) => t.role === 'headline')!.box;
    expect(headlineBox.y + headlineBox.height).toBeLessThan(layout!.canvas.height * 0.28);
  });

  it('beach cinematic place line stays in the measured slot, not a furniture list', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'cinematic_full_bleed',
      format: 'story',
      pinMode: 'hard',
    });
    expect(layout).toBeTruthy();
    const { fit } = fitCopyIntoLayoutBoxes(layout!, {
      headline: 'Deniz duruyor. Kenarda kalın.',
      subtitle: null,
    });
    expect(fit.fittedHeadline).toMatch(/Deniz/);
    expect(fit.fittedHeadline.toLocaleLowerCase('tr-TR')).not.toMatch(/şezlong|şemsiye/);
    const plan = planDesignSpecShell({
      layout: layout!,
      headline: 'Deniz duruyor. Kenarda kalın.',
      brandColors: { primary: '#0b4f6c', accent: '#e8c07a' },
    });
    expect(plan.canvas.width).toBe(1080);
    expect(plan.canvas.height).toBe(1920);
    expect(plan.texts[0]!.box.width).toBeGreaterThan(200);
  });

  it('scrim text is cream; product color block uses readable ink or cream', () => {
    expect(textColorForPanel('scrim', { primary: '#3d2b1f', accent: '#6b8f3e' })).toBe('#F4EFE6');
    expect(panelFillForRole('scrim', { primary: '#0b4f6c', accent: '#e8c07a' })).toMatch(/rgba\(12,10,8/);
    expect(textColorForPanel('color_block', { primary: '#3d2b1f', accent: '#6b8f3e' })).toMatch(/^#/);
  });
});

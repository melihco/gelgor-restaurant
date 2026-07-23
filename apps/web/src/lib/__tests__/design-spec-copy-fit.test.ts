import { describe, expect, it } from 'vitest';
import {
  assertCopyFitsLayoutForPin,
  buildTypeFitPromptBlock,
  fitMissionCopyToLayout,
  logoSlotToFalPosition,
} from '@/lib/design-spec-copy-fit';
import { seedDesignSpecLayout } from '@/lib/design-spec-layout';
import { buildTemplateReplicaPrompt } from '@/lib/brand-design-template-production';

describe('fitMissionCopyToLayout — fit-before-paint', () => {
  it('fits short hospitality headline into split panel (beach_club-style feed)', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'split_feature_panel',
      format: 'post',
      pinMode: 'hard',
    })!;
    const fit = fitMissionCopyToLayout(layout, {
      headline: 'Gün batımı',
      subtitle: 'Rezervasyon açık',
    });
    expect(fit.ok).toBe(true);
    expect(fit.renderPath).toBe('deterministic_compose');
    expect(fit.headline?.fit.lines.length).toBeGreaterThan(0);
    expect(fit.fittedHeadline).toMatch(/Gün batımı/i);
    expect(fit.subtitle?.ok).toBe(true);
  });

  it('fits product highlight into product_hero_card (local_products_shop-style)', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'product_hero_card',
      format: 'post',
      pinMode: 'soft',
    })!;
    const fit = fitMissionCopyToLayout(layout, {
      headline: 'Erken hasat zeytinyağı',
      subtitle: 'Sınırlı stok',
    });
    expect(fit.ok).toBe(true);
    expect(fit.headline?.zonePx.width).toBeGreaterThan(200);
    expect(fit.fittedHeadline.length).toBeGreaterThan(0);
  });

  it('hard pin withholds when headline cannot fit cinematic corner slot', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'cinematic_full_bleed',
      format: 'post',
      pinMode: 'hard',
    })!;
    const absurd =
      'Bu çok uzun bir kampanya başlığıdır ve köşe tipografi alanına sığması imkânsızdır kesinlikle aşırı uzun kelimelerle doludur';
    const fit = fitMissionCopyToLayout(layout, { headline: absurd });
    const gate = assertCopyFitsLayoutForPin({
      fit,
      pinMode: 'hard',
      matchQuality: 'hard',
    });
    expect(fit.ok).toBe(false);
    expect(fit.failReason).toBe('headline_overflow');
    expect(gate.allow).toBe(false);
    expect(gate.reason).toMatch(/copy_fit/);
  });

  it('soft pin allows best-effort fit even when tight', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'cinematic_full_bleed',
      format: 'story',
      pinMode: 'soft',
    })!;
    const fit = fitMissionCopyToLayout(layout, {
      headline: 'Datça sahilinde altın saat manzarası ve özel menü',
    });
    const gate = assertCopyFitsLayoutForPin({
      fit,
      pinMode: 'soft',
      matchQuality: 'soft',
    });
    expect(gate.allow).toBe(true);
    expect(fit.fittedHeadline.length).toBeGreaterThan(0);
  });

  it('legacy rows without layout are not withheld on hard pin', () => {
    const fit = fitMissionCopyToLayout(null, { headline: 'Menü' });
    expect(fit.failReason).toBe('missing_layout');
    const gate = assertCopyFitsLayoutForPin({
      fit,
      matchQuality: 'hard',
    });
    expect(gate.allow).toBe(true);
  });
});

describe('TYPE FIT prompt + logoSlot', () => {
  it('embeds measured metrics into replica prompt', () => {
    const layout = seedDesignSpecLayout({
      archetypeId: 'split_feature_panel',
      format: 'post',
    })!;
    const fit = fitMissionCopyToLayout(layout, {
      headline: 'Alfresco',
      subtitle: 'Bu akşam',
    });
    const block = buildTypeFitPromptBlock(fit);
    expect(block).toContain('TYPE FIT');
    expect(block).toContain('deterministic_compose');
    expect(block).toMatch(/font≈\d+px/);

    const prompt = buildTemplateReplicaPrompt(
      {
        prompt: 'Design a split panel template for Demo brand.',
        sampleHeadline: 'Sample',
        sampleSubtitle: 'Sub',
        forbiddenTexts: ['Sample'],
        format: 'post',
        templateName: 'Split Feature',
        canvaArchetypeId: 'split_feature_panel',
        layoutPattern: layout.layoutPattern,
        layout,
      },
      { headline: 'Alfresco', subtitle: 'Bu akşam' },
      { typeFit: fit, channel: 'feed_post' },
    );
    expect(prompt).toContain('TYPE FIT');
    expect(prompt).toContain('Alfresco');
    expect(prompt).toContain('LAYOUT DOCUMENT');
  });

  it('maps logoSlot centroids to sharp corners', () => {
    expect(logoSlotToFalPosition({ x: 0.72, y: 0.88, width: 0.18, height: 0.06 })).toBe(
      'bottom_right',
    );
    expect(logoSlotToFalPosition({ x: 0.06, y: 0.08, width: 0.18, height: 0.06 })).toBe(
      'top_left',
    );
    expect(logoSlotToFalPosition({ x: 0.06, y: 0.88, width: 0.2, height: 0.06 })).toBe(
      'bottom_left',
    );
  });
});

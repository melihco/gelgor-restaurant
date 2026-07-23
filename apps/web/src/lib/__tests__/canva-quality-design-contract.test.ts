import { describe, expect, it } from 'vitest';
import {
  allowDesignedPostIdeogramFallback,
  buildCanvaQualityDesignContract,
  buildCanvaTypeCraftLock,
  layoutDemandsOpaquePaint,
} from '@/lib/canva-quality-design-contract';

describe('buildCanvaQualityDesignContract', () => {
  it('includes photo lock, type fit, and quality floor markers', () => {
    const contract = buildCanvaQualityDesignContract({
      channel: 'feed_post',
      hasTemplateLayoutRef: true,
      brandPrimary: '#E85A3C',
      brandAccent: '#1B3A5C',
    });
    expect(contract).toContain('CANVA QUALITY FLOOR');
    expect(contract).toContain('PHOTO LOCK');
    expect(contract).toContain('TYPE FIT');
    expect(contract).toContain('LAYOUT LAW');
    expect(contract).toContain('#E85A3C');
  });

  it('photo-led balanced feed never prefers top color panel ~30–38%', () => {
    const beach = buildCanvaQualityDesignContract({
      channel: 'feed_post',
      intensityLevel: 'balanced',
      pinMode: 'unlocked',
    });
    const retail = buildCanvaQualityDesignContract({
      channel: 'feed_post',
      intensityLevel: 'balanced',
      pinMode: 'soft',
    });
    for (const contract of [beach, retail]) {
      expect(contract).not.toContain('top color panel ~30–38%');
      expect(contract).toMatch(/scrim|asymmetric|thin brand rules/i);
      expect(contract).toContain('≥25%');
    }
  });

  it('hard pin with color_block authorizes solid geometry language', () => {
    const contract = buildCanvaQualityDesignContract({
      channel: 'feed_post',
      hasTemplateLayoutRef: true,
      pinMode: 'hard',
      layoutPanelRoles: ['color_block'],
      intensityLevel: 'designed',
    });
    expect(layoutDemandsOpaquePaint({
      pinMode: 'hard',
      layoutPanelRoles: ['color_block'],
    })).toBe(true);
    expect(contract).toContain('HARD PIN');
    expect(contract).toMatch(/color_block|color-block/i);
  });

  it('compact form stays short but keeps the floor keywords', () => {
    const contract = buildCanvaQualityDesignContract({
      channel: 'feed_post',
      compact: true,
      intensityLevel: 'balanced',
    });
    expect(contract.length).toBeLessThan(420);
    expect(contract).toContain('PHOTO LOCK');
    expect(contract).toContain('TYPE CRAFT');
    expect(contract).toContain('TYPE FIT');
    expect(contract).toContain('PASS BAR');
    expect(contract).not.toContain('panel/plate/wave/split');
    expect(contract).toMatch(/photo-led|scrim|FORBIDDEN opaque/i);
  });

  it('type craft lock specifies face/size/placement for beach + retail intensities', () => {
    const beach = buildCanvaTypeCraftLock({
      intensityLevel: 'balanced',
      fontFace: 'boutique condensed coastal display',
      hasSubtitle: true,
    });
    const retail = buildCanvaTypeCraftLock({
      intensityLevel: 'designed',
      fontFace: 'clean geometric product sans',
      hasSubtitle: false,
    });
    for (const lock of [beach, retail]) {
      expect(lock).toContain('CANVA TYPE CRAFT');
      expect(lock).toContain('FACE');
      expect(lock).toContain('SIZE');
      expect(lock).toContain('PLACEMENT');
      expect(lock).toContain('CRAFT MINIMUM');
      expect(lock).toContain('asymmetric');
      expect(lock).toMatch(/Times|Georgia|empty rectangular border|Bare white serif/);
    }
    expect(beach).toContain('16–24%');
    expect(retail).toContain('18–28%');
  });

  it('mentions 9:16 safe zones for reel/story', () => {
    const contract = buildCanvaQualityDesignContract({ channel: 'reel' });
    expect(contract).toContain('9:16');
    expect(contract).toContain('12%');
  });
});

describe('allowDesignedPostIdeogramFallback', () => {
  it('blocks Ideogram for hard/soft template locks and grounded gallery', () => {
    expect(allowDesignedPostIdeogramFallback({
      hasRenderableTemplateMatch: true,
      replicaLockRequired: false,
    })).toBe(false);
    expect(allowDesignedPostIdeogramFallback({
      hasRenderableTemplateMatch: false,
      replicaLockRequired: true,
    })).toBe(false);
    expect(allowDesignedPostIdeogramFallback({
      hasRenderableTemplateMatch: false,
      replicaLockRequired: false,
      requireGroundedGallery: true,
    })).toBe(false);
  });

  it('allows Ideogram only for unlocked non-grounded slots', () => {
    expect(allowDesignedPostIdeogramFallback({
      hasRenderableTemplateMatch: false,
      replicaLockRequired: false,
      requireGroundedGallery: false,
    })).toBe(true);
  });
});

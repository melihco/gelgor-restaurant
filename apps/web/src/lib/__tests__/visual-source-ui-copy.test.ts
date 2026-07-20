import { describe, expect, it } from 'vitest';
import { resolveVisualSourceMode } from '@/lib/ai-visual-production-standard';
import {
  buildVisualSourceModeFromFlags,
  buildVisualSourceModePatch,
  getVisualSourceModeCopy,
  getVisualSourceModeHint,
  resolveVisualSourceUiFamily,
} from '@/lib/visual-source-ui-copy';

describe('visual-source-ui-copy', () => {
  it('picks product copy for local_products_shop', () => {
    expect(resolveVisualSourceUiFamily('local_products_shop')).toBe('product');
    const titles = getVisualSourceModeCopy('local_products_shop').map((m) => m.title);
    expect(titles[0]).toMatch(/Ürün/);
    expect(titles[1]).toMatch(/sahne/i);
  });

  it('picks venue copy for beach_club', () => {
    expect(resolveVisualSourceUiFamily('beach_club')).toBe('venue');
    const titles = getVisualSourceModeCopy('beach_club').map((m) => m.title);
    expect(titles[0]).toMatch(/Galeri/);
  });

  it('expands mode patches to concrete flags', () => {
    expect(buildVisualSourceModePatch('gallery_only')).toMatchObject({
      ai_photo_enhance: false,
      ai_caption_driven_visual: false,
    });
    expect(buildVisualSourceModePatch('gallery_enhanced')).toMatchObject({
      ai_photo_enhance: true,
      ai_caption_driven_visual: false,
    });
    expect(buildVisualSourceModePatch('ai_generated')).toMatchObject({
      ai_photo_enhance: true,
      ai_caption_driven_visual: true,
    });
  });

  it('keeps radio in sync when advanced enhance toggles', () => {
    expect(buildVisualSourceModeFromFlags({ aiPhotoEnhance: false }).visual_source_mode).toBe('gallery_only');
    expect(buildVisualSourceModeFromFlags({
      aiPhotoEnhance: true,
      aiCaptionDrivenVisual: false,
    }).visual_source_mode).toBe('gallery_enhanced');
    expect(buildVisualSourceModeFromFlags({
      aiPhotoEnhance: true,
      aiCaptionDrivenVisual: true,
    }).visual_source_mode).toBe('ai_generated');
  });

  it('resolveVisualSourceMode prefers production flags over stale mode label', () => {
    expect(resolveVisualSourceMode({
      visual_source_mode: 'gallery_enhanced',
      ai_photo_enhance: false,
      ai_caption_driven_visual: false,
    })).toBe('gallery_only');
    expect(resolveVisualSourceMode({
      visual_source_mode: 'gallery_only',
      ai_photo_enhance: true,
      ai_caption_driven_visual: true,
    })).toBe('ai_generated');
  });

  it('shows level + subject hint for gallery_enhanced', () => {
    const hint = getVisualSourceModeHint('gallery_enhanced', {
      sector: 'local_products_shop',
      level: 'full',
      subject: 'product_hero',
    });
    expect(hint).toMatch(/Tam/);
    expect(hint).toMatch(/Ürün hero/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ensureBrandTemplateLibrary,
  patchLibrarySlot,
} from '@/lib/brand-template-library';
import { resolveLibrarySlotRenderBinding } from '@/lib/remotion-template-binding';

const TENANT = 'binding-tenant-1111';
const SECTOR = 'restaurant';

function buildLibrary() {
  const base = ensureBrandTemplateLibrary(null, {
    sector: SECTOR,
    tenantId: TENANT,
  });
  return patchLibrarySlot(
    patchLibrarySlot(base, 'event_story', {
      storyTemplateId: 'remotion_campaign_hero_01',
      enabled: true,
    }),
    'campaign_post',
    {
      posterTemplateId: 'poster_event_masthead_01',
      enabled: true,
    },
  );
}

describe('resolveLibrarySlotRenderBinding', () => {
  it('forces the saved story template for a matching story slot key', () => {
    const library = buildLibrary();
    const binding = resolveLibrarySlotRenderBinding({
      library,
      librarySlotKey: 'event_story',
      requestedFormat: 'story',
      incomingTemplateId: 'remotion_editorial_bottom_01',
    });

    expect(binding.slot?.key).toBe('event_story');
    expect(binding.effectiveTemplateId).toBe('remotion_campaign_hero_01');
    expect(binding.enforceTemplate).toBe(true);
  });

  it('forces the saved poster template for a matching post slot key', () => {
    const library = buildLibrary();
    const binding = resolveLibrarySlotRenderBinding({
      library,
      librarySlotKey: 'campaign_post',
      requestedFormat: 'post',
      incomingTemplateId: 'poster_lineup_tiered_01',
    });

    expect(binding.slot?.key).toBe('campaign_post');
    expect(binding.effectiveTemplateId).toBe('poster_event_masthead_01');
    expect(binding.effectivePosterTemplateId).toBe('poster_event_masthead_01');
    expect(binding.enforceTemplate).toBe(true);
  });

  it('does not bind a story slot key to a post render', () => {
    const library = buildLibrary();
    const binding = resolveLibrarySlotRenderBinding({
      library,
      librarySlotKey: 'event_story',
      requestedFormat: 'post',
      incomingTemplateId: 'poster_lineup_tiered_01',
    });

    expect(binding.slot).toBeUndefined();
    expect(binding.effectiveTemplateId).toBe('poster_lineup_tiered_01');
    expect(binding.enforceTemplate).toBe(false);
  });

  it('keeps the incoming template when no slot key is provided', () => {
    const library = buildLibrary();
    const binding = resolveLibrarySlotRenderBinding({
      library,
      requestedFormat: 'story',
      incomingTemplateId: 'remotion_editorial_bottom_01',
    });

    expect(binding.slot).toBeUndefined();
    expect(binding.effectiveTemplateId).toBe('remotion_editorial_bottom_01');
    expect(binding.enforceTemplate).toBe(false);
  });
});

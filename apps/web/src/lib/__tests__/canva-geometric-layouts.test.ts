import { describe, expect, it } from 'vitest';
import {
  GEOMETRIC_SHELL_CATALOG,
  resolveGeometricCanvasColor,
  resolveGeometricShell,
} from '../canva-geometric-layouts';

describe('canva-geometric-layouts', () => {
  it('catalog has six hospitality shells', () => {
    expect(GEOMETRIC_SHELL_CATALOG.length).toBeGreaterThanOrEqual(6);
    const ids = GEOMETRIC_SHELL_CATALOG.map((s) => s.id);
    expect(ids).toContain('arch_photo_stack');
    expect(ids).toContain('badge_overlap_offer');
    expect(ids).toContain('inset_frame_on_color');
  });

  it('maps slot keys to distinct shells', () => {
    expect(resolveGeometricShell({
      catalogSlotKey: 'beach_club_daybed_offer_post',
      headline: 'Daybed',
      format: 'post',
    }).id).toBe('badge_overlap_offer');

    expect(resolveGeometricShell({
      catalogSlotKey: 'beach_club_cocktail_menu_post',
      headline: 'Kokteyl',
      format: 'post',
    }).id).toBe('circle_portrait_lockup');

    expect(resolveGeometricShell({
      catalogSlotKey: 'beach_club_dj_night_teaser_post',
      announcementType: 'event_announcement',
      format: 'story',
    }).id).toBe('inset_frame_on_color');

    expect(resolveGeometricShell({
      catalogSlotKey: 'beach_club_golden_hour_post',
      headline: 'Gün Batımı',
      format: 'post',
    }).id).toBe('arch_photo_stack');
  });

  it('resolves canvas colors from brand kit roles', () => {
    const shell = resolveGeometricShell({ catalogSlotKey: 'x', slotLook: 'nightlife_event' });
    const colors = resolveGeometricCanvasColor(shell, {
      primary: '#212529',
      accent: '#ffc107',
    });
    expect(colors.canvas).toBeTruthy();
    expect(colors.accent).toBeTruthy();
  });
});

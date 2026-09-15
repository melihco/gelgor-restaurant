import { describe, expect, it } from 'vitest';
import {
  buildDesignProductionModePatch,
  isFreeformDesignProduction,
  resolveDesignProductionMode,
  resolveDesignProductionModeForRun,
} from '../design-production-mode';
import { catalogTemplateWithholdReason } from '../brand-design-template-production';

describe('design production mode (Şablon ile üret)', () => {
  it('defaults to the template shell for every tenant/sector', () => {
    expect(resolveDesignProductionMode(null)).toBe('template_shell');
    expect(resolveDesignProductionMode({ visual_source_mode: 'gallery_only' })).toBe('template_shell');
    expect(resolveDesignProductionMode({ use_template_shell: true })).toBe('template_shell');
  });

  it('reads the mode string or the boolean macro (snake or camel)', () => {
    expect(resolveDesignProductionMode({ design_production_mode: 'freeform_brand' })).toBe('freeform_brand');
    expect(resolveDesignProductionMode({ designProductionMode: 'freeform_brand' })).toBe('freeform_brand');
    expect(resolveDesignProductionMode({ use_template_shell: false })).toBe('freeform_brand');
    expect(resolveDesignProductionMode({ useTemplateShell: false })).toBe('freeform_brand');
    // explicit mode wins over the boolean
    expect(resolveDesignProductionMode({ design_production_mode: 'template_shell', use_template_shell: false })).toBe('template_shell');
    expect(isFreeformDesignProduction({ use_template_shell: false })).toBe(true);
  });

  it('"+" (ad-hoc brief) always paints freeform, regardless of the brand toggle or sector', () => {
    const beachClubShell = { design_production_mode: 'template_shell', business_type: 'beach_club' };
    const shopShell = { use_template_shell: true, business_type: 'local_products_shop' };
    expect(resolveDesignProductionModeForRun({ brandTheme: beachClubShell, adHocBrief: true })).toBe('freeform_brand');
    expect(resolveDesignProductionModeForRun({ brandTheme: shopShell, adHocBrief: true })).toBe('freeform_brand');
    expect(resolveDesignProductionModeForRun({ brandTheme: null, adHocBrief: true })).toBe('freeform_brand');
  });

  it('weekly feed (non ad-hoc) keeps honouring the Brand Hub toggle', () => {
    expect(resolveDesignProductionModeForRun({ brandTheme: { business_type: 'beach_club' }, adHocBrief: false })).toBe('template_shell');
    expect(resolveDesignProductionModeForRun({ brandTheme: { use_template_shell: false, business_type: 'local_products_shop' } })).toBe('freeform_brand');
  });

  it('toggle patch keeps both keys in sync', () => {
    expect(buildDesignProductionModePatch(false)).toEqual({ design_production_mode: 'freeform_brand', use_template_shell: false });
    expect(buildDesignProductionModePatch(true)).toEqual({ design_production_mode: 'template_shell', use_template_shell: true });
  });

  it('freeform binding is never withheld for a missing library template', () => {
    expect(catalogTemplateWithholdReason('beach_club_sunset_post', null)).toMatch(/library_template_required/);
    expect(catalogTemplateWithholdReason('beach_club_sunset_post', null, { freeform: true })).toBeNull();
    expect(catalogTemplateWithholdReason('local_products_shop_new_arrival_story', null, { freeform: false })).toMatch(/library_template_required/);
  });
});

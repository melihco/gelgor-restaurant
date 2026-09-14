import { describe, expect, it } from 'vitest';
import {
  buildDesignProductionModePatch,
  isFreeformDesignProduction,
  resolveDesignProductionMode,
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

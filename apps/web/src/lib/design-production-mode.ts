/**
 * Brand Hub "Şablon ile üret" switch — how a slot's design card is painted.
 *
 * - `template_shell` (default, current behaviour): the slot binds to a saved
 *   brand template and the paint is a replica of that shell (layout, type
 *   zones, colours) with the mission photo + contracted copy swapped in.
 *   Catalog-pinned slots withhold when no renderable shell exists.
 * - `freeform_brand`: no shell lock. The painter designs each card directly
 *   from the brand's visual DNA / vibe / palette / typography on the real
 *   mission photo, like an agency art director. Nothing withholds for a
 *   missing template; the grafiker verdict is the only design gate.
 *
 * Read from `brand_theme.design_production_mode`; the boolean
 * `use_template_shell` is accepted as a write macro (false → freeform).
 */
import { normalizeBrandThemeRecord } from '@/lib/brand-theme-normalize';

export type DesignProductionMode = 'template_shell' | 'freeform_brand';

export const DEFAULT_DESIGN_PRODUCTION_MODE: DesignProductionMode = 'template_shell';

export function resolveDesignProductionMode(
  brandTheme: Record<string, unknown> | null | undefined,
): DesignProductionMode {
  const theme = normalizeBrandThemeRecord(brandTheme);
  const raw = String(theme.design_production_mode ?? theme.designProductionMode ?? '').trim().toLowerCase();
  if (raw === 'freeform_brand' || raw === 'template_shell') return raw;
  const useShell = theme.use_template_shell ?? theme.useTemplateShell;
  if (useShell === false) return 'freeform_brand';
  return DEFAULT_DESIGN_PRODUCTION_MODE;
}

/**
 * Mode a single production run actually paints with.
 *
 * The weekly feed honours the Brand Hub toggle. The "+" (New Brief / ad-hoc)
 * request is the user's own idea for their brand — it is never locked to a
 * saved template shell, so it always paints freeform from brand DNA. This is a
 * slot-policy decision (ad-hoc vs. calendar), not a tenant or sector branch.
 */
export function resolveDesignProductionModeForRun(input: {
  brandTheme: Record<string, unknown> | null | undefined;
  adHocBrief?: boolean;
}): DesignProductionMode {
  if (input.adHocBrief) return 'freeform_brand';
  return resolveDesignProductionMode(input.brandTheme);
}

export function isFreeformDesignProduction(
  brandTheme: Record<string, unknown> | null | undefined,
): boolean {
  return resolveDesignProductionMode(brandTheme) === 'freeform_brand';
}

/** Theme patch for the Brand Hub toggle. */
export function buildDesignProductionModePatch(useTemplateShell: boolean): Record<string, unknown> {
  return {
    design_production_mode: useTemplateShell ? 'template_shell' : 'freeform_brand',
    use_template_shell: useTemplateShell,
  };
}

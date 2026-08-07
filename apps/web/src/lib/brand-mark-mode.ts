/**
 * Brand mark XOR — on designed canvases use EITHER the official logo asset
 * OR a typed brand wordmark, never both.
 *
 * Intensity / layout stay separate; this only gates mark presentation.
 */

export type BrandMarkMode = 'official_logo' | 'text_wordmark' | 'none';

export type BrandLogoTreatment = 'watermark' | 'badge' | 'inline' | 'none';

export interface ResolveBrandMarkModeInput {
  logoUrl?: string | null;
  brandName?: string | null;
  /** From fal_template_production.logo_treatment / typography. */
  logoTreatment?: BrandLogoTreatment | string | null;
  /**
   * Preset/slot wants a visible brand mark. When false and treatment is soft,
   * may return none even if a name exists.
   */
  wantBrandMark?: boolean;
}

export interface ResolvedBrandMarkMode {
  mode: BrandMarkMode;
  /** Pass to generators / composite only when mode === official_logo. */
  logoUrl?: string;
  /** True → allow BRAND MARK wordmark in on-canvas text contract. */
  typeWordmark: boolean;
  /** Prompt line enforcing XOR. */
  xorDirective: string;
}

function normalizeTreatment(raw?: string | null): BrandLogoTreatment {
  if (raw === 'badge' || raw === 'inline' || raw === 'none' || raw === 'watermark') {
    return raw;
  }
  return 'watermark';
}

/**
 * Resolve whether this canvas should composite the logo or type the brand name.
 * Official logo asset always wins over typed wordmark when present (unless treatment is none).
 */
export function resolveBrandMarkMode(input: ResolveBrandMarkModeInput): ResolvedBrandMarkMode {
  const logo = input.logoUrl?.trim() || '';
  const name = input.brandName?.trim() || '';
  const treatment = normalizeTreatment(input.logoTreatment);
  const wantMark = input.wantBrandMark !== false;

  // Explicit opt-out (Brand Hub includeLogo=false, or logo_treatment=none).
  if (!wantMark || treatment === 'none') {
    return {
      mode: 'none',
      typeWordmark: false,
      xorDirective:
        'BRAND MARK XOR: No brand mark on this canvas — do not type the brand name and do not invent a logo.',
    };
  }

  if (logo) {
    return {
      mode: 'official_logo',
      logoUrl: logo,
      typeWordmark: false,
      xorDirective:
        'BRAND MARK XOR (mandatory): Official logo is composited after generation. '
        + 'Leave the reserved logo zone empty. FORBIDDEN: typing, spelling, abbreviating, '
        + 'or painting the brand name / wordmark / monogram anywhere on canvas — logo OR name, never both.',
    };
  }

  if (name && wantMark) {
    return {
      mode: 'text_wordmark',
      typeWordmark: true,
      xorDirective:
        `BRAND MARK XOR (mandatory): Type the brand wordmark "${name}" once as a small corner mark only. `
        + 'FORBIDDEN: inventing a logo icon, emblem, monogram, or second brand mark — logo OR name, never both.',
    };
  }

  return {
    mode: 'none',
    typeWordmark: false,
    xorDirective:
      'BRAND MARK XOR: No brand mark on this canvas — do not type a brand name and do not invent a logo.',
  };
}

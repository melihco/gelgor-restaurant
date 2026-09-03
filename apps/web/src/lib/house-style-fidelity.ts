/**
 * House-style fidelity — parameter match vs Grafiker beauty score.
 *
 * Soft signal only. Never raises GRAFIKER_PASS_THRESHOLD and never hard-blocks
 * publish. Multi-tenant: expected tokens from constitution / theme, not brand names.
 */

import type { BrandDesignConstitution } from '@/lib/brand-design-constitution';
import type { TemplateFillRecipe } from '@/lib/template-fill-recipe';

export const HOUSE_FIDELITY_WARN_BELOW = 7;

export type HouseFidelityCheckId =
  | 'heading_font'
  | 'color_roles'
  | 'compose_mode'
  | 'logo_treatment'
  | 'anti_patterns'
  | 'preferred_archetype';

export type HouseIdentityField =
  | 'heading_font'
  | 'body_font'
  | 'font_source'
  | 'primary'
  | 'accent'
  | 'vibe'
  | 'logo_treatment';

export interface HouseIdentityTokens {
  headingFont?: string;
  bodyFont?: string;
  fontSource?: string;
  primary?: string;
  accent?: string;
  vibe?: string;
  logoTreatment?: string;
}

export interface HouseFidelityExpected extends HouseIdentityTokens {
  composeMode?: string;
  layoutPackId?: string;
  antiPatterns?: string[];
  preferredArchetypes?: string[];
}

export interface HouseFidelityObserved {
  headingFont?: string | null;
  bodyFont?: string | null;
  primary?: string | null;
  accent?: string | null;
  composeMode?: string | null;
  layoutPackId?: string | null;
  canvaArchetypeId?: string | null;
  prompt?: string | null;
  includeLogo?: boolean | null;
}

export interface HouseFidelityViolation {
  id: HouseFidelityCheckId;
  detail: string;
}

export interface HouseFidelityReport {
  score: number;
  applicable: number;
  passed: number;
  violations: HouseFidelityViolation[];
  warn: boolean;
}

function normFont(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normHex(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  const m = raw.match(/^#([0-9a-fA-F]{3,8})$/);
  const captured = m?.[1];
  if (!captured) return '';
  let h = captured.toLowerCase();
  if (h.length === 3 || h.length === 4) {
    h = h.split('').map((c) => c + c).join('');
  }
  return `#${h.slice(0, 6)}`;
}

function fontsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

export function houseIdentityFingerprint(tokens: HouseIdentityTokens): string {
  return [
    normFont(tokens.headingFont),
    normFont(tokens.bodyFont),
    String(tokens.fontSource ?? '').trim().toLowerCase(),
    normHex(tokens.primary),
    normHex(tokens.accent),
    String(tokens.vibe ?? '').trim().toLowerCase(),
    String(tokens.logoTreatment ?? '').trim().toLowerCase(),
  ].join('|');
}

export function readHouseIdentityFromTheme(
  theme: Record<string, unknown> | null | undefined,
): HouseIdentityTokens {
  if (!theme) return {};
  const typo = (theme.typography ?? theme.Typography) as Record<string, unknown> | undefined;
  const palette = (theme.palette ?? {}) as Record<string, unknown>;
  const design = (theme.typography_design ?? theme.typographyDesign) as Record<string, unknown> | undefined;
  const fal = (theme.fal_template_production ?? theme.falTemplateProduction) as Record<string, unknown> | undefined;
  return {
    headingFont: String(typo?.heading_font ?? typo?.headingFont ?? '').trim() || undefined,
    bodyFont: String(typo?.body_font ?? typo?.bodyFont ?? '').trim() || undefined,
    fontSource: String(typo?.font_source ?? typo?.fontSource ?? '').trim() || undefined,
    primary: String(palette.primary ?? '').trim() || undefined,
    accent: String(palette.accent ?? '').trim() || undefined,
    vibe: String(design?.vibe ?? '').trim() || undefined,
    logoTreatment: String(
      fal?.logo_treatment ?? fal?.logoTreatment ?? design?.logo_treatment ?? design?.logoTreatment ?? '',
    ).trim() || undefined,
  };
}

/** Empty previous identity (first theme write) must not trigger library regen. */
export function isEmptyHouseIdentity(tokens: HouseIdentityTokens): boolean {
  return !houseIdentityFingerprint(tokens).replace(/\|/g, '');
}

export function identityShiftFields(
  previous: HouseIdentityTokens,
  next: HouseIdentityTokens,
): HouseIdentityField[] {
  if (isEmptyHouseIdentity(previous) || isEmptyHouseIdentity(next)) return [];
  return diffHouseIdentity(previous, next);
}

export function diffHouseIdentity(
  previous: HouseIdentityTokens,
  next: HouseIdentityTokens,
): HouseIdentityField[] {
  const prevFp = houseIdentityFingerprint(previous);
  const nextFp = houseIdentityFingerprint(next);
  if (prevFp === nextFp) return [];
  const changed: HouseIdentityField[] = [];
  const pairs: Array<[HouseIdentityField, string, string]> = [
    ['heading_font', normFont(previous.headingFont), normFont(next.headingFont)],
    ['body_font', normFont(previous.bodyFont), normFont(next.bodyFont)],
    ['font_source', String(previous.fontSource ?? '').toLowerCase(), String(next.fontSource ?? '').toLowerCase()],
    ['primary', normHex(previous.primary), normHex(next.primary)],
    ['accent', normHex(previous.accent), normHex(next.accent)],
    ['vibe', String(previous.vibe ?? '').toLowerCase(), String(next.vibe ?? '').toLowerCase()],
    ['logo_treatment', String(previous.logoTreatment ?? '').toLowerCase(), String(next.logoTreatment ?? '').toLowerCase()],
  ];
  for (const [field, a, b] of pairs) {
    if (a !== b && (a || b)) changed.push(field);
  }
  return changed;
}

export function expectedFromConstitution(
  constitution: BrandDesignConstitution,
  extra?: Pick<HouseFidelityExpected, 'logoTreatment' | 'vibe'>,
): HouseFidelityExpected {
  return {
    headingFont: constitution.headingFont,
    bodyFont: constitution.bodyFont,
    fontSource: constitution.fontSource,
    primary: constitution.primary,
    accent: constitution.accent,
    composeMode: constitution.composeMode,
    layoutPackId: constitution.layoutPackId,
    antiPatterns: constitution.antiPatterns,
    preferredArchetypes: constitution.preferredArchetypes,
    ...extra,
  };
}

export function observedFromRecipe(
  recipe: TemplateFillRecipe | null | undefined,
  extras?: { prompt?: string | null; includeLogo?: boolean | null; canvaArchetypeId?: string | null },
): HouseFidelityObserved {
  return {
    headingFont: recipe?.headingFont ?? null,
    bodyFont: recipe?.bodyFont ?? null,
    primary: recipe?.primary ?? null,
    accent: recipe?.accent ?? null,
    composeMode: recipe?.composeMode ?? null,
    layoutPackId: recipe?.layoutPackId ?? null,
    canvaArchetypeId: extras?.canvaArchetypeId ?? recipe?.canvaArchetypeId ?? null,
    prompt: extras?.prompt ?? null,
    includeLogo: extras?.includeLogo ?? null,
  };
}

export function isFillRecipeStale(
  recipe: TemplateFillRecipe | null | undefined,
  expected: HouseIdentityTokens,
): boolean {
  if (!recipe) return false;
  const changed = diffHouseIdentity({
    headingFont: recipe.headingFont,
    bodyFont: recipe.bodyFont,
    primary: recipe.primary,
    accent: recipe.accent,
    logoTreatment: undefined,
  }, expected);
  return changed.some((f) => f === 'heading_font' || f === 'primary' || f === 'accent');
}

export function scoreHouseStyleFidelity(input: {
  expected: HouseFidelityExpected;
  observed: HouseFidelityObserved;
}): HouseFidelityReport {
  const violations: HouseFidelityViolation[] = [];
  let applicable = 0;
  let passed = 0;
  const exp = input.expected;
  const obs = input.observed;
  const prompt = String(obs.prompt ?? '');

  const expHeading = normFont(exp.headingFont);
  const obsHeading = normFont(obs.headingFont);
  if (expHeading) {
    applicable += 1;
    const inPrompt = prompt && fontsMatch(normFont(prompt), expHeading);
    if (obsHeading && fontsMatch(obsHeading, expHeading)) passed += 1;
    else if (!obsHeading && inPrompt) passed += 1;
    else if (!obsHeading && !prompt) {
      applicable -= 1;
    } else {
      violations.push({
        id: 'heading_font',
        detail: `expected ${exp.headingFont}, observed ${obs.headingFont || '—'}`
          + (prompt && !inPrompt ? ', prompt does not lock the house font' : ''),
      });
    }
  }

  const expPrimary = normHex(exp.primary);
  const obsPrimary = normHex(obs.primary);
  if (expPrimary && obsPrimary) {
    applicable += 1;
    if (expPrimary === obsPrimary) passed += 1;
    else {
      violations.push({
        id: 'color_roles',
        detail: `expected primary ${expPrimary}, observed ${obsPrimary}`,
      });
    }
  }

  if (exp.composeMode && obs.composeMode) {
    applicable += 1;
    if (exp.composeMode === obs.composeMode) passed += 1;
    else {
      violations.push({
        id: 'compose_mode',
        detail: `expected ${exp.composeMode}, observed ${obs.composeMode}`,
      });
    }
  }

  const treatment = String(exp.logoTreatment ?? '').toLowerCase();
  if (treatment && obs.includeLogo != null) {
    applicable += 1;
    if (treatment === 'none' && obs.includeLogo) {
      violations.push({ id: 'logo_treatment', detail: 'house logo=none but canvas includes a mark' });
    } else if ((treatment === 'badge' || treatment === 'inline') && !obs.includeLogo) {
      violations.push({ id: 'logo_treatment', detail: `house logo=${treatment} but canvas omitted the mark` });
    } else {
      passed += 1;
    }
  }

  const antis = (exp.antiPatterns ?? []).map((s) => s.trim()).filter((s) => s.length >= 4);
  if (antis.length && prompt) {
    applicable += 1;
    const hit = antis.find((anti) => prompt.toLowerCase().includes(anti.toLowerCase()));
    if (hit) {
      violations.push({ id: 'anti_patterns', detail: `prompt repeats house anti-pattern "${hit}"` });
    } else {
      passed += 1;
    }
  }

  const preferred = (exp.preferredArchetypes ?? []).map((s) => s.trim()).filter(Boolean);
  const observedArch = String(obs.canvaArchetypeId ?? '').trim();
  if (preferred.length && observedArch) {
    applicable += 1;
    if (preferred.includes(observedArch)) passed += 1;
    else {
      violations.push({
        id: 'preferred_archetype',
        detail: `archetype ${observedArch} is outside house prefs (${preferred.join(', ')})`,
      });
    }
  }

  const score = applicable === 0
    ? 10
    : Math.max(0, Math.min(10, Math.round((passed / applicable) * 10)));
  return {
    score,
    applicable,
    passed,
    violations,
    warn: applicable >= 1 && score < HOUSE_FIDELITY_WARN_BELOW,
  };
}

export function houseFidelityArtifactMeta(report: HouseFidelityReport): Record<string, unknown> {
  return {
    house_fidelity_score: report.score,
    house_fidelity_warn: report.warn,
    house_fidelity_violations: report.violations.map((v) => v.id),
    house_fidelity_detail: report.violations.map((v) => v.detail).slice(0, 4),
  };
}

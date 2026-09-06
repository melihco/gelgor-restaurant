/**
 * Brand Design Constitution — typed house-style contract for template library.
 *
 * Compiles already-stored tenant data (theme, DNA, vibe, service profile,
 * discovery_outputs) into parameters the template engine can obey.
 * No tenant UUID / brand-name branches — sector + tenant data only.
 */

import type { DesignTemplatePreset, DesignTemplateType } from '@/lib/brand-design-template-presets';
import {
  resolveBrandLayoutLanguage,
  type BrandLayoutComposeMode,
  type BrandLayoutLanguagePackId,
} from '@/lib/brand-layout-language';
import { parseHouseMoodboardRefs, resolveHouseLayoutFamily } from '@/lib/house-layout-family';
import { readTenantPreferredCanvaArchetypes } from '@/lib/fal-design-brief';
import { isOnboardingFontConfirmed } from '@/lib/onboarding-brand-identity';
import { defaultFontsForSector } from '@/lib/premium-font-registry';
import { fitSlotPunchline } from '@/lib/slot-sample-copy';
import { readTypographyDesignConfig } from '@/lib/typography-design-policy';

export const BRAND_DESIGN_CONSTITUTION_VERSION = 1 as const;

export type ConstitutionFontSource = 'onboarding' | 'theme' | 'sector';

export interface BrandDesignConstitution {
  version: typeof BRAND_DESIGN_CONSTITUTION_VERSION;
  brandName: string;
  sector: string;
  location?: string;
  headingFont: string;
  bodyFont: string;
  fontSource: ConstitutionFontSource;
  primary: string;
  accent: string;
  composeMode: BrandLayoutComposeMode;
  layoutPackId: BrandLayoutLanguagePackId;
  preferredArchetypes: string[];
  /** 2–3 signature geometries the library rotates — ⊂ sector pool. */
  signatureArchetypes: string[];
  /** Existing onboarding/gallery refs (max 3) — not a new scrape. */
  moodboardRefs: string[];
  antiPatterns: string[];
  signatureOfferings: string[];
  templateNeeds: string[];
  /** Mapped design_template_type ids from template_needs. */
  neededTemplateTypes: DesignTemplateType[];
  assetRecommendations: string[];
  contentPillars: string[];
  nativeCtas: string[];
  typeEnergy: string;
  /** Five feeling tokens for the protected soul lock — not a HOUSE prose dump. */
  soulTokens: HouseSoulTokens;
}

/** Compact house feeling — materials / light / type / anti / offer. */
export type HouseSoulTokens = {
  materials: string;
  light: string;
  typeEnergy: string;
  anti: string;
  offer: string;
};

export interface CompileBrandDesignConstitutionInput {
  brandName: string;
  sector: string;
  location?: string | null;
  brandTheme?: Record<string, unknown> | null;
  visualDna?: string | null;
  visualDnaTone?: string | null;
  brandTone?: string | null;
  vibeProfile?: Record<string, unknown> | null;
  serviceProfile?: Record<string, unknown> | null;
  discoveryOutputs?: unknown;
  contentPillars?: string[] | null;
  defaultCtas?: string[] | null;
  antiPatterns?: string[] | null;
  tokens?: {
    headingFont?: string;
    bodyFont?: string;
    primary?: string;
    accent?: string;
  };
  /** brand_context.reference_image_urls — moodboard only, no unused-column fill. */
  referenceImageUrls?: unknown;
}

const DESIGN_TEMPLATE_TYPES = new Set<DesignTemplateType>([
  'campaign_announcement',
  'event_special',
  'menu_highlight',
  'venue_showcase',
  'seasonal_promo',
  'social_proof',
  'daily_story',
  'announcement_formal',
  'reel_cover',
  'brand_identity',
]);

const PRODUCT_COPY_TYPES = new Set<DesignTemplateType>([
  'menu_highlight',
  'seasonal_promo',
  'brand_identity',
]);

function uniqShort(items: Iterable<string>, maxItems: number, maxLen: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const s = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function readStringList(value: unknown, maxItems = 12, maxLen = 80): string[] {
  if (Array.isArray(value)) {
    return uniqShort(value.map((item) => String(item ?? '')), maxItems, maxLen);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return uniqShort(parsed.map((item) => String(item ?? '')), maxItems, maxLen);
      }
    } catch {
      return uniqShort(value.split(/[,\n]/), maxItems, maxLen);
    }
  }
  return [];
}

function readPaletteHex(theme: Record<string, unknown> | null | undefined, key: string): string {
  const palette = asRecord(theme?.palette) ?? theme ?? {};
  const raw = palette[key] ?? palette[key === 'primary' ? 'Primary' : 'Accent'];
  const s = String(raw ?? '').trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : '';
}

function readThemeFont(
  theme: Record<string, unknown> | null | undefined,
  kind: 'heading' | 'body',
): string {
  const typo = asRecord(theme?.typography) ?? asRecord(theme?.Typography) ?? {};
  if (kind === 'heading') {
    return String(
      typo.heading_font ?? typo.headingFont ?? typo.headline_font ?? typo.headlineFont ?? '',
    ).trim();
  }
  return String(typo.body_font ?? typo.bodyFont ?? '').trim();
}

function firstSentence(text: string, max = 80): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const cut = cleaned.split(/[.!?]/)[0] ?? cleaned;
  return cut.slice(0, max).trim();
}

export function parseDiscoveryOutputs(raw: unknown): {
  templateNeeds: string[];
  assetRecommendations: string[];
  missingQuestions: string[];
} {
  const rec = asRecord(raw) ?? {};
  return {
    templateNeeds: readStringList(
      rec.template_needs ?? rec.templateNeeds,
      16,
      64,
    ),
    assetRecommendations: readStringList(
      rec.asset_recommendations ?? rec.assetRecommendations,
      12,
      48,
    ),
    missingQuestions: readStringList(
      rec.missing_questions ?? rec.missingQuestions,
      8,
      120,
    ),
  };
}

export function extractSignatureOfferings(
  serviceProfile: Record<string, unknown> | null | undefined,
): string[] {
  if (!serviceProfile) return [];
  return readStringList(
    serviceProfile.signature_offerings ?? serviceProfile.signatureOfferings,
    8,
    48,
  );
}

/** Map analyze_brand template_needs slugs onto library design_template_type. */
export function mapTemplateNeedToType(need: string): DesignTemplateType | null {
  const n = String(need ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!n) return null;
  if (DESIGN_TEMPLATE_TYPES.has(n as DesignTemplateType)) return n as DesignTemplateType;

  if (/event|dj|lineup|concert|artist/.test(n)) return 'event_special';
  if (/offer|campaign|promo|discount|teklif/.test(n)) return 'campaign_announcement';
  if (/product|menu|dish|sku|highlight|food/.test(n)) return 'menu_highlight';
  if (/venue|atmosphere|ambiance|showcase/.test(n)) return 'venue_showcase';
  if (/season|mevsim/.test(n)) return 'seasonal_promo';
  if (/social_proof|review|testimonial|yorum/.test(n)) return 'social_proof';
  if (/reel/.test(n)) return 'reel_cover';
  if (/identity|branding|logo/.test(n)) return 'brand_identity';
  if (/announce|duyuru|hours/.test(n)) return 'announcement_formal';
  if (/story|daily|generic/.test(n)) return 'daily_story';
  return null;
}

export function mapTemplateNeedsToTypes(needs: string[]): DesignTemplateType[] {
  return uniqShort(
    needs.map(mapTemplateNeedToType).filter((t): t is DesignTemplateType => Boolean(t)),
    8,
    40,
  ) as DesignTemplateType[];
}

export function compileBrandDesignConstitution(
  input: CompileBrandDesignConstitutionInput,
): BrandDesignConstitution {
  const sector = String(input.sector ?? '').trim() || 'general';
  const theme = input.brandTheme ?? null;
  const sectorFonts = defaultFontsForSector(sector);
  const headingFromTheme = readThemeFont(theme, 'heading') || String(input.tokens?.headingFont ?? '').trim();
  const bodyFromTheme = readThemeFont(theme, 'body') || String(input.tokens?.bodyFont ?? '').trim();
  const fontSource: ConstitutionFontSource = isOnboardingFontConfirmed(theme)
    ? 'onboarding'
    : headingFromTheme
      ? 'theme'
      : 'sector';

  const discovery = parseDiscoveryOutputs(input.discoveryOutputs);
  const offerings = extractSignatureOfferings(input.serviceProfile);
  const vibeAnti = readStringList(
    asRecord(input.vibeProfile)?.anti_patterns
    ?? asRecord(input.vibeProfile)?.antiPatterns,
    6,
    64,
  );
  const antiPatterns = uniqShort(
    [...(input.antiPatterns ?? []), ...vibeAnti],
    8,
    72,
  );
  const layout = resolveBrandLayoutLanguage({
    sector,
    visualDna: input.visualDna,
    visualDnaTone: input.visualDnaTone,
    brandTone: input.brandTone,
    vibeProfile: input.vibeProfile,
    typographyVibe: readTypographyDesignConfig(theme)?.vibe ?? null,
  });
  const neededTemplateTypes = mapTemplateNeedsToTypes(discovery.templateNeeds);
  const typeEnergy = firstSentence(
    String(input.visualDnaTone || input.brandTone || input.visualDna || layout.id),
    72,
  );
  const signatureArchetypes = resolveHouseLayoutFamily({
    sector,
    layoutPackId: layout.id,
    tenantPreferred: readTenantPreferredCanvaArchetypes(theme),
  });
  const moodboardRefs = parseHouseMoodboardRefs(input.referenceImageUrls);

  return {
    version: BRAND_DESIGN_CONSTITUTION_VERSION,
    brandName: String(input.brandName ?? '').trim() || 'Brand',
    sector,
    ...(input.location ? { location: String(input.location).trim() } : {}),
    headingFont: headingFromTheme || sectorFonts.heading,
    bodyFont: bodyFromTheme || sectorFonts.body,
    fontSource,
    primary: String(input.tokens?.primary ?? '').trim()
      || readPaletteHex(theme, 'primary')
      || '#1a1a1a',
    accent: String(input.tokens?.accent ?? '').trim()
      || readPaletteHex(theme, 'accent')
      || '#c9a96e',
    composeMode: layout.composeMode,
    layoutPackId: layout.id,
    preferredArchetypes: signatureArchetypes,
    signatureArchetypes,
    moodboardRefs,
    antiPatterns,
    signatureOfferings: offerings,
    templateNeeds: discovery.templateNeeds,
    neededTemplateTypes,
    assetRecommendations: discovery.assetRecommendations,
    contentPillars: readStringList(input.contentPillars, 6, 48),
    nativeCtas: readStringList(input.defaultCtas, 4, 40),
    typeEnergy,
    soulTokens: compileHouseSoulTokens({
      visualDna: input.visualDna,
      visualDnaTone: input.visualDnaTone,
      typeEnergy,
      headingFont: headingFromTheme || sectorFonts.heading,
      antiPatterns,
      signatureOfferings: offerings,
      vibeProfile: input.vibeProfile,
    }),
  };
}

const HOUSE_LIGHT_RX =
  /\b(sun-?washed|golden(?:\s*hour)?|window\s*light|daylight|vitrin|güneş|ışık|candle(?:lit)?|neon|night\s*tungsten|soft\s*daylight|shop\s*window)\b/i;

function isUsableAesthetic(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length < 8) return false;
  const letters = t.toLowerCase().replace(/[^a-zğüşıöçà-ÿ]/gi, '');
  return new Set(letters).size >= 6;
}

function clipToken(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max).replace(/[|,;]+$/g, '').trim();
}

/** Derive five soul tokens from tenant DNA — never sector slogans, never brand-name ifs. */
export function compileHouseSoulTokens(input: {
  visualDna?: string | null;
  visualDnaTone?: string | null;
  typeEnergy?: string | null;
  headingFont?: string | null;
  antiPatterns?: string[];
  signatureOfferings?: string[];
  vibeProfile?: Record<string, unknown> | null;
}): HouseSoulTokens {
  const tone = String(input.visualDnaTone ?? '').replace(/\s+/g, ' ').trim();
  const dna = String(input.visualDna ?? '').replace(/\s+/g, ' ').trim();
  const vibe = asRecord(input.vibeProfile);
  const vibeLight = clipToken(String(vibe?.lighting ?? vibe?.light ?? vibe?.atmosphere ?? ''), 28);
  const blob = [tone, dna].filter((s) => isUsableAesthetic(s)).join(' · ');
  const lightFromBlob = blob.match(HOUSE_LIGHT_RX)?.[0] ?? '';
  const light = clipToken(vibeLight || lightFromBlob, 28);
  let materials = clipToken(tone || firstSentence(dna, 48), 48);
  if (light && materials) {
    materials = clipToken(materials.replace(new RegExp(light.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' '), 48);
  }
  if (!isUsableAesthetic(materials)) materials = '';
  const energy = clipToken(String(input.typeEnergy ?? ''), 40);
  const typeBits = [
    clipToken(String(input.headingFont ?? ''), 24),
    isUsableAesthetic(energy) ? energy : '',
  ].filter(Boolean);
  return {
    materials,
    light,
    typeEnergy: clipToken(typeBits.join(', '), 48),
    anti: uniqShort(input.antiPatterns ?? [], 2, 28).join(', '),
    offer: uniqShort(input.signatureOfferings ?? [], 1, 32).join(''),
  };
}

export function formatHouseSoulTokenLine(tokens: HouseSoulTokens | null | undefined): string {
  if (!tokens) return '';
  const parts = [
    tokens.materials ? `materials=${tokens.materials}` : '',
    tokens.light ? `light=${tokens.light}` : '',
    tokens.typeEnergy ? `type=${tokens.typeEnergy}` : '',
    tokens.anti ? `anti=${tokens.anti}` : '',
    tokens.offer ? `offer=${tokens.offer}` : '',
  ].filter(Boolean);
  if (!parts.length) return '';
  return `HOUSE TOKENS: ${parts.join('; ')}.`;
}

/** Compact typed house rules — not a DNA prose dump. */
export function formatConstitutionHouseRules(constitution: BrandDesignConstitution): string[] {
  const lines = [
    `HOUSE STYLE v${constitution.version}: ${constitution.brandName} · ${constitution.sector}`
      + (constitution.location ? ` · ${constitution.location}` : ''),
    `TYPE LOCK: heading=${constitution.headingFont} body=${constitution.bodyFont} source=${constitution.fontSource}. Obey this pair — do not fall back to generic Inter/Playfair unless source=sector.`,
    `COLOR ROLES: primary ${constitution.primary} for type/rules; accent ${constitution.accent} for one CTA or thin rule only.`,
    `COMPOSE: ${constitution.composeMode} via ${constitution.layoutPackId}.`,
  ];
  if (constitution.typeEnergy) {
    lines.push(`TYPE ENERGY: ${constitution.typeEnergy}.`);
  }
  if (constitution.signatureOfferings.length) {
    lines.push(`SIGNATURE OFFERINGS (must stay real, never invent SKUs): ${constitution.signatureOfferings.join(' · ')}.`);
  }
  if (constitution.antiPatterns.length) {
    lines.push(`HOUSE ANTI-PATTERNS: ${constitution.antiPatterns.join('; ')}.`);
  }
  if (constitution.neededTemplateTypes.length) {
    lines.push(`LIBRARY MIX PRIORITY: ${constitution.neededTemplateTypes.join(', ')}.`);
  }
  if (constitution.nativeCtas.length) {
    lines.push(`NATIVE CTA LANGUAGE: ${constitution.nativeCtas.join(' | ')}.`);
  }
  if (constitution.signatureArchetypes.length) {
    lines.push(
      `SIGNATURE FAMILY: ${constitution.signatureArchetypes.join(' · ')}. `
      + 'Rotate these 2–3 grids — same type rhythm, distinct crop. Stay inside this house; do not invent a new Canva pack.',
    );
  }
  if (constitution.moodboardRefs.length) {
    lines.push(
      `MOODBOARD: ${constitution.moodboardRefs.length} onboarding refs lock light, material, and crop rhythm. `
      + 'Obey their look — do not copy their subjects onto this slot.',
    );
  }
  return lines;
}

export function constitutionStamp(constitution: BrandDesignConstitution): Record<string, unknown> {
  return {
    constitution_version: constitution.version,
    house_style: {
      headingFont: constitution.headingFont,
      bodyFont: constitution.bodyFont,
      fontSource: constitution.fontSource,
      primary: constitution.primary,
      accent: constitution.accent,
      composeMode: constitution.composeMode,
      layoutPackId: constitution.layoutPackId,
      offerings: constitution.signatureOfferings.slice(0, 4),
      antiPatterns: constitution.antiPatterns.slice(0, 4),
      neededTypes: constitution.neededTemplateTypes,
      signatureArchetypes: constitution.signatureArchetypes,
      moodboardCount: constitution.moodboardRefs.length,
      soulTokens: constitution.soulTokens,
    },
  };
}

/**
 * Reorder catalog slots so discovery template_needs types come first,
 * then one-per-type diversity, then fill. No needs → original diversity rule.
 */
export function rankSlotsByTemplateNeeds<T extends {
  slot_key: string;
  design_template_type: string;
}>(
  slots: T[],
  templateNeeds: string[],
  cap: number,
): T[] {
  if (slots.length === 0) return [];
  const wanted = mapTemplateNeedsToTypes(templateNeeds);
  const picked: T[] = [];
  const used = new Set<string>();

  for (const type of wanted) {
    const hit = slots.find((s) => s.design_template_type === type && !used.has(s.slot_key));
    if (!hit) continue;
    used.add(hit.slot_key);
    picked.push(hit);
  }

  const seenTypes = new Set(picked.map((s) => s.design_template_type));
  for (const slot of slots) {
    if (used.has(slot.slot_key)) continue;
    if (seenTypes.has(slot.design_template_type)) continue;
    seenTypes.add(slot.design_template_type);
    used.add(slot.slot_key);
    picked.push(slot);
  }

  for (const slot of slots) {
    if (slots.length > cap && picked.length >= cap) break;
    if (used.has(slot.slot_key)) continue;
    used.add(slot.slot_key);
    picked.push(slot);
  }

  return slots.length <= cap ? picked : picked.slice(0, cap);
}

function assetTypesFromRecommendations(recs: string[]): string[] {
  const out: string[] = [];
  for (const rec of recs) {
    const k = rec.toLowerCase();
    if (/product|sku|packaging|jar/.test(k)) out.push('product_image');
    if (/food|dish|menu|plated/.test(k)) out.push('food_drink_photo');
    if (/event|artist|dj|lineup/.test(k)) out.push('event_photo');
    if (/venue|interior|atmosphere|background/.test(k)) out.push('venue_reference');
  }
  return uniqShort(out, 4, 32);
}

export function applyConstitutionToSampleCopy(input: {
  headline: string;
  subtitle?: string;
  templateType: DesignTemplateType | string;
  catalogSlotKey?: string | null;
  constitution: BrandDesignConstitution;
}): { headline: string; subtitle?: string } {
  const offerings = input.constitution.signatureOfferings;
  if (!offerings.length) {
    return input.subtitle
      ? { headline: input.headline, subtitle: input.subtitle }
      : { headline: input.headline };
  }
  const type = String(input.templateType).toLowerCase() as DesignTemplateType;
  const key = String(input.catalogSlotKey ?? '').toLowerCase();
  const productish = PRODUCT_COPY_TYPES.has(type)
    || /product|menu|dish|harvest|sku|highlight/.test(key);
  const first = fitSlotPunchline(offerings[0]!, 3, 28);
  if (productish && first.length >= 3) {
    const second = offerings[1] ? fitSlotPunchline(offerings[1], 3, 24) : '';
    return second
      ? { headline: first, subtitle: second }
      : { headline: first, ...(input.subtitle ? { subtitle: input.subtitle } : {}) };
  }
  if (type === 'campaign_announcement' && first.length >= 3) {
    return { headline: input.headline, subtitle: first };
  }
  return input.subtitle
    ? { headline: input.headline, subtitle: input.subtitle }
    : { headline: input.headline };
}

export function applyConstitutionToPreset(
  preset: DesignTemplatePreset,
  constitution: BrandDesignConstitution,
): DesignTemplatePreset {
  const copy = applyConstitutionToSampleCopy({
    headline: preset.sampleHeadline,
    subtitle: preset.sampleSubtitle,
    templateType: preset.templateType,
    catalogSlotKey: preset.catalogSlotKey,
    constitution,
  });
  const recAssets = assetTypesFromRecommendations(constitution.assetRecommendations);
  const preferredAssetTypes = recAssets.length
    ? uniqShort([...recAssets, ...preset.preferredAssetTypes], 5, 32)
    : preset.preferredAssetTypes;
  const offeringKeywords = constitution.signatureOfferings.slice(0, 3).join(' ');
  return {
    ...preset,
    sampleHeadline: copy.headline,
    sampleSubtitle: copy.subtitle,
    preferredAssetTypes,
    matchKeywords: offeringKeywords
      ? `${preset.matchKeywords} ${offeringKeywords}`.slice(0, 220)
      : preset.matchKeywords,
  };
}

export function applyConstitutionToPresets(
  presets: DesignTemplatePreset[],
  constitution: BrandDesignConstitution | null | undefined,
): DesignTemplatePreset[] {
  if (!constitution) return presets;
  return presets.map((preset) => applyConstitutionToPreset(preset, constitution));
}

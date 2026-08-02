import type { SaveCompanyProfileRequest } from '@/types';
import {
  resolveAuthoritativeIndustry,
  resolveTenantCanonicalSector,
  shouldRefreshIndustryFromPython,
} from '@/lib/canonical-sector';
import { normalizeSectorId } from '@/lib/sector-production-profile';

/** Setup Wizard / Marka Tonu chip values. */
export const BRAND_TONE_PRESETS = [
  'professional',
  'friendly',
  'energetic',
  'luxury',
  'casual',
] as const;

export type BrandTonePreset = (typeof BRAND_TONE_PRESETS)[number];

const BRAND_TONE_PRESET_SET = new Set<string>(BRAND_TONE_PRESETS);

/** True when value is already a wizard preset key (not freeform Turkish copy). */
export function isBrandTonePreset(tone: string | null | undefined): boolean {
  return BRAND_TONE_PRESET_SET.has(String(tone ?? '').trim().toLowerCase());
}

/**
 * Map Python / discovery brand_tone text → Setup Wizard preset value.
 * Accepts preset keys, Turkish labels, or freeform phrases like "samimi, sıcak, davetkar".
 */
export function pythonToneToPreset(tone: string): BrandTonePreset {
  const t = tone.toLowerCase().trim();
  if (BRAND_TONE_PRESET_SET.has(t)) return t as BrandTonePreset;
  if (t.includes('samimi') || t.includes('sıcak') || t.includes('davetkar') || t.includes('kişisel')) {
    return 'friendly';
  }
  if (t.includes('enerjik') || t.includes('dinamik') || t.includes('heyecan')) return 'energetic';
  if (t.includes('premium') || t.includes('lüks') || t.includes('luks') || t.includes('zarif') || t.includes('sofistike')) {
    return 'luxury';
  }
  if (t.includes('rahat') || t.includes('gündelik') || t.includes('gundelik') || t.includes('doğal') || t.includes('dogal')) {
    return 'casual';
  }
  if (t.includes('profesyonel') || t.includes('güven') || t.includes('guven') || t.includes('kurumsal')) {
    return 'professional';
  }
  return 'friendly';
}

/** First non-empty candidate → preset (company profile, then Python brand_tone, …). */
export function resolveBrandTonePreset(
  ...candidates: Array<string | null | undefined>
): BrandTonePreset {
  for (const c of candidates) {
    const s = String(c ?? '').trim();
    if (!s) continue;
    return pythonToneToPreset(s);
  }
  return 'professional';
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

/** Python may store human labels (e.g. "Restoran & Bar") — map to playbook slug when possible. */
export function industryFromPythonBusinessType(businessType: string): string {
  return normalizeSectorId(businessType) || businessType.slice(0, 100);
}

function parseJsonList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Fill empty Nexus CompanyProfile fields from Python brand_context (discovery).
 * Overwrites weak industry values (e.g. general_business) when service profile
 * has a confident canonical category.
 */
export function buildCompanyProfilePatchFromPython(
  profile: Record<string, unknown>,
  py: Record<string, unknown>,
): Partial<SaveCompanyProfileRequest> | null {
  const patch: Partial<SaveCompanyProfileRequest> = {};

  const authoritativeIndustry = resolveAuthoritativeIndustry(py);
  if (authoritativeIndustry && shouldRefreshIndustryFromPython(profile, py)) {
    patch.industry = authoritativeIndustry;
  } else if (!str(profile.industry) && authoritativeIndustry) {
    patch.industry = authoritativeIndustry;
  }
  if (!str(profile.location) && str(py.location)) {
    patch.location = str(py.location);
  }
  if (!str(profile.description)) {
    const desc = str(py.description) || str(py.website_summary);
    if (desc) patch.description = desc.slice(0, 2000);
  }
  if (!str(profile.targetAudience) && str(py.target_audience)) {
    patch.targetAudience = str(py.target_audience).slice(0, 500);
  }
  if (!str(profile.campaignGoals) && str(py.campaign_goals)) {
    patch.campaignGoals = str(py.campaign_goals).slice(0, 1000);
  }
  if (!str(profile.visualStyle) && str(py.visual_style)) {
    patch.visualStyle = str(py.visual_style).slice(0, 200);
  }
  if (!str(profile.logoUrl) && str(py.logo_url)) {
    patch.logoUrl = str(py.logo_url).slice(0, 500);
  }
  if (!str(profile.websiteUrl) && str(py.website_url)) {
    patch.websiteUrl = str(py.website_url).slice(0, 500);
  }
  if (!str(profile.instagramHandle) && str(py.instagram_handle)) {
    patch.instagramHandle = str(py.instagram_handle).replace(/^@/, '').slice(0, 100);
  }
  if (!str(profile.googleBusinessUrl) && str(py.google_business_url)) {
    patch.googleBusinessUrl = str(py.google_business_url).slice(0, 500);
  }
  {
    const existingTone = str(profile.brandTone);
    const pyTone = str(py.brand_tone);
    if (!existingTone && pyTone) {
      patch.brandTone = pythonToneToPreset(pyTone);
    } else if (existingTone && !isBrandTonePreset(existingTone)) {
      // Freeform discovery text was saved into Nexus — normalize to a chip key.
      patch.brandTone = pythonToneToPreset(existingTone || pyTone);
    }
  }
  if (!str(profile.brandName) && str(py.business_name)) {
    patch.brandName = str(py.business_name).slice(0, 200);
  }
  if (!str(profile.competitors)) {
    if (str(py.competitors)) {
      patch.competitors = str(py.competitors).slice(0, 500);
    } else {
      const suggested = parseJsonList(py.suggested_competitors);
      if (suggested.length) {
        patch.competitors = suggested.slice(0, 6).join(', ').slice(0, 500);
      }
    }
  }
  if (!str(profile.contentNeeds)) {
    const pillars = parseJsonList(py.content_pillars);
    if (pillars.length) patch.contentNeeds = JSON.stringify(pillars);
  }
  if (!str(profile.brandColors) && str(py.brand_primary_color)) {
    const accent = str(py.brand_accent_color);
    patch.brandColors = accent ? `${py.brand_primary_color}, ${accent}` : str(py.brand_primary_color);
  }
  if (!str(profile.accentColors) && str(py.brand_accent_color)) {
    patch.accentColors = str(py.brand_accent_color);
  }
  if (!str(profile.primaryFont) && str(py.brand_font_family)) {
    patch.primaryFont = str(py.brand_font_family).slice(0, 100);
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function isCompanyProfileSparse(profile: Record<string, unknown>): boolean {
  return (
    !str(profile.industry)
    && !str(profile.location)
    && !str(profile.description)
    && !str(profile.targetAudience)
    && !str(profile.campaignGoals)
  );
}

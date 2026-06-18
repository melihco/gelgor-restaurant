/**
 * Agency-level production defaults — driven entirely by sector profiles.
 * No hardcoded sector strings here; all decisions come from getSectorProfile().
 * To change behaviour for a sector, edit sector-production-profile.ts.
 */
import type { BrandTemplateLibrary } from './brand-template-library';
import { normalizeBrandThemeRecord } from './brand-theme-normalize';
import {
  getSectorProfile,
  isNonVenueSectorProfile,
  shouldForceAdaptiveScene,
  isCaptionDrivenDefault,
  getDefaultEnhanceLevel,
} from './sector-production-profile';

export const KACTA_TENANT_ID = '5feb36f7-def7-4b4a-834f-353457de57bf';

/** @deprecated Use getSectorProfile(sector).hasPhysicalVenue instead. */
export function isPhysicalServiceSector(sector: string): boolean {
  return getSectorProfile(sector).hasPhysicalVenue;
}

/** @deprecated Use isNonVenueSectorProfile() from sector-production-profile instead. */
export { isNonVenueSectorProfile as isNonVenueSectorFromProfile };

/**
 * True for agency/professional-service sectors that use designed Remotion
 * templates for ALL posts (not just campaign posts).
 * @deprecated Use getSectorProfile(sector).defaultVisualSubject === 'digital_ui' instead.
 */
export function isAgencyServiceSector(sector: string): boolean {
  const profile = getSectorProfile(sector);
  return profile.defaultVisualSubject === 'digital_ui' || profile.sectorId === 'agency_services';
}

export function isPilotAgencyTenant(tenantId: string): boolean {
  return tenantId === KACTA_TENANT_ID;
}

/**
 * Applies agency-level production defaults on top of brand_theme at runtime.
 *
 * Priority order (high → low):
 *   1. Explicit user opt-out (ai_photo_enhance === false) — always wins
 *   2. Pilot / locked-library / physical-venue force-on
 *   3. Sector profile defaults (galleryReliability, adaptiveScene, etc.)
 *   4. Stored brand_theme values
 */
export function applyAgencyProductionThemeDefaults(
  theme: Record<string, unknown> | null,
  input: {
    tenantId: string;
    sector: string;
    templateLibrary: BrandTemplateLibrary;
  },
): { theme: Record<string, unknown> | null; forced: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const normalized = normalizeBrandThemeRecord(theme);

  // Explicit opt-out always wins — never force AI enhance back on.
  if (normalized.ai_photo_enhance === false) {
    return { theme: normalized, forced: false, reasons: ['ai_photo_enhance_explicit_off'] };
  }

  const profile = getSectorProfile(input.sector);
  const pilot = isPilotAgencyTenant(input.tenantId);
  const locked = Boolean(input.templateLibrary.locked);
  const nonVenue = isNonVenueSectorProfile(input.sector);
  const physicalVenue = profile.hasPhysicalVenue;

  if (pilot) reasons.push('pilot_tenant_kacta');
  if (locked) reasons.push('template_library_locked');
  if (nonVenue) reasons.push('non_venue_saas');
  if (physicalVenue) reasons.push(`physical_venue_sector:${profile.sectorId}`);

  // ── Non-venue / SaaS path ─────────────────────────────────────────────────
  // Digital brands: Remotion + digital UI; never force GPT venue enhance.
  if (nonVenue && (pilot || locked)) {
    const base = { ...normalized };
    base.ai_photo_enhance = false;
    if (!base.ai_visual_subject || base.ai_visual_subject === 'auto') {
      base.ai_visual_subject = 'digital_ui';
    }
    if (base.ai_adaptive_scene === undefined) base.ai_adaptive_scene = true;
    if (!base.ai_adaptive_scene_mode || base.ai_adaptive_scene_mode === 'auto') {
      base.ai_adaptive_scene_mode = 'digital_ui_context';
    }
    reasons.push('non_venue_digital_defaults');
    return { theme: base, forced: true, reasons };
  }

  // ── Physical venue / service path ─────────────────────────────────────────
  const shouldForce = (pilot || locked || physicalVenue) && !nonVenue;
  if (!shouldForce) {
    return { theme: normalized, forced: false, reasons: [] };
  }

  const base = { ...normalized };
  const enhanceLevel = getDefaultEnhanceLevel(input.sector);

  // Enable AI photo enhance for physical venues
  if (!base.ai_photo_enhance) {
    base.ai_photo_enhance = true;
    reasons.push('enabled_ai_photo_enhance');
  }

  // ── Sector-profile-driven defaults ───────────────────────────────────────
  // Each property is only forced when the sector profile requires it AND the
  // stored theme doesn't have an explicit value (undefined = not set by user).

  // Gallery revision: use selected photo as enhance base
  if (base.ai_enhance_gallery_selected === undefined) {
    base.ai_enhance_gallery_selected = profile.galleryRevisionDefault;
  }

  // Adaptive scene: when gallery reliability is low, bypass gallery_match_ok skip.
  // This is the key fix for service sectors (beauty, barber, healthcare) where
  // gallery match score is misleading — high score ≠ brief-specific visual.
  if (shouldForceAdaptiveScene(input.sector)) {
    // Force ON regardless of stored value — sector characteristic, not user preference
    base.ai_adaptive_scene = true;
    reasons.push(`adaptive_scene_forced:${profile.sectorId}`);
  } else if (base.ai_adaptive_scene === undefined) {
    // Medium/low gallery reliability: default adaptive scene ON so weak-match slots
    // use GPT enhance instead of brand_solid vibe generation.
    base.ai_adaptive_scene = profile.galleryReliability !== 'high';
    if (base.ai_adaptive_scene) {
      reasons.push(`adaptive_scene_default:${profile.sectorId}`);
    }
  }

  // Caption-driven: generate fresh from brief when gallery can't deliver
  if (isCaptionDrivenDefault(input.sector)) {
    base.ai_caption_driven_visual = base.ai_caption_driven_visual ?? true;
    reasons.push(`caption_driven_default:${profile.sectorId}`);
  }

  // Brief drives visual scene composition
  if (base.ai_brief_drives_scene === undefined) {
    base.ai_brief_drives_scene = true;
  }

  // Enhance level: sector-specific default (only if not set)
  if (!base.ai_photo_enhance_level) {
    base.ai_photo_enhance_level = enhanceLevel;
  }

  // Apply to all formats by default
  if (!Array.isArray(base.ai_enhance_formats) || !(base.ai_enhance_formats as unknown[]).length) {
    base.ai_enhance_formats = ['post', 'story', 'carousel', 'reel'];
  }

  if (base.ai_use_brand_identity === undefined) base.ai_use_brand_identity = true;

  return { theme: base, forced: true, reasons };
}

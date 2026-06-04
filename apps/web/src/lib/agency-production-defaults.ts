/**
 * Ajans seviyesi üretim — tenant/sector varsayılanları.
 * Marka kiti kilitli veya pilot tenant (Kaçta) için AI görsel katmanı zorunlu.
 */
import type { BrandTemplateLibrary } from './brand-template-library';

export const KACTA_TENANT_ID = '5feb36f7-def7-4b4a-834f-353457de57bf';

const AGENCY_SECTOR_RE =
  /barber|berber|kuaför|kuafor|salon|beauty|agency_services|agency|professional_service|clinic|dental|spa|gym/i;

export function isAgencyServiceSector(sector: string): boolean {
  return AGENCY_SECTOR_RE.test(sector);
}

export function isPilotAgencyTenant(tenantId: string): boolean {
  return tenantId === KACTA_TENANT_ID;
}

/**
 * Production sırasında brand_theme üzerine ajans varsayılanları uygular.
 * UI'da ai_photo_enhance kapalı olsa bile kilitli kütüphane / pilot tenant'ta açılır.
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
  const pilot = isPilotAgencyTenant(input.tenantId);
  const locked = Boolean(input.templateLibrary.locked);
  const service = isAgencyServiceSector(input.sector);

  if (pilot) reasons.push('pilot_tenant_kacta');
  if (locked) reasons.push('template_library_locked');
  if (service && !pilot && !locked) reasons.push('agency_service_sector');

  const shouldForce = pilot || locked || service;
  if (!shouldForce) {
    return { theme, forced: false, reasons: [] };
  }

  const base = { ...(theme ?? {}) };
  if (!base.ai_photo_enhance) {
    base.ai_photo_enhance = true;
    reasons.push('enabled_ai_photo_enhance');
  }
  if (!base.ai_photo_enhance_level) {
    base.ai_photo_enhance_level = 'moderate';
  }
  if (!Array.isArray(base.ai_enhance_formats) || !(base.ai_enhance_formats as unknown[]).length) {
    base.ai_enhance_formats = ['post', 'story', 'carousel', 'reel'];
  }
  if (base.ai_use_brand_identity === undefined) base.ai_use_brand_identity = true;
  if (base.ai_brief_drives_scene === undefined) base.ai_brief_drives_scene = true;

  return { theme: base, forced: true, reasons };
}

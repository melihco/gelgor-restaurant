/**
 * Brand-context produce preflight — dual-DB / onboarding gate.
 *
 * Python `ensure_brand_context` auto-creates stubs ("Brand" / general_business)
 * so missing mirrors look present. Auto-produce must fail loud before drain
 * when constitution or gallery is incomplete. Sector-agnostic — no tenant UUIDs.
 */

import {
  BRS_MIN_USABLE_PHOTOS,
  filterUsablePhotos,
  parseStringOrArray,
} from '@/lib/brand-readiness';

export type BrandContextProducePreflightCode =
  | 'brand_context_unavailable'
  | 'brand_constitution_required'
  | 'brand_gallery_insufficient'
  | 'brand_identity_stub';

export type BrandContextProducePreflight = {
  ok: boolean;
  code?: BrandContextProducePreflightCode;
  reason?: string;
  details: {
    hasRawContext: boolean;
    constitutionConfirmed: boolean;
    usablePhotoCount: number;
    minUsablePhotos: number;
    brandName: string;
    isStubName: boolean;
  };
};

const STUB_BRAND_NAMES = new Set([
  '',
  'brand',
  'your brand',
  'marka',
  'işletme',
  'business',
]);

export function isStubBrandName(name: string | null | undefined): boolean {
  const n = String(name ?? '').trim().toLowerCase();
  return STUB_BRAND_NAMES.has(n);
}

/**
 * Fail-loud gate for auto-produce / factory drain.
 * Call after fetchProductionContext with the resolved brand name + raw row.
 */
export function getBrandContextProducePreflight(input: {
  raw: Record<string, unknown> | null | undefined;
  brandName?: string | null;
  /** Override photo floor (defaults to BRS_MIN_USABLE_PHOTOS). */
  minUsablePhotos?: number;
}): BrandContextProducePreflight {
  const raw = input.raw && typeof input.raw === 'object' ? input.raw : {};
  const hasRawContext = Object.keys(raw).length > 0;
  const brandName = String(
    input.brandName
    ?? raw.business_name
    ?? raw.brand_name
    ?? '',
  ).trim();
  const isStubName = isStubBrandName(brandName);
  const constitutionConfirmed = Boolean(
    raw.brand_constitution_confirmed_at
    ?? raw.constitution_confirmed_at,
  );
  const logoUrl = typeof raw.logo_url === 'string' ? raw.logo_url : null;
  const urls = parseStringOrArray(raw.reference_image_urls);
  const usablePhotoCount = filterUsablePhotos(urls, logoUrl).length;
  const minUsablePhotos = input.minUsablePhotos ?? BRS_MIN_USABLE_PHOTOS;

  const details = {
    hasRawContext,
    constitutionConfirmed,
    usablePhotoCount,
    minUsablePhotos,
    brandName: brandName || 'Brand',
    isStubName,
  };

  if (!hasRawContext) {
    return {
      ok: false,
      code: 'brand_context_unavailable',
      reason: 'Python brand_context mirror unavailable or empty — sync onboarding first',
      details,
    };
  }
  if (!constitutionConfirmed) {
    return {
      ok: false,
      code: 'brand_constitution_required',
      reason: 'Marka Anayasası onaylanmadan üretim yapılamaz',
      details,
    };
  }
  if (usablePhotoCount < minUsablePhotos) {
    return {
      ok: false,
      code: 'brand_gallery_insufficient',
      reason:
        `Galeri yetersiz (${usablePhotoCount}/${minUsablePhotos} kullanılabilir foto) — Marka Galeri’yi tamamlayın`,
      details,
    };
  }
  if (isStubName) {
    return {
      ok: false,
      code: 'brand_identity_stub',
      reason: 'Marka adı stub (Brand) — keşif/onboarding tamamlanmadan üretim engellendi',
      details,
    };
  }

  return { ok: true, details };
}

export function httpStatusForBrandContextPreflight(
  code: BrandContextProducePreflightCode | undefined,
): number {
  if (code === 'brand_context_unavailable') return 503;
  return 422;
}

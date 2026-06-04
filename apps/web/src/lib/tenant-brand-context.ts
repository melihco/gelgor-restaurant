/**
 * Single source of truth for tenant-specific brand dynamics.
 * Never use hardcoded demo brand names, sectors, or handles in production UI/prompts.
 */

import { resolveSectorPack } from '@/lib/context-signals/sector-packs';
import { resolveCanonicalBrandName } from '@/lib/resolve-brand-name';
import type { CompanyProfile } from '@/types';

export interface TenantBrandContext {
  brandName: string;
  businessType: string;
  sector: string;
  sectorPackId: string;
  sectorLabel: string;
  location: string;
  languages: string;
  primaryLanguage: string;
  outputLanguage: string;
  instagramHandle: string;
  displayHandle: string;
  logoUrl: string;
  brandTone: string;
  description: string;
  isReady: boolean;
}

const OUTPUT_LANG: Record<string, string> = {
  tr: 'Turkish',
  en: 'English',
  de: 'German',
  fr: 'French',
  ar: 'Arabic',
  es: 'Spanish',
  it: 'Italian',
  ru: 'Russian',
};

export function resolvePrimaryLanguageCode(languages?: string | null): string {
  const raw = (languages || '').split(',')[0]?.trim().toLowerCase();
  return raw || 'tr';
}

export function resolveOutputLanguage(languages?: string | null): string {
  const code = resolvePrimaryLanguageCode(languages);
  return OUTPUT_LANG[code] || code.charAt(0).toUpperCase() + code.slice(1);
}

export function resolveInstagramHandle(
  profile?: Partial<CompanyProfile> | null,
  brandCtx?: Record<string, unknown> | null,
): string {
  const fromProfile = String(profile?.instagramHandle || '').replace(/^@/, '').trim();
  if (fromProfile) return fromProfile.toLowerCase();
  const fromCtx = String(brandCtx?.instagram_handle || brandCtx?.instagramHandle || '')
    .replace(/^@/, '').trim();
  if (fromCtx) return fromCtx.toLowerCase();
  const name = String(profile?.brandName || brandCtx?.business_name || brandCtx?.businessName || '').trim();
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 24);
}

export function resolveTenantSector(
  profile?: Partial<CompanyProfile> | null,
  brandCtx?: Record<string, unknown> | null,
): string {
  return String(
    profile?.industry
    || brandCtx?.business_type
    || brandCtx?.businessType
    || brandCtx?.industry
    || 'general_business',
  ).trim().toLowerCase();
}

/** Merge Nexus company profile + Python brand context into one struct. */
export function buildTenantBrandContext(
  profile?: Partial<CompanyProfile> | null,
  brandCtx?: Record<string, unknown> | null,
): TenantBrandContext {
  const brandName = resolveCanonicalBrandName(profile, brandCtx);
  const businessType = resolveTenantSector(profile, brandCtx);
  const location = String(profile?.location || brandCtx?.location || '').trim();
  const languages = String(brandCtx?.languages || profile?.languages || 'tr').trim();
  const description = String(profile?.description || brandCtx?.description || '').trim();
  const pack = resolveSectorPack(businessType, brandName, description);
  const handle = resolveInstagramHandle(profile, brandCtx);

  return {
    brandName,
    businessType,
    sector: businessType,
    sectorPackId: pack.id,
    sectorLabel: pack.label,
    location,
    languages,
    primaryLanguage: resolvePrimaryLanguageCode(languages),
    outputLanguage: resolveOutputLanguage(languages),
    instagramHandle: handle,
    displayHandle: handle || slugFromBrandName(brandName),
    logoUrl: String(profile?.logoUrl || brandCtx?.logo_url || brandCtx?.logoUrl || '').trim(),
    brandTone: String(profile?.brandTone || brandCtx?.brand_tone || brandCtx?.brandTone || '').trim(),
    description,
    isReady: Boolean(brandName && businessType !== 'general_business'),
  };
}

export function emptyTenantBrandContext(): TenantBrandContext {
  return buildTenantBrandContext(null, null);
}

function slugFromBrandName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
  return slug || 'brand';
}

/** Feed / preview card handle — artifact metadata wins, then tenant profile. */
export function resolveFeedHandle(
  artifactMeta: Record<string, unknown> | undefined,
  brand: TenantBrandContext,
): string {
  const fromMeta = String(
    artifactMeta?.instagram_handle
    || artifactMeta?.instagramHandle
    || artifactMeta?.brandName
    || '',
  ).trim();
  if (fromMeta) {
    return fromMeta.replace(/^@/, '').toLowerCase().replace(/\s+/g, '_').slice(0, 24);
  }
  return brand.displayHandle;
}

export function resolveFeedBrandName(
  artifactMeta: Record<string, unknown> | undefined,
  brand: TenantBrandContext,
): string {
  const fromMeta = String(artifactMeta?.brandName || '').trim();
  return fromMeta || brand.brandName || 'Brand';
}

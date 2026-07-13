/**
 * Deep-link targets from Mission Hub readiness checks → Brand Constitution fields.
 * Multi-tenant; sector-agnostic.
 */
import { brandReadinessFixToBrandTab } from '@/lib/brand-readiness';

export type BrandConstitutionTab = 'identity' | 'content' | 'design' | 'gallery' | 'chatbot';
export type BrandIdentityGroup = 'basics' | 'channels' | 'about';
export type BrandContentGroup = 'voice' | 'audience' | 'strategy' | 'special' | 'competitors';
export type BrandDesignGroup = 'colors' | 'templates' | 'engines' | 'dna' | 'rules';
export type BrandGalleryGroup = 'upload' | 'analyze' | 'photos';

export interface BrandReadinessNavTarget {
  tab: BrandConstitutionTab;
  identityGroup?: BrandIdentityGroup | null;
  contentGroup?: BrandContentGroup | null;
  designGroup?: BrandDesignGroup | null;
  galleryGroup?: BrandGalleryGroup | null;
  /** DOM anchor via data-brand-fix */
  anchor: string;
  label: string;
}

const CHECK_TARGETS: Record<string, BrandReadinessNavTarget> = {
  constitution: {
    tab: 'identity',
    identityGroup: null,
    anchor: 'constitution-confirm',
    label: 'Marka Anayasası onayı',
  },
  discovery_confidence: {
    tab: 'identity',
    identityGroup: 'channels',
    anchor: 'discovery-channels',
    label: 'Keşif kanalları',
  },
  gallery_min_photos: {
    tab: 'gallery',
    galleryGroup: 'upload',
    anchor: 'gallery-upload',
    label: 'Galeri fotoğraf yükleme',
  },
  gallery_coverage: {
    tab: 'gallery',
    galleryGroup: 'analyze',
    anchor: 'gallery-analyze',
    label: 'Galeri AI analizi',
  },
  brand_dna: {
    tab: 'design',
    designGroup: 'dna',
    anchor: 'brand-dna-analyze',
    label: 'Marka DNA',
  },
  brand_theme: {
    tab: 'design',
    designGroup: 'colors',
    anchor: 'brand-theme',
    label: 'Marka teması',
  },
  content_pillars: {
    tab: 'content',
    contentGroup: 'strategy',
    anchor: 'content-pillars',
    label: 'İçerik sütunları',
  },
  default_ctas: {
    tab: 'content',
    contentGroup: 'strategy',
    anchor: 'content-pillars',
    label: 'Varsayılan CTA',
  },
  service_profile: {
    tab: 'identity',
    identityGroup: 'basics',
    anchor: 'service-profile',
    label: 'Hizmet profili',
  },
  production_visual_dna: {
    tab: 'design',
    designGroup: 'dna',
    anchor: 'brand-dna-analyze',
    label: 'Production visual DNA',
  },
  production_theme_layers: {
    tab: 'design',
    designGroup: 'colors',
    anchor: 'theme-layers',
    label: 'Tema üretim katmanları',
  },
  sector_consistency: {
    tab: 'identity',
    identityGroup: 'basics',
    anchor: 'service-profile',
    label: 'Sektör uyumu',
  },
};

const FIX_TARGETS: Record<string, BrandReadinessNavTarget> = {
  'brand-constitution': CHECK_TARGETS.constitution!,
  'brand-analysis': CHECK_TARGETS.discovery_confidence!,
  gallery: CHECK_TARGETS.gallery_coverage!,
  'brand-dna': CHECK_TARGETS.brand_dna!,
  'brand-theme': CHECK_TARGETS.brand_theme!,
  'story-templates': {
    tab: 'design',
    designGroup: 'templates',
    anchor: 'story-templates',
    label: 'fal.ai şablon galerisi',
  },
  'content-pillars': CHECK_TARGETS.content_pillars!,
  brand: {
    tab: 'identity',
    identityGroup: null,
    anchor: 'identity-dashboard',
    label: 'Marka kimliği',
  },
  identity: CHECK_TARGETS.discovery_confidence!,
  design: CHECK_TARGETS.brand_theme!,
  content: CHECK_TARGETS.content_pillars!,
};

export function resolveBrandReadinessNav(
  fix?: string | null,
  checkId?: string | null,
): BrandReadinessNavTarget | null {
  if (checkId) {
    const direct = CHECK_TARGETS[checkId];
    if (direct) return direct;
    if (checkId.startsWith('brs_')) {
      return CHECK_TARGETS[checkId.slice(4)] ?? null;
    }
    if (checkId.startsWith('ppr_')) {
      return CHECK_TARGETS[checkId.slice(4)] ?? null;
    }
  }
  if (fix) {
    const mapped = FIX_TARGETS[fix];
    if (mapped) return mapped;
    const tab = brandReadinessFixToBrandTab(fix);
    if (tab) {
      return {
        tab,
        anchor: `${tab}-dashboard`,
        label: 'Marka profili',
      };
    }
  }
  return null;
}

/** Scroll to anchor and pulse-highlight the target block. */
export function focusBrandReadinessAnchor(anchor: string, delayMs = 360): void {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    const el = document.querySelector(`[data-brand-fix="${anchor}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('brand-fix-highlight');
    const focusable = el.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]',
    );
    if (focusable) {
      window.setTimeout(() => focusable.focus({ preventScroll: true }), 280);
    }
    window.setTimeout(() => el.classList.remove('brand-fix-highlight'), 2600);
  }, delayMs);
}

/**
 * Auto visual subject resolution for Brand Hub `ai_visual_subject: auto`.
 *
 * Priority (auto only):
 *   1. Gallery analysis density (product packaging vs venue vs digital UI)
 *   2. Sector profile defaultVisualSubject
 *   3. venue_ambiance fallback
 *
 * Explicit theme subjects (venue_ambiance | product_hero | digital_ui) always win.
 */
import type {
  AiVisualSubject,
  ResolvedVisualSubject,
} from '@/lib/ai-visual-production-standard';
import {
  getDefaultVisualSubject,
  isNonVenueSectorProfile,
} from '@/lib/sector-production-profile';
import { catalogSlotPurposeKey } from '@/lib/sector-slot-pack';

/** Minimal gallery meta shape — avoids coupling to full GalleryPhotoMeta. */
export type GallerySubjectEvidence = {
  contentTags?: string[];
  description?: string;
  bestFor?: string[];
  primarySubject?: string;
  subjectFamily?: string;
  visibleLabelText?: string;
  hasPeople?: boolean;
};

const PRODUCT_SIGNAL =
  /\b(product|packaging|jar|bottle|tin|sku|label|box|pouch|cosmetic|skincare|olive|honey|jam|soap|candle|merch|flat.?lay|still.?life|ürün|ambalaj|kavanoz|şişe|etiket)\b/i;
const VENUE_SIGNAL =
  /\b(interior|exterior|venue|terrace|pool|beach|dining|architecture|ambiance|salon|bar|lounge|restaurant|cafe|club|resort|mekân|mekan|teras|salon|plaj)\b/i;
const DIGITAL_SIGNAL =
  /\b(ui|dashboard|screenshot|app.?screen|saas|software|mockup|laptop|interface|panel)\b/i;

/**
 * Infer subject from gallery analysis tags. Returns null when evidence is thin
 * so the sector default can decide.
 */
export function inferVisualSubjectFromGallery(
  galleryMeta: Record<string, GallerySubjectEvidence> | null | undefined,
): ResolvedVisualSubject | null {
  if (!galleryMeta || typeof galleryMeta !== 'object') return null;

  const entries = Object.values(galleryMeta).filter((m) => {
    if (!m || typeof m !== 'object') return false;
    return Boolean(
      (m.contentTags && m.contentTags.length)
      || (m.description && m.description.trim())
      || m.primarySubject
      || m.subjectFamily
      || m.visibleLabelText,
    );
  });

  // Need a few analyzed photos before overriding sector defaults.
  if (entries.length < 2) return null;

  let product = 0;
  let venue = 0;
  let digital = 0;

  for (const m of entries) {
    const blob = [
      ...(m.contentTags ?? []),
      m.description ?? '',
      ...(m.bestFor ?? []),
      m.primarySubject ?? '',
      m.subjectFamily ?? '',
      m.visibleLabelText ?? '',
    ].join(' ');

    const hasProduct =
      Boolean(m.primarySubject || m.subjectFamily || m.visibleLabelText)
      || PRODUCT_SIGNAL.test(blob);
    const hasDigital = DIGITAL_SIGNAL.test(blob);
    const hasVenue = VENUE_SIGNAL.test(blob);

    if (hasProduct) product += 1;
    if (hasDigital) digital += 1;
    if (hasVenue) venue += 1;
    // People without product/packaging cues → venue/service ambiance
    if (!hasProduct && !hasDigital && m.hasPeople) venue += 1;
  }

  const n = entries.length;
  if (digital / n >= 0.4 && digital >= product && digital >= venue) {
    return 'digital_ui';
  }
  if (product / n >= 0.35 && product >= venue) {
    return 'product_hero';
  }
  if (venue / n >= 0.35 && venue > product) {
    return 'venue_ambiance';
  }
  return null;
}

function resolveFromSector(businessType: string): ResolvedVisualSubject {
  const profileSubject = getDefaultVisualSubject(businessType);
  if (profileSubject === 'digital_ui') return 'digital_ui';
  if (profileSubject === 'product_closeup') return 'product_hero';
  if (
    profileSubject === 'venue_interior'
    || profileSubject === 'service_person'
    || profileSubject === 'lifestyle'
  ) {
    return 'venue_ambiance';
  }
  if (isNonVenueSectorProfile(businessType)) return 'digital_ui';
  return 'venue_ambiance';
}

export type ResolveVisualSubjectOptions = {
  galleryMeta?: Record<string, GallerySubjectEvidence> | null;
  /** Catalog slot — venue/process jobs must not inherit a mission-wide product_hero. */
  catalogSlotKey?: string | null;
};

/**
 * Slot job wins over gallery-density auto. A shop of jar photos must not
 * restage farm / hours / ambiance cards as the same product hero.
 * Purpose stem only — never brand names or tenant ids.
 */
export function inferVisualSubjectFromSlotKey(
  catalogSlotKey?: string | null,
): ResolvedVisualSubject | null {
  const key = catalogSlotPurposeKey(String(catalogSlotKey ?? ''));
  if (!key) return null;
  if (
    /weekend_hours|opening_hours|ambiance|atmosphere|venue|facility|aerial|interior|terrace|pool|sunset|golden_hour/.test(key)
  ) {
    return 'venue_ambiance';
  }
  if (
    /farm_visit|farm.?to.?table|orchard|grove|producer_visit|production_bts|craft_process|behind_scenes|kitchen_bts|shop_tour/.test(key)
  ) {
    return 'venue_ambiance';
  }
  if (
    /product_hero|new_arrival|limited_batch|gift_bundle|gift_set|hamper|product_detail|product_range|unboxing|signature_dish|menu_highlight|cocktail|chef_special/.test(key)
  ) {
    return 'product_hero';
  }
  return null;
}

/** Slot job first, then Hub subject / gallery density / sector. */
export function resolveVisualSubjectForSlot(input: {
  subject: AiVisualSubject;
  businessType: string;
  catalogSlotKey?: string | null;
  galleryMeta?: Record<string, GallerySubjectEvidence> | null;
}): ResolvedVisualSubject {
  const fromSlot = inferVisualSubjectFromSlotKey(input.catalogSlotKey);
  if (fromSlot) return fromSlot;
  return resolveAutoVisualSubject(input.subject, input.businessType, {
    galleryMeta: input.galleryMeta,
  });
}

/**
 * Resolve theme `ai_visual_subject` to a concrete production subject.
 * Explicit selections are never overridden by gallery or sector.
 */
export function resolveAutoVisualSubject(
  subject: AiVisualSubject,
  businessType: string,
  opts?: ResolveVisualSubjectOptions,
): ResolvedVisualSubject {
  if (subject === 'digital_ui' || subject === 'venue_ambiance' || subject === 'product_hero') {
    return subject;
  }

  // auto — gallery density first, then sector profile
  const fromGallery = inferVisualSubjectFromGallery(opts?.galleryMeta);
  if (fromGallery) return fromGallery;

  return resolveFromSector(businessType);
}

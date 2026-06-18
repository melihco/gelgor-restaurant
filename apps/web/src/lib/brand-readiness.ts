/**
 * Brand Readiness Score (BRS) — Sprint 1 / Foundation Sprint Program.
 *
 * BRS is the first of five sub-scores that make up the Brand Alignment Score (BAS).
 * A tenant cannot run autonomous production until BAS === 100; missions can only be
 * proposed once BRS >= 80 (and later GIS >= 70).
 *
 * This module is the single source of truth for the 100-point checklist. It is pure
 * (no I/O) so it can run server-side in the BFF route and be unit-tested with fixtures.
 *
 * See docs/foundation-sprint-program.md § "BRS 100 puan checklist".
 */

// Lowered from 80 → 70: allows proposals when core quality data is present
// (gallery, theme, pillars, CTAs) even without formal constitution confirmation.
// The GIS gate (≥70) provides independent quality assurance on the gallery side.
// Constitution approval still earns +20 pts toward full autonomy.
export const BRS_PROPOSE_THRESHOLD = 70;
export const BRS_MIN_USABLE_PHOTOS = 8;
export const BRS_MIN_DISCOVERY_CONFIDENCE = 70;
export const BRS_MIN_COVERAGE_RATIO = 0.9;
export const BRS_MIN_CONTENT_PILLARS = 2;

export type BrandReadinessCheckId =
  | 'constitution'
  | 'discovery_confidence'
  | 'gallery_min_photos'
  | 'gallery_coverage'
  | 'brand_dna'
  | 'brand_theme'
  | 'content_pillars'
  | 'default_ctas';

export interface BrandReadinessCheck {
  id: BrandReadinessCheckId;
  label: string;
  /** Points earned (0..weight). */
  earned: number;
  /** Maximum points for this check. */
  weight: number;
  passed: boolean;
  /** Human-readable status, e.g. "6 / 8 fotoğraf". */
  detail: string;
  /** Operator-facing next action when not passed. */
  action: string;
  /** Deep-link hint the UI can route to (screen id or anchor). */
  fix?: string;
}

export interface BrandReadinessResult {
  /** 0..100 */
  score: number;
  checks: BrandReadinessCheck[];
  canProposeMissions: boolean;
  /** Gallery sub-score (GIS) decides the final autonomy gate (Sprint 2). */
  canAutoProduce: boolean;
  /** Convenience: checks that are not yet passed. */
  missing: BrandReadinessCheck[];
}

/**
 * Normalised inputs for scoring. The BFF route maps raw Python responses
 * (which mix JSON strings and arrays) into this shape before scoring.
 */
export interface BrandReadinessInputs {
  constitutionConfirmedAt: string | null;
  discoveryConfidence: number;
  /** Reference image URLs excluding the logo. */
  usablePhotoCount: number;
  /** Count of usable photos that have a gallery_analysis entry. */
  analyzedPhotoCount: number;
  hasBrandDna: boolean;
  /** Palette / typography visual kit derived or saved manually. */
  hasBrandTheme: boolean;
  /** Five locked production slots in brand_theme.template_library. */
  hasTemplateLibrary: boolean;
  contentPillarCount: number;
  defaultCtaCount: number;
}

/** Map BRS fix hints to Brand Constitution tab ids (5-tab layout). */
export function brandReadinessFixToBrandTab(
  fix: string | undefined,
): 'identity' | 'content' | 'visual' | 'production' | 'gallery' | null {
  switch (fix) {
    case 'brand-constitution':
      return 'identity';
    case 'brand-analysis':
    case 'brand-dna':
      return 'production';
    case 'gallery':
      return 'gallery';
    case 'brand-theme':
    case 'story-templates':
      return 'visual';
    case 'content-pillars':
      return 'content';
    case 'brand':
      return 'identity';
    default:
      return null;
  }
}

function clampPoints(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, Math.round(value));
}

export function computeBrandReadiness(input: BrandReadinessInputs): BrandReadinessResult {
  const checks: BrandReadinessCheck[] = [];

  // 1. Constitution confirmed — 20
  {
    const passed = Boolean(input.constitutionConfirmedAt);
    checks.push({
      id: 'constitution',
      label: 'Marka Anayasası onaylı',
      weight: 20,
      earned: passed ? 20 : 0,
      passed,
      detail: passed ? 'Onaylandı' : 'Onay bekliyor',
      action: 'Marka Anayasasını gözden geçirip onaylayın.',
      fix: 'brand-constitution',
    });
  }

  // 2. Discovery confidence >= 70 — 15 (partial credit below threshold)
  {
    const conf = Math.max(0, Math.min(100, input.discoveryConfidence));
    const passed = conf >= BRS_MIN_DISCOVERY_CONFIDENCE;
    const earned = passed ? 15 : clampPoints((conf / BRS_MIN_DISCOVERY_CONFIDENCE) * 15, 15);
    checks.push({
      id: 'discovery_confidence',
      label: 'Keşif güven skoru',
      weight: 15,
      earned,
      passed,
      detail: `${conf} / ${BRS_MIN_DISCOVERY_CONFIDENCE}`,
      action: 'Web sitesi, Instagram ve Google kaynaklarını bağlayıp marka analizini tekrar çalıştırın.',
      fix: 'brand-analysis',
    });
  }

  // 3. Gallery min usable photos — 15 (partial credit)
  {
    const count = Math.max(0, input.usablePhotoCount);
    const passed = count >= BRS_MIN_USABLE_PHOTOS;
    const earned = passed ? 15 : clampPoints((count / BRS_MIN_USABLE_PHOTOS) * 15, 15);
    checks.push({
      id: 'gallery_min_photos',
      label: 'Galeri foto sayısı',
      weight: 15,
      earned,
      passed,
      detail: `${count} / ${BRS_MIN_USABLE_PHOTOS} fotoğraf`,
      action: 'Markaya ait en az 8 kullanılabilir fotoğraf ekleyin (logo hariç).',
      fix: 'gallery',
    });
  }

  // 4. Gallery analyze coverage >= 90% — 15
  {
    const total = Math.max(0, input.usablePhotoCount);
    const analyzed = Math.max(0, Math.min(total, input.analyzedPhotoCount));
    const ratio = total > 0 ? analyzed / total : 0;
    const passed = total > 0 && ratio >= BRS_MIN_COVERAGE_RATIO;
    const earned = total === 0 ? 0 : clampPoints(ratio * 15, 15);
    checks.push({
      id: 'gallery_coverage',
      label: 'Galeri analiz kapsamı',
      weight: 15,
      earned,
      passed,
      detail: total > 0 ? `${analyzed} / ${total} analiz edildi (%${Math.round(ratio * 100)})` : 'Foto yok',
      action: 'Tüm galeri fotoğraflarını analiz edin (vision analizi eksik fotoları tamamlayın).',
      fix: 'gallery',
    });
  }

  // 5. Brand DNA present — 10
  {
    const passed = input.hasBrandDna;
    checks.push({
      id: 'brand_dna',
      label: 'Marka DNA sentezi',
      weight: 10,
      earned: passed ? 10 : 0,
      passed,
      detail: passed ? 'Mevcut' : 'Üretilmedi',
      action: 'Marka DNA sentezini çalıştırın (anayasa onayından sonra otomatik üretilir).',
      fix: 'brand-dna',
    });
  }

  // 6. Brand theme + 5-slot template library — 10 (5 pts each)
  {
    const themePts = input.hasBrandTheme ? 5 : 0;
    const libraryPts = input.hasTemplateLibrary ? 5 : 0;
    const earned = themePts + libraryPts;
    const passed = earned === 10;
    let detail = 'Türetilmedi';
    if (input.hasBrandTheme && input.hasTemplateLibrary) detail = 'Tema + 5 şablon';
    else if (input.hasBrandTheme) detail = 'Tema var · 5 şablon bekliyor';
    else if (input.hasTemplateLibrary) detail = '5 şablon · tema bekliyor';
    checks.push({
      id: 'brand_theme',
      label: 'Marka teması (görsel kit)',
      weight: 10,
      earned,
      passed,
      detail,
      action: passed
        ? 'Görsel kit ve üretim şablonları hazır.'
        : 'Marka temasını türetin ve story şablonlarını kaydedin (Story Şablonları).',
      fix: input.hasTemplateLibrary ? 'brand-theme' : 'story-templates',
    });
  }

  // 7. Content pillars >= 2 — 10
  {
    const count = Math.max(0, input.contentPillarCount);
    const passed = count >= BRS_MIN_CONTENT_PILLARS;
    const earned = passed ? 10 : clampPoints((count / BRS_MIN_CONTENT_PILLARS) * 10, 10);
    checks.push({
      id: 'content_pillars',
      label: 'İçerik sütunları',
      weight: 10,
      earned,
      passed,
      detail: `${count} / ${BRS_MIN_CONTENT_PILLARS} sütun`,
      action: 'En az 2 içerik sütunu (content pillar) tanımlayın.',
      fix: 'content-pillars',
    });
  }

  // 8. Default CTAs >= 1 — 5
  {
    const count = Math.max(0, input.defaultCtaCount);
    const passed = count >= 1;
    checks.push({
      id: 'default_ctas',
      label: 'Varsayılan CTA’lar',
      weight: 5,
      earned: passed ? 5 : 0,
      passed,
      detail: `${count} CTA`,
      action: 'En az 1 varsayılan harekete geçirici mesaj (CTA) ekleyin.',
      fix: 'content-pillars',
    });
  }

  const score = clampPoints(
    checks.reduce((sum, c) => sum + c.earned, 0),
    100,
  );
  const missing = checks.filter((c) => !c.passed);
  const canProposeMissions = score >= BRS_PROPOSE_THRESHOLD;
  // Full autonomy needs BRS=100 AND gallery passes; gallery (GIS) is layered in Sprint 2.
  const canAutoProduce = score === 100;

  return { score, checks, canProposeMissions, canAutoProduce, missing };
}

/** Tolerant parse for fields that Python returns as JSON strings OR arrays. */
export function parseStringOrArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === 'string');
    } catch {
      // not JSON — treat as single value
      return [value];
    }
  }
  return [];
}

/** Heuristic: exclude the brand logo and obvious non-photo assets from usable count. */
export function filterUsablePhotos(urls: string[], logoUrl?: string | null): string[] {
  const logo = (logoUrl || '').trim();
  return urls.filter((u) => {
    if (!u || typeof u !== 'string') return false;
    if (logo && u === logo) return false;
    const lower = u.toLowerCase();
    if (lower.includes('logo')) return false;
    return true;
  });
}

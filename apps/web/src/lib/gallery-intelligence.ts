/**
 * Gallery Intelligence Score (GIS) — Sprint 2 / Foundation Sprint Program.
 *
 * GIS is the second BAS sub-score. It measures whether the brand gallery is rich
 * and well-understood enough to drive brand-aligned photo↔idea matching.
 *
 * Pure module (no I/O): the BFF route feeds it normalised inputs and it returns a
 * 100-point breakdown. See docs/foundation-sprint-program.md § "GIS 100 puan".
 *
 * GIS 100 breakdown:
 *   - URL coverage 100%            → 30
 *   - Avg analysis quality ≥80     → 25
 *   - Usable photos (non-logo) ≥8  → 15
 *   - Last analyze < 30 days       → 10
 *   - Matcher avg ≥58 (last 20)    → 20
 */

export const GIS_PROPOSE_THRESHOLD = 70;
export const GIS_MIN_USABLE_PHOTOS = 8;
export const GIS_QUALITY_TARGET = 80;
export const GIS_RECENCY_DAYS = 30;
export const GIS_MATCHER_TARGET = 58;

/** Subset of GalleryPhotoAnalysis needed to score quality. */
export interface AnalysisLike {
  description?: string;
  contentTags?: string[];
  bestFor?: string[];
  notGoodFor?: string[];
  mood?: string;
  usageContext?: string;
  suggestedAssetType?: string;
  isLogo?: boolean;
  captionHooks?: string[];
  pairingKeywords?: string[];
  /** Stamped by the analyze pipeline (Sprint 2). ISO string. */
  analyzedAt?: string;
  /** Cached deterministic quality score (0..100), if already computed. */
  qualityScore?: number;
}

/**
 * Deterministic per-photo analysis quality (0..100). Rewards specific, complete
 * tagging so the matcher has enough signal. No LLM — pure heuristics over the
 * structured fields the vision model returned.
 */
export function computeAnalysisQuality(a: AnalysisLike): number {
  if (!a) return 0;
  let score = 0;

  // Description richness — up to 30
  const desc = (a.description ?? '').trim();
  if (desc.length >= 160) score += 30;
  else if (desc.length >= 90) score += 22;
  else if (desc.length >= 40) score += 12;
  else if (desc.length > 0) score += 4;

  // Content tags — up to 35 (specificity is the matcher's main fuel)
  const tags = (a.contentTags ?? []).filter((t) => typeof t === 'string' && t.trim());
  if (tags.length >= 10) score += 35;
  else if (tags.length >= 6) score += 26;
  else if (tags.length >= 3) score += 16;
  else if (tags.length >= 1) score += 6;

  // bestFor use-cases — up to 15
  const bestFor = (a.bestFor ?? []).filter((t) => typeof t === 'string' && t.trim());
  if (bestFor.length >= 3) score += 15;
  else if (bestFor.length >= 1) score += 8;

  // usageContext present — up to 12
  const usage = (a.usageContext ?? '').trim();
  if (usage.length >= 40) score += 12;
  else if (usage.length > 0) score += 6;

  // caption hooks + pairing keywords — up to 10
  const hooks = (a.captionHooks ?? []).filter((t) => typeof t === 'string' && t.trim());
  const pairs = (a.pairingKeywords ?? []).filter((t) => typeof t === 'string' && t.trim());
  if (hooks.length >= 3 && pairs.length >= 6) score += 10;
  else if (hooks.length >= 1 || pairs.length >= 4) score += 5;

  // mood + asset type classified — up to 8
  if ((a.mood ?? '').trim()) score += 4;
  if ((a.suggestedAssetType ?? '').trim()) score += 4;

  return Math.min(100, Math.round(score));
}

export type GisCheckId =
  | 'coverage'
  | 'avg_quality'
  | 'min_photos'
  | 'recency'
  | 'matcher_avg';

export interface GisCheck {
  id: GisCheckId;
  label: string;
  earned: number;
  weight: number;
  passed: boolean;
  detail: string;
  action: string;
  /** True when we lack the data to evaluate this check yet (not a failure). */
  pending?: boolean;
}

export interface GisResult {
  score: number;
  checks: GisCheck[];
  /** GIS gate for mission proposing (combined with BRS). */
  canPropose: boolean;
  /** Gallery side of the autonomy gate. */
  canAutoProduce: boolean;
  missing: GisCheck[];
}

export interface GalleryIntelligenceInputs {
  usablePhotoCount: number;
  analyzedPhotoCount: number;
  /** Quality scores (0..100) for each analyzed usable photo. */
  qualityScores: number[];
  /** Most recent analyze timestamp across entries (ISO), if known. */
  lastAnalyzedAt: string | null;
  /** Recent matcher scores (last ~20), if instrumented. Empty = not yet measured. */
  recentMatchScores: number[];
}

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, Math.round(value));
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

export function computeGalleryIntelligence(input: GalleryIntelligenceInputs): GisResult {
  const checks: GisCheck[] = [];

  const usable = Math.max(0, input.usablePhotoCount);
  const analyzed = Math.max(0, Math.min(usable, input.analyzedPhotoCount));

  // 1. URL coverage — 30
  {
    const ratio = usable > 0 ? analyzed / usable : 0;
    const passed = usable > 0 && ratio >= 1;
    checks.push({
      id: 'coverage',
      label: 'Analiz kapsamı',
      weight: 30,
      earned: usable === 0 ? 0 : clamp(ratio * 30, 30),
      passed,
      detail: usable > 0 ? `${analyzed}/${usable} (%${Math.round(ratio * 100)})` : 'Foto yok',
      action: 'Tüm galeri fotoğraflarını analiz edin (kapsama işini çalıştırın).',
    });
  }

  // 2. Avg analysis quality ≥80 — 25
  // Pre-Sprint-2 analyses don't have qualityScore → compute from fields.
  // If computed quality is very low (< 40) for ALL entries it likely means old format →
  // treat as "not measured" and give partial credit (50%) rather than 0.
  {
    const avg = average(input.qualityScores);
    const noScores = input.qualityScores.length === 0;
    const allLegacy = !noScores && avg < 35 && input.qualityScores.every(s => s < 40);
    const passed = !noScores && !allLegacy && avg >= GIS_QUALITY_TARGET;
    const earned = noScores
      ? 20  // no data → assume OK (give 80% credit)
      : allLegacy
        ? 15  // legacy/poor format → partial credit (60%)
        : clamp((avg / GIS_QUALITY_TARGET) * 25, 25);
    checks.push({
      id: 'avg_quality',
      label: 'Ortalama analiz kalitesi',
      weight: 25,
      earned,
      passed: passed || noScores || allLegacy,
      detail: noScores ? 'Ölçülmedi (tam puan)' : allLegacy ? `${Math.round(avg)} / ${GIS_QUALITY_TARGET} (eski format)` : `${Math.round(avg)} / ${GIS_QUALITY_TARGET}`,
      action: 'Zayıf etiketlenmiş fotoğrafları premium tier (gpt-4o) ile yeniden analiz edin.',
    });
  }

  // 3. Usable photos ≥8 — 15
  {
    const passed = usable >= GIS_MIN_USABLE_PHOTOS;
    checks.push({
      id: 'min_photos',
      label: 'Kullanılabilir foto sayısı',
      weight: 15,
      earned: passed ? 15 : clamp((usable / GIS_MIN_USABLE_PHOTOS) * 15, 15),
      passed,
      detail: `${usable} / ${GIS_MIN_USABLE_PHOTOS}`,
      action: 'Markaya ait en az 8 kullanılabilir fotoğraf ekleyin (logo hariç).',
    });
  }

  // 4. Recency < 30 days — 10
  // When analyzedAt is missing (legacy analyses from before Sprint 2), treat as
  // "not yet measured" → give full credit so legacy accounts aren't hard-blocked.
  {
    let earned = 0;
    let passed = false;
    let detail = 'Tarih bilinmiyor';
    let pending = true;
    if (input.lastAnalyzedAt) {
      const ts = Date.parse(input.lastAnalyzedAt);
      if (Number.isFinite(ts)) {
        pending = false;
        const days = (Date.now() - ts) / 86_400_000;
        passed = days <= GIS_RECENCY_DAYS;
        earned = passed ? 10 : days <= GIS_RECENCY_DAYS * 3 ? 4 : 0;
        detail = `${Math.max(0, Math.round(days))} gün önce`;
      }
    }
    // Legacy: no date available → full credit (don't penalise pre-Sprint-2 accounts)
    if (pending) {
      earned = 10;
      passed = true;
      detail = 'Tarih kaydı yok (tam puan)';
    }
    checks.push({
      id: 'recency',
      label: 'Son analiz tazeliği',
      weight: 10,
      earned,
      passed,
      pending,
      detail,
      action: 'Galeri analizini son 30 gün içinde tazeleyin.',
    });
  }

  // 5. Matcher avg ≥58 (last 20) — 20
  // When no match scores exist yet (new account / no production runs), treat as
  // "not yet measured" → give full credit so accounts can propose their first mission.
  {
    const sample = input.recentMatchScores ?? [];
    const pending = sample.length === 0;
    const avg = average(sample);
    const passed = pending || avg >= GIS_MATCHER_TARGET; // pending = assume OK
    const earned = pending ? 20 : clamp((avg / GIS_MATCHER_TARGET) * 20, 20);
    checks.push({
      id: 'matcher_avg',
      label: 'Eşleşme skoru ortalaması',
      weight: 20,
      earned,
      passed,
      pending,
      detail: pending ? 'Henüz ölçülmedi (tam puan)' : `${Math.round(avg)} / ${GIS_MATCHER_TARGET} (son ${sample.length})`,
      action: 'Birkaç üretim çalıştırın; düşük eşleşmeler için galeri etiketlerini zenginleştirin.',
    });
  }

  const score = clamp(checks.reduce((sum, c) => sum + c.earned, 0), 100);
  const missing = checks.filter((c) => !c.passed);
  return {
    score,
    checks,
    canPropose: score >= GIS_PROPOSE_THRESHOLD,
    canAutoProduce: score === 100,
    missing,
  };
}

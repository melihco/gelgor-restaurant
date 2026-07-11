/**
 * Brand gap analysis — mirrors Python detect_brand_gaps for UI preview.
 * Multi-tenant; no pilot UUID branches.
 */
import {
  BRS_MIN_CONTENT_PILLARS,
  BRS_MIN_DISCOVERY_CONFIDENCE,
  BRS_MIN_COVERAGE_RATIO,
  type BrandReadinessCheck,
} from '@/lib/brand-readiness';

export type BrandGapSeverity = 'block' | 'high' | 'medium' | 'low';

export interface BrandGapItem {
  id: string;
  label: string;
  severity: BrandGapSeverity;
  fix?: string;
}

export interface BrandGapAnalysisInput {
  description?: string | null;
  websiteSummary?: string | null;
  visualDna?: string | null;
  brandDna?: unknown;
  discoveryConfidence?: number;
  contentPillarCount?: number;
  defaultCtaCount?: number;
  usablePhotoCount?: number;
  analyzedPhotoCount?: number;
  readinessMissing?: BrandReadinessCheck[];
  productionProfileMissing?: Array<{ id: string; label: string }>;
}

const GENERIC_DESCRIPTION_MARKERS = [
  'local service business sektöründe',
  'brand — local service',
  'hizmet vermektedir.',
];

export function isCorruptedBrandDescription(description: string | null | undefined): boolean {
  const text = String(description ?? '').trim();
  if (text.length < 24) return true;
  const lower = text.toLowerCase();
  return GENERIC_DESCRIPTION_MARKERS.some((m) => lower.includes(m));
}

function brandDnaRichness(brandDna: unknown): string | null {
  if (!brandDna) return null;
  let data: Record<string, unknown> | null = null;
  if (typeof brandDna === 'string') {
    try {
      data = JSON.parse(brandDna) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof brandDna === 'object' && brandDna) {
    data = brandDna as Record<string, unknown>;
  }
  return typeof data?.data_richness === 'string' ? data.data_richness : null;
}

/** Merge Python gap list with BFF readiness signals for dashboard display. */
export function mergeBrandGapLists(
  pythonGaps: BrandGapItem[],
  input: BrandGapAnalysisInput,
): BrandGapItem[] {
  const seen = new Set(pythonGaps.map((g) => g.id));
  const out = [...pythonGaps];

  const add = (gap: BrandGapItem) => {
    if (seen.has(gap.id)) return;
    seen.add(gap.id);
    out.push(gap);
  };

  if (isCorruptedBrandDescription(input.description) && !input.websiteSummary?.trim()) {
    add({
      id: 'description_corrupt',
      label: 'Marka açıklaması generic — website özeti de yok',
      severity: 'high',
      fix: 'identity',
    });
  }

  const richness = brandDnaRichness(input.brandDna);
  if (!richness || richness === 'sparse') {
    add({
      id: 'brand_dna_sparse',
      label: 'Marka DNA zayıf veya üretilmedi',
      severity: 'high',
      fix: 'design',
    });
  }

  const discovery = input.discoveryConfidence ?? 0;
  if (discovery < BRS_MIN_DISCOVERY_CONFIDENCE) {
    add({
      id: 'discovery_low',
      label: `Keşif güven skoru düşük (${discovery}/${BRS_MIN_DISCOVERY_CONFIDENCE})`,
      severity: 'medium',
      fix: 'brand-analysis',
    });
  }

  const pillars = input.contentPillarCount ?? 0;
  if (pillars < BRS_MIN_CONTENT_PILLARS) {
    add({
      id: 'content_pillars_low',
      label: `İçerik sütunları yetersiz (${pillars}/${BRS_MIN_CONTENT_PILLARS})`,
      severity: 'medium',
      fix: 'content',
    });
  }

  const usable = input.usablePhotoCount ?? 0;
  const analyzed = input.analyzedPhotoCount ?? 0;
  if (usable > 0 && analyzed / usable < BRS_MIN_COVERAGE_RATIO) {
    add({
      id: 'gallery_coverage_low',
      label: `Galeri analiz kapsamı düşük (${analyzed}/${usable})`,
      severity: 'medium',
      fix: 'gallery',
    });
  }

  for (const check of input.readinessMissing ?? []) {
    if (check.passed) continue;
    add({
      id: `brs_${check.id}`,
      label: check.label,
      severity: check.weight >= 15 ? 'high' : 'medium',
      fix: check.fix,
    });
  }

  for (const item of input.productionProfileMissing ?? []) {
    add({
      id: `ppr_${item.id}`,
      label: item.label,
      severity: 'medium',
      fix: 'design',
    });
  }

  const severityRank: Record<BrandGapSeverity, number> = {
    block: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return out.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export function countActionableGaps(gaps: BrandGapItem[]): number {
  return gaps.filter((g) => g.severity !== 'low').length;
}

/** Gaps the complete-gaps pipeline can repair without manual Marka Analizi. */
export const AUTO_FIXABLE_GAP_IDS = new Set([
  'description_corrupt',
  'visual_dna_missing',
  'brand_dna_sparse',
  'service_profile_missing',
  'industry_calendar_stale',
  'content_pillars_low',
  'default_ctas_missing',
  'brand_theme_missing',
  'template_library_incomplete',
  'gallery_coverage_low',
]);

/** Gaps that need operator action (re-analyze, manual identity edit). */
export const MANUAL_GAP_IDS = new Set([
  'discovery_low',
  'vibe_profile_missing',
]);

export function countAutoFixableGaps(gaps: BrandGapItem[]): number {
  return gaps.filter((g) => AUTO_FIXABLE_GAP_IDS.has(g.id)).length;
}

export function formatCompleteGapsFeedback(input: {
  resolvedCount: number;
  steps?: Array<{ id: string; ok: boolean; detail?: string }>;
  gapsAfter?: BrandGapItem[];
}): string {
  const { resolvedCount, steps = [], gapsAfter = [] } = input;
  if (resolvedCount > 0) {
    return `${resolvedCount} eksik alan güncellendi — agent profili güçlendirildi.`;
  }

  const failed = steps.filter((s) => !s.ok);
  const needsOpenAi = failed.some((s) =>
    ['visual_dna', 'production_design_profile', 'brand_dna'].includes(s.id),
  );
  const needsAnalyze = (gapsAfter.some((g) => g.id === 'discovery_low')
    || failed.some((s) => s.id === 'discovery_reanalyze'));

  if (needsOpenAi && needsAnalyze) {
    return 'Bazı alanlar için OPENAI_API_KEY ve Marka Analizi (Kimlik) gerekli. Aşağıdaki manuel adımları tamamlayın.';
  }
  if (needsOpenAi) {
    return 'Marka DNA ve görsel profil için OPENAI_API_KEY gerekli. İçerik sütunları ve açıklama gibi alanlar güncellenmiş olabilir.';
  }
  if (needsAnalyze) {
    return 'Keşif skoru için Marka Ayarları → Kimlik bölümünden web/Instagram analizini yeniden çalıştırın.';
  }
  if (failed.length > 0) {
    const detail = failed.map((s) => s.detail || s.id).filter(Boolean).slice(0, 2).join('; ');
    return detail
      ? `Otomatik tamamlama kısmen başarısız: ${detail}`
      : 'Otomatik tamamlanacak kritik alan kalmadı veya veri yetersiz.';
  }
  return 'Kritik alanlar güncel — kalan maddeler manuel adım veya opsiyonel.';
}

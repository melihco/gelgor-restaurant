/**
 * AI maliyet kategorileri — backend token_billing_service.CATEGORY_LABELS_TR ile uyumlu.
 */
import { PLAN_API_UNIT_COSTS } from '@/lib/package-plan-config';

export const AI_COST_CATEGORY_LABELS: Record<string, string> = {
  auto_produce: 'Feed üretimi (görsel/video)',
  mission_propose: 'Mission önerisi',
  content_strategy: 'İçerik stratejisi',
  content_ideation: 'İçerik fikirleri',
  feed_art_director: 'Feed Art Director',
  scene_brief: 'Sahne yönetmeni',
  gpt_image_enhance: 'GPT fotoğraf iyileştirme',
  gallery_vision_analysis: 'Galeri vision analizi',
  market_intelligence: 'Pazar analizi',
  gallery_match: 'Galeri eşleştirme',
  standalone_reel: 'Bağımsız reel',
  other: 'Diğer',
};

/** Tahmini birim maliyetler (USD) — yeni misyon / görev için önizleme */
export const AI_UNIT_COST_USD: Record<string, number> = {
  mission_propose: PLAN_API_UNIT_COSTS.missionPropose,
  content_strategy: 0.20,
  content_ideation: 1.00,
  feed_art_director: 0.45,
  scene_brief: 0.15,
  gpt_image_enhance: 0.21,
  auto_produce: 0.55,
  gallery_vision_analysis: PLAN_API_UNIT_COSTS.galleryVisionAnalysis,
  standalone_reel: PLAN_API_UNIT_COSTS.standaloneReel,
};

export const MISSION_FULL_CYCLE_ESTIMATE_USD =
  PLAN_API_UNIT_COSTS.missionPropose
  + PLAN_API_UNIT_COSTS.missionProductionCycle;

export function categoryLabel(key: string, labels?: Record<string, string> | null): string {
  return labels?.[key] ?? AI_COST_CATEGORY_LABELS[key] ?? key;
}

export function formatUsd(amount: number): string {
  if (amount <= 0) return '—';
  if (amount < 0.01) return '<$0.01';
  return `$${amount.toFixed(2)}`;
}

export function formatUsdCompact(amount: number): string {
  if (amount <= 0) return '$0';
  if (amount < 1) return `$${amount.toFixed(2)}`;
  return `$${amount.toFixed(1)}`;
}

export function usdToTokens(amountUsd: number, markup = 10, tokenUsdValue = 0.01): number {
  if (amountUsd <= 0) return 0;
  return Math.max(1, Math.ceil((amountUsd * markup) / tokenUsdValue));
}

export function sortedCategoryEntries(
  totals: Record<string, number> | null | undefined,
): Array<[string, number]> {
  if (!totals) return [];
  return Object.entries(totals)
    .filter(([, v]) => v > 0.0001)
    .sort((a, b) => b[1] - a[1]);
}

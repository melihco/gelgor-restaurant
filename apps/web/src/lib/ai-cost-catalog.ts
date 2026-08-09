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

/**
 * fal.ai catalog unit estimates (USD) — used until fal REST returns settled `cost`.
 * Prefer model-specific overrides; fall back by request kind.
 */
const FAL_KIND_DEFAULT_USD: Record<'still' | 'video' | 'flux_sync', number> = {
  still: 0.05,
  video: 0.22,
  flux_sync: 0.04,
};

/** Substring match on fal model id → USD (longest match wins). */
const FAL_MODEL_COST_USD: Array<{ match: string; usd: number }> = [
  { match: 'kling-video/v3', usd: 0.225 },
  { match: 'kling-video/v1.6', usd: 0.25 },
  { match: 'kling-video', usd: 0.22 },
  { match: 'luma-dream-machine', usd: 0.10 },
  { match: 'minimax', usd: 0.20 },
  { match: 'ideogram/v3', usd: 0.06 },
  { match: 'ideogram', usd: 0.05 },
  { match: 'flux-pro', usd: 0.05 },
  { match: 'flux/', usd: 0.04 },
  { match: 'recraft', usd: 0.04 },
];

/** Catalog estimate for a fal queue/sync call — never invents zero for a real request. */
export function estimateFalModelUsd(
  model: string | null | undefined,
  kind: 'still' | 'video' | 'flux_sync' = 'still',
): number {
  const id = String(model ?? '').toLowerCase();
  let best: { len: number; usd: number } | null = null;
  for (const row of FAL_MODEL_COST_USD) {
    if (!id.includes(row.match)) continue;
    if (!best || row.match.length > best.len) {
      best = { len: row.match.length, usd: row.usd };
    }
  }
  if (best) return best.usd;
  return FAL_KIND_DEFAULT_USD[kind] ?? 0.05;
}

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

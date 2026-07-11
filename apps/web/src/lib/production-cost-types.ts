/**
 * Production cost types — shared between telemetry writers and admin panel readers.
 * Mirrors backend cost_events + rollups schema.
 */

export type CostEventScope =
  | 'mission_graph'
  | 'feed_slot'
  | 'integration'
  | 'gallery'
  | 'other';

export type PricingBasis =
  | 'measured_tokens'
  | 'provider_metered'
  | 'catalog_estimate'
  | 'manual';

export interface CostEventLineInput {
  category: string;
  amountUsd: number;
  missionId?: string | null;
  artifactId?: string | null;
  scope?: CostEventScope;
  callType?: string;
  slotKey?: string | null;
  ideaIndex?: number | null;
  slotRole?: string | null;
  pipeline?: string | null;
  attempt?: number;
  sourceSystem?: string;
  sourceRef?: string;
  provider?: string;
  model?: string;
  pricingBasis?: PricingBasis;
  tokensIn?: number;
  tokensOut?: number;
  cachedTokens?: number;
  externalRequestId?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface MissionSlotCostRollup {
  slot_key: string;
  idea_index?: number;
  slot_role?: string;
  pipeline?: string;
  artifact_id?: string;
  total_usd: number;
  measured_usd: number;
  estimated_usd: number;
  line_count: number;
  by_category: Record<string, number>;
  by_call_type: Record<string, number>;
  status: string;
  first_recorded_at?: string;
  last_recorded_at?: string;
}

export interface MissionCostRollup {
  mission_graph_usd: number;
  feed_slot_usd: number;
  integration_usd: number;
  gallery_usd: number;
  other_usd: number;
  total_usd: number;
  measured_usd: number;
  estimated_usd: number;
  event_count: number;
  slot_count: number;
  graph_by_category: Record<string, number>;
  feed_by_category: Record<string, number>;
  by_provider: Record<string, number>;
  first_recorded_at?: string;
  last_recorded_at?: string;
}

export interface MissionProductionCostSummary {
  workspace_id?: string;
  mission_id: string;
  rollup: MissionCostRollup | null;
  slots: MissionSlotCostRollup[];
  slot_count: number;
  event_count: number;
  total_usd: number;
  measured_usd: number;
  estimated_usd: number;
}

export interface WorkspaceProductionCostSummary {
  workspace_id: string;
  days: number;
  period_total_usd: number;
  period_measured_usd: number;
  period_estimated_usd: number;
  by_scope: Record<string, number>;
  daily_series: Array<{
    date: string;
    total_usd: number;
    measured_usd: number;
    estimated_usd: number;
  }>;
  top_missions: Array<{
    mission_id: string;
    total_usd: number;
    measured_usd: number;
    estimated_usd: number;
    slot_count: number;
    event_count: number;
    last_recorded_at?: string;
  }>;
}

export interface CostEventRecord {
  id: string;
  workspace_id: string;
  mission_id?: string;
  artifact_id?: string;
  recorded_at?: string;
  usage_date?: string;
  scope: CostEventScope;
  category: string;
  call_type?: string;
  slot_key?: string;
  idea_index?: number;
  slot_role?: string;
  pipeline?: string;
  attempt?: number;
  source_system?: string;
  provider?: string;
  model?: string;
  pricing_basis: PricingBasis;
  amount_usd: number;
  tokens_in?: number;
  tokens_out?: number;
  external_request_id?: string;
  metadata?: Record<string, unknown>;
}

/** Canonical slot key — matches Python `build_slot_key` / `missionGallerySlotKey`. */
export function buildProductionSlotKey(ideaIndex: number, slotRole: string): string {
  return `${ideaIndex}::${slotRole}`;
}

export function inferPricingBasis(input: {
  tokensIn?: number;
  tokensOut?: number;
  externalRequestId?: string | null;
  explicit?: PricingBasis;
}): PricingBasis {
  if (input.explicit) return input.explicit;
  if ((input.tokensIn ?? 0) > 0 || (input.tokensOut ?? 0) > 0) return 'measured_tokens';
  if (input.externalRequestId) return 'provider_metered';
  return 'catalog_estimate';
}

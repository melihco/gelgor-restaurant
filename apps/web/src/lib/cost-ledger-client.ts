/**
 * Immutable cost ledger client — persists mission + artifact line items to Python DB.
 * Used for admin pricing analytics; complements workspace_usage_daily rollups.
 */

import { getCrewBackendBaseUrl } from '@/lib/crew-backend-url';
import type {
  CostEventLineInput,
  CostEventRecord,
  MissionProductionCostSummary,
  WorkspaceProductionCostSummary,
} from '@/lib/production-cost-types';
import { buildProductionSlotKey, inferPricingBasis } from '@/lib/production-cost-types';

const CREW_BACKEND = getCrewBackendBaseUrl();
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';

export interface MissionCostLineInput {
  missionId: string;
  category: string;
  amountUsd: number;
  sourceSystem?: string;
  sourceRef?: string;
  provider?: string;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  cachedTokens?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface ArtifactCostLineInput {
  artifactId: string;
  category: string;
  amountUsd: number;
  missionId?: string | null;
  callType?: string;
  sourceSystem?: string;
  provider?: string;
  model?: string;
  slotRole?: string;
  ideaIndex?: number;
  pipeline?: string;
  attempt?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface MissionCostLedgerSummary {
  mission_id: string;
  workspace_id?: string;
  mission_graph_usd: number;
  feed_artifacts_usd: number;
  total_usd: number;
  measured_usd?: number;
  estimated_usd?: number;
  by_category: Record<string, number>;
  mission_graph_by_category: Record<string, number>;
  feed_by_category: Record<string, number>;
  rollup?: MissionProductionCostSummary['rollup'];
  slots?: MissionProductionCostSummary['slots'];
  slot_count?: number;
  event_count?: number;
  artifacts: Array<{
    artifact_id: string;
    total_usd: number;
    slot_role?: string;
    idea_index?: number;
    pipeline?: string;
    lines: Array<{ category: string; amount_usd: number; call_type?: string }>;
  }>;
  artifact_count: number;
  line_count: number;
}

/** Map production pipeline → ledger category for artifact rollup. */
export function ledgerCategoryForPipeline(pipeline: string | undefined | null): string {
  const p = String(pipeline ?? '').toLowerCase();
  if (p === 'local_typography' || p === 'satori_local') return 'local_typography';
  if (p.includes('fal_only') || p.includes('fal_reel') || p.includes('fal_story') || p === 'fal_design') {
    return 'fal_production';
  }
  if (p.includes('fal')) return 'fal_production';
  if (p.includes('carousel')) return 'carousel';
  if (p.includes('story_still')) return 'story_still';
  if (p.includes('gallery')) return 'gallery_post';
  if (p.includes('meta_ad')) return 'meta_ad';
  if (p.includes('google_ad')) return 'google_ad';
  return 'auto_produce';
}

export async function recordCostLedgerBatch(
  workspaceId: string,
  input: {
    missionLines?: MissionCostLineInput[];
    artifactLines?: ArtifactCostLineInput[];
    costEvents?: CostEventLineInput[];
  },
): Promise<void> {
  const missionLines = input.missionLines ?? [];
  const artifactLines = input.artifactLines ?? [];
  const costEvents = input.costEvents ?? [];
  if (!workspaceId || (missionLines.length === 0 && artifactLines.length === 0 && costEvents.length === 0)) return;

  try {
    await fetch(`${CREW_BACKEND}/api/v1/cost-ledger/${workspaceId}/ledger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Api-Key': INTERNAL_KEY,
        'X-Tenant-Id': workspaceId,
      },
      body: JSON.stringify({
        mission_lines: missionLines.map((l) => ({
          mission_id: l.missionId,
          category: l.category,
          amount_usd: l.amountUsd,
          source_system: l.sourceSystem ?? 'next_auto_produce',
          source_ref: l.sourceRef,
          provider: l.provider,
          model: l.model,
          tokens_in: l.tokensIn,
          tokens_out: l.tokensOut,
          cached_tokens: l.cachedTokens,
          idempotency_key: l.idempotencyKey,
          metadata: l.metadata ?? {},
        })),
        artifact_lines: artifactLines.map((l) => ({
          artifact_id: l.artifactId,
          mission_id: l.missionId ?? undefined,
          category: l.category,
          amount_usd: l.amountUsd,
          call_type: l.callType,
          source_system: l.sourceSystem ?? 'next_auto_produce',
          provider: l.provider,
          model: l.model,
          slot_role: l.slotRole,
          idea_index: l.ideaIndex,
          pipeline: l.pipeline,
          attempt: l.attempt ?? 0,
          idempotency_key: l.idempotencyKey,
          metadata: l.metadata ?? {},
        })),
        cost_events: costEvents.map((e) => ({
          mission_id: e.missionId ?? undefined,
          artifact_id: e.artifactId ?? undefined,
          category: e.category,
          amount_usd: e.amountUsd,
          scope: e.scope,
          call_type: e.callType,
          slot_key: e.slotKey ?? undefined,
          idea_index: e.ideaIndex ?? undefined,
          slot_role: e.slotRole ?? undefined,
          pipeline: e.pipeline ?? undefined,
          attempt: e.attempt ?? 0,
          source_system: e.sourceSystem ?? 'next_telemetry',
          source_ref: e.sourceRef,
          provider: e.provider,
          model: e.model,
          pricing_basis: e.pricingBasis,
          tokens_in: e.tokensIn,
          tokens_out: e.tokensOut,
          cached_tokens: e.cachedTokens,
          external_request_id: e.externalRequestId ?? undefined,
          idempotency_key: e.idempotencyKey,
          metadata: e.metadata ?? {},
        })),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    /* non-fatal — production must not fail on ledger write */
  }
}

/** Preferred SSOT write — lands directly in cost_events + rollups. */
export async function recordCostEvent(input: {
  workspaceId: string;
} & CostEventLineInput): Promise<void> {
  const { workspaceId, ...line } = input;
  if (!workspaceId || line.amountUsd <= 0) return;
  await recordCostLedgerBatch(workspaceId, { costEvents: [line] });
}

export async function recordArtifactProductionCost(input: {
  workspaceId: string;
  missionId?: string | null;
  artifactId: string;
  amountUsd: number;
  pipeline?: string;
  slotRole?: string;
  ideaIndex?: number;
  slotKey?: string;
  detail?: string;
  lines?: ArtifactCostLineInput[];
}): Promise<void> {
  if (!input.workspaceId || !input.artifactId || input.amountUsd <= 0) return;

  const category = ledgerCategoryForPipeline(input.pipeline ?? input.slotRole);
  const baseKey = input.slotKey ?? `${input.ideaIndex ?? 0}:${input.slotRole ?? 'slot'}`;

  const artifactLines: ArtifactCostLineInput[] = input.lines?.length
    ? input.lines
    : [{
      artifactId: input.artifactId,
      missionId: input.missionId ?? undefined,
      category,
      amountUsd: input.amountUsd,
      callType: category,
      sourceSystem: 'next_auto_produce',
      slotRole: input.slotRole,
      ideaIndex: input.ideaIndex,
      pipeline: input.pipeline,
      idempotencyKey: `artifact:${input.artifactId}:${baseKey}:rollup`,
      metadata: input.detail ? { detail: input.detail.slice(0, 160) } : {},
    }];

  await recordCostLedgerBatch(input.workspaceId, { artifactLines });
}

export async function fetchMissionCostLedgerSummary(
  workspaceId: string,
  missionId: string,
): Promise<MissionCostLedgerSummary | null> {
  try {
    const res = await fetch(
      `${CREW_BACKEND}/api/v1/cost-ledger/${workspaceId}/missions/${missionId}/summary`,
      {
        headers: { 'X-Tenant-Id': workspaceId },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<MissionCostLedgerSummary>;
  } catch {
    return null;
  }
}

export async function fetchMissionProductionCostSummary(
  workspaceId: string,
  missionId: string,
): Promise<MissionProductionCostSummary | null> {
  try {
    const res = await fetch(
      `${CREW_BACKEND}/api/v1/cost-ledger/${workspaceId}/missions/${missionId}/production`,
      {
        headers: { 'X-Tenant-Id': workspaceId },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<MissionProductionCostSummary>;
  } catch {
    return null;
  }
}

export async function fetchWorkspaceProductionCostSummary(
  workspaceId: string,
  days = 30,
): Promise<WorkspaceProductionCostSummary | null> {
  try {
    const res = await fetch(
      `${CREW_BACKEND}/api/v1/cost-ledger/${workspaceId}/workspace/summary?days=${days}`,
      {
        headers: { 'X-Tenant-Id': workspaceId },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    return res.json() as Promise<WorkspaceProductionCostSummary>;
  } catch {
    return null;
  }
}

export async function fetchMissionCostEvents(
  workspaceId: string,
  missionId: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ events: CostEventRecord[]; total: number } | null> {
  const limit = opts?.limit ?? 200;
  const offset = opts?.offset ?? 0;
  try {
    const res = await fetch(
      `${CREW_BACKEND}/api/v1/cost-ledger/${workspaceId}/missions/${missionId}/events?limit=${limit}&offset=${offset}`,
      {
        headers: { 'X-Tenant-Id': workspaceId },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json() as { events: CostEventRecord[]; total: number };
    return { events: data.events ?? [], total: data.total ?? 0 };
  } catch {
    return null;
  }
}

export { buildProductionSlotKey, inferPricingBasis };

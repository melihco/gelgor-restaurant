/**
 * P3 — Unified production run observability (profile, FD, tenant learning, run stats).
 * Written to mission.performance_summary.last_production_telemetry + auto-produce response.
 */
import type { ProductionProfileTier } from '@/lib/production-profile';
import { formatPublishScheduleLabel } from '@/lib/feed-publish-schedule';

export type TenantLearningTelemetryStatus = 'applied' | 'empty' | 'fetch_failed';

export interface TenantLearningTelemetry {
  status: TenantLearningTelemetryStatus;
  approved_count: number;
  rejected_count: number;
}

export interface FeedDirectorTelemetry {
  is_fallback: boolean;
  fallback_reason: string | null;
  verdict: string | null;
  feed_score: number | null;
}

export interface ProductionRunTelemetry {
  produced: number;
  publish_ready: number;
  rendering: number;
  withheld: number;
}

export interface MissionProductionTelemetry {
  profile_tier: ProductionProfileTier;
  hub_package: string | null;
  gis_score: number | null;
  feed_director: FeedDirectorTelemetry;
  tenant_learning: TenantLearningTelemetry;
  run: ProductionRunTelemetry;
  schedule: {
    artifacts_with_schedule: number;
    total_artifacts: number;
  };
  produced_at: string;
}

export interface TenantLearningSnapshot {
  prompt: string;
  status: TenantLearningTelemetryStatus;
  approved_count: number;
  rejected_count: number;
}

export function emptyTenantLearningSnapshot(): TenantLearningSnapshot {
  return {
    prompt: '',
    status: 'fetch_failed',
    approved_count: 0,
    rejected_count: 0,
  };
}

export function parseTenantLearningApiResponse(
  data: unknown,
  fetchOk: boolean,
): TenantLearningSnapshot {
  if (!fetchOk || !data || typeof data !== 'object') {
    return emptyTenantLearningSnapshot();
  }
  const d = data as Record<string, unknown>;
  const prompt = String(d.prompt ?? '').trim();
  const approved = Number(d.approved_count ?? 0) || 0;
  const rejected = Number(d.rejected_count ?? 0) || 0;
  const hasLearning = d.has_learning === true || prompt.length > 0;
  return {
    prompt,
    status: hasLearning ? 'applied' : 'empty',
    approved_count: approved,
    rejected_count: rejected,
  };
}

export function buildFeedDirectorTelemetry(
  report: Record<string, unknown> | null | undefined,
): FeedDirectorTelemetry {
  if (!report) {
    return {
      is_fallback: false,
      fallback_reason: null,
      verdict: null,
      feed_score: null,
    };
  }
  const feedScoreRaw = report.feed_score;
  return {
    is_fallback: report._fallback === true,
    fallback_reason: String(report._fallback_reason ?? '').trim() || null,
    verdict: String(report.art_director_verdict ?? '').trim() || null,
    feed_score: typeof feedScoreRaw === 'number' ? feedScoreRaw : null,
  };
}

export function buildMissionProductionTelemetry(input: {
  profileTier: ProductionProfileTier;
  hubPackage?: string | null;
  gisScore?: number | null;
  feedDirectorReport?: Record<string, unknown> | null;
  tenantLearning: TenantLearningSnapshot;
  run: ProductionRunTelemetry;
  scheduleArtifactsWithLabel?: number;
  scheduleArtifactsTotal?: number;
  producedAt?: string;
}): MissionProductionTelemetry {
  return {
    profile_tier: input.profileTier,
    hub_package: input.hubPackage?.trim() || null,
    gis_score: input.gisScore ?? null,
    feed_director: buildFeedDirectorTelemetry(input.feedDirectorReport),
    tenant_learning: {
      status: input.tenantLearning.status,
      approved_count: input.tenantLearning.approved_count,
      rejected_count: input.tenantLearning.rejected_count,
    },
    run: input.run,
    schedule: {
      artifacts_with_schedule: input.scheduleArtifactsWithLabel ?? 0,
      total_artifacts: input.scheduleArtifactsTotal ?? 0,
    },
    produced_at: input.producedAt ?? new Date().toISOString(),
  };
}

function isProfileTier(raw: unknown): raw is ProductionProfileTier {
  return raw === 'economy' || raw === 'agency' || raw === 'premium';
}

/** Read persisted telemetry from mission.performance_summary. */
export function telemetryFromPerformanceSummary(
  summary: Record<string, unknown> | null | undefined,
): MissionProductionTelemetry | null {
  const raw = summary?.last_production_telemetry;
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const fd = (t.feed_director ?? {}) as Record<string, unknown>;
  const tl = (t.tenant_learning ?? {}) as Record<string, unknown>;
  const run = (t.run ?? {}) as Record<string, unknown>;
  const sched = (t.schedule ?? {}) as Record<string, unknown>;
  if (!isProfileTier(t.profile_tier)) return null;
  const tlStatus = tl.status;
  const learningStatus: TenantLearningTelemetryStatus =
    tlStatus === 'applied' || tlStatus === 'empty' || tlStatus === 'fetch_failed'
      ? tlStatus
      : 'empty';
  return {
    profile_tier: t.profile_tier,
    hub_package: String(t.hub_package ?? '').trim() || null,
    gis_score: typeof t.gis_score === 'number' ? t.gis_score : null,
    feed_director: {
      is_fallback: fd.is_fallback === true,
      fallback_reason: String(fd.fallback_reason ?? '').trim() || null,
      verdict: String(fd.verdict ?? '').trim() || null,
      feed_score: typeof fd.feed_score === 'number' ? fd.feed_score : null,
    },
    tenant_learning: {
      status: learningStatus,
      approved_count: Number(tl.approved_count ?? 0) || 0,
      rejected_count: Number(tl.rejected_count ?? 0) || 0,
    },
    run: {
      produced: Number(run.produced ?? 0) || 0,
      publish_ready: Number(run.publish_ready ?? 0) || 0,
      rendering: Number(run.rendering ?? 0) || 0,
      withheld: Number(run.withheld ?? 0) || 0,
    },
    schedule: {
      artifacts_with_schedule: Number(sched.artifacts_with_schedule ?? 0) || 0,
      total_artifacts: Number(sched.total_artifacts ?? 0) || 0,
    },
    produced_at: String(t.produced_at ?? '').trim() || new Date().toISOString(),
  };
}

/** Compose telemetry from summary + FD node when last_production_telemetry not yet persisted. */
export function telemetryFromMissionProgress(input: {
  performanceSummary?: Record<string, unknown> | null;
  feedDirectorReport?: Record<string, unknown> | null;
  pipelineSummary?: { producedArtifacts?: number; publishReady?: number } | null;
}): MissionProductionTelemetry | null {
  const stored = telemetryFromPerformanceSummary(input.performanceSummary ?? null);
  if (stored) return stored;

  const summary = input.performanceSummary ?? {};
  const tier = summary.production_profile_tier;
  if (!isProfileTier(tier)) return null;

  return buildMissionProductionTelemetry({
    profileTier: tier,
    hubPackage: String(summary.hub_production_package ?? '').trim() || null,
    feedDirectorReport: input.feedDirectorReport,
    tenantLearning: {
      prompt: '',
      status: 'empty',
      approved_count: 0,
      rejected_count: 0,
    },
    run: {
      produced: input.pipelineSummary?.producedArtifacts ?? 0,
      publish_ready: input.pipelineSummary?.publishReady ?? 0,
      rendering: 0,
      withheld: 0,
    },
  });
}

export function describeTelemetryAlerts(telemetry: MissionProductionTelemetry): string[] {
  const alerts: string[] = [];
  if (telemetry.feed_director.is_fallback) {
    alerts.push(
      telemetry.feed_director.fallback_reason
        ? `Feed Art Director kullanılamadı — ${telemetry.feed_director.fallback_reason}`
        : 'Feed Art Director kullanılamadı — heuristik routing',
    );
  }
  if (telemetry.tenant_learning.status === 'fetch_failed') {
    alerts.push('Tenant learning yüklenemedi — onay/red geçmişi prompt\'a eklenmedi');
  }
  if (
    telemetry.tenant_learning.status === 'empty'
    && telemetry.tenant_learning.approved_count === 0
    && telemetry.tenant_learning.rejected_count === 0
  ) {
    alerts.push('Henüz onay/red öğrenme verisi yok');
  }
  return alerts;
}

export function hasTelemetryAlert(telemetry: MissionProductionTelemetry): boolean {
  return describeTelemetryAlerts(telemetry).length > 0;
}

/**
 * Production block — surfaced from mission.performance_summary.production_status,
 * written by the backend when feed production is deferred awaiting dependency nodes.
 * Lets Mission Hub explain *why* the feed has not been produced yet.
 */
export interface MissionProductionBlock {
  reason: string;
  awaitingNodes: string[];
  label: string;
  at: string | null;
}

const PRODUCTION_BLOCK_HEADINGS: Record<string, string> = {
  awaiting_other_ideation: 'İçerik fikirleri tamamlanıyor',
  awaiting_visual_design_cards: 'Görsel tasarım kartları bekleniyor',
  awaiting_content_calendar: 'Yayın takvimi hazırlanıyor',
};

export function parseMissionProductionBlock(
  summary: Record<string, unknown> | null | undefined,
): MissionProductionBlock | null {
  const raw = summary?.production_status;
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (String(s.state ?? '').trim() !== 'awaiting_dependencies') return null;
  const reason = String(s.reason ?? '').trim();
  if (!reason) return null;
  const awaitingNodes = Array.isArray(s.awaiting_nodes)
    ? s.awaiting_nodes.map((n) => String(n ?? '').trim()).filter(Boolean)
    : [];
  return {
    reason,
    awaitingNodes,
    label: PRODUCTION_BLOCK_HEADINGS[reason] ?? 'Feed üretimi bağımlılık bekliyor',
    at: String(s.at ?? '').trim() || null,
  };
}

export function countArtifactsWithScheduleLabel(
  artifacts: Array<{ metadata?: unknown }>,
): number {
  let count = 0;
  for (const art of artifacts) {
    const meta = (art.metadata ?? {}) as Record<string, unknown>;
    if (formatPublishScheduleLabel(meta)) count += 1;
  }
  return count;
}

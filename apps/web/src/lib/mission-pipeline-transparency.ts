/**
 * Mission Hub — planlama (AI node) vs üretim (artifact) vs Feed (yayına hazır) sayıları.
 * Faz 1: operatör şeffaflığı; pipeline davranışını değiştirmez.
 */
import { parseProductionIdeas } from '@/lib/production-idea-parse';
import { nodeHasOutput, nodeOutputArray, nodeOutputObject } from '@/lib/mission-node-output';
import { MISSION_WEEKLY_PACKAGE_COUNTS } from '@/lib/mission-production-manifest';
import {
  dedupeProductionBundles,
  parseArtifactMissionId,
} from '@/lib/production-bundle';
import { filterFeedPublishableArtifacts } from '@/lib/weekly-publish-package';
import { buildMissionPlanningDisplayIdeas } from '@/lib/mission-production-plan';
import type { MissionSlotChecklist } from '@/lib/mission-slot-checklist';
import type { OutputArtifact } from '@/types';
import {
  describeMissionArtifactQualityAlerts,
  summarizeMissionArtifactQuality,
  type MissionArtifactQualitySummary,
} from '@/lib/mission-artifact-quality';
import {
  buildFeedDirectorTelemetry,
  type MissionProductionTelemetry,
  telemetryFromMissionProgress,
  describeTelemetryAlerts,
  hasTelemetryAlert,
} from '@/lib/mission-production-telemetry';

type MissionNodeLike = {
  task_type?: string;
  output_summary?: string | null;
  output_payload?: unknown;
  status?: string;
};

/** Count items inside a completed mission node (planlama katmanı). */
export function countPlanningNodeResults(node: MissionNodeLike): number | null {
  if (!nodeHasOutput(node)) return null;

  // content_strategy is one weekly document (theme + brief + pillars), not N strategies.
  if (node.task_type === 'content_strategy') {
    const obj = nodeOutputObject(node);
    if (
      obj
      && (
        String(obj.weekly_theme ?? obj.theme ?? '').trim()
        || String(obj.mission_brief ?? obj.brief ?? '').trim()
        || Array.isArray(obj.pillar_mix)
      )
    ) {
      return 1;
    }
    return null;
  }

  const ideas = parseProductionIdeas(node.output_summary ?? '');
  if (ideas.length > 0) return ideas.length;
  const arr = nodeOutputArray(node, ['plans', 'calendar', 'items', 'content_calendar', 'schedule', 'ideas']);
  if (arr.length > 0) return arr.length;
  return null;
}

export interface MissionPlanningSummary {
  strategyTheme: string | null;
  ideas: number;
  designs: number;
  calendarPlans: number;
  slotPlanReady: boolean;
}

export function extractWeeklyThemeFromNodes(nodes: MissionNodeLike[]): string | null {
  const node = nodes.find((n) => n.task_type === 'content_strategy' && n.status === 'completed');
  const obj = nodeOutputObject(node);
  const theme = String(obj?.weekly_theme ?? obj?.theme ?? '').trim();
  return theme || null;
}

export function summarizeMissionPlanningOutputs(nodes: MissionNodeLike[]): MissionPlanningSummary {
  let ideas = 0;
  let designs = 0;
  let calendarPlans = 0;
  let slotPlanReady = false;

  for (const node of nodes) {
    if (node.status !== 'completed') continue;
    const cnt = countPlanningNodeResults(node);
    if (node.task_type === 'content_ideation' && cnt != null) ideas += cnt;
    if (node.task_type === 'visual_design_cards' && cnt != null) designs += cnt;
    if (node.task_type === 'content_calendar' && cnt != null) calendarPlans += cnt;
    if (node.task_type === 'feed_cohesion_review' && nodeHasOutput(node)) {
      slotPlanReady = true;
    }
  }

  const uniqueIdeation = buildMissionPlanningDisplayIdeas({
    nodes: nodes as Parameters<typeof buildMissionPlanningDisplayIdeas>[0]['nodes'],
  });
  if (uniqueIdeation.length > 0) {
    ideas = uniqueIdeation.length;
  }

  return {
    strategyTheme: extractWeeklyThemeFromNodes(nodes),
    ideas,
    designs,
    calendarPlans,
    slotPlanReady,
  };
}

export interface MissionProductionPipelineSummary {
  /** Haftalık paket hedefi (manifest) */
  productionTarget: number;
  /** Feed Art Director atama sayısı */
  plannedAssignments: number | null;
  /** Takvim satırı sayısı */
  plannedCalendarRows: number;
  /** auto-produce artifact (dedupe sonrası) */
  producedArtifacts: number;
  /** filterFeedPublishableArtifacts */
  publishReady: number;
  /** Manifest slot checklist — zorunlu hazır */
  manifestReady: number;
  manifestRequired: number;
  /** Son reproduce-feed produced sayısı */
  lastProduceRun: number | null;
}

export function isMissionProducedArtifact(artifact: OutputArtifact): boolean {
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  return meta.auto_produced === true
    || meta.production_bundle === true
    || meta.production_role != null
    || meta.ad_creative === true
    || meta.source === 'auto-produce'
    || meta.source === 'remotion';
}

/** Mission-scoped auto-produce outputs (includes rendering bundles). */
export function listMissionProducedArtifacts(
  artifacts: OutputArtifact[],
  missionId: string,
): OutputArtifact[] {
  return dedupeProductionBundles(
    artifacts.filter((a) => {
      if (parseArtifactMissionId(a) !== missionId) return false;
      return isMissionProducedArtifact(a);
    }),
  );
}

export function countMissionProducedArtifacts(
  artifacts: OutputArtifact[],
  missionId: string,
): number {
  return listMissionProducedArtifacts(artifacts, missionId).length;
}

export function summarizeMissionProductionPipeline(input: {
  artifacts: OutputArtifact[];
  missionId: string;
  checklist: MissionSlotChecklist | null;
  planning: MissionPlanningSummary;
  fdAssignmentCount?: number | null;
  lastFeedProduced?: number | null;
}): MissionProductionPipelineSummary {
  const producedArtifacts = countMissionProducedArtifacts(input.artifacts, input.missionId);
  const publishReady = filterFeedPublishableArtifacts(
    input.artifacts.filter((a) => parseArtifactMissionId(a) === input.missionId),
  ).length;

  const manifestRequired = input.checklist?.requiredTotal ?? MISSION_WEEKLY_PACKAGE_COUNTS.total;
  const fdSlots = input.fdAssignmentCount ?? null;
  // Hedef: her zaman manifest zorunlu slot sayısı (7). FD atama sayısı bilgi amaçlı.
  const productionTarget = manifestRequired;

  return {
    productionTarget,
    plannedAssignments: fdSlots,
    plannedCalendarRows: input.planning.calendarPlans,
    producedArtifacts,
    publishReady,
    manifestReady: input.checklist?.readyRequired ?? 0,
    manifestRequired,
    lastProduceRun: input.lastFeedProduced ?? null,
  };
}

export type {
  MissionArtifactQualitySummary,
} from '@/lib/mission-artifact-quality';

export type {
  MissionProductionTelemetry,
  TenantLearningTelemetry,
  FeedDirectorTelemetry,
} from '@/lib/mission-production-telemetry';

export {
  telemetryFromMissionProgress,
  describeTelemetryAlerts,
  hasTelemetryAlert,
};

/** @deprecated Use buildFeedDirectorTelemetry — kept for existing imports */
export interface FeedDirectorTransparency {
  isFallback: boolean;
  fallbackReason: string | null;
  verdict: string | null;
  feedScore: number | null;
  productionPackage: string | null;
}

export function parseFeedDirectorTransparency(
  report: Record<string, unknown> | null | undefined,
): FeedDirectorTransparency {
  const fd = buildFeedDirectorTelemetry(report);
  return {
    isFallback: fd.is_fallback,
    fallbackReason: fd.fallback_reason,
    verdict: fd.verdict,
    feedScore: fd.feed_score,
    productionPackage: String(report?.production_package ?? '').trim() || null,
  };
}

/** Operatör banner — sessiz skip / hata / render gecikmesi */
export function summarizeMissionProductionSkipAlerts(input: {
  checklist: MissionSlotChecklist | null;
  fdReport: Record<string, unknown> | null | undefined;
  pipeline: MissionProductionPipelineSummary | null;
  productionPis?: { skipped?: number; warnings?: unknown[] } | null;
  tenantLearningStatus?: 'applied' | 'empty' | 'fetch_failed' | null;
  fdRawAssignmentCount?: number | null;
  artifacts?: OutputArtifact[];
  missionId?: string | null;
}): string[] {
  const alerts: string[] = [];
  const checklist = input.checklist;
  if (checklist) {
    if (checklist.failedCount > 0) {
      alerts.push(`${checklist.failedCount} slot hata — retry veya yeniden üret`);
    }
    const missingRequired = checklist.items.filter(
      (i) => i.required && (i.status === 'missing' || i.status === 'failed'),
    ).length;
    if (missingRequired > 0 && checklist.renderingCount === 0) {
      alerts.push(`${missingRequired} zorunlu slot eksik`);
    }
    if (checklist.renderingCount > 0) {
      alerts.push(`${checklist.renderingCount} slot render bekliyor`);
    }
  }
  if (input.pipeline && input.pipeline.producedArtifacts > input.pipeline.publishReady) {
    const pending = input.pipeline.producedArtifacts - input.pipeline.publishReady;
    if (pending > 0 && !alerts.some((a) => a.includes('render'))) {
      alerts.push(`${pending} artifact üretildi ama henüz Feed'de görünmüyor`);
    }
  }
  const pisSkipped = Number(input.productionPis?.skipped ?? 0);
  if (pisSkipped > 0) {
    alerts.push(`Kalite kapısı (PIS) ${pisSkipped} slot atladı`);
  }
  const flagged = Array.isArray(input.fdReport?.flagged_ideas)
    ? input.fdReport!.flagged_ideas as Array<{ severity?: string; reason?: string; index?: number }>
    : [];
  const fdErrors = flagged.filter((f) => f.severity === 'error');
  if (fdErrors.length > 0) {
    alerts.push(`Feed Director ${fdErrors.length} fikri hata olarak işaretledi`);
  }
  if (input.fdReport?._fallback === true) {
    const reason = String(input.fdReport._fallback_reason ?? '').trim();
    alerts.push(reason
      ? `Feed Director fallback — ${reason}`
      : 'Feed Director fallback — heuristik routing');
  }
  const rawFd = input.fdRawAssignmentCount;
  if (
    rawFd != null
    && rawFd > 0
    && rawFd < MISSION_WEEKLY_PACKAGE_COUNTS.total
    && input.fdReport?.production_assignments
  ) {
    alerts.push(`FD ham atama ${rawFd}/7 — sunucu manifest backfill uyguladı`);
  }
  if (input.tenantLearningStatus === 'fetch_failed') {
    alerts.push('Tenant learning yüklenemedi — onay/red geçmişi üretim prompt\'una eklenmeyebilir');
  }
  if (input.missionId && input.artifacts?.length) {
    const quality = summarizeMissionArtifactQuality(input.artifacts, input.missionId);
    alerts.push(...describeMissionArtifactQualityAlerts(quality));
  }
  return alerts;
}

/** Kısa açıklama — planlama vs Feed farkı */
export function describeMissionPipelineGap(
  planning: MissionPlanningSummary,
  pipeline: MissionProductionPipelineSummary,
): string | null {
  const planningTotal = planning.ideas + planning.designs + planning.calendarPlans;
  if (planningTotal === 0 && pipeline.publishReady === 0) return null;

  if (pipeline.publishReady < pipeline.productionTarget) {
    const parts: string[] = [];
    if (planning.ideas > 0) {
      parts.push(`${planning.ideas} fikir planlandı (planlama metni; otomatik üretim slot planına bağlı)`);
    }
    if (planning.calendarPlans > 0) {
      parts.push(`${planning.calendarPlans} takvim satırı`);
    }
    if (
      pipeline.plannedAssignments != null
      && pipeline.plannedAssignments < MISSION_WEEKLY_PACKAGE_COUNTS.total
    ) {
      parts.push(
        `Feed Director ${pipeline.plannedAssignments} slot atadı (standart paket ${MISSION_WEEKLY_PACKAGE_COUNTS.total})`,
      );
    }
    parts.push(`hedef ${pipeline.productionTarget} zorunlu slot (manifest)`);
    if (pipeline.producedArtifacts > pipeline.publishReady) {
      parts.push(`${pipeline.producedArtifacts - pipeline.publishReady} çıktı render bekliyor`);
    }
    return `${parts.join(' · ')} — Feed'de ${pipeline.publishReady} yayına hazır.`;
  }
  return null;
}

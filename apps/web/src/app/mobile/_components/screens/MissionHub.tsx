'use client';
/**
 * MISSION HUB — Autonomous campaign command centre.
 *
 * Three live sections:
 *   1. Onay Bekliyor    — proposed missions (approve / reject with one tap)
 *   2. Aktif Kampanyalar — approved + in_flight (progress bar, node dots, cancel)
 *   3. Tamamlananlar   — last 5 completed missions
 *
 * "Yeni Misyon Öner" button calls POST /missions/propose — triggers the
 * StrategistAgent (30–90s); shows a pulsing loading state with timeout message.
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import type { T } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '../auth-store';
import { apiClient, type WorkspaceUsageSummary, type MissionProductionJobsSummary } from '@/lib/api-client';
import { AiCostBreakdownCard } from '../AiCostBreakdownCard';
import { MobileBrandAutoFill } from '../MobileBrandAutoFill';
import { BrandLoadingScreen } from '../BrandLoadingScreen';
import type { MissionSummary, MissionProgress, MissionNodeProgress } from '@/types';
import { BRS_PROPOSE_THRESHOLD, type BrandReadinessResult, type ProductionProfileReadinessResult, PRODUCTION_PROFILE_THRESHOLD } from '@/lib/brand-readiness';
import { humanizeAgentError } from '@/lib/humanize-agent-error';
import { parseProductionIdeas, productionIdeasFromParsed, resolveIdeationHeadline } from '@/lib/production-idea-parse';
import { productionSnapshotToLegacyBrandContext } from '@/lib/production-snapshot-compat';
import { getTenantBffHeaders } from '@/lib/runtime-config';
import { computeIdeaContractScore } from '@/types/production-idea';
import type { SignalRecord } from '@/lib/context-signals';
import { computeMissionDiversity, buildDiversityDirective } from '@/lib/mission-diversity';
import { isDebugUiMode, isMobileOperatorMode } from '../mobile-client-config';
import { isProductionLimitsBypassed } from '@/lib/production-budget-policy';
import {
  buildProductionPackageDirective,
  getMissionProductionPackage,
  missionProductionPackageLabel,
  parseHubProductionPackage,
  setMissionProductionPackage,
  type MissionProductionPackage,
} from '@/lib/mission-production-prefs';
import {
  summarizeMissionFeedPackage,
  formatMissionFeedPackageLabel,
  resolveMissionSlotProgress,
  type MissionFeedPackage,
} from '@/lib/mission-feed-package';
import {
  buildMissionSlotChecklist,
  extractFeedDirectorReportFromNodes,
  formatSlotChecklistSummary,
  slotStatusLabel,
  type MissionSlotChecklist,
  type SlotDeliveryStatus,
} from '@/lib/mission-slot-checklist';
import { summarizeAiEnhanceItems } from '@/lib/ai-enhance-ui-labels';
import {
  buildWeeklySelectionFromMissionNodes,
  filterCohesionNotesForAssignments,
  countPublishScheduleEntries,
  filterFeedPublishableArtifacts,
  formatWeeklyPackageSummary,
  formatWeeklyPackageTarget,
  reconcileArtDirectorVerdict,
  resolveFeedDirectorFormatDistribution,
  slotRoleToPackageFormat,
  type WeeklyPublishSelection,
  type FormatDistribution,
} from '@/lib/weekly-publish-package';
import { filterArtifactsForMission, parseArtifactMissionId } from '@/lib/mission-feed-package';
import { MISSION_WEEKLY_PACKAGE_COUNTS } from '@/lib/mission-production-manifest';
import { isFeedProductionLockActive } from '@/lib/mission-production-guard';
import {
  nodeHasOutput,
  nodeOutputArray,
  nodeOutputObject,
  nodeOutputText,
} from '@/lib/mission-node-output';
import {
  countMissionProducedArtifacts,
  countPlanningNodeResults,
  describeMissionPipelineGap,
  summarizeMissionPlanningOutputs,
  summarizeMissionProductionSkipAlerts,
  summarizeMissionProductionPipeline,
  type MissionProductionPipelineSummary,
} from '@/lib/mission-pipeline-transparency';
import { buildMissionPlanningDisplayIdeas, buildMissionProductionIdeas, summarizeMissionContentProductionStatus } from '@/lib/mission-production-plan';
import {
  summarizeMissionStrategistKpi,
  type MissionStrategistKpiSummary,
} from '@/lib/mission-strategist-kpi';
import {
  telemetryFromMissionProgress,
  describeTelemetryAlerts,
  parseMissionProductionBlock,
} from '@/lib/mission-production-telemetry';
import {
  describeStoryAudioPolicy,
  parseMotionProfileFromTheme,
} from '@/lib/brand-motion-profile';
import {
  collectMissionPreviewArtifacts,
} from '../MissionFeedPreviewGrid';
import { filterMissionRenderRetryArtifacts, filterMissionRemotionStoryRetryArtifacts } from '@/lib/mission-render-retry';
import type { OutputArtifact } from '@/types';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import { useMissionProgress } from '../../_hooks/use-mission-progress';
import {
  invalidateMobileArtifactPool,
  MOBILE_ARTIFACT_MISSION_POOL_LIMIT,
} from '../../_lib/mobile-artifacts';
import {
  isMissionFeedProductionActive,
  shouldPollCompletedMissionFeed,
} from '../../_lib/mobile-mission-progress';
import { mobileQueryDefaults } from '../../_lib/mobile-query';
import {
  linkCalendarItemsToArtifacts,
  linkPlanningItemsToArtifacts,
  resolveArtifactHubPreviewUrl,
  planningItemReferenceUrl,
  CALENDAR_STATUS_TR,
  type CalendarItemLink,
} from '@/lib/content-calendar-artifact-link';
import { resolveClientMediaUrl } from '@/lib/media-url';
import { resolveStoryVideoUrl } from '@/lib/production-bundle';
import { resolveArtifactProductionBadge } from '@/lib/artifact-production-badge';
import { SafeCoverImage } from '../SafeCoverImage';
import { formatUsd } from '@/lib/ai-cost-catalog';
import { missionFeedStatusLabel, formatMobileContentTypeLabel } from '@/lib/mobile-customer-copy';
import { missionProductionStatusCopy } from '@/lib/mission-production-status';
import { useMissionFactoryJobs } from '../../_lib/use-mission-factory-jobs';
import {
  buildMissionAiCostSummary,
  formatMissionAiCostRange,
  type MissionAiCostSummary,
} from '@/lib/mission-ai-cost';

interface BasSubScore {
  id: string;
  label: string;
  score: number | null;
  kind: 'standing' | 'runtime';
  fix: string;
}
interface BrandAlignmentData {
  bas: number;
  canProposeMissions: boolean;
  canAutoProduce: boolean;
  subScores: BasSubScore[];
  weakest: { id: string; label: string; score: number | null; fix: string } | null;
}

interface ContextSignalsData {
  signals: SignalRecord[];
  coverageScore: number;
  activeThisWeek: number;
  sectorPack: { id: string; label: string };
  promptBlock: string;
}

// ── Task type → customer-facing label + icon ──────────────────────────────────
const TASK_META: Record<string, { label: string; icon: string; color: string; resultNoun: string }> = {
  content_strategy:        { label: 'Haftalık İçerik Stratejisi',  icon: '🗺',  color: '#8AABBD', resultNoun: 'strateji' },
  content_ideation:        { label: 'İçerik Fikirleri',            icon: '💡',  color: '#F59E0B', resultNoun: 'fikir' },
  content_calendar:        { label: 'Yayın Takvimi',               icon: '📅',  color: '#10B981', resultNoun: 'plan' },
  visual_design_cards:     { label: 'Görsel Tasarım Önerileri',    icon: '🎨',  color: '#EC4899', resultNoun: 'tasarım' },
  review_analysis:         { label: 'Yorum Analizi',               icon: '⭐',  color: '#F59E0B', resultNoun: 'analiz' },
  single_review_response:  { label: 'Yorum Yanıtları',             icon: '💬',  color: '#10B981', resultNoun: 'yanıt' },
  traffic_analysis:        { label: 'Trafik Analizi',              icon: '📊',  color: '#3B82F6', resultNoun: 'rapor' },
  conversion_report:       { label: 'Dönüşüm Raporu',              icon: '📈',  color: '#10B981', resultNoun: 'rapor' },
  weekly_performance:      { label: 'Haftalık Performans',         icon: '📉',  color: '#8AABBD', resultNoun: 'rapor' },
  campaign_analysis:       { label: 'Kampanya Analizi',            icon: '🎯',  color: '#F59E0B', resultNoun: 'analiz' },
  ad_creative_generation:  { label: 'Reklam Metinleri',            icon: '📢',  color: '#EF4444', resultNoun: 'reklam' },
  auto_budget_optimize:    { label: 'Bütçe Optimizasyonu',         icon: '💰',  color: '#10B981', resultNoun: 'öneri' },
  ads_budget_optimization: { label: 'Reklam Bütçesi',              icon: '💰',  color: '#10B981', resultNoun: 'öneri' },
  mission_planning:        { label: 'Misyon Planlaması',            icon: '🚀',  color: '#8AABBD', resultNoun: 'plan' },
  workspace_intelligence:  { label: 'İş Zekâsı Raporu',           icon: '🧠',  color: '#3B82F6', resultNoun: 'rapor' },
  feed_cohesion_review:    { label: 'Feed uyumu ve slot planı',      icon: '🎬',  color: '#10B981', resultNoun: 'slot' },
  product_scene_brief:     { label: 'Ürün Sahne Yönetmeni',        icon: '📸',  color: '#8AABBD', resultNoun: 'brief' },
};

function taskMeta(taskType: string) {
  return TASK_META[taskType] ?? { label: taskType.replace(/_/g, ' '), icon: '✦', color: '#8AABBD', resultNoun: 'çıktı' };
}

/** Hub satır başlığı — DB'deki strategist title; teknik FD adını müşteri etiketine çevirir. */
function displayNodeTitle(node: MissionNodeProgress): string {
  const raw = (node.title ?? '').trim();
  const meta = TASK_META[node.task_type];
  if (/feed art director|slot atama/i.test(raw) || node.task_type === 'feed_cohesion_review') {
    return meta?.label ?? 'Feed uyumu ve slot planı';
  }
  return raw || meta?.label || node.node_key;
}

/** Count ideas / items inside a node output for the result badge */
function countNodeResults(node: MissionNodeProgress, allNodes?: MissionNodeProgress[]): number | null {
  if (node.task_type === 'feed_cohesion_review') {
    if (allNodes?.length) {
      const ideationIdeas = buildMissionPlanningDisplayIdeas({ nodes: allNodes });
      if (ideationIdeas.length > 0) return ideationIdeas.length;
    }
    const report = nodeOutputObject(node);
    const assignments = report?.production_assignments;
    if (Array.isArray(assignments) && assignments.length > 0) {
      return assignments.length;
    }
  }
  if (node.task_type === 'content_ideation' && allNodes?.length) {
    const planningIdeas = buildMissionPlanningDisplayIdeas({ nodes: allNodes });
    if (planningIdeas.length > 0) return planningIdeas.length;
  }
  return countPlanningNodeResults(node);
}

/**
 * Idea Contract Score (ICS) for a content_ideation node — average per-idea
 * completeness (0..100). Surfaces parse loss / missing fields right in the Hub.
 * Returns null when the node has no parseable ideas.
 */
function computeNodeIcs(node: MissionNodeProgress): number | null {
  const ideas = parseProductionIdeas(node.output_summary ?? '');
  const parsedIdeas = ideas.length > 0 ? ideas : productionIdeasFromParsed(nodeOutputArray(node));
  if (parsedIdeas.length === 0) return null;
  const total = parsedIdeas.reduce((sum, idea) => sum + computeIdeaContractScore(idea).score, 0);
  return Math.round(total / parsedIdeas.length);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'Az önce';
  if (m < 60) return `${m} dk`;
  if (m < 1440) return `${Math.floor(m / 60)} sa`;
  return `${Math.floor(m / 1440)} gün`;
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high:     '#F59E0B',
  medium:   '#9DBECE',
  low:      '#60A5FA',
};

const TYPE_LABEL: Record<string, string> = {
  seasonal:    '🌤 Sezonsal',
  opportunity: '⚡ Fırsat',
  competitive: '🏆 Rekabet',
  recovery:    '↑ Toparlanma',
  manual:      '✎ Manuel',
};

const STATUS_DOT: Record<string, string> = {
  completed: '#10B981',
  running:   '#F59E0B',
  pending:   'rgba(160,160,180,0.3)',
  failed:    '#EF4444',
  skipped:   'rgba(120,120,140,0.3)',
};

// ── Progress ring WITH % number inside ───────────────────────────────────────

function ProgressRing({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) {
  const r    = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(pct, 100) / 100);
  const cx   = size / 2;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke="rgba(160,160,180,0.12)" strokeWidth={4} />
      {/* Progress arc — starts at 12 o'clock */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      {/* % label in center */}
      <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={pct === 100 ? 11 : 12} fontWeight="800"
        fontFamily="-apple-system,SF Pro Display,system-ui,sans-serif">
        {pct === 100 ? '✓' : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}

// ── Node rows — isimli, durumlu görev listesi ────────────────────────────────

function friendlyError(raw: string): string {
  const msg = raw.replace(/^\[(Final|Attempt \d+)\]\s*/, '');
  if (msg.startsWith("Task '") || msg.startsWith("The task '")) {
    return 'İçerik fikirleri üretilemedi (LLM görevi tamamlanamadı).';
  }
  const human = humanizeAgentError(msg);
  if (human) {
    if (human.title === 'OpenAI kotası') return `⚡ ${human.summary}`;
    if (human.title === 'İstek limiti') return `⏱ ${human.summary} (429 — kota değil, kısa bekleyip yeniden dene)`;
    if (human.title === 'API anahtarı') return `🔑 ${human.summary}`;
    if (human.title === 'Zaman aşımı') return `⏱ ${human.summary}`;
    return human.summary;
  }
  if (msg.includes('timed out') || msg.includes('TimeoutError'))
    return '⏱ Zaman aşımı — daha sonra tekrar dene';
  if (msg.includes('API_KEY') || msg.includes('api_key'))
    return '🔑 API anahtarı eksik veya geçersiz';
  return msg.slice(0, 120) || 'Bilinmeyen hata';
}

const NODE_STATUS_UI: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  pending:   { icon: '○', color: '#8080A0', bg: 'rgba(128,128,160,0.10)', label: 'Bekliyor' },
  running:   { icon: '◉', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: 'Çalışıyor' },
  completed: { icon: '✓', color: '#10B981', bg: 'rgba(16,185,129,0.10)', label: 'Tamamlandı' },
  failed:    { icon: '✕', color: '#EF4444', bg: 'rgba(239,68,68,0.10)',  label: 'Başarısız' },
  skipped:   { icon: '—', color: '#707090', bg: 'rgba(112,112,144,0.08)', label: 'Atlandı' },
};

function NodeRows({ nodes }: { nodes: MissionProgress['nodes'] }) {
  const { t } = useTheme();
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const sorted = [...nodes].sort((a, b) => a.phase_index - b.phase_index || a.node_key.localeCompare(b.node_key));

  function toggleError(key: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {sorted.map((n, i) => {
        const ui = (NODE_STATUS_UI[n.status] ?? NODE_STATUS_UI['pending'])!;
        const isRunning = n.status === 'running';
        const isFailed  = n.status === 'failed';
        const isLast    = i === sorted.length - 1;

        return (
          <div key={n.node_key} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            paddingBottom: isLast ? 0 : 10,
            position: 'relative',
          }}>
            {/* Connector line */}
            {!isLast && (
              <div style={{
                position: 'absolute', left: 9, top: 20, bottom: 0, width: 1,
                background: 'rgba(160,160,180,0.15)',
              }} />
            )}

            {/* Status icon — uses explicit bg instead of hex-concat */}
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              background: ui.bg,
              border: `1.5px solid ${ui.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: ui.color, fontWeight: 800, zIndex: 1,
              animation: isRunning ? 'breathe 1.4s ease-in-out infinite' : 'none',
              boxShadow: isRunning ? `0 0 8px ${ui.color}` : 'none',
            }}>
              {ui.icon}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: isRunning ? 700 : 600,
                  color: isRunning ? t.textPrimary : isFailed ? '#EF4444' : t.textSecondary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1 }}>
                  {displayNodeTitle(n)}
                </span>
                <span style={{ fontSize: 10, color: ui.color, fontWeight: 600, flexShrink: 0 }}>
                  {ui.label}
                </span>
              </div>

              {/* Running indicator */}
              {isRunning && (
                <div style={{ marginTop: 4, height: 2, borderRadius: 1,
                  background: 'rgba(245,158,11,0.12)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: '40%', borderRadius: 1,
                    background: '#F59E0B',
                    animation: 'shimmer 1.8s ease-in-out infinite',
                  }} />
                </div>
              )}

              {/* Error message — expandable, with copy + full text */}
              {isFailed && n.error_message && (() => {
                const isOpen = expandedErrors.has(n.node_key);
                const raw = n.error_message;
                const short = friendlyError(raw);
                const hasMore = raw.length > 100 || short !== raw;
                return (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: 'rgba(239,100,100,0.85)', lineHeight: 1.4 }}>
                      {short}
                    </div>
                    {hasMore && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button onClick={() => toggleError(n.node_key)}
                          aria-expanded={isOpen}
                          style={{ fontSize: 10, padding: 0, background: 'none',
                            border: 'none', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}>
                          {isOpen ? 'Daralt' : 'Tüm hatayı gör'}
                        </button>
                        <button onClick={() => navigator.clipboard.writeText(raw).catch(() => {})}
                          aria-label="Hatayı kopyala"
                          style={{ fontSize: 10, padding: 0, background: 'none',
                            border: 'none', color: 'rgba(239,100,100,0.75)', fontWeight: 600, cursor: 'pointer' }}>
                          Kopyala
                        </button>
                      </div>
                    )}
                    {isOpen && (
                      <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.18)',
                        fontSize: 11, color: t.textSecondary, lineHeight: 1.5,
                        wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {raw}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── InFlightCard — progress via shared useMissionProgress (single poll owner) ──

function InFlightCard({ mission, workspaceId, onCancel, onRestart, onKickFeedProduction, onTapCompleted, isRestarting, isKickingFeed, detailOpen }: {
  mission: MissionSummary;
  workspaceId: string;
  onCancel: (id: string) => void;
  onRestart: (id: string) => void;
  onKickFeedProduction?: (id: string) => void;
  onTapCompleted?: () => void;
  isRestarting?: boolean;
  isKickingFeed?: boolean;
  /** Detail sheet open for this mission — card subscribes only, no duplicate /progress polls. */
  detailOpen?: boolean;
}) {
  const { t } = useTheme();
  const debugMode = isDebugUiMode();
  const pColor = PRIORITY_COLOR[mission.priority] ?? t.accent;
  const missionInFlight = mission.status === 'in_flight' || mission.status === 'approved';

  const missionActive = missionInFlight;
  const isFailedCompletedPreview =
    mission.status === 'completed' && (mission.failed_nodes ?? 0) > 0;
  const shouldLoadProgress = missionActive || isFailedCompletedPreview;

  const { data: prog } = useMissionProgress({
    workspaceId,
    missionId: mission.id,
    missionStatus: mission.status,
    enabled: shouldLoadProgress,
    poll: missionActive && !detailOpen,
  });

  const ideationDone = (prog?.nodes ?? []).some(
    (n) => n.task_type === 'content_ideation' && n.status === 'completed',
  );
  const visualDesignNodes = (prog?.nodes ?? []).filter(
    (n) => n.task_type === 'visual_design_cards',
  );
  const visualDesignPending = ideationDone
    && visualDesignNodes.length > 0
    && visualDesignNodes.some(
      (n) => n.status !== 'completed' || !nodeHasOutput(n),
    );
  const calendarNodes = (prog?.nodes ?? []).filter((n) => n.task_type === 'content_calendar');
  const calendarPending = ideationDone
    && calendarNodes.length > 0
    && calendarNodes.some(
      (n) => n.status !== 'completed' || !nodeHasOutput(n),
    );
  const feedPrepPending = visualDesignPending || calendarPending;
  const productionBlock = parseMissionProductionBlock(
    prog?.performance_summary as Record<string, unknown> | undefined,
  );

  const { data: artifactPool = [] } = useMobileArtifacts({
    params: { limit: MOBILE_ARTIFACT_MISSION_POOL_LIMIT },
    enabled: ideationDone,
    subscribeOnly: true,
  });
  const missionArtifacts = useMemo(
    () => filterArtifactsForMission(artifactPool, mission.id),
    [artifactPool, mission.id],
  );

  const feedPublishableCount = useMemo(
    () => filterFeedPublishableArtifacts(
      missionArtifacts.filter((a) => parseArtifactMissionId(a) === mission.id),
    ).length,
    [missionArtifacts, mission.id],
  );

  const feedProducedCount = useMemo(
    () => countMissionProducedArtifacts(missionArtifacts, mission.id),
    [missionArtifacts, mission.id],
  );

  const lastFeedProduced = Number(
    (prog?.performance_summary as { last_feed_produce?: { produced?: number } } | undefined)
      ?.last_feed_produce?.produced ?? 0,
  );
  const inFlightSlotChecklist = useMemo(() => {
    const fd = extractFeedDirectorReportFromNodes(prog?.nodes ?? []);
    return buildMissionSlotChecklist({
      missionId: mission.id,
      missionType: mission.type,
      missionTitle: mission.title,
      assignments: fd?.production_assignments,
      artifacts: missionArtifacts,
      missionInFlight,
    });
  }, [mission.id, mission.type, mission.title, missionInFlight, missionArtifacts, prog?.nodes]);

  const contentProductionStatus = useMemo(
    () => summarizeMissionContentProductionStatus({
      nodes: prog?.nodes ?? [],
      missionId: mission.id,
      artifacts: missionArtifacts,
      missionInFlight,
    }),
    [prog?.nodes, mission.id, missionArtifacts, missionInFlight],
  );

  const feedTarget = contentProductionStatus.requiredTotal > 0
    ? contentProductionStatus.requiredTotal
    : MISSION_WEEKLY_PACKAGE_COUNTS.total;

  const feedProductionLockActive = isFeedProductionLockActive(
    prog?.performance_summary as Record<string, unknown> | undefined,
  );
  const feedBackgroundActive = feedProductionLockActive || Boolean(isKickingFeed);
  const manifestGap = contentProductionStatus.readyRequired < feedTarget;
  const feedPackageComplete = feedTarget > 0
    && contentProductionStatus.readyRequired >= feedTarget;

  // Auto-kick removed: production is driven by the backend scheduler/factory drain.
  // The InFlightCard should never trigger production on mount — only via explicit
  // operator buttons (visible in debug mode).

  const pct      = prog?.completion_pct ?? mission.completion_pct;
  const nodes    = prog?.nodes ?? [];
  const running  = nodes.filter(n => n.status === 'running').length;
  const failed   = nodes.filter(n => n.status === 'failed').length;
  const done     = prog?.completed_nodes ?? mission.completed_nodes;
  const total    = prog?.total_nodes ?? mission.total_nodes;
  const hasError = failed > 0 && running === 0;
  const isFailedCompleted =
    mission.status === 'completed' && (hasError || (mission.failed_nodes ?? 0) > 0);
  const failedNode = nodes.find((n) => n.status === 'failed');
  const failedReason = String(failedNode?.error_message ?? '').trim();
  const failedReasonShort = failedReason.includes('429') || failedReason.toLowerCase().includes('quota')
    ? 'OpenAI kotası doldu — API limitini yenileyin'
    : failedReason.includes('insufficient_quota')
      ? 'OpenAI kotası doldu — API limitini yenileyin'
      : failedReason.includes('Stale running state') || failedReason.includes('Deneme hakkı tükendi')
        ? 'Görev yarıda kesildi — aşağıdaki yeniden başlat düğmesine basın'
        : failedReason
          ? failedReason.replace(/^\[Final\]\s*Task execution failed:\s*/i, '').slice(0, 120)
          : 'Görev hatası — yeniden başlatmayı deneyin';
  const canRestart = hasError || pct === 0 || isFailedCompleted;
  const showFeedStatus = ideationDone && !feedPackageComplete;
  const isWaiting = mission.status === 'approved' && running === 0 && done === 0 && !hasError;

  const runningNode = nodes.find((n) => n.status === 'running');
  const runningStepLabel = runningNode
    ? (TASK_META[runningNode.task_type]?.label ?? runningNode.title)
    : null;

  const ringColor = hasError ? '#EF4444' : pColor;
  const statusLabel = hasError
    ? '✕ Hata'
    : mission.status === 'in_flight' && running > 0
      ? (debugMode ? `▶ ${running} görev çalışıyor` : '▶ Hazırlanıyor')
      : mission.status === 'in_flight'
        ? '◎ İşleniyor'
        : '✓ Onaylandı';

  return (
    <div style={{
      borderRadius: 18, overflow: 'hidden',
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${hasError ? 'rgba(239,68,68,0.3)' : t.separator}`,
      boxShadow: t.isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${ringColor}cc, ${ringColor}22)` }} />
      <div style={{ padding: '16px 16px 14px' }}>

        {/* ── Top row: ring + title + cancel ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <ProgressRing pct={pct} color={ringColor} size={52} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                background: hasError ? 'rgba(239,68,68,0.1)' : isWaiting ? 'rgba(160,160,180,0.1)' : `${pColor}14`,
                color: hasError ? '#EF4444' : isWaiting ? t.textMuted : pColor,
              }}>
                {statusLabel}
              </span>
              <span style={{ fontSize: 9, color: t.textMuted }}>
                {TYPE_LABEL[mission.type] ?? mission.type}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary,
              letterSpacing: '-0.01em', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mission.title}
            </div>
            <div style={{ fontSize: 12, color: isFailedCompleted ? '#EF4444' : t.textTertiary, marginTop: 3 }}>
              {isFailedCompleted
                ? failedReasonShort
                : debugMode
                  ? `${done}/${total} görev tamamlandı`
                  : feedPublishableCount > 0 || feedProducedCount > 0
                    ? `${feedPublishableCount}/${feedTarget} yayına hazır`
                      + (feedProducedCount > feedPublishableCount
                        ? ` · ${feedProducedCount} üretildi`
                        : '')
                    : runningStepLabel
                      ? `${runningStepLabel} hazırlanıyor…`
                      : 'İçerik planı hazırlanıyor'}
              {!isFailedCompleted && mission.timeline_days ? ` · ${mission.timeline_days} gün` : ''}
            </div>
          </div>

          {(canRestart || mission.status !== 'completed') && (
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              {canRestart && (
                <button
                  type="button"
                  disabled={isRestarting}
                  onClick={() => onRestart(mission.id)}
                  style={{
                    padding: '6px 11px', borderRadius: 30,
                    cursor: isRestarting ? 'wait' : 'pointer',
                    opacity: isRestarting ? 0.65 : 1,
                    background: isFailedCompleted ? 'rgba(90,130,160,0.16)' : 'rgba(90,130,160,0.08)',
                    border: '0.5px solid rgba(90,130,160,0.28)',
                    color: '#818cf8', fontSize: 11, fontWeight: 600,
                  }}
                >
                  {isRestarting ? '…' : '↺ Yeniden'}
                </button>
              )}
              {mission.status !== 'completed' && (
                <button type="button" onClick={() => onCancel(mission.id)} style={{
                  padding: '6px 11px', borderRadius: 30, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)',
                  color: t.danger, fontSize: 11, fontWeight: 600,
                }}>İptal</button>
              )}
            </div>
          )}
        </div>

        {/* ── Waiting for executor ── */}
        {isWaiting && (
          <div style={{ padding: '8px 10px', borderRadius: 10, marginBottom: 10,
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}`,
            fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%',
              border: `1.5px solid ${t.separator}`, borderTop: `1.5px solid ${pColor}`,
              animation: 'spinSlow 1s linear infinite', flexShrink: 0 }} />
            {debugMode
              ? 'Executor başlatılıyor... 5 dakika içinde görevler otomatik atanacak'
              : 'Kampanya başlatılıyor — birkaç dakika içinde içerikler hazırlanacak'}
          </div>
        )}

        {/* ── Node rows with names + status ── */}
        {(isFailedCompleted || showFeedStatus) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {isFailedCompleted && (
              <button
                type="button"
                disabled={isRestarting}
                onClick={() => onRestart(mission.id)}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12,
                  cursor: isRestarting ? 'wait' : 'pointer',
                  background: 'linear-gradient(135deg, rgba(90,130,160,0.22), rgba(129,140,248,0.12))',
                  border: '0.5px solid rgba(90,130,160,0.35)',
                  color: '#a5b4fc', fontSize: 13, fontWeight: 700,
                  opacity: isRestarting ? 0.7 : 1,
                }}
              >
                {isRestarting ? 'Yeniden başlatılıyor…' : '↺ Hatalı görevleri yeniden başlat'}
              </button>
            )}
            {showFeedStatus && (
              <div style={{
                width: '100%', padding: '11px 14px', borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(52,211,153,0.06))',
                border: '0.5px solid rgba(16,185,129,0.28)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {feedBackgroundActive && (
                    <div style={{ width: 10, height: 10, borderRadius: '50%',
                      border: '1.5px solid rgba(52,211,153,0.3)',
                      borderTop: '1.5px solid #34d399',
                      animation: 'spinSlow 1s linear infinite', flexShrink: 0 }} />
                  )}
                  <span style={{ color: '#34d399', fontSize: 13, fontWeight: 700 }}>
                    {visualDesignPending
                      ? 'Görsel tasarım önerileri bekleniyor'
                      : calendarPending
                        ? 'Yayın takvimi hazırlanıyor'
                        : productionBlock && !feedBackgroundActive
                          ? productionBlock.label
                          : feedBackgroundActive
                            ? 'Feed arka planda üretiliyor'
                            : 'Feed üretimi bekleniyor'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.5 }}>
                  {visualDesignPending
                    ? 'Ajans tasarım kartları tamamlanınca Feed üretimi otomatik başlayacak.'
                    : calendarPending
                      ? 'Yayın planı tamamlanınca her plan satırı için Feed çıktısı üretilir.'
                      : productionBlock && !feedBackgroundActive
                        ? `Feed üretimi şunu bekliyor: ${productionBlock.awaitingNodes.join(', ') || productionBlock.label}. Tamamlanınca otomatik başlayacak.`
                        : feedPublishableCount > 0
                        ? `${feedPublishableCount}/${feedTarget} yayına hazır`
                          + (feedProducedCount > feedPublishableCount
                            ? ` (${feedProducedCount} üretildi, render bekliyor olabilir)`
                            : '')
                          + ' — yeni içerikler geldikçe Feed\'de listelenir.'
                        : feedProducedCount > 0
                          ? `${feedProducedCount} çıktı üretildi — yayına hazır hale geldikçe Feed\'de görünür.`
                          : 'Gönderiler hazır oldukça Feed sekmesine düşer (story, post, carousel, reel).'}
                </div>
                {debugMode && !feedBackgroundActive && !feedPrepPending && onKickFeedProduction && (
                  <button
                    type="button"
                    disabled={isKickingFeed}
                    onClick={() => onKickFeedProduction(mission.id)}
                    style={{
                      marginTop: 10, padding: '8px 12px', borderRadius: 10,
                      cursor: isKickingFeed ? 'wait' : 'pointer',
                      background: 'rgba(16,185,129,0.12)',
                      border: '0.5px solid rgba(16,185,129,0.35)',
                      color: '#34d399', fontSize: 11, fontWeight: 700,
                    }}
                  >
                    Şimdi başlat
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {debugMode && (nodes.length > 0 ? (
          <NodeRows nodes={nodes} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {Array.from({ length: total || 2 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(160,160,180,0.08)', border: '1.5px solid rgba(160,160,180,0.2)',
                  flexShrink: 0 }} />
                <div style={{ flex: 1, height: 10, borderRadius: 5,
                  background: 'rgba(160,160,180,0.08)' }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ProposedCard ──────────────────────────────────────────────────────────────

function ProposedCard({ mission, workspaceId, onApprove, onReject, isPending }: {
  mission: MissionSummary;
  workspaceId: string;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  isPending: boolean;
}) {
  const { t } = useTheme();
  const pColor = PRIORITY_COLOR[mission.priority] ?? t.accent;

  return (
    <div style={{
      borderRadius: 18, overflow: 'hidden',
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${t.isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.3)'}`,
      boxShadow: t.isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${pColor}cc, ${pColor}22)` }} />
      <div style={{ padding: '14px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10,
            background: `${pColor}12`, border: `0.5px solid ${pColor}28`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0 }}>
            {mission.type === 'seasonal' ? '🌤' : mission.type === 'opportunity' ? '⚡' :
             mission.type === 'competitive' ? '🏆' : mission.type === 'recovery' ? '↑' : '✎'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20,
                background: `${pColor}14`, color: pColor, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {mission.priority}
              </span>
              <span style={{ fontSize: 9, color: t.textMuted, fontWeight: 500 }}>
                {TYPE_LABEL[mission.type] ?? mission.type}
              </span>
              {mission.confidence > 0 && (
                <span style={{ fontSize: 9, color: t.live, fontWeight: 500 }}>
                  %{Math.round(mission.confidence * 100)} güven
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary,
              lineHeight: 1.25, letterSpacing: '-0.01em' }}>
              {mission.title}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {mission.timeline_days && (
            <span style={{ fontSize: 11, color: t.textTertiary }}>
              📅 {mission.timeline_days} gün
            </span>
          )}
          {mission.total_nodes > 0 && (
            <span style={{ fontSize: 11, color: t.textTertiary }}>
              ⚡ {mission.total_nodes} görev
            </span>
          )}
          {mission.assigned_agent_roles && mission.assigned_agent_roles.length > 0 && (
            <span style={{ fontSize: 11, color: t.textTertiary }}>
              🤖 {mission.assigned_agent_roles.length} ajan
            </span>
          )}
          <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 'auto' }}>
            {timeAgo(mission.created_at)}
          </span>
        </div>

        {mission.objective && (
          <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.5, marginBottom: 10,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const }}>
            {mission.objective}
          </div>
        )}

        {/* Approve / Reject buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApprove(mission.id)}
            disabled={isPending}
            style={{
              flex: 1, padding: '12px', borderRadius: 14, cursor: isPending ? 'default' : 'pointer',
              background: isPending ? t.accentDim : `linear-gradient(135deg, ${pColor}cc, ${pColor}99)`,
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              boxShadow: isPending ? 'none' : `0 3px 14px ${pColor}40`,
              opacity: isPending ? 0.7 : 1,
            }}>
            {isPending ? (
              <><div style={{ width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />
              Başlatılıyor...</>
            ) : '✓ Onayla'}
          </button>
          <button
            onClick={() => onReject(mission.id)}
            disabled={isPending}
            style={{
              flex: 1, padding: '12px', borderRadius: 14, cursor: isPending ? 'default' : 'pointer',
              background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
              border: `0.5px solid ${t.separator}`,
              color: t.textTertiary, fontSize: 13, fontWeight: 500,
              opacity: isPending ? 0.5 : 1,
            }}>
            ✕ Reddet
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Node output renderer — uses existing MobileArtifactView pipeline ────────
// Import the same signalFromArtifact used everywhere else in the app.
import { signalFromArtifact } from '@/components/artifacts/artifact-preview';
import type { ArtifactSignal } from '@/components/artifacts/artifact-preview';

/**
 * Convert raw node output_summary string → fake OutputArtifact →
 * signalFromArtifact → proper ArtifactSignal for rendering.
 * Maps task_type to the artifact type string the parser expects.
 */
function nodeToSignal(node: MissionNodeProgress): ArtifactSignal | null {
  const raw = nodeOutputText(node);
  if (!raw) return null;

  // Map task_type → artifactType string (mirrors what .NET stores in OutputArtifacts)
  const artifactTypeMap: Record<string, string> = {
    content_ideation:        'instagram_caption',
    content_calendar:        'instagram_caption',
    content_strategy:        'strategy_document',
    visual_design_cards:     'instagram_caption',
    ad_creative_generation:  'ad_copy',
    review_analysis:         'generic_document',
    single_review_response:  'review_response',
    traffic_analysis:        'strategy_document',
    weekly_performance:      'strategy_document',
  };

  const fakeArtifact = {
    id: node.node_key,
    agentRunId: node.node_key,
    type: 'text' as const,
    title: node.title,
    content: raw,
    mimeType: 'application/json',
    artifactType: artifactTypeMap[node.task_type] ?? 'generic_document',
    status: 'approved' as const,
    createdAt: node.completed_at ?? new Date().toISOString(),
    metadata: { agentName: node.agent_role },
  };

  try {
    return signalFromArtifact(fakeArtifact);
  } catch {
    return null;
  }
}

// Content strategy renders differently — structured summary card
function ContentStrategyView({ node, t }: { node: MissionNodeProgress; t: ReturnType<typeof useTheme>['t'] }) {
  const raw = nodeOutputText(node);
  const obj = nodeOutputObject(node) ?? {};

  const theme   = String(obj.weekly_theme ?? obj.theme ?? '');
  const brief   = String(obj.mission_brief ?? obj.brief ?? '');
  const pillars = Array.isArray(obj.pillar_mix)
    ? (obj.pillar_mix as Record<string, unknown>[]).map(p => String(p.pillar ?? '')).filter(Boolean)
    : [];
  const formats = Array.isArray(obj.recommended_formats)
    ? (obj.recommended_formats as string[]).slice(0, 4)
    : [];
  const notes   = Array.isArray(obj.strategy_notes)
    ? (obj.strategy_notes as string[]).slice(0, 3)
    : [];

  if (!theme && !brief) {
    // Fallback: just show raw text nicely
    return (
      <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim().slice(0, 800)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {theme && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
            Haftalık Tema
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary, lineHeight: 1.3 }}>
            {theme}
          </div>
        </div>
      )}

      {brief && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
            İçerik Brief
          </div>
          <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.65 }}>
            {brief.slice(0, 400)}
          </div>
        </div>
      )}

      {pillars.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            İçerik Sütunları
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pillars.map((p, i) => (
              <span key={i} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20,
                background: t.accentDim, color: t.accent, fontWeight: 600 }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {formats.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Önerilen Formatlar
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {formats.map((f, i) => (
              <span key={i} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                color: t.textSecondary, fontWeight: 500 }}>
                {f.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Strateji Notları
          </div>
          {notes.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.live, flexShrink: 0, fontSize: 12 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5 }}>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Content ideation / calendar — rendered as proper content cards
// ── Calendar Items View — for content_calendar task output ──────────────────
function CalendarItemsView({ items, links, t, onGoToFeed, onOpenArtifact }: {
  items: unknown[];
  links?: CalendarItemLink[];
  t: ReturnType<typeof useTheme>['t'];
  onGoToFeed?: () => void;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const FMT_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
    story:    { bg: 'rgba(138,171,189,0.15)', color: '#8AABBD', icon: '◉' },
    post:     { bg: 'rgba(59,130,246,0.15)', color: '#3B82F6', icon: '□' },
    reel:     { bg: 'rgba(236,72,153,0.15)', color: '#EC4899', icon: '▶' },
    carousel: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B', icon: '⊞' },
  };
  const PRIORITY_COLORS: Record<string, string> = {
    high: '#EF4444', recommended: '#10B981', medium: '#F59E0B', low: t.textMuted,
  };
  const TYPE_LABELS: Record<string, string> = {
    venue_showcase: 'Mekan', product_reveal: 'Ürün', event_announce: 'Etkinlik',
    announcement: 'Duyuru', campaign: 'Kampanya', promotion: 'Promosyon',
    behind_the_scenes: 'Sahne Arkası', seasonal: 'Sezonluk',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 4,
        background: 'rgba(16,185,129,0.08)', border: '0.5px solid rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>
            📅 {items.length} yayın planı planlandı
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3 }}>
            Tüm planlar üretime girer — brief, mood ve format; eşleşmeyenler slot havuzuna eklenir.
          </div>
        </div>
        {onGoToFeed && (
          <button onClick={onGoToFeed} style={{ padding: '4px 10px', borderRadius: 8,
            border: 'none', cursor: 'pointer', background: 'rgba(16,185,129,0.18)',
            color: '#10B981', fontSize: 11, fontWeight: 700 }}>
            Feed'i Aç →
          </button>
        )}
      </div>

      {items.slice(0, 8).map((item, i) => {
        const it = item as Record<string, unknown>;
        const fmt     = String(it.format || 'story').toLowerCase();
        const fmtCfg  = FMT_COLORS[fmt] ?? FMT_COLORS.story!;
        const type    = String(it.announcement_type || it.type || '');
        const title   = String(it.event_name || it.title || it.headline || `Plan ${i + 1}`);
        const tagline = String(it.tagline || it.subtitle || '');
        const brief   = String(it.content_brief || it.brief || it.description || '');
        const date    = String(it.date || '');
        const time    = String(it.time || '');
        const area    = String(it.venue_area || it.location || '');
        const mood    = String(it.photo_mood || it.mood || '');
        const priority = String(it.priority || '').toLowerCase();
        const link = links?.[i];
        const status = link?.status ?? 'unlinked';
        const statusColor = status === 'ready' ? '#10B981'
          : status === 'rendering' || status === 'pending' ? '#F59E0B'
            : status === 'failed' ? '#EF4444'
              : status === 'missing' ? '#94A3B8'
                : t.textMuted;

        return (
          <div key={i} style={{ borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            border: `0.5px solid ${t.separator}`, overflow: 'hidden' }}>

            {/* Card header: format + type + priority */}
            <div style={{ padding: '9px 12px', borderBottom: `0.5px solid ${t.separator}`,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 20,
                background: fmtCfg.bg, color: fmtCfg.color }}>
                {fmtCfg.icon} {fmt.toUpperCase()}
              </span>
              {type && (
                <span style={{ fontSize: 10, color: t.textMuted }}>
                  {TYPE_LABELS[type] || type.replace(/_/g, ' ')}
                </span>
              )}
              {link && (
                <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 8,
                  background: `${statusColor}18`, color: statusColor }}>
                  {CALENDAR_STATUS_TR[status]}
                </span>
              )}
              {priority && (
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                  color: PRIORITY_COLORS[priority] ?? t.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {priority === 'recommended' ? '✓ Önerilen' : priority === 'high' ? '🔴 Yüksek' : priority}
                </span>
              )}
              {link?.artifactId && onOpenArtifact && status === 'ready' && (
                <button
                  type="button"
                  onClick={() => onOpenArtifact(link.artifactId!)}
                  style={{
                    fontSize: 9, fontWeight: 800, padding: '4px 8px', borderRadius: 8, border: 'none',
                    cursor: 'pointer', background: 'rgba(59,130,246,0.12)', color: '#3B82F6',
                  }}>
                  Önizle
                </button>
              )}
            </div>

            {/* Card body */}
            <div style={{ padding: '12px 14px' }}>
              {/* Title */}
              <div style={{ fontSize: 14, fontWeight: 800, color: t.textPrimary,
                lineHeight: 1.25, marginBottom: tagline ? 6 : 8 }}>
                {title}
              </div>

              {/* Tagline */}
              {tagline && (
                <div style={{ fontSize: 12, fontStyle: 'italic', color: t.accent,
                  marginBottom: 8, letterSpacing: 0.5 }}>
                  "{tagline}"
                </div>
              )}

              {/* Date/Time/Area row */}
              {(date || time || area) && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  {date && <span style={{ fontSize: 11, color: t.textMuted }}>📅 {date}</span>}
                  {time && <span style={{ fontSize: 11, color: t.textMuted }}>🕐 {time}</span>}
                  {area && <span style={{ fontSize: 11, color: t.textMuted }}>📍 {area}</span>}
                </div>
              )}

              {/* Content brief */}
              {brief && (
                <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6,
                  borderLeft: `2px solid ${t.separator}`, paddingLeft: 10 }}>
                  {brief.slice(0, 150)}
                </div>
              )}

              {/* Photo mood */}
              {mood && (
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 8, fontStyle: 'italic' }}>
                  🎨 {mood.slice(0, 80)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ContentIdeasView({ signal, t, onGoToFeed, planningKind = 'ideation', links, artifacts, onOpenArtifact }: {
  signal: ArtifactSignal;
  t: ReturnType<typeof useTheme>['t'];
  onGoToFeed?: () => void;
  planningKind?: 'ideation' | 'design';
  links?: CalendarItemLink[];
  artifacts?: OutputArtifact[];
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const ideas = signal.ideas ?? [];
  if (!ideas.length && !signal.caption) {
    return (
      <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
        İçerik fikri bulunamadı
      </div>
    );
  }

  const items = ideas.length > 0 ? ideas : [{
    headline: signal.headline ?? (signal as any).title ?? '',
    caption:  signal.caption ?? '',
    cta:      signal.cta ?? '',
    contentType: 'post',
  }];

  const FMT_CONFIG: Record<string, { icon: string; label: string; color: string; aspect: string }> = {
    post:            { icon: '□', label: formatMobileContentTypeLabel('post'),    color: '#3B82F6', aspect: '4/5' },
    instagram_post:  { icon: '□', label: formatMobileContentTypeLabel('post'),    color: '#3B82F6', aspect: '4/5' },
    story:           { icon: '◉', label: formatMobileContentTypeLabel('story'),   color: '#8AABBD', aspect: '9/16' },
    instagram_story: { icon: '◉', label: formatMobileContentTypeLabel('story'),   color: '#8AABBD', aspect: '9/16' },
    reel:            { icon: '▶', label: formatMobileContentTypeLabel('reel'),    color: '#EC4899', aspect: '9/16' },
    instagram_reel:  { icon: '▶', label: formatMobileContentTypeLabel('reel'),    color: '#EC4899', aspect: '9/16' },
    carousel:        { icon: '⊞', label: formatMobileContentTypeLabel('carousel'),color: '#F59E0B', aspect: '1/1' },
  };

  const readyPreviewCount = links?.filter((l) => l.status === 'ready').length ?? 0;
  const renderingCount = links?.filter((l) => l.status === 'rendering' || l.status === 'pending').length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Lead summary */}
      <div style={{ padding: '10px 12px', borderRadius: 12, marginBottom: 4,
        background: 'rgba(16,185,129,0.08)', border: '0.5px solid rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>
            {planningKind === 'design'
              ? `${items.length} tasarım kartı planlandı`
              : `${items.length} içerik fikri planlandı`}
            {readyPreviewCount > 0 && (
              <span style={{ color: '#8AABBD', fontWeight: 800 }}>
                {' '}· {readyPreviewCount} görsel önizleme
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 3, lineHeight: 1.4 }}>
            {readyPreviewCount > 0
              ? 'Üretilen görseller kartlarda önizlenir — tam boyut için Feed veya Önizle.'
              : renderingCount > 0
                ? 'Görseller üretiliyor — tamamlandığında kartlarda görünür.'
                : planningKind === 'design'
                  ? 'Planlama brief\'i — üretim sonrası fal.ai / tasarım çıktıları burada önizlenir.'
                  : 'Planlama çıktısı — üretimde caption ve format kaynağı; Feed dosyası değildir.'}
          </div>
          {/* Story/Remotion indicator */}
          {planningKind === 'ideation' && items.some((idea: any) => {
            const t = String((idea as any)?.visual_production_spec?.treatment || '').toLowerCase();
            return t === 'story_event' || t === 'event_announcement' || t === 'campaign_offer';
          }) && (
            <div style={{ fontSize: 10, color: '#8AABBD', marginTop: 2 }}>
              ▶ Tasarımlı story'ler üretiliyor — Feed story bar'ında görünür
            </div>
          )}
        </div>
        {onGoToFeed && (
          <button onClick={onGoToFeed} style={{
            padding: '4px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'rgba(16,185,129,0.18)', color: '#10B981', fontSize: 11, fontWeight: 700,
          }}>
            Feed'i Aç →
          </button>
        )}
      </div>

      {items.map((idea, i) => {
        const ia       = idea as any;
        const headline = resolveIdeationHeadline(ia as Record<string, unknown>)
          || ia.canva_field_copy?.headline
          || ia.canvaFieldCopy?.headline
          || `Fikir ${i + 1}`;
        const caption  = ia.caption ?? ia.captionDraft ?? ia.caption_draft ?? ia.subline ?? '';
        const hashtags = Array.isArray(ia.hashtags) ? ia.hashtags.slice(0, 4) : [];
        const mood     = ia.mood ?? ia.tone ?? ia.visual_mood ?? '';
        const postTime = ia.posting_time_suggestion ?? ia.postingTime ?? '';
        const fmt      = (ia.contentType ?? ia.contentKind ?? ia.content_type ?? ia.format ?? 'post') as string;
        const fmtCfg   = FMT_CONFIG[fmt.toLowerCase()] ?? FMT_CONFIG['post']!;
        const isCalendar = 'day' in idea || ('theme' in ia && !ia.headline);
        const link = links?.[i];
        const linkedArtifact = link?.artifactId && artifacts?.length
          ? artifacts.find((a) => a.id === link.artifactId)
          : undefined;
        const previewUrl = linkedArtifact
          ? resolveArtifactHubPreviewUrl(linkedArtifact)
          : planningItemReferenceUrl(ia);
        const hasVideo = linkedArtifact ? Boolean(resolveStoryVideoUrl(linkedArtifact)) : false;
        const productionBadge = linkedArtifact ? resolveArtifactProductionBadge(linkedArtifact) : null;
        const status = link?.status;
        const statusColor = status === 'ready' ? '#10B981'
          : status === 'rendering' || status === 'pending' ? '#F59E0B'
            : status === 'failed' ? '#EF4444'
              : status === 'missing' ? '#94A3B8'
                : t.textMuted;
        const canOpenPreview = Boolean(link?.artifactId && onOpenArtifact && status === 'ready');

        if (isCalendar) {
          return (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0',
              borderBottom: i < items.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: t.accentDim, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 12, fontWeight: 800, color: t.accent }}>
                {String(ia.day ?? i + 1)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, marginBottom: 3 }}>
                  {String(ia.theme ?? headline)}
                </div>
                {ia.brief && (
                  <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45 }}>
                    {String(ia.brief).slice(0, 100)}
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={i} style={{ borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            border: `0.5px solid ${t.separator}`,
            overflow: 'hidden' }}>

            {/* Card header: format + index */}
            <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: previewUrl ? 'none' : `0.5px solid ${t.separator}`,
              flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 800,
                padding: '3px 9px', borderRadius: 20,
                background: fmtCfg.color + '18',
                color: fmtCfg.color, letterSpacing: '0.04em' }}>
                {fmtCfg.icon} {fmtCfg.label}
              </span>
              {productionBadge && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 8,
                  background: 'rgba(0,0,0,0.06)', color: productionBadge.engineColor,
                }}>
                  {productionBadge.engine}
                </span>
              )}
              {link && status && status !== 'unlinked' && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 8,
                  background: `${statusColor}18`, color: statusColor,
                }}>
                  {CALENDAR_STATUS_TR[status]}
                </span>
              )}
              {mood && (
                <span style={{ fontSize: 10, color: t.textMuted, fontStyle: 'italic' }}>
                  {String(mood).slice(0, 30)}
                </span>
              )}
              {canOpenPreview && (
                <button
                  type="button"
                  onClick={() => onOpenArtifact!(link!.artifactId!)}
                  style={{
                    fontSize: 9, fontWeight: 800, padding: '4px 8px', borderRadius: 8, border: 'none',
                    cursor: 'pointer', background: 'rgba(59,130,246,0.12)', color: '#3B82F6',
                  }}
                >
                  Önizle
                </button>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: t.textMuted }}>
                #{i + 1}
              </span>
            </div>

            {previewUrl && (
              <button
                type="button"
                disabled={!canOpenPreview}
                onClick={() => { if (canOpenPreview) onOpenArtifact!(link!.artifactId!); }}
                style={{
                  display: 'block', width: '100%', border: 'none', padding: 0, margin: 0,
                  cursor: canOpenPreview ? 'pointer' : 'default',
                  background: t.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.04)',
                  borderBottom: `0.5px solid ${t.separator}`,
                }}
              >
                <div style={{
                  position: 'relative', width: '100%', aspectRatio: fmtCfg.aspect,
                  maxHeight: fmtCfg.aspect === '9/16' ? 320 : 280, overflow: 'hidden',
                }}>
                  <SafeCoverImage
                    src={previewUrl}
                    fallbacks={[
                      linkedArtifact?.contentUrl
                        ? (resolveClientMediaUrl(linkedArtifact.contentUrl) ?? linkedArtifact.contentUrl)
                        : null,
                    ]}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    placeholder={(
                      <div style={{
                        width: '100%', height: '100%', minHeight: 120,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: t.textMuted, fontSize: 11,
                      }}>
                        {status === 'rendering' || status === 'pending' ? 'Render…' : 'Önizleme yükleniyor…'}
                      </div>
                    )}
                  />
                  {hasVideo && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', pointerEvents: 'none',
                    }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: '#fff', fontSize: 16, marginLeft: 2 }}>▶</span>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            )}

            {/* Content */}
            <div style={{ padding: '12px 14px' }}>
              {/* Headline */}
              <div style={{ fontSize: 14, fontWeight: 800, color: t.textPrimary,
                lineHeight: 1.3, letterSpacing: '-0.01em', marginBottom: 7 }}>
                {String(headline).slice(0, 100)}
              </div>

              {/* Caption preview */}
              {caption && (
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.65,
                  marginBottom: 10,
                  overflow: 'hidden', display: '-webkit-box',
                  WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                  {String(caption)}
                </div>
              )}

              {/* Hashtags */}
              {hashtags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {hashtags.map((h: string, hi: number) => (
                    <span key={hi} style={{ fontSize: 10, color: t.accent, fontWeight: 600 }}>
                      {String(h).startsWith('#') ? h : `#${h}`}
                    </span>
                  ))}
                  {(ia.hashtags?.length ?? 0) > 4 && (
                    <span style={{ fontSize: 10, color: t.textMuted }}>
                      +{(ia.hashtags?.length ?? 0) - 4} daha
                    </span>
                  )}
                </div>
              )}

              {/* Posting time chip */}
              {postTime && (
                <div style={{ fontSize: 10, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>🕐</span>
                  <span>{String(postTime).slice(0, 60)}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ad creative direct view — parses raw array output from agent
function AdCreativeDirectView({ items, t }: { items: unknown[]; t: ReturnType<typeof useTheme>['t'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase',
        letterSpacing: '0.07em', marginBottom: 4 }}>
        {items.length} Reklam Metni Hazır
      </div>
      {items.slice(0, 5).map((ad, i) => {
        const a = ad as Record<string, unknown>;
        const headlines = Array.isArray(a.headline_options)
          ? (a.headline_options as string[]).slice(0, 2)
          : [String(a.headline ?? '')].filter(Boolean);
        const descriptions = Array.isArray(a.description_options)
          ? (a.description_options as string[]).slice(0, 1)
          : [String(a.body ?? a.description ?? a.text ?? '')].filter(Boolean);
        const cta = String(a.cta ?? a.call_to_action ?? '');
        const platform = String(a.platform ?? a.ad_type ?? '');

        return (
          <div key={i} style={{ borderRadius: 14,
            background: t.isDark ? 'rgba(239,68,68,0.07)' : 'rgba(239,68,68,0.04)',
            border: '0.5px solid rgba(239,68,68,0.18)', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(239,68,68,0.15)',
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(239,68,68,0.15)', color: '#EF4444', fontWeight: 700 }}>
                Reklam {i + 1}
              </span>
              {platform && (
                <span style={{ fontSize: 9, color: t.textMuted, textTransform: 'capitalize' }}>
                  {platform}
                </span>
              )}
            </div>
            {/* Content */}
            <div style={{ padding: '12px 14px' }}>
              {headlines.map((h, hi) => (
                <div key={hi} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#EF4444',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                    Başlık {hi + 1}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, lineHeight: 1.3 }}>
                    {h}
                  </div>
                </div>
              ))}
              {descriptions.map((d, di) => d && (
                <div key={di} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: t.accent,
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                    Açıklama
                  </div>
                  <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6 }}>
                    {d.slice(0, 200)}
                  </div>
                </div>
              ))}
              {cta && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.12)', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: t.textMuted }}>CTA</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>
                    → {cta}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Ad creative view
function AdCreativeView({ signal, t }: { signal: ArtifactSignal; t: ReturnType<typeof useTheme>['t'] }) {
  const ideas = signal.ideas ?? [];
  const items = ideas.length > 0 ? ideas : [{ headline: signal.headline, caption: signal.caption, cta: signal.cta }];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 4).map((ad, i) => {
        const adObj = ad as Record<string, unknown>;
        const headlines = Array.isArray(adObj.headline_options)
          ? (adObj.headline_options as string[]).slice(0, 2)
          : [String(adObj.headline ?? ad.headline ?? '')].filter(Boolean);
        const body = String(adObj.body ?? adObj.description ?? ad.caption ?? '');
        const cta  = String(adObj.cta ?? adObj.call_to_action ?? ad.cta ?? '');
        const platform = String(adObj.platform ?? '');

        return (
          <div key={i} style={{ padding: '14px', borderRadius: 14,
            background: t.isDark ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.04)',
            border: `0.5px solid rgba(245,158,11,0.2)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(245,158,11,0.12)', color: '#F59E0B', fontWeight: 700 }}>
                Reklam {i + 1}{platform ? ` · ${platform}` : ''}
              </span>
            </div>
            {headlines.map((h, hi) => h ? (
              <div key={hi} style={{ fontSize: 14, fontWeight: 800, color: t.textPrimary,
                lineHeight: 1.25, marginBottom: 6 }}>
                {h.slice(0, 100)}
              </div>
            ) : null)}
            {body && (
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6,
                marginBottom: 8,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as const }}>
                {body}
              </div>
            )}
            {cta && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>→ {cta.slice(0, 60)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── JSON parse helper ─────────────────────────────────────────────────────────
function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    // Strip markdown code fences and leading prose text
    let clean = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim();
    // If there's introductory prose before the JSON, skip to first { or [
    const jsonStart = clean.search(/[\[{]/);
    if (jsonStart > 0) clean = clean.slice(jsonStart);
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return { items: parsed };
    return typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

// ── Analytics output renderer (traffic_analysis, conversion_report, weekly_performance) ──
function AnalyticsOutputView({ data, t }: { data: Record<string, unknown>; t: T }) {
  // Support multiple field name variants from different agent outputs
  const summary   = (
    data.executive_summary ?? data.summary ?? data.headline ??
    data.overview ?? data.period_summary ?? ''
  ) as string;
  const metrics   = data.key_metrics as Record<string, { value: unknown; trend?: string; assessment?: string }> | null;
  const insights  = (
    data.key_insights ?? data.insights ?? data.recommendations ??
    data.traffic_highlights ?? data.search_performance ?? data.highlights
  ) as string[] | null;
  const sources   = data.source_analysis as Record<string, unknown> | null;
  // Weekly performance specific
  const period    = data.period as string || '';
  const topPages  = (data.top_pages ?? data.top_queries) as string[] | null;

  const trendIcon = (t: string | undefined) =>
    t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';
  const trendColor = (t: string | undefined) =>
    t === 'increasing' ? '#10B981' : t === 'decreasing' ? '#EF4444' : '#F59E0B';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Period badge */}
      {period && (
        <div style={{ fontSize: 10, padding: '3px 10px', borderRadius: 10, width: 'fit-content',
          background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: t.textMuted }}>
          📅 {period}
        </div>
      )}

      {/* Headline/summary */}
      {summary && (
        <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0,
          fontWeight: summary.length < 80 ? 700 : 400,
          color: summary.length < 80 ? t.textPrimary : t.textSecondary }}>
          {summary.slice(0, 400)}
        </p>
      )}

      {/* KPI grid */}
      {metrics && Object.keys(metrics).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {Object.entries(metrics).slice(0, 6).map(([key, m]) => (
            <div key={key} style={{
              padding: '10px 12px', borderRadius: 12,
              background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: `0.5px solid ${t.separator}`,
            }}>
              <div style={{ fontSize: 9, color: t.textMuted, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 4 }}>
                {key.replace(/_/g, ' ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>
                  {typeof m?.value === 'number' ? m.value.toLocaleString() : String(m?.value ?? '—')}
                </span>
                {m?.trend && (
                  <span style={{ fontSize: 12, color: trendColor(m.trend), fontWeight: 700 }}>
                    {trendIcon(m.trend)}
                  </span>
                )}
              </div>
              {m?.assessment && (
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{m.assessment}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Key insights / recommendations */}
      {Array.isArray(insights) && insights.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>
            Öneriler
          </p>
          {insights.slice(0, 5).map((ins, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.accent, flexShrink: 0, fontSize: 13 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {typeof ins === 'string' ? ins : JSON.stringify(ins)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Source breakdown */}
      {sources && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>
            Kaynak Dağılımı
          </p>
          {Object.entries(sources).slice(0, 4).map(([src, val]) => {
            const v = val as Record<string, unknown>;
            const pct = v?.percentage ?? v?.share ?? '';
            return (
              <div key={src} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: t.textSecondary, textTransform: 'capitalize' }}>
                  {src.replace(/_/g, ' ')}
                </span>
                {pct && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.accent }}>
                    {typeof pct === 'number' ? `${pct}%` : String(pct)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Top pages / queries (weekly_performance specific) */}
      {Array.isArray(topPages) && topPages.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>
            Top Sayfalar / Sorgular
          </p>
          {topPages.slice(0, 5).map((pg, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
              <span style={{ color: t.accent, flexShrink: 0, fontSize: 11 }}>{i + 1}.</span>
              <span style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.4 }}>
                {typeof pg === 'string' ? pg : JSON.stringify(pg)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Fallback: render all remaining non-null string fields */}
      {!summary && !Array.isArray(insights) && !metrics && (
        <div>
          {Object.entries(data).filter(([, v]) => typeof v === 'string' && v.length > 0).slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 4 }}>
                {k.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6 }}>
                {String(v).slice(0, 300)}
              </div>
            </div>
          ))}
          {Object.entries(data).filter(([, v]) => Array.isArray(v) && (v as unknown[]).length > 0).slice(0, 3).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 6 }}>
                {k.replace(/_/g, ' ')}
              </div>
              {(v as string[]).slice(0, 4).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 5 }}>
                  <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
                  <span style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
                    {typeof item === 'string' ? item : JSON.stringify(item)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Review output renderer (review_analysis, single_review_response) ──────────
function ReviewOutputView({ data, t }: { data: Record<string, unknown>; t: T }) {
  const summary  = data.summary as string || data.analysis_summary as string || '';
  const responses = (data.responses ?? data.suggested_responses ?? data.review_responses) as Array<Record<string, unknown>> | null;
  const sentiment = data.overall_sentiment as string || data.sentiment as string || '';
  const highlights = (data.highlights ?? data.positives ?? data.strengths) as string[] | null;
  const concerns  = (data.concerns ?? data.issues ?? data.negatives) as string[] | null;

  const sentimentColor = sentiment?.toLowerCase().includes('positive') || sentiment?.toLowerCase().includes('olumlu')
    ? '#10B981' : sentiment?.toLowerCase().includes('negative') || sentiment?.toLowerCase().includes('olumsuz')
      ? '#EF4444' : '#F59E0B';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sentiment && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
          borderRadius: 20, background: `${sentimentColor}14`,
          border: `0.5px solid ${sentimentColor}40`, alignSelf: 'flex-start' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: sentimentColor }}>{sentiment}</span>
        </div>
      )}
      {summary && (
        <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>
          {summary.slice(0, 400)}
        </p>
      )}
      {Array.isArray(highlights) && highlights.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#10B981', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 6, marginTop: 0 }}>✓ Güçlü Yönler</p>
          {highlights.slice(0, 3).map((h, i) => (
            <div key={i} style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4, paddingLeft: 12,
              borderLeft: '2px solid #10B98144' }}>{typeof h === 'string' ? h : JSON.stringify(h)}</div>
          ))}
        </div>
      )}
      {Array.isArray(concerns) && concerns.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 6, marginTop: 0 }}>⚠ Dikkat Edilecekler</p>
          {concerns.slice(0, 3).map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4, paddingLeft: 12,
              borderLeft: '2px solid #EF444444' }}>{typeof c === 'string' ? c : JSON.stringify(c)}</div>
          ))}
        </div>
      )}
      {Array.isArray(responses) && responses.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>💬 Önerilen Yanıtlar</p>
          {responses.slice(0, 3).map((r, i) => {
            const text = r.response ?? r.text ?? r.reply ?? r.suggested_response ?? '';
            const platform = r.platform ?? r.channel ?? '';
            return (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 12, marginBottom: 8,
                background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}` }}>
                {platform && (
                  <div style={{ fontSize: 9, color: t.textMuted, textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginBottom: 4 }}>{String(platform)}</div>
                )}
                <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, margin: 0 }}>
                  {String(text).slice(0, 300)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Campaign / Ads output renderer ────────────────────────────────────────────
function CampaignOutputView({ data, t }: { data: Record<string, unknown>; t: T }) {
  const summary    = data.summary as string || data.analysis as string || data.executive_summary as string || '';
  const campaigns  = (data.campaigns ?? data.campaign_recommendations) as Array<Record<string, unknown>> | null;
  const budget     = data.budget_recommendation != null ? String(data.budget_recommendation) : (data.recommended_budget != null ? String(data.recommended_budget) : null);
  const roas       = data.roas != null ? String(data.roas) : (data.current_roas != null ? String(data.current_roas) : null);
  const actions    = (data.recommended_actions ?? data.action_items ?? data.next_steps) as string[] | null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {summary && (
        <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>
          {summary.slice(0, 400)}
        </p>
      )}
      {(budget || roas) && (
        <div style={{ display: 'flex', gap: 10 }}>
          {budget && (
            <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(90,130,160,0.08)', border: '0.5px solid rgba(90,130,160,0.2)' }}>
              <div style={{ fontSize: 9, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bütçe Önerisi</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#818cf8', marginTop: 4 }}>{budget}</div>
            </div>
          )}
          {roas && (
            <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(16,185,129,0.08)', border: '0.5px solid rgba(16,185,129,0.2)' }}>
              <div style={{ fontSize: 9, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ROAS</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981', marginTop: 4 }}>{roas}</div>
            </div>
          )}
        </div>
      )}
      {Array.isArray(campaigns) && campaigns.slice(0, 3).map((c, i) => (
        <div key={i} style={{ padding: '10px 12px', borderRadius: 12,
          background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `0.5px solid ${t.separator}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>
            {String(c.name ?? c.campaign_name ?? `Kampanya ${i + 1}`)}
          </div>
          {(c.recommendation ?? c.action) != null && (
            <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
              {String(c.recommendation ?? c.action).slice(0, 150)}
            </div>
          )}
        </div>
      ))}
      {Array.isArray(actions) && actions.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>Aksiyon Adımları</p>
          {actions.slice(0, 5).map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {typeof a === 'string' ? a : JSON.stringify(a)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feed Cohesion Report view ─────────────────────────────────────────────────
function FormatDistributionChips({
  dist,
  t,
  label,
}: {
  dist: FormatDistribution;
  t: ReturnType<typeof useTheme>['t'];
  label?: string;
}) {
  const fmtColors: Record<string, string> = {
    post: '#3B82F6', story: '#8AABBD', reel: '#EC4899', carousel: '#F59E0B',
  };
  return (
    <div>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['post', 'story', 'reel', 'carousel'] as const).map((fmt) => {
          const count = dist[fmt] ?? 0;
          return (
            <div key={fmt} style={{ padding: '6px 12px', borderRadius: 20,
              background: fmtColors[fmt] + '18', border: `0.5px solid ${fmtColors[fmt]}40` }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: fmtColors[fmt] }}>{count}</span>
              <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 4, textTransform: 'capitalize' }}>{fmt}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function deriveReadyFormatDistributionFromChecklist(
  checklist: MissionSlotChecklist | null | undefined,
): FormatDistribution | null {
  if (!checklist?.items.length) return null;
  const dist: FormatDistribution = { post: 0, story: 0, reel: 0, carousel: 0 };
  for (const item of checklist.items) {
    if (item.status !== 'ready') continue;
    dist[slotRoleToPackageFormat(item.role)] += 1;
  }
  const total = dist.post + dist.story + dist.reel + dist.carousel;
  return total > 0 ? dist : null;
}

function FeedCohesionOutputView({
  node,
  t,
  missionId,
  missionArtifacts,
  missionInFlight,
}: {
  node: MissionNodeProgress;
  t: ReturnType<typeof useTheme>['t'];
  missionId?: string;
  missionArtifacts?: OutputArtifact[];
  missionInFlight?: boolean;
}) {
  const report = nodeOutputObject(node);
  if (!report) return null;

  const feedScore = typeof report.feed_score === 'number' ? report.feed_score : null;
  const rawDist = (report.format_distribution ?? {}) as Record<string, number>;
  const assignments = Array.isArray(report.production_assignments)
    ? report.production_assignments as Array<Record<string, unknown>>
    : [];
  const plannedDist = resolveFeedDirectorFormatDistribution(report);
  const distMismatch = assignments.length > 0 && (
    (rawDist.post ?? 0) !== plannedDist.post
    || (rawDist.story ?? 0) !== plannedDist.story
    || (rawDist.reel ?? 0) !== plannedDist.reel
    || (rawDist.carousel ?? 0) !== plannedDist.carousel
  );
  const slotChecklist = missionId && missionArtifacts
    ? buildMissionSlotChecklist({
      missionId,
      assignments,
      artifacts: missionArtifacts,
      missionInFlight,
    })
    : null;
  const producedDist = deriveReadyFormatDistributionFromChecklist(slotChecklist);
  const notes = filterCohesionNotesForAssignments(
    Array.isArray(report.cohesion_notes) ? report.cohesion_notes as string[] : [],
    plannedDist,
  );
  const verdict = reconcileArtDirectorVerdict(
    String(report.art_director_verdict ?? ''),
    plannedDist,
    assignments.length,
  );
  const schedule = (report.publish_schedule ?? {}) as Record<string, unknown[]>;
  const scheduleCount = countPublishScheduleEntries(schedule);
  const manifestCov = typeof report.manifest_coverage_pct === 'number'
    ? report.manifest_coverage_pct
    : null;
  const productionPis = (report.production_pis ?? {}) as Record<string, unknown>;
  const pisWarnings = Array.isArray(productionPis.warnings)
    ? productionPis.warnings as Array<Record<string, unknown>>
    : [];
  const pisAvg = typeof productionPis.avg === 'number' ? productionPis.avg : null;
  const pisSkipped = typeof productionPis.skipped === 'number' ? productionPis.skipped : 0;
  const scoreColor = feedScore == null ? t.textMuted : feedScore >= 80 ? '#10B981' : feedScore >= 60 ? '#F59E0B' : '#EF4444';
  const ROLE_TR: Record<string, string> = {
    organic_post: 'Organik post',
    designed_post: 'Tasarım post',
    organic_story_still: 'Story (görsel)',
    campaign_story_motion: 'Kampanya story',
    organic_reel: 'Organik reel',
    campaign_reel_motion: 'Kampanya reel',
    organic_carousel: 'Carousel',
    paid_ad_creative: 'Meta reklam',
    paid_ad_google_creative: 'Google Ads',
  };
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_TR: Record<string, string> = { Mon: 'Pzt', Tue: 'Sal', Wed: 'Çar', Thu: 'Per', Fri: 'Cum', Sat: 'Cmt', Sun: 'Paz' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Score + verdict */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
        background: t.isDark ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.06)',
        border: '0.5px solid rgba(16,185,129,0.2)' }}>
        {feedScore != null && (
          <div style={{ fontSize: 32, fontWeight: 900, color: scoreColor, lineHeight: 1, minWidth: 56 }}>
            {feedScore}
            <span style={{ fontSize: 14, color: t.textMuted }}>/100</span>
          </div>
        )}
        <div style={{ flex: 1, fontSize: 12, color: t.textSecondary, lineHeight: 1.55 }}>
          {verdict || 'Feed Art Director analizi tamamlandı.'}
        </div>
      </div>

      {/* PIS summary (APO-3) */}
      {(pisAvg != null || pisWarnings.length > 0) && (
        <div style={{ padding: '10px 12px', borderRadius: 10,
          background: pisSkipped > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.06)',
          border: `0.5px solid ${pisSkipped > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.2)'}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Üretim bütünlüğü (PIS)
          </div>
          <div style={{ fontSize: 12, color: t.textSecondary }}>
            {pisAvg != null && <span>Ortalama <strong style={{ color: t.textPrimary }}>{pisAvg}%</strong></span>}
            {pisSkipped > 0 && (
              <span style={{ marginLeft: pisAvg != null ? 8 : 0, color: '#F59E0B' }}>
                · {pisSkipped} fikir atlandı
              </span>
            )}
          </div>
          {pisWarnings.slice(0, 4).map((w, i) => (
            <div key={i} style={{ fontSize: 10, color: t.textMuted, marginTop: 4 }}>
              #{String(w.idea_index ?? i)} {String(w.headline ?? '').slice(0, 36)} — PIS {String(w.score ?? '?')}%
            </div>
          ))}
        </div>
      )}

      {/* Production assignments (APO-1) */}
      {assignments.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Üretim Atamaları
            </div>
            {manifestCov != null && (
              <span style={{ fontSize: 10, fontWeight: 700, color: manifestCov >= 80 ? '#10B981' : '#F59E0B' }}>
                Manifest {manifestCov}%
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {assignments.slice(0, 12).map((a, i) => {
              const role = String(a.slot_role ?? '');
              const idx = a.idea_index;
              const checklistItem = slotChecklist?.items.find((it) => it.assignmentIndex === i);
              const statusColor = checklistItem?.status === 'ready'
                ? '#10B981'
                : checklistItem?.status === 'rendering'
                  ? '#F59E0B'
                  : checklistItem?.status === 'failed'
                    ? '#EF4444'
                    : t.textMuted;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
                  padding: '6px 10px', borderRadius: 8,
                  background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                  <span style={{ fontWeight: 800, color: t.textMuted, minWidth: 36 }}>Slot {i + 1}</span>
                  <span style={{ fontWeight: 700, color: t.textPrimary, flex: 1 }}>
                    {ROLE_TR[role] ?? role}
                  </span>
                  {typeof idx === 'number' && (
                    <span style={{ fontSize: 9, color: t.textMuted }}>fikir #{idx}</span>
                  )}
                  <span style={{ fontSize: 9, color: t.textMuted }}>{String(a.pipeline ?? '')}</span>
                  {checklistItem && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: statusColor }}>
                      {slotStatusLabel(checklistItem.status)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Format distribution — assignments are authoritative */}
      {(plannedDist.post + plannedDist.story + plannedDist.reel + plannedDist.carousel) > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Format Dağılımı (Plan)
          </div>
          <FormatDistributionChips dist={plannedDist} t={t} />
          {producedDist && (
            <div style={{ marginTop: 10 }}>
              <FormatDistributionChips
                dist={producedDist}
                t={t}
                label={`Feed'de hazır (${slotChecklist?.readyTotal ?? 0}/${assignments.length || slotChecklist?.items.length || 0})`}
              />
            </div>
          )}
          {distMismatch && isMobileOperatorMode() && (
            <div style={{ fontSize: 10, color: t.textMuted, marginTop: 6, lineHeight: 1.45 }}>
              LLM format_distribution düzeltildi — kaynak: üretim atamaları.
            </div>
          )}
        </div>
      )}

      {/* Cohesion notes */}
      {notes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Art Director Notları
          </div>
          {notes.slice(0, 4).map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: '#10B981', flexShrink: 0, fontSize: 12 }}>→</span>
              <span style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>{n}</span>
            </div>
          ))}
        </div>
      )}

      {/* Publish schedule mini-grid */}
      {Object.keys(schedule).length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Yayın Takvimi
            </div>
            {assignments.length > 0 && scheduleCount < assignments.length && (
              <span style={{ fontSize: 9, color: t.textMuted }}>
                {scheduleCount}/{assignments.length} slot zamanlandı
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {DAYS.map(day => {
              const items = (schedule[day] ?? []) as Array<Record<string, unknown>>;
              const first = items[0];
              const timeLabel = first
                ? String(first.suggested_time ?? first.time ?? '').trim()
                : '';
              const formatLabel = first ? String(first.format ?? '').trim() : '';
              return (
                <div key={day} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: t.textMuted, marginBottom: 4 }}>{DAY_TR[day]}</div>
                  <div style={{ minHeight: 36, borderRadius: 6, padding: '4px 2px',
                    background: items.length > 0
                      ? (t.isDark ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.10)')
                      : (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: items.length > 0 ? '#10B981' : t.textMuted }}>
                      {items.length > 0 ? items.length : '–'}
                    </span>
                    {items.length > 0 && timeLabel && (
                      <span style={{ fontSize: 8, color: t.textMuted, lineHeight: 1 }}>{timeLabel}</span>
                    )}
                    {items.length > 0 && formatLabel && (
                      <span style={{ fontSize: 7, color: t.textMuted, lineHeight: 1, textTransform: 'capitalize' }}>
                        {formatLabel.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function NodeOutputView({
  node,
  missionId,
  missionArtifacts,
  missionInFlight,
  onGoToFeed,
  onOpenArtifact,
  allNodes,
}: {
  node: MissionNodeProgress;
  t?: unknown;
  missionId?: string;
  missionArtifacts?: OutputArtifact[];
  missionInFlight?: boolean;
  onGoToFeed?: () => void;
  onOpenArtifact?: (artifactId: string) => void;
  allNodes?: MissionNodeProgress[];
}) {
  const { t } = useTheme();

  if (!nodeHasOutput(node)) {
    return (
      <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', padding: '8px 0',
        textAlign: 'center' }}>
        Çıktı henüz kaydedilmedi — eski çalıştırma
      </div>
    );
  }

  // feed_cohesion_review — art director report with score + schedule
  if (node.task_type === 'feed_cohesion_review') {
    return (
      <FeedCohesionOutputView
        node={node}
        t={t}
        missionId={missionId}
        missionArtifacts={missionArtifacts}
        missionInFlight={missionInFlight}
      />
    );
  }

  // content_strategy — custom structured view
  if (node.task_type === 'content_strategy') {
    return <ContentStrategyView node={node} t={t} />;
  }

  // Analytics tasks — KPI cards + insights
  if (['traffic_analysis', 'conversion_report', 'weekly_performance'].includes(node.task_type)) {
    const data = nodeOutputObject(node) ?? tryParseJson(nodeOutputText(node));
    if (data) return <AnalyticsOutputView data={data} t={t} />;
  }

  // Review tasks
  if (['review_analysis', 'single_review_response'].includes(node.task_type)) {
    const data = nodeOutputObject(node) ?? tryParseJson(nodeOutputText(node));
    if (data) return <ReviewOutputView data={data} t={t} />;
  }

  // Campaign / ads analysis
  if (['campaign_analysis', 'ads_budget_optimization', 'auto_budget_optimize'].includes(node.task_type)) {
    const data = nodeOutputObject(node) ?? tryParseJson(nodeOutputText(node));
    if (data) return <CampaignOutputView data={data} t={t} />;
  }

  // For all other tasks: convert to ArtifactSignal and render
  const signal = nodeToSignal(node);

  // Ad creative
  if (node.task_type === 'ad_creative_generation') {
    // Direct array parse (output often starts with prose before JSON array)
    const adItems = nodeOutputArray(node);
    if (adItems && adItems.length > 0) {
      return <AdCreativeDirectView items={adItems} t={t} />;
    }
    if (signal) return <AdCreativeView signal={signal} t={t} />;
  }

  // Content ideation / calendar / visual design
  // content_calendar — dedicated calendar card view
  if (node.task_type === 'content_calendar') {
    const calItems = nodeOutputArray(node, ['plans', 'calendar', 'items', 'content_calendar', 'schedule']);
    if (calItems && calItems.length > 0) {
      const calLinks = missionId && missionArtifacts?.length
        ? linkCalendarItemsToArtifacts(calItems, missionArtifacts, missionId, { missionInFlight })
        : undefined;
      return (
        <CalendarItemsView
          items={calItems}
          links={calLinks}
          t={t}
          onGoToFeed={onGoToFeed}
          onOpenArtifact={onOpenArtifact}
        />
      );
    }
  }

  // content_ideation / visual_design_cards — planlama + üretilmiş görsel önizleme
  if (['content_ideation', 'visual_design_cards'].includes(node.task_type)) {
    const planningKind = node.task_type === 'visual_design_cards' ? 'design' : 'ideation';
    const hasCalendarNode = allNodes?.some(
      (n) => n.task_type === 'content_calendar' && n.status === 'completed',
    );
    const planningIdeas = node.task_type === 'content_ideation' && allNodes?.length
      ? (hasCalendarNode
        ? buildMissionProductionIdeas({ nodes: allNodes, missionId })
        : buildMissionPlanningDisplayIdeas({ nodes: allNodes, missionId }))
      : [];
    const ideaItems = planningIdeas.length > 0
      ? planningIdeas
      : nodeOutputArray(node);
    if (ideaItems && ideaItems.length > 0) {
      const planLinks = missionId && missionArtifacts?.length
        ? linkPlanningItemsToArtifacts(ideaItems, missionArtifacts, missionId, { missionInFlight })
        : undefined;
      const syntheticSignal = { ideas: ideaItems.map(item => {
        const it = item as Record<string, unknown>;
        return {
          headline:    it.concept_title ?? it.conceptTitle ?? it.idea_title ?? it.title ?? it.headline ?? '',
          concept_title: it.concept_title ?? it.conceptTitle ?? it.idea_title ?? it.title ?? it.headline ?? '',
          caption:     it.caption_draft ?? it.caption ?? it.subline ?? '',
          cta:         it.cta ?? it.cta_text ?? '',
          contentType: it.content_type ?? it.content_kind ?? it.format ?? 'post',
          hashtags:    it.hashtags ?? [],
          mood:        it.mood ?? it.tone ?? it.visual_mood ?? '',
          posting_time_suggestion: it.posting_time_suggestion ?? '',
          ...it,
        };
      }) } as any;
      return (
        <ContentIdeasView
          signal={syntheticSignal}
          t={t}
          onGoToFeed={onGoToFeed}
          planningKind={planningKind}
          links={planLinks}
          artifacts={missionArtifacts}
          onOpenArtifact={onOpenArtifact}
        />
      );
    }
    if (signal) {
      const fallbackItems = signal.ideas ?? [];
      const planLinks = missionId && missionArtifacts?.length && fallbackItems.length
        ? linkPlanningItemsToArtifacts(fallbackItems, missionArtifacts, missionId, { missionInFlight })
        : undefined;
      return (
        <ContentIdeasView
          signal={signal}
          t={t}
          onGoToFeed={onGoToFeed}
          planningKind={planningKind}
          links={planLinks}
          artifacts={missionArtifacts}
          onOpenArtifact={onOpenArtifact}
        />
      );
    }
  }

  // Generic signal — summary + recommendations
  if (signal) {
    const recs = signal.recommendations ?? [];
    const sum  = signal.summary ?? '';
    if (sum || recs.length > 0) {
      return (
        <div>
          {sum && (
            <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, marginBottom: 10 }}>
              {sum.slice(0, 600)}
            </div>
          )}
          {recs.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
              <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      );
    }
  }

  // Try JSON parse for any remaining task types
  const anyData = nodeOutputObject(node) ?? tryParseJson(nodeOutputText(node));
  if (anyData) {
    const sum = anyData.summary as string || anyData.executive_summary as string ||
                anyData.analysis as string || anyData.brief as string || '';
    const recs = (anyData.recommendations ?? anyData.key_insights ?? anyData.actions) as string[] | null;
    if (sum || (Array.isArray(recs) && recs.length > 0)) {
      return (
        <div>
          {sum && <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: '0 0 10px' }}>{sum.slice(0, 500)}</p>}
          {Array.isArray(recs) && recs.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {typeof r === 'string' ? r : JSON.stringify(r)}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }

  // Final fallback — clean raw text
  return (
    <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {nodeOutputText(node).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim().slice(0, 1000)}
    </div>
  );
}

// ── Mission Feed Package (P0: mission → feed bridge) ─────────────────────────

const SLOT_STATUS_COLOR: Record<SlotDeliveryStatus, string> = {
  ready: '#10B981',
  rendering: '#3B82F6',
  failed: '#EF4444',
  missing: '#94A3B8',
  pending: '#F59E0B',
};

function MissionAiCostPanel({
  summary,
  t,
}: {
  summary: MissionAiCostSummary | null;
  t: T;
}) {
  if (!summary) return null;

  const totalLabel = formatMissionAiCostRange(summary);

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 14, marginBottom: 16,
      background: t.isDark ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.05)',
      border: '0.5px solid rgba(245,158,11,0.25)',
    }}>
      <div style={{
        fontSize: 11, fontWeight: 800, color: '#F59E0B', letterSpacing: '0.06em',
        textTransform: 'uppercase', marginBottom: 6,
      }}>
        AI maliyeti — bu misyon
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, color: t.textPrimary, marginBottom: 4 }}>
        {totalLabel}
        <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted, marginLeft: 8 }}>
          API · {summary.artifactCount > 0 ? `${summary.artifactCount} Feed çıktısı` : 'tahmini'}
        </span>
      </div>
      {summary.isEstimate && summary.lines.length === 0 && (
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 8 }}>
          Aralık: {formatUsd(summary.minUsd)} – {formatUsd(summary.maxUsd)} (10 üretimlik paket)
        </div>
      )}
      {summary.lines.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {summary.lines.map((line) => (
            <div
              key={line.key}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11 }}
            >
              <span style={{ color: t.textSecondary }}>{line.label}</span>
              <span style={{ fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' }}>
                {formatUsd(line.usd)}
                {line.source === 'estimated' ? (
                  <span style={{ fontWeight: 500, color: t.textMuted, marginLeft: 4 }}>≈</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}
      {summary.feedBreakdown && summary.feedBreakdown.totalUsd > 0 && (
        (() => {
          const fb = summary.feedBreakdown!;
          const buckets: Array<{ label: string; usd: number }> = [
            { label: 'Video (Runway/fal)', usd: fb.runwayUsd },
            { label: 'Tasarım (fal/Grafiker)', usd: fb.remotionUsd },
            { label: 'Görsel/enhance', usd: fb.imageUsd },
            { label: 'Diğer', usd: fb.otherUsd },
          ].filter((b) => b.usd > 0);
          if (buckets.length === 0) return null;
          return (
            <div style={{
              marginTop: 10, paddingTop: 8,
              borderTop: `0.5px solid ${t.isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.15)'}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, marginBottom: 5 }}>
                Feed üretim kırılımı · {fb.artifactCount} çıktı
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {buckets.map((b) => (
                  <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 10.5 }}>
                    <span style={{ color: t.textSecondary }}>{b.label}</span>
                    <span style={{ fontWeight: 700, color: t.textPrimary, whiteSpace: 'nowrap' }}>{formatUsd(b.usd)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()
      )}
      {summary.feedBreakdown && summary.feedBreakdown.qualityTier && (
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 8 }}>
          Kalite: <strong style={{ color: t.textPrimary }}>{summary.feedBreakdown.qualityTier}</strong>
        </div>
      )}
      <div style={{ fontSize: 10, color: t.textTertiary, marginTop: 8, lineHeight: 1.4 }}>
        Strategist, strateji, fikirler, Feed Director, scene brief ve görsel/video üretimi dahil.
      </div>
    </div>
  );
}

function MissionProductionAlertsBanner({
  alerts,
  t,
}: {
  alerts: string[];
  t: T;
}) {
  if (!alerts.length) return null;
  return (
    <div style={{
      marginTop: 10, padding: '10px 12px', borderRadius: 10,
      background: t.isDark ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.08)',
      border: '0.5px solid rgba(245,158,11,0.28)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#F59E0B',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
      }}>
        Üretim uyarıları
      </div>
      {alerts.map((alert) => (
        <div key={alert} style={{ fontSize: 11, color: t.textSecondary, lineHeight: 1.45, marginTop: 3 }}>
          {alert}
        </div>
      ))}
    </div>
  );
}

function MissionStrategistKpiStrip({
  kpi,
  t,
}: {
  kpi: MissionStrategistKpiSummary;
  t: T;
}) {
  const templatePct = Math.round(kpi.templateCoverageRatio * 100);
  const cells = [
    {
      label: 'Benzersiz başlık',
      value: kpi.uniqueHeadlines,
      sub: kpi.totalArtifacts > 0 ? `/${kpi.totalArtifacts} parça` : 'henüz üretim yok',
    },
    {
      label: 'Benzersiz foto',
      value: kpi.uniquePhotos,
      sub: 'galeri kaynağı',
    },
    {
      label: 'Şablon kapsama',
      value: `${templatePct}%`,
      sub: `${kpi.uniqueTemplates}/${kpi.manifestTarget} slot`,
    },
  ];

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 9, fontWeight: 700, color: t.textMuted,
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
      }}>
        Strategist KPI
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
      }}>
        {cells.map((cell) => (
          <div key={cell.label} style={{
            padding: '10px 8px', borderRadius: 10, textAlign: 'center',
            background: t.isDark ? 'rgba(90,130,160,0.08)' : 'rgba(90,130,160,0.06)',
            border: `0.5px solid ${t.isDark ? 'rgba(90,130,160,0.2)' : 'rgba(90,130,160,0.15)'}`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {cell.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary, lineHeight: 1.2, marginTop: 2 }}>
              {cell.value}
            </div>
            <div style={{ fontSize: 9, color: t.textMuted, marginTop: 2 }}>{cell.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissionProductionPipelineStrip({
  pipeline,
  gapHint,
  storyAudioHint,
  t,
}: {
  pipeline: MissionProductionPipelineSummary;
  gapHint: string | null;
  storyAudioHint?: string | null;
  t: T;
}) {
  const renderingPending = Math.max(0, pipeline.producedArtifacts - pipeline.publishReady);
  const cells = [
    { label: 'Hedef', value: pipeline.productionTarget, sub: 'zorunlu slot' },
    { label: 'Slot hazır', value: pipeline.manifestReady, sub: `/${pipeline.manifestRequired} manifest` },
    { label: 'Yayına hazır', value: pipeline.publishReady, sub: renderingPending > 0 ? `${renderingPending} render` : 'Feed' },
  ];

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
      }}>
        {cells.map((cell) => (
          <div key={cell.label} style={{
            padding: '10px 8px', borderRadius: 10, textAlign: 'center',
            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            border: `0.5px solid ${t.separator}`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {cell.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary, lineHeight: 1.2, marginTop: 2 }}>
              {cell.value}
            </div>
            <div style={{ fontSize: 9, color: t.textMuted, marginTop: 2 }}>{cell.sub}</div>
          </div>
        ))}
      </div>
      {storyAudioHint && (
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 8, lineHeight: 1.45 }}>
          Story ses: <span style={{ color: t.textSecondary }}>{storyAudioHint}</span>
        </div>
      )}
      {(pipeline.plannedCalendarRows > 0 || pipeline.plannedAssignments != null) && (
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 8, lineHeight: 1.45 }}>
          Planlama:
          {pipeline.plannedCalendarRows > 0 && ` ${pipeline.plannedCalendarRows} takvim satırı`}
          {pipeline.plannedAssignments != null && ` · ${pipeline.plannedAssignments} slot ataması`}
          {pipeline.manifestRequired > 0 && ` · manifest ${pipeline.manifestReady}/${pipeline.manifestRequired}`}
        </div>
      )}
      {gapHint && (
        <div style={{
          marginTop: 8, fontSize: 11, color: t.textSecondary, lineHeight: 1.5,
          padding: '8px 10px', borderRadius: 8,
          background: t.isDark ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.06)',
          border: '0.5px solid rgba(245,158,11,0.2)',
        }}>
          {gapHint}
        </div>
      )}
    </div>
  );
}

function MissionSlotChecklistPanel({
  checklist,
  pipelineSummary,
  strategistKpi,
  pipelineGapHint,
  productionAlerts,
  storyAudioHint,
  workspaceId,
  missionId,
  isLoading,
  onGoToFeed,
  onRefresh,
  onReproduceFeed,
  isReproducingFeed,
  feedProductionActive = false,
  debugMode = false,
  t,
}: {
  checklist: MissionSlotChecklist | null;
  pipelineSummary?: MissionProductionPipelineSummary | null;
  strategistKpi?: MissionStrategistKpiSummary | null;
  pipelineGapHint?: string | null;
  productionAlerts?: string[];
  storyAudioHint?: string | null;
  workspaceId: string;
  missionId: string;
  isLoading: boolean;
  onGoToFeed: () => void;
  onRefresh: () => void;
  onReproduceFeed?: (missionId: string) => void;
  isReproducingFeed?: boolean;
  feedProductionActive?: boolean;
  debugMode?: boolean;
  t: T;
}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const { data: factorySummary } = useMissionFactoryJobs(workspaceId, missionId, Boolean(workspaceId && missionId));

  if (isLoading && !checklist) {
    return (
      <div style={{ padding: '12px 14px', borderRadius: 14, marginBottom: 16,
        background: t.isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.05)',
        border: '0.5px solid rgba(59,130,246,0.2)' }}>
        <div style={{ fontSize: 12, color: t.textMuted }}>
          {debugMode ? 'Üretim manifesti kontrol ediliyor…' : 'İçerik durumu kontrol ediliyor…'}
        </div>
      </div>
    );
  }
  if (!checklist || checklist.items.length === 0) {
    if (!pipelineSummary) return null;
    if (!debugMode) {
      const ready = pipelineSummary.publishReady;
      const total = pipelineSummary.productionTarget;
      return (
        <div style={{
          padding: '14px 16px', borderRadius: 14, marginBottom: 16,
          background: t.isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.05)',
          border: '0.5px solid rgba(59,130,246,0.25)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
            {ready >= total ? 'İçerik paketi hazır' : `${ready}/${total} içerik hazır`}
          </div>
          <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
            {ready > 0
              ? 'Onay bekleyen gönderiler İçerik sekmesinde.'
              : feedProductionActive || isReproducingFeed
                ? 'Görseller hazırlanıyor — birkaç dakika içinde görünür.'
                : 'Planınız hazır. Görselleri üretmek için butona dokunun.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {ready < total && !feedProductionActive && !isReproducingFeed && onReproduceFeed && (
              <button
                type="button"
                onClick={() => onReproduceFeed(missionId)}
                style={{
                  flex: 1, minWidth: 140, padding: '10px', borderRadius: 10, border: 'none',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: t.accent, color: '#fff',
                }}
              >
                Görselleri üret
              </button>
            )}
            {ready > 0 && (
            <button
              type="button"
              onClick={onGoToFeed}
              style={{
                marginTop: 12, width: '100%', padding: '10px', borderRadius: 10,
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: t.accent, color: '#fff',
              }}
            >
              İçeriklere git →
            </button>
          )}
          </div>
        </div>
      );
    }
    return (
      <div style={{
        padding: '14px 16px', borderRadius: 14, marginBottom: 16,
        background: t.isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.05)',
        border: '0.5px solid rgba(59,130,246,0.25)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
          Üretim → Feed
        </div>
        {strategistKpi && (
          <MissionStrategistKpiStrip kpi={strategistKpi} t={t} />
        )}
        <MissionProductionPipelineStrip
          pipeline={pipelineSummary}
          gapHint={pipelineGapHint ?? null}
          storyAudioHint={storyAudioHint}
          t={t}
        />
        {productionAlerts && productionAlerts.length > 0 && (
          <MissionProductionAlertsBanner alerts={productionAlerts} t={t} />
        )}
      </div>
    );
  }

  if (!debugMode) {
    const ready = checklist.readyRequired;
    const total = checklist.requiredTotal;
    const pct = checklist.coveragePct;
    const manifestReady = pipelineSummary?.manifestReady ?? ready;
    const manifestRequired = pipelineSummary?.manifestRequired ?? total;
    const packageIncomplete = manifestReady < manifestRequired;
    const statusCopy = missionProductionStatusCopy(factorySummary, {
      manifestReady,
      manifestRequired,
    });
    const inProgress = Boolean(
      isReproducingFeed
      || feedProductionActive
      || checklist.renderingCount > 0
      || statusCopy.inProgress,
    );
    const displayReady = manifestReady;
    const displayTotal = manifestRequired;

    return (
      <div style={{
        padding: '14px 16px', borderRadius: 14, marginBottom: 16,
        background: t.isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.05)',
        border: `0.5px solid rgba(59,130,246,0.25)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary }}>
            Haftalık içerik paketi
          </div>
          <span style={{ fontSize: 13, fontWeight: 800, color: pct >= 80 ? '#10B981' : '#3B82F6' }}>
            {displayReady}/{displayTotal}
          </span>
        </div>
        <div style={{
          height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 10,
          background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 3,
            background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
            transition: 'width 0.4s ease',
          }} />
        </div>
        <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
          {inProgress
            ? statusCopy.subtitle
            : packageIncomplete
              ? statusCopy.subtitle
              : displayReady >= displayTotal
                ? 'Haftalık paketiniz onaya hazır.'
                : `${displayReady} içerik onayınızı bekliyor.`}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {packageIncomplete && !inProgress && onReproduceFeed && (
            <button
              type="button"
              onClick={() => onReproduceFeed(missionId)}
              disabled={isReproducingFeed}
              style={{
                flex: 1, minWidth: 140, padding: '10px', borderRadius: 10, border: 'none',
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: t.accent, color: '#fff',
                opacity: isReproducingFeed ? 0.7 : 1,
              }}
            >
              {displayReady === 0 ? 'Görselleri üret' : 'Eksik içerikleri üret'}
            </button>
          )}
          {ready > 0 && (
            <button
              type="button"
              onClick={onGoToFeed}
              style={{
                flex: 1, minWidth: 120, padding: '10px', borderRadius: 10,
                border: `0.5px solid rgba(59,130,246,0.35)`,
                cursor: 'pointer', fontSize: 12, fontWeight: 700,
                background: 'rgba(59,130,246,0.12)', color: '#3B82F6',
              }}
            >
              İçeriklere git →
            </button>
          )}
        </div>
      </div>
    );
  }

  const summary = formatSlotChecklistSummary(checklist);
  const pct = checklist.coveragePct;
  const missingCount = checklist.items.filter((i) => i.status === 'missing').length;
  const hasIssue = checklist.failedCount > 0 || checklist.renderingCount > 0
    || missingCount > 0
    || checklist.readyRequired < checklist.requiredTotal;
  const needsReproduce = missingCount > 0 || checklist.failedCount > 0;
  const canReproduce = Boolean(onReproduceFeed) && needsReproduce;

  const retryRender = async (artifactId: string) => {
    setRetryingId(artifactId);
    try {
      const res = await fetch(`/api/production-bundle/${artifactId}/retry-render`, {
        method: 'POST',
        headers: { 'X-Tenant-Id': workspaceId },
      });
      if (!res.ok && res.status !== 202) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onRefresh();
    } catch (err) {
      console.warn('[MissionHub] retry-render:', err);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14, marginBottom: 16,
      background: t.isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.05)',
      border: `0.5px solid ${hasIssue ? 'rgba(245,158,11,0.35)' : 'rgba(59,130,246,0.25)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Üretim manifesti
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: pct >= 80 ? '#10B981' : '#F59E0B' }}>
          {summary} · %{pct}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checklist.items.map((item) => {
          const color = SLOT_STATUS_COLOR[item.status];
          return (
            <div key={`${item.role}-${item.assignmentIndex}`} style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
              padding: '7px 10px', borderRadius: 8,
              background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            }}>
              <span style={{ fontWeight: 800, color, minWidth: 52, fontSize: 10 }}>
                {slotStatusLabel(item.status)}
              </span>
              <span style={{ fontWeight: 700, color: t.textPrimary, flex: 1 }}>
                {item.label}
                {item.ideaIndex != null && item.ideaIndex >= 0 && (
                  <span style={{ color: t.textMuted, fontWeight: 600 }}> #{item.ideaIndex}</span>
                )}
              </span>
              {item.headline && (
                <span style={{ fontSize: 9, color: t.textMuted, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.headline.slice(0, 28)}
                </span>
              )}
              {item.aiEnhanceLabel && (
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 6, flexShrink: 0,
                  background: item.aiEnhanceStatus === 'applied'
                    ? 'rgba(16,185,129,0.15)'
                    : 'rgba(148,163,184,0.12)',
                  color: item.aiEnhanceStatus === 'applied' ? '#10B981' : '#94A3B8',
                }}>
                  {item.aiEnhanceLabel.slice(0, debugMode ? 42 : 28)}
                </span>
              )}
              {item.status === 'failed' && item.artifactId && (
                <button
                  type="button"
                  disabled={retryingId === item.artifactId}
                  onClick={() => void retryRender(item.artifactId!)}
                  style={{
                    fontSize: 9, fontWeight: 800, padding: '4px 8px', borderRadius: 8, border: 'none',
                    cursor: retryingId ? 'default' : 'pointer',
                    background: 'rgba(239,68,68,0.15)', color: '#EF4444',
                  }}>
                  {retryingId === item.artifactId ? '…' : 'Yeniden'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {summarizeAiEnhanceItems(checklist.items, debugMode) && (
        <div style={{
          marginTop: 10, padding: '10px 12px', borderRadius: 10,
          background: t.isDark ? 'rgba(77,112,136,0.08)' : 'rgba(77,112,136,0.06)',
          border: `0.5px solid ${t.isDark ? 'rgba(77,112,136,0.22)' : 'rgba(77,112,136,0.14)'}`,
          fontSize: 11, color: t.textMuted, lineHeight: 1.55,
        }}>
          <div style={{ fontWeight: 800, color: '#9DBECE', marginBottom: 4, fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            AI Fotoğraf İyileştirme
          </div>
          {summarizeAiEnhanceItems(checklist.items, debugMode)}
        </div>
      )}
      {checklist.renderingCount > 0 && (
        <div style={{ marginTop: 10, fontSize: 11, color: t.textMuted, lineHeight: 1.5 }}>
          {checklist.renderingCount} slot render ediliyor — birkaç dakika sonra yenileyin.
        </div>
      )}
      {missingCount > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#94A3B8', lineHeight: 1.5 }}>
          {missingCount} zorunlu slot henüz üretilmedi.
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {canReproduce && (
          <button
            type="button"
            disabled={isReproducingFeed}
            onClick={() => onReproduceFeed!(missionId)}
            style={{
              width: '100%', padding: '11px', borderRadius: 10, border: 'none',
              cursor: isReproducingFeed ? 'default' : 'pointer', fontSize: 12, fontWeight: 800,
              background: 'linear-gradient(135deg, #4D7088, #8AABBD)',
              color: '#fff',
              opacity: isReproducingFeed ? 0.7 : 1,
            }}>
            {isReproducingFeed ? 'Paket üretiliyor…' : 'Paketi yeniden üret'}
          </button>
        )}
        {(checklist.failedCount > 0 || checklist.renderingCount > 0 || missingCount > 0) && (
          <button
            type="button"
            onClick={onGoToFeed}
            style={{
              width: '100%', padding: '10px', borderRadius: 10, border: 'none',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: 'rgba(59,130,246,0.12)', color: '#3B82F6',
            }}>
            Feed&apos;de incele →
          </button>
        )}
      </div>
    </div>
  );
}

function MissionPublishPackageCard({
  pkg,
  selection,
  previewArtifacts,
  isLoading,
  onGoToFeed,
  workspaceId,
  missionId,
  onRefresh,
  t,
}: {
  pkg: MissionFeedPackage | null;
  selection: WeeklyPublishSelection | null;
  previewArtifacts: OutputArtifact[];
  isLoading: boolean;
  onGoToFeed: () => void;
  workspaceId?: string;
  missionId?: string;
  onRefresh?: () => void;
  t: T;
}) {
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);

  // Durable Production Factory — live per-slot job rollup.
  const [factoryJobs, setFactoryJobs] = useState<MissionProductionJobsSummary | null>(null);
  const lastFactoryRequeueAt = useRef(0);
  useEffect(() => {
    if (!workspaceId || !missionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const summary = await apiClient.getMissionProductionJobs(workspaceId, missionId);
        if (cancelled) return;
        setFactoryJobs(summary);

        const hasStalledFailed = summary.failed > 0
          && (summary.inFlight ?? 0) === 0
          && summary.ready < summary.total;
        const needsRequeue = summary.slots.some((s) => s.status === 'exhausted')
          || hasStalledFailed;
        const requeueCooldownMs = 60_000;
        if (
          needsRequeue
          && Date.now() - lastFactoryRequeueAt.current > requeueCooldownMs
          && workspaceId
          && missionId
        ) {
          lastFactoryRequeueAt.current = Date.now();
          try {
            await apiClient.requeueMissionFactoryJobs(workspaceId, missionId);
            if (!cancelled) {
              timer = setTimeout(poll, 2000);
              return;
            }
          } catch {
            lastFactoryRequeueAt.current = 0;
          }
        }

        if (!summary.complete && summary.total > 0) {
          timer = setTimeout(poll, 8000);
        }
      } catch {
        // Factory rollup is best-effort — silent on transient errors.
      }
    };
    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [workspaceId, missionId]);

  const failedRenderTargets = useMemo(() => {
    if (!missionId) return [];
    return filterMissionRenderRetryArtifacts(previewArtifacts, missionId);
  }, [previewArtifacts, missionId]);

  const failedStoryCount = useMemo(() => {
    if (!missionId) return 0;
    return filterMissionRemotionStoryRetryArtifacts(previewArtifacts, missionId).length;
  }, [previewArtifacts, missionId]);

  const failedRenderCount = failedRenderTargets.length;

  const retryAllRenders = async () => {
    if (!workspaceId || !missionId) return;
    setRetryingAll(true);
    setRetryMessage(null);
    try {
      const res = await fetch(`/api/missions/${workspaceId}/${missionId}/retry-render`, {
        method: 'POST',
        headers: { 'X-Tenant-Id': workspaceId },
      });
      const body = await res.json().catch(() => ({})) as {
        error?: string;
        message?: string;
        queued?: number;
        total?: number;
      };
      if (!res.ok) {
        setRetryMessage(body.message || body.error || 'Yeniden üretim başlatılamadı');
        return;
      }
      const queued = Number(body.queued ?? 0);
      const total = Number(body.total ?? failedRenderCount);
      if (queued <= 0) {
        setRetryMessage('Yeniden render kuyruğa alınamadı — birkaç saniye sonra tekrar deneyin.');
        return;
      }
      const storyNote = failedStoryCount > 0
        ? `${failedStoryCount} tasarımlı story`
        : `${queued} içerik`;
      setRetryMessage(`${storyNote} yeniden üretiliyor (~2 dk). Feed otomatik güncellenecek.`);
      onRefresh?.();
    } catch (err) {
      console.warn('[MissionHub] retry-render unreachable:', err);
      setRetryMessage('Üretim servisine ulaşılamadı');
    } finally {
      setRetryingAll(false);
    }
  };
  if (isLoading && previewArtifacts.length === 0) {
    return (
      <div style={{ padding: '12px 14px', borderRadius: 14, marginBottom: 16,
        background: t.isDark ? 'rgba(138,171,189,0.08)' : 'rgba(138,171,189,0.06)',
        border: '0.5px solid rgba(138,171,189,0.25)' }}>
        <div style={{ fontSize: 12, color: t.textMuted }}>Feed paketi yükleniyor…</div>
      </div>
    );
  }
  if (!pkg && previewArtifacts.length === 0) return null;

  const hasContent = (pkg?.totalPublishable ?? 0) > 0 || previewArtifacts.length > 0;
  const label = pkg ? formatMissionFeedPackageLabel(pkg) : '';
  const slotProgress = resolveMissionSlotProgress({
    factoryReady: factoryJobs?.ready,
    factoryTotal: factoryJobs?.total,
    pkg,
    selection,
  });
  const selectionLabel = selection
    ? formatWeeklyPackageSummary(selection, {
        producedOverride: factoryJobs?.total ? factoryJobs.ready : undefined,
        targetOverride: factoryJobs?.total ? factoryJobs.total : undefined,
      })
    : label;
  const targetLabel = factoryJobs?.total
    ? `${factoryJobs.total} marka slotu`
    : `${formatWeeklyPackageTarget()} (${MISSION_WEEKLY_PACKAGE_COUNTS.total} içerik)`;

  return (
    <div style={{
      padding: '16px', borderRadius: 16, marginBottom: 16,
      background: 'linear-gradient(135deg, rgba(77,112,136,0.12), rgba(201,169,110,0.08))',
      border: '0.5px solid rgba(138,171,189,0.35)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#8AABBD', letterSpacing: '0.06em',
        textTransform: 'uppercase', marginBottom: 8 }}>
        Haftalık Yayın Paketi
        {selection?.selectionSource === 'feed_art_director' && isMobileOperatorMode() && (
          <span style={{ marginLeft: 6, color: '#10B981', fontWeight: 700 }}>· Art Director</span>
        )}
      </div>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6, lineHeight: 1.45 }}>
        Hedef paket: {targetLabel}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 6 }}>
        {hasContent ? selectionLabel : 'Video story\'ler hazırlanıyor…'}
      </div>
      <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5, marginBottom: 14 }}>
        {hasContent && pkg
          ? (() => {
              const { ready, target } = slotProgress;
              const progress =
                ready > 0 && ready < target
                  ? `${ready}/${target} slot üretildi · `
                  : '';
              return pkg.pendingReview > 0
                ? `${progress}${pkg.pendingReview} içerik Feed'de onayınızı bekliyor.${pkg.backupCount > 0 ? ` (+${pkg.backupCount} ek üretim önerilen paket dışında)` : ''}`
                : `${progress}${pkg.approved} içerik onaylandı · Feed'de yayın geçmişini kontrol edin.`;
            })()
          : previewArtifacts.length > 0
            ? `${previewArtifacts.length} içerik önizlenebilir · render devam edebilir.`
            : 'Auto-produce ve tasarım üretimi arka planda çalışıyor (1–3 dk). Biraz sonra Feed\'i yenileyin.'}
      </div>
      {factoryJobs && factoryJobs.total > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          marginBottom: 12, padding: '8px 10px', borderRadius: 10,
          background: t.isDark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.08)',
          border: '0.5px solid rgba(16,185,129,0.28)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#10B981', letterSpacing: '0.04em' }}>
            ÜRETİM HATTI {factoryJobs.ready}/{factoryJobs.total}
          </span>
          {(factoryJobs.inFlight ?? 0) > 0 && (
            <span style={{ fontSize: 10, color: t.textSecondary }}>
              {factoryJobs.inFlight} üretiliyor
            </span>
          )}
          {(factoryJobs.queued ?? 0) > 0 && (
            <span style={{ fontSize: 10, color: t.textMuted }}>
              {factoryJobs.queued} sırada
            </span>
          )}
          {factoryJobs.failed > 0 && (
            <span style={{ fontSize: 10, color: '#E2A03F' }}>
              {(factoryJobs.inFlight ?? 0) > 0
                ? `${factoryJobs.failed} slot tekrar denenecek`
                : `${factoryJobs.failed} slot bekliyor`}
            </span>
          )}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {factoryJobs.slots.map((slot) => {
              const color = slot.status === 'ready'
                ? '#10B981'
                : slot.status === 'failed' || slot.status === 'exhausted'
                  ? '#E2A03F'
                  : slot.status === 'running' || slot.status === 'claimed'
                    ? '#8AABBD'
                    : t.textMuted;
              return (
                <span
                  key={`${slot.ideaIndex}:${slot.slotRole}`}
                  title={`${slot.format} · ${slot.status}`}
                  style={{
                    width: 8, height: 8, borderRadius: 3, background: color,
                    opacity: slot.status === 'pending' ? 0.4 : 1,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}
      {hasContent && pkg && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {pkg.organicPosts > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(16,185,129,0.12)', color: '#10B981' }}>
              Galeri {pkg.organicPosts}
            </span>
          )}
          {pkg.designedPosts > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(59,130,246,0.12)', color: '#60A5FA' }}>
              Tasarım {pkg.designedPosts}
            </span>
          )}
          {pkg.storyStills > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(138,171,189,0.12)', color: '#9DBECE' }}>
              Story {pkg.storyStills}
            </span>
          )}
          {pkg.storyMotion > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(77,112,136,0.14)', color: '#C4B5FD' }}>
              Motion {pkg.storyMotion}
            </span>
          )}
          {pkg.carousels > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
              Carousel {pkg.carousels}
            </span>
          )}
          {pkg.reels > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(236,72,153,0.12)', color: '#F472B6' }}>
              Reel {pkg.reels}
            </span>
          )}
        </div>
      )}
      {pkg && hasContent && pkg.backupCount > 0 && (
        <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 12, lineHeight: 1.45 }}>
          Yedek: {pkg.backupCount} içerik · onay bekliyorsa Feed&apos;de de görünür.
        </div>
      )}
      {failedRenderCount > 0 && workspaceId && missionId && (
        <>
        <button
          type="button"
          onClick={() => void retryAllRenders()}
          disabled={retryingAll}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12, border: 'none',
            cursor: retryingAll ? 'default' : 'pointer', marginBottom: retryMessage ? 8 : 12,
            background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
            fontSize: 12, fontWeight: 800,
          }}
        >
          {retryingAll
            ? 'Yeniden üretiliyor…'
            : failedStoryCount > 0
              ? `${failedStoryCount} tasarımlı story — yeniden üret`
              : `${failedRenderCount} eksik video/poster — yeniden üret`}
        </button>
        {retryMessage && (
          <div style={{
            fontSize: 11, color: t.textSecondary, marginBottom: 12, lineHeight: 1.45,
            padding: '8px 10px', borderRadius: 10,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
          }}>
            {retryMessage}
          </div>
        )}
        </>
      )}
      <button
        onClick={onGoToFeed}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: hasContent && (pkg?.pendingReview ?? 0) > 0
            ? 'linear-gradient(135deg, #4D7088, #8AABBD)'
            : (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
          color: hasContent && (pkg?.pendingReview ?? 0) > 0 ? '#fff' : t.textSecondary,
          fontSize: 14, fontWeight: 800,
          boxShadow: hasContent && (pkg?.pendingReview ?? 0) > 0 ? '0 4px 20px rgba(77,112,136,0.35)' : 'none',
        }}>
        {(pkg?.pendingReview ?? 0) > 0
          ? `İçeriklere git → ${pkg!.pendingReview} onay bekliyor`
          : hasContent ? 'İçerikleri görüntüle' : 'İçeriklere git'}
      </button>
    </div>
  );
}

// ── Mission Detail Sheet ──────────────────────────────────────────────────────

function MissionDetailSheet({ mission, workspaceId, onClose }: {
  mission: MissionSummary;
  workspaceId: string;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const debugMode = isDebugUiMode();
  const { openMissionFactory, navigate, openFeedForMission, openPlatformPreview } = useMobileStore();
  const openArtifactPreview = (artifactId: string) => openPlatformPreview(artifactId);
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const [productionKickRequested, setProductionKickRequested] = useState(false);
  const [pollCompletedFeed, setPollCompletedFeed] = useState(false);

  const isCompleted = mission.status === 'completed';
  const showFeedPackage = isCompleted || mission.status === 'in_flight';
  const missionInFlight = mission.status === 'in_flight' || mission.status === 'approved';
  const { data: factoryJobsSummary } = useMissionFactoryJobs(
    workspaceId,
    mission.id,
    showFeedPackage,
  );

  const { data: prog, isLoading } = useMissionProgress({
    workspaceId,
    missionId: mission.id,
    missionStatus: mission.status,
    enabled: true,
    poll: missionInFlight,
    pollFeedProduction: pollCompletedFeed,
  });

  const { data: brandThemePayload } = useQuery({
    queryKey: ['brand-theme-kit', workspaceId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-context/${workspaceId}/theme`, {
        headers: { 'X-Tenant-Id': workspaceId },
      });
      if (!res.ok) return null;
      return res.json() as { theme?: Record<string, unknown> };
    },
    staleTime: 60_000,
    enabled: Boolean(workspaceId),
  });

  const storyAudioHint = useMemo(() => {
    const theme = brandThemePayload?.theme;
    if (!theme) return null;
    return describeStoryAudioPolicy(parseMotionProfileFromTheme(theme));
  }, [brandThemePayload]);

  const { data: feedArtifactPool = [], isLoading: feedPkgLoading, refetch: refetchMissionArtifacts } = useMobileArtifacts({
    params: { limit: MOBILE_ARTIFACT_MISSION_POOL_LIMIT },
    subscribeOnly: !pollCompletedFeed,
    pollMissionFeed: pollCompletedFeed,
    enabled: showFeedPackage,
  });
  const feedArtifacts = useMemo(
    () => filterArtifactsForMission(feedArtifactPool, mission.id),
    [feedArtifactPool, mission.id],
  );

  const weeklySelection = useMemo(() => {
    if (!feedArtifacts || !prog?.nodes?.length) return null;
    return buildWeeklySelectionFromMissionNodes(feedArtifacts, mission.id, prog.nodes);
  }, [feedArtifacts, prog?.nodes, mission.id]);

  const feedPackage = feedArtifacts
    ? summarizeMissionFeedPackage(feedArtifacts, mission.id, weeklySelection)
    : null;

  const missionPublishable = useMemo(() => {
    if (!feedArtifacts?.length) return [];
    return filterFeedPublishableArtifacts(
      feedArtifacts.filter((a) => parseArtifactMissionId(a) === mission.id),
    );
  }, [feedArtifacts, mission.id]);

  const previewArtifacts = useMemo(
    () => collectMissionPreviewArtifacts(
      feedArtifacts,
      mission.id,
      weeklySelection,
      missionPublishable,
    ),
    [feedArtifacts, mission.id, weeklySelection, missionPublishable],
  );

  const fdReport = useMemo(
    () => extractFeedDirectorReportFromNodes(prog?.nodes ?? []),
    [prog?.nodes],
  );

  const planningSummary = useMemo(
    () => summarizeMissionPlanningOutputs(prog?.nodes ?? []),
    [prog?.nodes],
  );

  const lastFeedProduced = Number(
    (prog?.performance_summary as { last_feed_produce?: { produced?: number } } | undefined)
      ?.last_feed_produce?.produced ?? 0,
  );

  const missionAiCost = useMemo(() => buildMissionAiCostSummary({
    missionId: mission.id,
    artifacts: feedArtifacts ?? [],
    performanceSummary: (prog?.performance_summary ?? null) as Record<string, unknown> | null,
    nodes: prog?.nodes ?? null,
  }), [feedArtifacts, mission.id, prog?.performance_summary, prog?.nodes]);

  const slotChecklist = useMemo(() => {
    return buildMissionSlotChecklist({
      missionId: mission.id,
      missionType: mission.type,
      missionTitle: mission.title,
      assignments: fdReport?.production_assignments,
      artifacts: feedArtifacts ?? [],
      missionInFlight: mission.status === 'in_flight' || mission.status === 'approved',
      debugMode,
    });
  }, [debugMode, feedArtifacts, mission.id, mission.type, mission.title, mission.status, fdReport]);

  const pipelineSummary = useMemo(() => {
    const fdAssignments = Array.isArray(fdReport?.production_assignments)
      ? fdReport!.production_assignments!.length
      : null;
    return summarizeMissionProductionPipeline({
      artifacts: feedArtifacts ?? [],
      missionId: mission.id,
      checklist: slotChecklist,
      planning: planningSummary,
      fdAssignmentCount: fdAssignments,
      lastFeedProduced: lastFeedProduced > 0 ? lastFeedProduced : null,
      nodes: prog?.nodes ?? [],
      missionInFlight: mission.status === 'in_flight' || mission.status === 'approved',
    });
  }, [feedArtifacts, mission.id, mission.status, slotChecklist, planningSummary, fdReport, lastFeedProduced, prog?.nodes]);

  const strategistKpi = useMemo(
    () => summarizeMissionStrategistKpi({
      artifacts: feedArtifacts ?? [],
      missionId: mission.id,
    }),
    [feedArtifacts, mission.id],
  );

  const pipelineGapHint = useMemo(() => {
    if (!pipelineSummary) return null;
    return describeMissionPipelineGap(planningSummary, pipelineSummary);
  }, [planningSummary, pipelineSummary]);

  const productionTelemetry = useMemo(
    () => telemetryFromMissionProgress({
      performanceSummary: (prog?.performance_summary ?? null) as Record<string, unknown> | null,
      feedDirectorReport: fdReport,
      pipelineSummary: pipelineSummary
        ? {
          producedArtifacts: pipelineSummary.producedArtifacts,
          publishReady: pipelineSummary.publishReady,
        }
        : null,
    }),
    [prog?.performance_summary, fdReport, pipelineSummary],
  );

  const productionSkipAlerts = useMemo(() => {
    const productionPis = (fdReport?.production_pis ?? null) as {
      skipped?: number;
      warnings?: unknown[];
    } | null;
    return summarizeMissionProductionSkipAlerts({
      checklist: slotChecklist,
      fdReport,
      pipeline: pipelineSummary,
      productionPis,
      tenantLearningStatus: productionTelemetry?.tenant_learning?.status ?? null,
      fdRawAssignmentCount: Array.isArray(fdReport?.production_assignments)
        ? (fdReport.production_assignments as unknown[]).length
        : null,
      artifacts: feedArtifacts ?? [],
      missionId: mission.id,
    });
  }, [slotChecklist, fdReport, pipelineSummary, productionTelemetry, feedArtifacts, mission.id]);

  const telemetryAlerts = useMemo(
    () => (productionTelemetry ? describeTelemetryAlerts(productionTelemetry) : []),
    [productionTelemetry],
  );

  const queryClient = useQueryClient();
  const refreshFeedPackage = () => {
    invalidateMobileArtifactPool(queryClient, workspaceId);
  };

  const [reproduceFeedError, setReproduceFeedError] = useState<string | null>(null);
  const [reproduceFeedOk, setReproduceFeedOk] = useState<string | null>(null);
  const hubProductionPackage =
    parseHubProductionPackage(prog?.performance_summary?.hub_production_package)
    ?? getMissionProductionPackage(workspaceId);
  const kickFeedMutation = useMutation({
    mutationFn: () => apiClient.kickMissionFeedProduction(workspaceId, mission.id, {
      productionPackage: hubProductionPackage,
    }),
    onSuccess: (data) => {
      setProductionKickRequested(true);
      setReproduceFeedError(null);
      setReproduceFeedOk(
        data?.message?.trim() || 'Feed üretimi arka planda başlatıldı.',
      );
      refreshFeedPackage();
      void queryClient.invalidateQueries({ queryKey: ['mission-progress', mission.id] });
      void queryClient.invalidateQueries({ queryKey: ['mission-production-jobs', workspaceId, mission.id] });
    },
    onError: (err: Error) => {
      setReproduceFeedOk(null);
      setReproduceFeedError(err.message?.trim() || 'Feed üretimi başlatılamadı');
    },
  });

  const reproduceFeedMutation = useMutation({
    mutationFn: () => apiClient.reproduceMissionFeed(workspaceId, mission.id, {
      productionPackage: hubProductionPackage,
      force: true,
      cleanSlate: true,
    }),
    onSuccess: (data) => {
      setProductionKickRequested(true);
      setReproduceFeedError(null);
      setReproduceFeedOk(
        data?.message?.trim()
        || `${data?.produced ?? 0} içerik Feed'e eklendi.`,
      );
      refreshFeedPackage();
      void queryClient.invalidateQueries({ queryKey: ['mission-progress', mission.id] });
    },
    onError: (err: Error) => {
      setReproduceFeedOk(null);
      setReproduceFeedError(err.message?.trim() || 'Feed üretimi başlatılamadı');
    },
  });

  const goToFeed = () => {
    onClose();
    openFeedForMission(mission.id);
  };

  const completedNodes = (prog?.nodes ?? []).filter(n => n.status === 'completed');
  const rate = mission.total_nodes > 0
    ? Math.round((mission.completed_nodes / mission.total_nodes) * 100)
    : 0;
  const hasPreviewContent = previewArtifacts.length > 0 || (feedPackage?.totalPublishable ?? 0) > 0;
  const slotRendering = (slotChecklist?.renderingCount ?? 0) > 0;

  const visualDesignNodes = (prog?.nodes ?? []).filter(
    (n) => n.task_type === 'visual_design_cards',
  );
  const visualDesignPending = (prog?.nodes ?? []).some(
    (n) => n.task_type === 'content_ideation' && n.status === 'completed',
  )
    && visualDesignNodes.length > 0
    && visualDesignNodes.some(
      (n) => n.status !== 'completed' || !nodeHasOutput(n),
    );
  const calendarNodes = (prog?.nodes ?? []).filter((n) => n.task_type === 'content_calendar');
  const calendarPending = (prog?.nodes ?? []).some(
    (n) => n.task_type === 'content_ideation' && n.status === 'completed',
  )
    && calendarNodes.length > 0
    && calendarNodes.some(
      (n) => n.status !== 'completed' || !nodeHasOutput(n),
    );
  const feedPrepPending = visualDesignPending || calendarPending;
  const productionBlock = parseMissionProductionBlock(
    prog?.performance_summary as Record<string, unknown> | undefined,
  );

  const feedProductionLockActive = isFeedProductionLockActive(
    prog?.performance_summary as Record<string, unknown> | undefined,
  );

  const productionState = String(
    (prog?.performance_summary as Record<string, unknown> | undefined)?.production_state ?? '',
  );
  const productionTarget = pipelineSummary?.productionTarget ?? MISSION_WEEKLY_PACKAGE_COUNTS.total;
  const manifestRequired = pipelineSummary?.manifestRequired ?? slotChecklist?.requiredTotal ?? productionTarget;
  const manifestReady = pipelineSummary?.manifestReady ?? slotChecklist?.readyRequired ?? 0;
  const feedPackageIncomplete = manifestReady < manifestRequired
    || (pipelineSummary?.publishReady ?? 0) < productionTarget;

  const feedProductionActive = isMissionFeedProductionActive({
    kickPending: kickFeedMutation.isPending,
    reproducePending: reproduceFeedMutation.isPending,
    slotRendering,
    feedProductionLockActive,
    productionState,
    userKicked: productionKickRequested,
  });

  useEffect(() => {
    const shouldPoll = shouldPollCompletedMissionFeed({
      missionStatus: mission.status,
      feedPackageIncomplete,
      feedProductionActive,
    });
    setPollCompletedFeed(shouldPoll);
    if (!feedPackageIncomplete) {
      setProductionKickRequested(false);
    }
  }, [
    mission.status,
    feedPackageIncomplete,
    feedProductionActive,
  ]);

  // Auto-kick removed: production is driven exclusively by the backend scheduler
  // and factory drain loop — UI opening a detail sheet must never trigger fal/Remotion costs.
  // Operator can still use explicit buttons when in debug/operatorMode.

  if (typeof window === 'undefined') return null;

  const sheet = (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        animation: 'fadeIn 180ms ease both',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 601,
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        background: t.isDark ? '#0D0D1A' : '#f2f2f7',
        borderRadius: '26px 26px 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.45)',
        border: t.isDark ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '4px 22px 14px', borderBottom: `0.5px solid ${t.separator}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20,
              background: rate >= 80 ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
              color: rate >= 80 ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
              %{rate} · {TYPE_LABEL[mission.type] ?? mission.type}
            </span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {mission.title}
          </div>
          {mission.objective && (
            <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 5, lineHeight: 1.5 }}>
              {mission.objective}
            </div>
          )}
          {debugMode && telemetryAlerts.length > 0 && (
            <div style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.35)',
              fontSize: 11,
              color: '#FCA5A5',
              lineHeight: 1.45,
            }}>
              {telemetryAlerts.map((alert) => (
                <div key={alert} style={{ marginTop: telemetryAlerts[0] === alert ? 0 : 6 }}>
                  {alert}
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
            {mission.completed_nodes}/{mission.total_nodes} plan adımı · {timeAgo(mission.completed_at)}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {isLoading && missionInFlight && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%',
                border: `3px solid ${t.separator}`, borderTop: `3px solid ${t.accent}`,
                animation: 'spinSlow 1s linear infinite', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 13, color: t.textMuted }}>Çıktılar yükleniyor...</div>
            </div>
          )}

          {/* Mission results summary banner */}
          {!isLoading && completedNodes.length > 0 && (() => {
            const feedStatus = missionFeedStatusLabel({
              publishReady: pipelineSummary?.publishReady ?? 0,
              productionTarget: pipelineSummary?.productionTarget ?? MISSION_WEEKLY_PACKAGE_COUNTS.total,
              hasPreviewContent,
              rate,
              feedProductionActive,
              factorySummary: factoryJobsSummary,
            });
            return (
            <div style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 16,
              background: rate >= 80
                ? 'rgba(16,185,129,0.08)'
                : 'rgba(245,158,11,0.08)',
              border: `0.5px solid ${rate >= 80 ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{rate >= 80 ? '✅' : '⏳'}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary }}>
                    {debugMode
                      ? (rate >= 80
                        ? ((pipelineSummary?.publishReady ?? 0) >= (pipelineSummary?.productionTarget ?? MISSION_WEEKLY_PACKAGE_COUNTS.total)
                          ? (hasPreviewContent ? 'Misyon başarıyla tamamlandı' : 'Strateji görevleri tamamlandı')
                          : 'Strateji tamam — Feed üretimi eksik')
                        : `%${rate} tamamlandı`)
                      : feedStatus.title}
                  </div>
                  {!debugMode && feedStatus.subtitle && (
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.45 }}>
                      {feedStatus.subtitle}
                    </div>
                  )}
                  {debugMode && rate >= 80 && !hasPreviewContent && (
                    <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 1.45 }}>
                      Planlama tamam; Feed görselleri ayrı üretim adımında oluşur.
                    </div>
                  )}
                  {planningSummary.strategyTheme && (
                    <div style={{ fontSize: 11, color: t.textSecondary, marginTop: 4, lineHeight: 1.4 }}>
                      Haftalık tema: <span style={{ fontWeight: 700 }}>{planningSummary.strategyTheme}</span>
                    </div>
                  )}
                </div>
              </div>
              {debugMode && (
                <>
              <div style={{
                fontSize: 9, fontWeight: 800, color: t.textMuted, letterSpacing: '0.06em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                Planlama (AI) — Feed dosyası değil
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: pipelineSummary ? 10 : 0 }}>
                {completedNodes.map(node => {
                  const m = taskMeta(node.task_type);
                  const cnt = countNodeResults(node);
                  return (
                    <span key={node.node_key} style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '3px 10px', borderRadius: 20,
                      background: m.color + '15', color: m.color,
                    }}>
                      {m.icon} {cnt != null ? `${cnt} ${m.resultNoun}` : m.label}
                    </span>
                  );
                })}
              </div>
              {pipelineSummary && (
                <div style={{
                  paddingTop: 10, marginTop: 4,
                  borderTop: `0.5px solid ${t.separator}`,
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 800, color: '#3B82F6', letterSpacing: '0.06em',
                    textTransform: 'uppercase', marginBottom: 8,
                  }}>
                    Üretim → Feed özeti
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: t.textSecondary }}>
                    <span><strong style={{ color: t.textPrimary }}>{pipelineSummary.productionTarget}</strong> hedef</span>
                    <span><strong style={{ color: t.textPrimary }}>{pipelineSummary.producedArtifacts}</strong> üretildi</span>
                    <span><strong style={{ color: '#10B981' }}>{pipelineSummary.publishReady}</strong> yayına hazır</span>
                  </div>
                  {pipelineGapHint && (
                    <div style={{ fontSize: 10, color: t.textMuted, marginTop: 6, lineHeight: 1.45 }}>
                      {pipelineGapHint}
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>
            );
          })()}

          {debugMode && (isCompleted || mission.status === 'in_flight') && (
            <MissionAiCostPanel summary={missionAiCost} t={t} />
          )}

          {debugMode && (isCompleted || mission.status === 'in_flight') && (() => {
            const ps = prog?.performance_summary as Record<string, unknown> | undefined;
            const state = String(ps?.production_state ?? 'unknown');
            const slotsReady = Number(ps?.slots_ready ?? 0);
            const slotsTotal = Number(ps?.slots_total ?? 0);
            const lastDrain = ps?.last_drain_at ? new Date(String(ps.last_drain_at)).toLocaleTimeString('tr-TR') : '—';
            const stateColor: Record<string, string> = {
              complete: '#10B981', draining: '#3B82F6', queued: '#F59E0B',
              exhausted: '#EF4444', idle: t.textMuted,
            };
            return (
              <div style={{
                padding: '10px 14px', borderRadius: 12, marginBottom: 12,
                background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}`,
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: t.textMuted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Factory State
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: t.textSecondary }}>
                  <span style={{ color: stateColor[state] ?? t.textMuted, fontWeight: 700 }}>{state}</span>
                  <span>{slotsReady}/{slotsTotal} ready</span>
                  <span>drain: {lastDrain}</span>
                </div>
              </div>
            );
          })()}

          {(isCompleted || mission.status === 'in_flight') && (
            <MissionSlotChecklistPanel
              checklist={slotChecklist}
              pipelineSummary={pipelineSummary}
              strategistKpi={strategistKpi}
              pipelineGapHint={pipelineGapHint}
              productionAlerts={productionSkipAlerts}
              storyAudioHint={storyAudioHint}
              workspaceId={workspaceId}
              missionId={mission.id}
              isLoading={feedPkgLoading}
              onGoToFeed={goToFeed}
              onRefresh={refreshFeedPackage}
              onReproduceFeed={feedPackageIncomplete
                ? () => { kickFeedMutation.mutate(); }
                : undefined}
              isReproducingFeed={kickFeedMutation.isPending || reproduceFeedMutation.isPending}
              feedProductionActive={feedProductionActive}
              debugMode={debugMode}
              t={t}
            />
          )}

          {isCompleted && !hasPreviewContent && (() => {
            const productionError = prog?.performance_summary?.production_error;
            const errMsg = String(productionError?.message ?? '').toLowerCase();
            const isStillProcessing = (kickFeedMutation.isPending || reproduceFeedMutation.isPending)
              || slotRendering
              || feedProductionLockActive
              || feedProductionActive
              || feedPkgLoading
              || errMsg.includes('disconnected')
              || errMsg.includes('server')
              || errMsg.includes('timeout')
              || errMsg.includes('connection')
              || (errMsg.includes('rendering') && !errMsg.includes('failed'));
            const isBudget = !isProductionLimitsBypassed() && (
              productionError?.status_code === 429
              || errMsg.includes('bütçe') || errMsg.includes('budget') || errMsg.includes('limit')
            );
            const productionFailed = Boolean(productionError?.message) && !isStillProcessing && !isBudget;
            const ideationNode = prog?.nodes?.find(n => n.task_type === 'content_ideation' && n.status === 'completed');
            const factoryStatusCopy = (factoryJobsSummary?.total ?? 0) > 0
              ? missionProductionStatusCopy(factoryJobsSummary, {
                  manifestReady: pipelineSummary?.manifestReady ?? 0,
                  manifestRequired: pipelineSummary?.manifestRequired ?? MISSION_WEEKLY_PACKAGE_COUNTS.total,
                })
              : null;

            return (
              <div style={{
                padding: '14px 16px', borderRadius: 14, marginBottom: 16,
                background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
                  {visualDesignPending
                    ? 'Görsel tasarım önerileri bekleniyor'
                    : calendarPending
                      ? 'Yayın takvimi hazırlanıyor'
                      : productionFailed
                        ? 'Feed üretimi tamamlanamadı'
                        : productionBlock && !isStillProcessing
                          ? productionBlock.label
                          : isStillProcessing
                            ? (factoryStatusCopy?.title ?? 'Görseller hazırlanıyor')
                            : 'Feed görselleri henüz yok'}
                </div>
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>
                  {visualDesignPending
                    ? 'Ajans tasarım kartları tamamlanınca Feed üretimi otomatik başlayacak.'
                    : calendarPending
                      ? 'Plan satırları (format, tarih, başlık) hazır olunca her biri için Feed çıktısı üretilir.'
                      : productionFailed
                        ? String(productionError?.message ?? 'Feed üretimi başarısız oldu. Aşağıdan tekrar deneyin.')
                      : productionBlock && !isStillProcessing
                        ? `Feed üretimi şunu bekliyor: ${productionBlock.awaitingNodes.join(', ') || productionBlock.label}. Tamamlanınca otomatik başlayacak.`
                      : isStillProcessing
                    ? (factoryStatusCopy?.subtitle ?? 'Görseller hazırlanıyor — gönderiler geldikçe Feed sekmesinde görünür.')
                    : isBudget
                      ? (debugMode
                        ? 'Bugünkü üretim kotası doldu. Yarın otomatik devam eder veya aşağıdan manuel başlatın.'
                        : 'Bu ayki kredi limitiniz doldu. Yeni içerik yarın veya kredi yüklemesi sonrası devam eder.')
                      : (debugMode
                        ? 'Strateji ve fikirler tamam. Feed üretimi arka planda başlatılır; gerekirse aşağıdan yenileyin.'
                        : 'Planınız hazır. Görselleri üret\'e dokunarak haftalık paketi oluşturun.')}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { void refetchMissionArtifacts(); }}
                    style={{
                      padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                      background: 'transparent',
                      border: `0.5px solid ${t.separator}`,
                      color: t.textSecondary, fontSize: 12, fontWeight: 600,
                    }}
                  >
                    ↻ Yenile
                  </button>
                  {!isStillProcessing && ideationNode && !feedPrepPending && !productionFailed && (
                    <button
                      type="button"
                      onClick={() => kickFeedMutation.mutate()}
                      disabled={kickFeedMutation.isPending}
                      style={{
                        padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                        background: t.accent, border: 'none',
                        color: '#fff', fontSize: 12, fontWeight: 700,
                        opacity: kickFeedMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      {kickFeedMutation.isPending ? 'Üretiliyor…' : 'Görselleri üret →'}
                    </button>
                  )}
                  {!isStillProcessing && ideationNode && productionFailed && (
                    <button
                      type="button"
                      onClick={() => reproduceFeedMutation.mutate()}
                      disabled={reproduceFeedMutation.isPending}
                      style={{
                        padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                        background: t.accent, border: 'none',
                        color: '#fff', fontSize: 12, fontWeight: 700,
                        opacity: (kickFeedMutation.isPending || reproduceFeedMutation.isPending) ? 0.7 : 1,
                      }}
                    >
                      {(kickFeedMutation.isPending || reproduceFeedMutation.isPending)
                        ? 'Üretiliyor…'
                        : 'Feed üretimini tekrar dene →'}
                    </button>
                  )}
                  {debugMode && !isStillProcessing && ideationNode && !productionFailed && (
                    <button
                      type="button"
                      onClick={() => reproduceFeedMutation.mutate()}
                      disabled={reproduceFeedMutation.isPending}
                      style={{
                        padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                        background: 'transparent',
                        border: `0.5px solid ${t.accentBorder}`,
                        color: t.accent, fontSize: 12, fontWeight: 700,
                        opacity: reproduceFeedMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      {reproduceFeedMutation.isPending ? 'Üretiliyor…' : 'Feed üretimini başlat (sync) →'}
                    </button>
                  )}
                  {debugMode && !isStillProcessing && ideationNode && (
                    <button
                      type="button"
                      onClick={() => openMissionFactory(mission.id, ideationNode.node_key)}
                      style={{
                        padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                        background: 'transparent',
                        border: `0.5px solid ${t.accentBorder}`,
                        color: t.accent, fontSize: 12, fontWeight: 700,
                      }}
                    >
                      İçerik fabrikası
                    </button>
                  )}
                </div>
                {reproduceFeedOk && (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#22C55E', lineHeight: 1.45 }}>
                    {reproduceFeedOk}
                  </div>
                )}
                {reproduceFeedError && (
                  <div style={{ marginTop: 10, fontSize: 11, color: '#EF4444', lineHeight: 1.45 }}>
                    {reproduceFeedError}
                  </div>
                )}
              </div>
            );
          })()}

          {showFeedPackage && (hasPreviewContent || missionInFlight || (isCompleted && feedPkgLoading)) && (
            <MissionPublishPackageCard
              pkg={feedPackage}
              selection={weeklySelection}
              previewArtifacts={previewArtifacts}
              isLoading={feedPkgLoading && !feedPackage?.totalPublishable && previewArtifacts.length === 0}
              onGoToFeed={goToFeed}
              workspaceId={workspaceId}
              missionId={mission.id}
              onRefresh={() => {
                invalidateMobileArtifactPool(queryClient, workspaceId);
                void queryClient.invalidateQueries({ queryKey: ['mission-progress', mission.id] });
              }}
              t={t}
            />
          )}

          {isCompleted && weeklySelection && weeklySelection.backup.length > 0 && (
            <div style={{
              padding: '14px', borderRadius: 14, marginBottom: 16,
              background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: `0.5px solid ${t.separator}`,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: t.textMuted,
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                Yedek İçerikler ({weeklySelection.backup.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {weeklySelection.backup.slice(0, 5).map((art) => {
                  const meta = (art.metadata ?? {}) as Record<string, unknown>;
                  const headline = String(meta.headline || art.title || 'İçerik').slice(0, 60);
                  return (
                    <div key={art.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '8px 10px', borderRadius: 10,
                      background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                    }}>
                      <span style={{ fontSize: 12, color: t.textSecondary, flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {headline}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted,
                        padding: '2px 8px', borderRadius: 10,
                        background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }}>
                        yedek
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {completedNodes.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: t.textMuted, fontSize: 13 }}>
              Tamamlanmış görev çıktısı bulunamadı
            </div>
          )}

          {completedNodes.map(node => {
            const isOpen = expandedNode === node.node_key;
            const hasOutput = nodeHasOutput(node);
            const meta = taskMeta(node.task_type);
            const resultCount = hasOutput ? countNodeResults(node, completedNodes) : null;
            const ics = node.task_type === 'content_ideation' && hasOutput
              ? computeNodeIcs(node)
              : null;
            const icsColor = ics == null ? t.textMuted
              : ics >= 90 ? '#10B981' : ics >= 70 ? '#F59E0B' : '#EF4444';
            const isContentNode = ['content_ideation', 'visual_design_cards'].includes(node.task_type);

            return (
              <div key={node.node_key} style={{ marginBottom: 10 }}>
                {/* Node header — human-readable label with icon */}
                <button
                  onClick={() => hasOutput ? setExpandedNode(isOpen ? null : node.node_key) : undefined}
                  style={{
                    width: '100%', textAlign: 'left', padding: '13px 14px',
                    borderRadius: isOpen ? '14px 14px 0 0' : 14,
                    background: isOpen
                      ? (t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')
                      : (t.isDark ? 'rgba(255,255,255,0.04)' : '#fafafa'),
                    border: `0.5px solid ${isOpen ? meta.color + '50' : t.separator}`,
                    cursor: hasOutput ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>

                  {/* Icon bubble */}
                  <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: meta.color + '18', border: `1.5px solid ${meta.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16 }}>
                    {meta.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Human-readable label */}
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary,
                      lineHeight: 1.2, marginBottom: 2 }}>
                      {meta.label}
                    </div>
                    {/* Result summary */}
                    <div style={{ fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {['content_ideation', 'visual_design_cards', 'content_calendar', 'content_strategy', 'feed_cohesion_review'].includes(node.task_type) && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 6,
                          background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                          color: t.textMuted, letterSpacing: '0.03em',
                        }}>
                          planlama
                        </span>
                      )}
                      {hasOutput && resultCount != null ? (
                        <span style={{ color: meta.color, fontWeight: 600 }}>
                          {resultCount} {meta.resultNoun} planlandı
                        </span>
                      ) : hasOutput ? (
                        <span style={{ color: '#10B981', fontWeight: 600 }}>Tamamlandı ✓</span>
                      ) : (
                        <span>Çıktı yok</span>
                      )}
                      {ics != null && isMobileOperatorMode() && (
                        <span style={{ padding: '1px 6px', borderRadius: 10,
                          background: icsColor + '18', color: icsColor,
                          fontSize: 9, fontWeight: 800 }}>
                          ICS {ics}%
                        </span>
                      )}
                    </div>
                  </div>

                  {hasOutput && (
                    <span style={{ fontSize: 14, color: meta.color, flexShrink: 0,
                      transition: 'transform 0.2s',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      ▾
                    </span>
                  )}
                </button>

                {/* Expanded output */}
                {isOpen && (
                  <div style={{
                    padding: '14px', border: `0.5px solid ${meta.color + '30'}`,
                    borderTop: 'none', borderRadius: '0 0 14px 14px',
                    background: t.isDark ? 'rgba(255,255,255,0.02)' : '#fff',
                  }}>
                    <NodeOutputView
                      node={node}
                      t={t}
                      missionId={mission.id}
                      missionArtifacts={feedArtifacts ?? []}
                      missionInFlight={mission.status === 'in_flight' || mission.status === 'approved'}
                      onGoToFeed={isContentNode ? goToFeed : undefined}
                      onOpenArtifact={openArtifactPreview}
                      allNodes={completedNodes}
                    />

                    {/* Per-node action buttons */}
                    {isContentNode && hasOutput && debugMode && (
                      <div style={{ marginTop: 14 }}>
                        <button
                          onClick={() => { onClose(); openMissionFactory(mission.id, node.node_key); }}
                          style={{
                            width: '100%', padding: '12px', borderRadius: 12,
                            cursor: 'pointer', border: `0.5px solid ${t.separator}`,
                            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                            color: t.textSecondary, fontSize: 12, fontWeight: 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}>
                          ✦ İçerik Fabrikası'nda Detaylandır
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}

// ── CompletedRow ──────────────────────────────────────────────────────────────

/** Build a human-readable production summary for the completed mission row */
function missionOutputBadges(mission: MissionSummary): string {
  const type = mission.type ?? '';
  const completed = mission.completed_nodes ?? 0;
  const total = mission.total_nodes ?? 0;

  const parts: string[] = [];

  // Deduce what was likely produced based on mission type
  if (type.includes('content') || type.includes('seasonal') || type.includes('weekly')) {
    // content ideation missions typically produce ~3-6 ideas
    if (completed > 0) parts.push(`${Math.min(completed * 3, 9)} içerik fikri`);
  }
  if (type.includes('strategy') || type.includes('strateji')) {
    parts.push('haftalık strateji');
  }
  if (type.includes('review') || type.includes('yorum')) {
    if (completed > 0) parts.push(`${completed} yorum yanıtı`);
  }
  if (type.includes('ads') || type.includes('reklam') || type.includes('campaign')) {
    parts.push('kampanya analizi');
  }
  if (type.includes('analytics') || type.includes('rapor')) {
    parts.push('performans raporu');
  }

  if (parts.length === 0 && completed > 0) {
    parts.push(`${completed}/${total} görev`);
  }

  return parts.join(' · ');
}

function CompletedRow({ mission, onTap }: { mission: MissionSummary; onTap: () => void }) {
  const { t } = useTheme();
  const rate = mission.total_nodes > 0
    ? Math.round((mission.completed_nodes / mission.total_nodes) * 100)
    : 0;
  const badges = missionOutputBadges(mission);
  const isFullyDone = rate >= 80;

  return (
    <button onClick={onTap} style={{
      width: '100%', padding: '14px 16px', marginBottom: 8,
      borderRadius: 14, cursor: 'pointer',
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${t.separator}`,
      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      {/* Icon */}
      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0,
        background: isFullyDone ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, color: isFullyDone ? '#10B981' : '#F59E0B' }}>
        {isFullyDone ? '✓' : '◔'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Mission title */}
        <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: 3 }}>
          {mission.title}
        </div>
        {/* What was produced */}
        {badges && (
          <div style={{ fontSize: 11, color: isFullyDone ? '#10B981' : t.textMuted,
            fontWeight: isFullyDone ? 600 : 400, marginBottom: 2 }}>
            {badges}
          </div>
        )}
        {/* Time */}
        <div style={{ fontSize: 10, color: t.textMuted }}>
          {TYPE_LABEL[mission.type] ?? mission.type} · {timeAgo(mission.completed_at)}
        </div>
      </div>

      <span style={{ fontSize: 14, color: t.accent, flexShrink: 0 }}>›</span>
    </button>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

// ── BrandReadinessCard ──────────────────────────────────────────────────────
// Sprint 1 gate UI — shows BRS score, a progress bar and the missing checklist
// items with the operator action for each. Mission proposing is disabled until
// BRS >= 70; full autonomy needs BRS = 100.
function BrandReadinessCard({
  t,
  readiness,
  tenantId,
  onComplete,
  onFix,
}: {
  t: T;
  readiness: BrandReadinessResult;
  tenantId: string | null;
  onComplete: (fix?: string, checkId?: string) => void;
  onFix?: (fix: string, checkId?: string) => void;
}) {
  const operatorMode = isMobileOperatorMode();
  const score = readiness.score ?? 0;
  const blocks = readiness.canProposeMissions === false;
  const accent = blocks ? '#EF4444' : score === 100 ? '#22C55E' : '#F59E0B';
  const missing = (readiness.missing ?? []).slice(0, 6);

  return (
    <div style={{
      margin: '12px 22px 0',
      padding: '14px 16px',
      borderRadius: 16,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${blocks ? 'rgba(239,68,68,0.35)' : t.separator}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em' }}>
            Marka Hazırlığı
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {blocks
              ? 'Misyon önerebilmek için en az %70 gerekli'
              : score === 100
                ? 'Tüm kapılar tamam — tam uyum'
                : 'Otonom üretim için %100 hedefleyin'}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: accent, letterSpacing: '-0.03em' }}>
          {score}<span style={{ fontSize: 12, color: t.textMuted }}>/100</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 10, height: 6, borderRadius: 6, background: t.separator, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: accent, transition: 'width 0.4s ease' }} />
      </div>

      {/* Missing checklist */}
      {missing.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {missing.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => (c.fix && onFix ? onFix(c.fix, c.id) : onComplete(c.fix, c.id))}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                width: '100%',
                padding: '6px 0',
                border: 'none',
                background: 'transparent',
                cursor: c.fix ? 'pointer' : 'default',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 12, color: accent, lineHeight: '16px' }}>○</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary, lineHeight: 1.3 }}>
                  {c.label}
                  {operatorMode && (
                    <span style={{ fontWeight: 400, color: t.textMuted }}> · {c.detail}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>
                  {c.action}
                  {c.fix && (
                    <span style={{ color: t.accent, fontWeight: 600 }}> → Alanı aç</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => onComplete(missing[0]?.fix, missing[0]?.id)}
        style={{
          marginTop: 12, width: '100%', padding: '9px 14px', borderRadius: 10,
          border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff',
          background: `linear-gradient(135deg, ${accent}dd, ${accent}99)`,
        }}>
        İlgili alana git →
      </button>
      <MobileBrandAutoFill tenantId={tenantId} variant="card" />
    </div>
  );
}

function ProductionProfileCard({
  t,
  profile,
  tenantId,
  onFix,
}: {
  t: T;
  profile: ProductionProfileReadinessResult;
  tenantId: string | null;
  onFix: (fix?: string, checkId?: string) => void;
}) {
  const score = profile.score ?? 0;
  const ready = profile.isProductionReady !== false;
  const accent = ready ? '#22C55E' : score >= 50 ? '#F59E0B' : '#EF4444';
  const missing = (profile.missing ?? []).slice(0, 4);

  return (
    <div style={{
      margin: '10px 22px 0',
      padding: '12px 14px',
      borderRadius: 14,
      background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
      border: `0.5px solid ${ready ? t.separator : 'rgba(239,68,68,0.28)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.textPrimary }}>Üretim Tasarım Profili</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {ready
              ? 'Fal katmanları hazır — typography + intensity + DNA'
              : `Fal standardı için en az %${PRODUCTION_PROFILE_THRESHOLD} gerekli`}
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: accent }}>
          {score}<span style={{ fontSize: 11, color: t.textMuted }}>/100</span>
        </div>
      </div>

      <div style={{ marginTop: 8, height: 5, borderRadius: 5, background: t.separator, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: accent, transition: 'width 0.35s ease' }} />
      </div>

      {missing.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {missing.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onFix(c.fix, c.id)}
              style={{
                display: 'flex',
                gap: 8,
                width: '100%',
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: c.fix ? 'pointer' : 'default',
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 11, color: accent }}>○</span>
              <span style={{ fontSize: 11, color: t.textPrimary, lineHeight: 1.35 }}>
                {c.label}
                <span style={{ color: t.textMuted }}> · {c.detail}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── BrandAlignmentCard ──────────────────────────────────────────────────────
// Sprint 8 — single-glance Brand Alignment Score with the 5 sub-scores.
// BAS = min(standing scores); autonomy needs all standing = 100.
function BrandAlignmentCard({
  t,
  data,
  onFix,
}: {
  t: T;
  data: BrandAlignmentData;
  onFix: (target: string) => void;
}) {
  const basColor = data.bas >= 100 ? '#22C55E' : data.bas >= 80 ? '#F59E0B' : '#EF4444';
  const scoreColor = (s: number | null) =>
    s == null ? t.textMuted : s >= 100 ? '#22C55E' : s >= 70 ? '#F59E0B' : '#EF4444';

  return (
    <div style={{
      margin: '12px 22px 0', padding: '14px 16px', borderRadius: 16,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${data.bas >= 100 ? 'rgba(34,197,94,0.35)' : t.separator}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em' }}>
            Marka Uyum Skoru (BAS)
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            {data.canAutoProduce
              ? 'Tüm temel skorlar tam — otonom üretime hazır'
              : data.canProposeMissions
                ? 'Misyon önerilebilir; otonom için %100 hedefleyin'
                : 'Temel skorları yükseltin'}
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: basColor, letterSpacing: '-0.03em' }}>
          {data.bas}<span style={{ fontSize: 12, color: t.textMuted }}>/100</span>
        </div>
      </div>

      {/* Sub-score chips */}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {data.subScores.map((s) => {
          const c = scoreColor(s.score);
          return (
            <button
              key={s.id}
              onClick={() => onFix(s.fix)}
              title={`${s.label}${s.kind === 'runtime' ? ' (üretimde ölçülür)' : ''}`}
              style={{
                padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                background: c + '14', border: `0.5px solid ${c}40`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted }}>{s.id}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: c }}>
                {s.score == null ? '–' : s.score}
              </span>
            </button>
          );
        })}
      </div>

      {data.weakest && data.weakest.score != null && data.weakest.score < 100 && (
        <button
          onClick={() => onFix(data.weakest!.fix)}
          style={{
            marginTop: 10, width: '100%', padding: '8px 12px', borderRadius: 10,
            border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#fff',
            background: `linear-gradient(135deg, ${basColor}dd, ${basColor}99)`,
          }}>
          Önce {data.weakest.label} ({data.weakest.score}) →
        </button>
      )}
    </div>
  );
}

// ── ContextSignalsCard ──────────────────────────────────────────────────────
// Sprint 6 — surfaces the deterministic triggers (season, full moon, weekly
// rhythm, holidays, sector) feeding the Strategist, so the operator sees WHY
// content is timed the way it is. Includes the industry-calendar stale badge.
function ContextSignalsCard({
  t,
  data,
  calendarStale,
  calendarStaleDays,
}: {
  t: T;
  data: ContextSignalsData;
  calendarStale: boolean;
  calendarStaleDays: number | null;
}) {
  const top = (data.signals ?? []).slice(0, 5);
  const typeIcon: Record<string, string> = {
    lunar: '🌙', season: '🍃', holiday: '🎉', weekly_rhythm: '📅',
    golden_hour: '🌅', solstice_equinox: '☀️', sector: '✦', day_of_week: '🗓️', day_part: '🕒',
  };
  return (
    <div style={{
      margin: '12px 22px 0', padding: '14px 16px', borderRadius: 16,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${t.separator}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em' }}>
          Bu Hafta Aktif Sinyaller
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted }}>
          {data.sectorPack?.label} · {data.activeThisWeek} aktif
        </span>
      </div>

      {calendarStale && (
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 8,
          background: 'rgba(245,158,11,0.12)', border: '0.5px solid rgba(245,158,11,0.4)',
          fontSize: 10, color: '#F59E0B', fontWeight: 600,
        }}>
          ⚠ Sektör takvimi {calendarStaleDays} gün önce güncellendi — tazelemeniz önerilir
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {top.map((s) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>{typeIcon[s.type] ?? '•'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.title}
              </div>
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
              background: s.verified ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.15)',
              color: s.verified ? '#10B981' : t.textMuted,
            }}>
              {Math.round(s.confidence * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MissionHub() {
  const { t } = useTheme();
  const operatorMode = isMobileOperatorMode();
  const debugMode = isDebugUiMode();
  const { navigate, goBack, openBrand, openStoryTemplates, openFeedForMission, history } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [detailMission, setDetailMission] = useState<MissionSummary | null>(null);
  const [productionPackage, setProductionPackageState] = useState<MissionProductionPackage>('weekly_content');
  const [deferGateQueries, setDeferGateQueries] = useState(false);

  const wsId = tenantId;

  useEffect(() => {
    const id = window.setTimeout(() => setDeferGateQueries(true), 350);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!wsId) return;
    setProductionPackageState(getMissionProductionPackage(wsId));
  }, [wsId]);

  const {
    data: missions = [],
    isLoading: missionsInitialLoading,
    isError: missionsLoadError,
    refetch: refetchMissions,
    isFetching: missionsFetching,
  } = useQuery({
    queryKey: ['missions', wsId],
    queryFn: () => apiClient.listMissionsForHub(wsId),
    refetchInterval: (query) => {
      const list = (query.state.data as MissionSummary[] | undefined) ?? [];
      const active = list.some(
        (m) => m.status === 'in_flight' || m.status === 'approved',
      );
      return active ? 25_000 : false;
    },
    staleTime: 45_000,
    retry: 2,
    placeholderData: keepPreviousData,
    enabled: Boolean(wsId),
    ...mobileQueryDefaults,
  });
  const missionsLoading = missionsInitialLoading && missions.length === 0;

  const {
    data: productionSnapshot,
    isFetching: productionSnapshotFetching,
    isFetched: productionSnapshotFetched,
  } = useQuery({
    queryKey: ['production-context-snapshot', wsId],
    queryFn: async () => {
      try {
        return await apiClient.getProductionBrandContextSnapshot(wsId);
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: 1,
    enabled: Boolean(wsId) && Boolean(proposeError),
  });
  const brandCtx = productionSnapshotToLegacyBrandContext(productionSnapshot);

  const profileHydratedRef = useRef(false);
  useEffect(() => {
    if (profileHydratedRef.current || !wsId) return;
    const hydrateKey = `sa-profile-hydrate:${wsId}`;
    try {
      if (sessionStorage.getItem(hydrateKey)) return;
    } catch { /* private mode */ }
    profileHydratedRef.current = true;
    const runHydrate = () => {
      fetch(`/api/brand-context/${wsId}/hydrate-company-profile`, {
        method: 'POST',
        headers: getTenantBffHeaders(wsId),
      })
        .then(() => {
          try { sessionStorage.setItem(hydrateKey, '1'); } catch { /* ignore */ }
          if (!operatorMode) return;
          queryClient.invalidateQueries({ queryKey: ['brand-readiness', wsId] });
          queryClient.invalidateQueries({ queryKey: ['production-context-snapshot', wsId] });
          queryClient.invalidateQueries({ queryKey: ['gallery-intelligence', wsId] });
        })
        .catch(() => {
          profileHydratedRef.current = false;
        });
    };
    const delayMs = operatorMode ? 800 : 12_000;
    const t = window.setTimeout(runHydrate, delayMs);
    return () => window.clearTimeout(t);
  }, [wsId, queryClient, operatorMode]);

  const { data: usageCost } = useQuery({
    queryKey: ['usage-cost', wsId],
    queryFn: () => apiClient.getWorkspaceUsageCost(wsId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: Boolean(wsId) && operatorMode,
    ...mobileQueryDefaults,
  });

  // Brand readiness gate (Sprint 1) — missions cannot be proposed until BRS >= 80.
  const { data: readiness } = useQuery<BrandReadinessResult & { productionProfile?: ProductionProfileReadinessResult }>({
    queryKey: ['brand-readiness', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-readiness/${wsId}`, {
        headers: getTenantBffHeaders(wsId),
      });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: operatorMode ? 30_000 : 3 * 60_000,
    retry: 1,
    enabled: Boolean(wsId) && deferGateQueries,
    ...mobileQueryDefaults,
  });

  // Brand Alignment Score (Sprint 8) — aggregate of the standing sub-scores.
  const { data: alignment } = useQuery<BrandAlignmentData>({
    queryKey: ['brand-alignment', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-alignment/${wsId}`);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: 60_000,
    enabled: Boolean(wsId) && operatorMode,
  });

  // Context signals — season/holiday/lunar/sector triggers for every tenant;
  // promptBlock is injected into the Strategist at propose time (client + operator).
  const fetchContextSignals = async (): Promise<ContextSignalsData> => {
    const res = await fetch(`/api/context-signals/${wsId}`, {
      headers: getTenantBffHeaders(wsId),
    });
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  };

  const { data: contextSignals } = useQuery<ContextSignalsData>({
    queryKey: ['context-signals', wsId],
    queryFn: fetchContextSignals,
    staleTime: 60_000,
    enabled: Boolean(wsId),
    ...mobileQueryDefaults,
  });

  // Industry calendar freshness (Sprint 6 stale badge).
  const { data: briefs } = useQuery<{ industry_intelligence_updated_at?: string | null }>({
    queryKey: ['all-briefs-freshness', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-context/${wsId}/all-briefs`);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: 120_000,
    enabled: Boolean(wsId) && operatorMode,
  });

  const calendarStaleDays = (() => {
    const ts = briefs?.industry_intelligence_updated_at;
    if (!ts) return null;
    const parsed = Date.parse(ts);
    if (!Number.isFinite(parsed)) return null;
    return Math.floor((Date.now() - parsed) / 86_400_000);
  })();
  const calendarStale = calendarStaleDays != null && calendarStaleDays > 14;

  // Gallery Intelligence (Sprint 7) — propose also requires GIS >= 70.
  const { data: gis } = useQuery<{ score: number; canPropose: boolean }>({
    queryKey: ['gallery-intelligence', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/gallery-intelligence/${wsId}`, {
        headers: getTenantBffHeaders(wsId),
      });
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: operatorMode ? 60_000 : 3 * 60_000,
    enabled: Boolean(wsId) && deferGateQueries,
    ...mobileQueryDefaults,
  });

  const readinessScore = readiness?.score ?? null;
  const gisScore = typeof gis?.score === 'number' ? gis.score : null;
  const brsBlocks =
    readiness != null && Array.isArray(readiness.checks) && readiness.checks.length > 0
      ? readiness.canProposeMissions === false
      : false;
  const gisBlocks = gisScore != null ? gisScore < 70 : false;
  const readinessBlocks = brsBlocks || gisBlocks;

  // Auto-run gallery vision analysis when photos exist but GIS is below gate (operator only).
  const coverageJobStarted = useRef(false);
  useEffect(() => {
    if (!operatorMode || !wsId || coverageJobStarted.current || gisScore == null || gisScore >= 70) return;
    const coverageKey = `sa-coverage-job:${wsId}`;
    try {
      if (sessionStorage.getItem(coverageKey)) return;
    } catch { /* ignore */ }
    coverageJobStarted.current = true;
    const t = window.setTimeout(() => {
      fetch(`/api/gallery-intelligence/${wsId}/analyze-coverage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxImages: 20, tier: 'standard' }),
      })
        .then(() => {
          try { sessionStorage.setItem(coverageKey, '1'); } catch { /* ignore */ }
          queryClient.invalidateQueries({ queryKey: ['gallery-intelligence', wsId] });
          queryClient.invalidateQueries({ queryKey: ['brand-readiness', wsId] });
        })
        .catch(() => {
          coverageJobStarted.current = false;
        });
    }, 5_000);
    return () => window.clearTimeout(t);
  }, [wsId, gisScore, queryClient, operatorMode]);

  const budgetExhausted = !isProductionLimitsBypassed() && usageCost != null && (
    usageCost.remaining_today_usd <= 0.001
    || (usageCost.token_wallet?.enabled === true
      && (usageCost.token_wallet.remaining_tokens ?? 0) <= 0)
  );

  const proposed  = missions.filter(m => m.status === 'proposed');
  const active    = missions.filter(m => ['approved','in_flight'].includes(m.status));
  const hasBlockingMissions = proposed.length > 0 || active.length > 0;
  const hasProposedBlocking = proposed.length > 0;
  const hasActiveOnlyBlocking = active.length > 0 && proposed.length === 0;
  // Completed with errors (failed_nodes > 0) shown in active section so errors are visible
  const failedCompleted = missions.filter(m => m.status === 'completed' && m.failed_nodes > 0);
  const completed = missions.filter(m => m.status === 'completed' && m.failed_nodes === 0).slice(0, 5);

  const productionPackageOptions: MissionProductionPackage[] = [
    'weekly_content',
    'campaign',
    'event',
    'ads_focus',
  ];

  const handleProductionPackageChange = (pkg: MissionProductionPackage) => {
    setProductionPackageState(pkg);
    if (wsId) setMissionProductionPackage(wsId, pkg);
  };

  const proposeMutation = useMutation({
    mutationFn: async () => {
      // Brief enrichment: context signals + diversity + Hub production package.
      const directive = buildDiversityDirective(missions);
      const pkgDirective = buildProductionPackageDirective(productionPackage);
      let signalBlock = contextSignals?.promptBlock;
      if (!signalBlock?.trim() && wsId) {
        try {
          const fresh = await queryClient.fetchQuery<ContextSignalsData>({
            queryKey: ['context-signals', wsId],
            queryFn: fetchContextSignals,
            staleTime: 60_000,
          });
          signalBlock = fresh.promptBlock;
        } catch {
          /* backend still has industry_calendar + sector packs */
        }
      }
      const block = [signalBlock, pkgDirective, directive].filter(Boolean).join('\n\n');
      return apiClient.proposeMissions(wsId, block || undefined, {
        productionPackage,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
      queryClient.invalidateQueries({ queryKey: ['usage-cost', wsId] });
      if (data.proposals_created === 0) {
        if (data.skip_reason === 'blocking_missions') {
          void queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
        }
        const msg = data.message?.trim()
          || (data.skip_reason === 'blocking_missions'
            ? 'Önce bekleyen veya aktif misyonu onaylayın / reddedin.'
            : 'Yeni öneri üretilemedi — birkaç dakika sonra tekrar deneyin.');
        setProposeError(msg);
        return;
      }
      setProposeError(null);
    },
    onError: (err: Error) => {
      setProposeError(err.message?.trim() || 'Öneri oluşturulamadı.');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (missionId: string) =>
      apiClient.approveMission(wsId, missionId, user?.displayName ?? 'operator'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missions', wsId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.rejectMission(wsId, missionId),
    onSuccess: () => {
      setRejectId(null);
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.cancelMission(wsId, missionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missions', wsId] }),
  });

  const restartMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.restartMission(wsId, missionId),
    onSuccess: (_data, missionId) => {
      setProposeError(null);
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
      queryClient.invalidateQueries({ queryKey: ['mission-progress', missionId] });
    },
    onError: (err: Error) => {
      setProposeError(err.message?.trim() || 'Misyon yeniden başlatılamadı.');
    },
  });

  const kickFeedMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.kickMissionFeedProduction(wsId, missionId, {
      productionPackage,
    }),
    onSuccess: (data, missionId) => {
      setProposeError(null);
      invalidateMobileArtifactPool(queryClient, wsId);
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
      queryClient.invalidateQueries({ queryKey: ['mission-progress', missionId] });
    },
    onError: (err: Error) => {
      setProposeError(err.message?.trim() || 'Feed üretimi başlatılamadı.');
    },
  });

  const reproduceFeedMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.reproduceMissionFeed(wsId, missionId, {
      productionPackage,
    }),
    onSuccess: (data, missionId) => {
      if ((data?.produced ?? 0) > 0) {
        setProposeError(null);
        openFeedForMission(missionId);
      } else {
        setProposeError(data?.message?.trim() || 'Feed\'e kaydedilen içerik yok.');
      }
      invalidateMobileArtifactPool(queryClient, wsId);
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
      queryClient.invalidateQueries({ queryKey: ['mission-progress', missionId] });
    },
    onError: (err: Error) => {
      setProposeError(err.message?.trim() || 'Feed üretimi başlatılamadı.');
    },
  });

  const isEmpty = !missionsLoading && !missionsLoadError && proposed.length === 0 && active.length === 0 && completed.length === 0 && failedCompleted.length === 0;

  return (
    <>
    {detailMission && (
      <MissionDetailSheet
        mission={detailMission}
        workspaceId={wsId}
        onClose={() => setDetailMission(null)}
      />
    )}
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 88 }}>
      {/* ── Header — native tab toolbar (no web page title on client) ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top,0px) + 8px) 16px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button
          type="button"
          onClick={() => (history.length > 1 ? goBack() : navigate('more'))}
          aria-label={history.length > 1 ? 'Geri' : 'Menü'}
          style={{ ...t.backBtn, cursor: 'pointer',
          width: 44, height: 44, borderRadius: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: history.length > 1 ? 18 : 15, flexShrink: 0 }}>
          {history.length > 1 ? '←' : '⊞'}
        </button>
        {operatorMode ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: t.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Operasyon Merkezi
            </div>
          </div>
        ) : (
          <div style={{ flex: 1 }} aria-hidden />
        )}
        {/* New Mission button */}
        <button
          onClick={() => { setProposeError(null); proposeMutation.mutate(); }}
          disabled={proposeMutation.isPending || budgetExhausted || hasBlockingMissions || readinessBlocks}
          title={
            readinessBlocks
              ? `Kalite kapısı: Marka Hazırlığı (BRS ${readinessScore ?? 0}/100, ≥${BRS_PROPOSE_THRESHOLD}) ve Galeri Zekâsı (GIS ${gisScore ?? 0}/100, ≥70) gerekli.`
              : hasBlockingMissions
                ? 'Önce mevcut önerileri onaylayın veya aktif kampanyayı tamamlayın'
                : budgetExhausted
                  ? (debugMode ? 'Günlük API bütçesi doldu' : 'Kredi limiti doldu')
                  : undefined
          }
          style={{
            padding: '8px 14px', borderRadius: 30, cursor: proposeMutation.isPending ? 'default' : 'pointer',
            background: proposeMutation.isPending
              ? t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
              : `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`,
            border: 'none', color: proposeMutation.isPending ? t.textMuted : '#fff',
            fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 5,
            boxShadow: proposeMutation.isPending ? 'none' : `0 2px 12px ${t.accent}40`,
          }}>
          {proposeMutation.isPending ? (
            <><div style={{ width: 10, height: 10, borderRadius: '50%',
              border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`,
              animation: 'spinSlow 0.8s linear infinite' }} />Analiz...</>
          ) : <><span>✦</span>{operatorMode ? 'Yeni Öneri' : 'Yeni Plan'}</>}
        </button>
      </div>

      {debugMode && usageCost ? <AiCostBreakdownCard data={usageCost} t={t} /> : null}

      {/* Summary strip — client mode only, shown when there are missions */}
      {!operatorMode && missions.length > 0 && (
        <div style={{
          margin: '14px 22px 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
        }}>
          {[
            { label: 'Onay Bekliyor', value: proposed.length, color: proposed.length > 0 ? '#F59E0B' : t.textMuted, bg: proposed.length > 0 ? 'rgba(245,158,11,0.08)' : (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)') },
            { label: 'Üretimde', value: active.length, color: active.length > 0 ? '#34d399' : t.textMuted, bg: active.length > 0 ? 'rgba(52,211,153,0.08)' : (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)') },
            { label: 'Tamamlandı', value: completed.length + failedCompleted.length, color: t.textSecondary, bg: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{ padding: '10px 8px', borderRadius: 12, background: bg, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
              <div style={{ fontSize: 10, color: t.textMuted, marginTop: 4, fontWeight: 600, letterSpacing: '0.03em' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Production package — agency tooling */}
      {operatorMode && <div style={{ margin: '12px 22px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 8 }}>
          Üretim paketi
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {productionPackageOptions.map((pkg) => {
            const active = productionPackage === pkg;
            return (
              <button
                key={pkg}
                type="button"
                onClick={() => handleProductionPackageChange(pkg)}
                style={{
                  padding: '7px 12px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  border: active ? `1px solid ${t.accent}` : `0.5px solid ${t.separator}`,
                  background: active ? t.accentDim : t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  color: active ? t.accent : t.textSecondary,
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {missionProductionPackageLabel(pkg)}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: t.textMuted, marginTop: 6, lineHeight: 1.45 }}>
          Story şablonları:{' '}
          <button
            type="button"
            onClick={() => openStoryTemplates()}
            style={{ border: 'none', background: 'none', padding: 0, color: t.accent,
              fontWeight: 700, cursor: 'pointer', fontSize: 10 }}
          >
            Marka kütüphanesi →
          </button>
          {' '}· Seçim ideation ve auto-produce manifestine yansır.
        </div>
      </div>}

      {/* Inline gate banner — explains why "Yeni Öneri" is disabled (mobile-friendly) */}
      {!proposeMutation.isPending && (readinessBlocks || hasBlockingMissions || budgetExhausted) && (
        <div style={{
          margin: '10px 22px 0', padding: '10px 14px', borderRadius: 12,
          background: budgetExhausted
            ? 'rgba(239,68,68,0.08)'
            : 'rgba(245,158,11,0.08)',
          border: `0.5px solid ${budgetExhausted ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.3)'}`,
          fontSize: 12, lineHeight: 1.55,
          color: budgetExhausted ? '#EF4444' : '#F59E0B',
        }}>
          {budgetExhausted && (operatorMode
            ? 'Günlük AI bütçesi doldu — yarın yenilenir veya bakiye yükleyin.'
            : 'Bugünkü üretim kotası doldu — yarın devam edecek.')}
          {!budgetExhausted && hasProposedBlocking && (operatorMode
            ? 'Onay bekleyen misyon var — önce onaylayın veya reddedin.'
            : 'Önce bekleyen kampanya önerisini onaylayın veya reddedin.')}
          {!budgetExhausted && hasActiveOnlyBlocking && (operatorMode
            ? 'Aktif kampanya çalışıyor — tamamlanınca yeni öneri alın.'
            : 'Kampanya hazırlanıyor — tamamlanınca yeni öneri alabilirsiniz.')}
          {!budgetExhausted && !hasBlockingMissions && readinessBlocks && (
            operatorMode ? (
              <span>
                {brsBlocks && (
                  <>
                    Marka Hazırlığı (BRS) yetersiz — skor {readinessScore ?? 0}/100.
                    {readiness?.missing?.[0] && (
                      <> <strong>{readiness.missing[0].label}</strong> tamamlayın (+{readiness.missing[0].weight} puan).</>
                    )}
                  </>
                )}
                {gisBlocks && (
                  <>
                    {brsBlocks && ' '}
                    Galeri Zekâsı (GIS) {gisScore ?? 0}/70 — galeri fotoğrafları analiz ediliyor, birkaç saniye bekleyin.
                  </>
                )}
              </span>
            ) : (
              <span>
                Yeni kampanya önerisi için marka kurulumunu tamamlayın.
                {readiness?.missing?.[0]?.label && (
                  <> Öncelik:{' '}
                    <button
                      type="button"
                      onClick={() => openBrand(readiness.missing[0]?.fix, readiness.missing[0]?.id)}
                      style={{
                        border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                        color: 'inherit', fontWeight: 700, textDecoration: 'underline',
                      }}
                    >
                      {readiness.missing[0].label}
                    </button>.
                  </>
                )}
              </span>
            )
          )}
        </div>
      )}

      {/* Brand Alignment Score — agency diagnostics only */}
      {operatorMode && alignment && Array.isArray(alignment.subScores) && (
        <BrandAlignmentCard t={t} data={alignment} onFix={(target) => openBrand(target)} />
      )}

      {/* Brand readiness — clients: only when blocking new proposals */}
      {readiness && Array.isArray(readiness.checks) && readiness.checks.length > 0 && readinessScore !== 100
        && (operatorMode || readinessBlocks) && (
        <BrandReadinessCard
          t={t}
          readiness={readiness}
          tenantId={tenantId}
          onComplete={(fix, checkId) => openBrand(fix, checkId)}
          onFix={(fix, checkId) => openBrand(fix, checkId)}
        />
      )}

      {readiness?.productionProfile
        && Array.isArray(readiness.productionProfile.checks)
        && readiness.productionProfile.checks.length > 0
        && (operatorMode || !readiness.productionProfile.isProductionReady) && (
        <ProductionProfileCard
          t={t}
          profile={readiness.productionProfile}
          tenantId={tenantId}
          onFix={(fix, checkId) => openBrand(fix, checkId)}
        />
      )}

      {operatorMode && (
        <button
          type="button"
          onClick={openStoryTemplates}
          style={{
            margin: '10px 22px 0',
            width: 'calc(100% - 44px)',
            padding: '12px 14px',
            borderRadius: 14,
            cursor: 'pointer',
            textAlign: 'left',
            border: `0.5px solid ${t.accentBorder}`,
            background: t.accentDim,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: t.accent }}>Story Şablon Kütüphanesi</div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, lineHeight: 1.4 }}>
            Günlük, etkinlik, editorial ve sosyal kanıt story şablonlarını seçin — Mission üretimi buradan beslenir.
          </div>
        </button>
      )}

      {/* Active context signals — agency only */}
      {operatorMode && contextSignals && Array.isArray(contextSignals.signals) && contextSignals.signals.length > 0 && (
        <ContextSignalsCard
          t={t}
          data={contextSignals}
          calendarStale={calendarStale}
          calendarStaleDays={calendarStaleDays}
        />
      )}

      {/* Propose loading note */}
      {proposeMutation.isPending && (
        <div style={{ margin: '12px 22px 0', padding: '10px 14px', borderRadius: 12,
          background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
          fontSize: 12, color: t.accent, lineHeight: 1.5 }}>
          ✦ StrategistAgent tüm sinyalleri analiz ediyor... 30–90 saniye sürebilir.
        </div>
      )}
      {proposeError && !proposeMutation.isPending && (() => {
        const b = brandCtx as any;
        const missingFields = [
          { label: 'Ürün / Hizmet tanımı', ok: Boolean(b?.description?.trim()) },
          { label: 'Hedef kitle',           ok: Boolean(b?.target_audience?.trim()) },
          { label: 'Konum',                 ok: Boolean(b?.location?.trim()) },
          { label: 'Marka tonu',            ok: Boolean(b?.brand_tone?.trim()) },
        ].filter(f => !f.ok);

        const brandSnapshotReady = productionSnapshotFetched && !productionSnapshotFetching;
        const errLower = proposeError.toLowerCase();
        const isQuotaError =
          errLower.includes('kota') ||
          errLower.includes('quota') ||
          errLower.includes('429') ||
          errLower.includes('openai');
        const isBlockingError =
          errLower.includes('bekleyen/aktif') || errLower.includes('bitirin veya reddedin');
        const blockingList = [...proposed, ...active];
        // Only surface brand-field gaps after snapshot load; never mask API errors (blocking, quota, etc.).
        const showBrandMissing =
          brandSnapshotReady
          && missingFields.length > 0
          && !isBlockingError
          && !isQuotaError;
        const cardTitle = showBrandMissing
          ? 'Marka verisi eksik'
          : isQuotaError
            ? 'OpenAI kotası / API hatası'
            : isBlockingError
              ? 'Bekleyen misyon var'
              : 'Öneri oluşturulamadı';
        const cardSubtitle = showBrandMissing
          ? `${missingFields.length} alan eksik, strateji üretilemiyor`
          : proposeError;
        const accent = showBrandMissing ? '#F59E0B' : isQuotaError ? '#EF4444' : '#F59E0B';
        const cardHasBody = showBrandMissing || (isBlockingError && blockingList.length > 0);

        return (
          <div style={{ margin: '12px 22px 0', borderRadius: 16, overflow: 'hidden',
            background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            border: `0.5px solid ${showBrandMissing ? 'rgba(245,158,11,0.25)' : isQuotaError ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
            <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: cardHasBody ? `0.5px solid ${t.separator}` : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8,
                background: showBrandMissing ? 'rgba(245,158,11,0.1)' : isQuotaError ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                border: `0.5px solid ${showBrandMissing ? 'rgba(245,158,11,0.25)' : isQuotaError ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>
                  {cardTitle}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3, lineHeight: 1.45 }}>
                  {cardSubtitle}
                </div>
              </div>
            </div>

            {isBlockingError && blockingList.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: `0.5px solid ${t.separator}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.warning, letterSpacing: '0.08em',
                  textTransform: 'uppercase', marginBottom: 8 }}>
                  Bekleyen / aktif ({blockingList.length})
                </div>
                {blockingList.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 0', borderBottom: `0.5px solid ${t.separator}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.title}
                      </div>
                      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                        {m.status === 'proposed' ? 'Onay bekliyor' : m.status === 'approved' ? 'Onaylandı · sırada' : 'Üretimde'}
                      </div>
                    </div>
                    {m.status === 'proposed' && (
                      <button
                        type="button"
                        onClick={() => rejectMutation.mutate(m.id)}
                        disabled={rejectMutation.isPending}
                        style={{ fontSize: 10, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
                          border: '0.5px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.08)',
                          color: '#EF4444', cursor: 'pointer', flexShrink: 0 }}
                      >
                        Reddet
                      </button>
                    )}
                    {(m.status === 'approved' || m.status === 'in_flight') && (
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate(m.id)}
                        disabled={cancelMutation.isPending}
                        style={{ fontSize: 10, fontWeight: 700, padding: '6px 10px', borderRadius: 8,
                          border: `0.5px solid ${t.separator}`, background: 'transparent',
                          color: t.textMuted, cursor: 'pointer', flexShrink: 0 }}
                      >
                        İptal
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showBrandMissing && (
              <div style={{ padding: '10px 16px' }}>
                {missingFields.map((item, i) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 0',
                    borderBottom: i < missingFields.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: '1.5px solid rgba(245,158,11,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(245,158,11,0.4)' }} />
                    </div>
                    <span style={{ fontSize: 12, color: t.textSecondary }}>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '10px 16px 14px', display: 'flex', gap: 8 }}>
              {showBrandMissing && (
                <button onClick={() => openBrand()} style={{
                  flex: 1, padding: '10px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(157,190,206,0.12)', border: '0.5px solid rgba(157,190,206,0.3)',
                  fontSize: 12, fontWeight: 700, color: t.accent,
                }}>
                  Marka Hub'ını Doldur →
                </button>
              )}
              <button onClick={() => {
                if (hasBlockingMissions || budgetExhausted || readinessBlocks) return;
                setProposeError(null);
                queryClient.invalidateQueries({ queryKey: ['production-context-snapshot', wsId] });
                setTimeout(() => proposeMutation.mutate(), 300);
              }} disabled={hasBlockingMissions || budgetExhausted || readinessBlocks} style={{
                flex: showBrandMissing ? 0 : 1, padding: '10px 14px', borderRadius: 12,
                cursor: (hasBlockingMissions || budgetExhausted || readinessBlocks) ? 'default' : 'pointer',
                opacity: (hasBlockingMissions || budgetExhausted || readinessBlocks) ? 0.45 : 1,
                background: showBrandMissing ? 'transparent' : 'rgba(157,190,206,0.12)',
                border: showBrandMissing ? `0.5px solid ${t.separator}` : '0.5px solid rgba(157,190,206,0.3)',
                fontSize: 12, fontWeight: showBrandMissing ? 400 : 700,
                color: showBrandMissing ? t.textMuted : t.accent,
              }}>
                {hasBlockingMissions ? 'Önce bekleyen misyonları bitirin' : 'Yeniden Dene →'}
              </button>
            </div>
          </div>
        );
      })()}

      <div style={{ padding: '24px 22px 0' }}>

        {/* ── Loading ── */}
        {missionsLoading && (
          <BrandLoadingScreen compact fillViewport={false} />
        )}

        {/* ── Load error (avoid misleading empty state) ── */}
        {missionsLoadError && !missionsLoading && missions.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              Planlar yüklenemedi
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 28, maxWidth: 280, margin: '0 auto 28px' }}>
              Sunucu geçici olarak yanıt vermiyor. Birkaç saniye bekleyip tekrar deneyin.
            </div>
            <button
              type="button"
              onClick={() => void refetchMissions()}
              disabled={missionsFetching}
              style={{
                padding: '12px 24px', borderRadius: 30, border: 'none', cursor: 'pointer',
                background: missionsFetching
                  ? t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
                  : `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`,
                color: missionsFetching ? t.textMuted : '#fff',
                fontSize: 14, fontWeight: 700,
              }}
            >
              {missionsFetching ? 'Yükleniyor…' : 'Tekrar Dene'}
            </button>
          </div>
        )}

        {/* ── Empty state ── */}
        {isEmpty && !missionsLoading && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              {operatorMode ? 'Henüz kampanya yok' : 'Henüz içerik planı yok'}
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 28, maxWidth: 280, margin: '0 auto 28px' }}>
              {operatorMode
                ? '"Yeni Öneri" butonuna basarak StrategistAgent\'ın tüm sinyal verilerini analiz etmesini ve kampanya önerileri üretmesini sağla.'
                : 'İlk haftalık planınızı başlatın. AI markanıza uygun içerik fikirleri hazırlayıp onayınıza sunar.'}
            </div>
            {!operatorMode && (
              <button
                type="button"
                onClick={() => { setProposeError(null); proposeMutation.mutate(); }}
                disabled={proposeMutation.isPending || budgetExhausted || hasBlockingMissions || readinessBlocks}
                style={{
                  padding: '12px 24px', borderRadius: 30, border: 'none', cursor: 'pointer',
                  background: proposeMutation.isPending
                    ? t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
                    : `linear-gradient(135deg, ${t.accent}, ${t.accent}cc)`,
                  color: proposeMutation.isPending ? t.textMuted : '#fff',
                  fontSize: 14, fontWeight: 700,
                  boxShadow: proposeMutation.isPending ? 'none' : `0 2px 12px ${t.accent}40`,
                }}
              >
                {proposeMutation.isPending ? 'Hazırlanıyor…' : '✦ Yeni Plan Başlat'}
              </button>
            )}
          </div>
        )}

        {/* ── Proposed ── */}
        {proposed.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.warning,
                animation: 'liveGlow 2s infinite', boxShadow: `0 0 8px ${t.warning}` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Onay Bekliyor</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: 'rgba(245,158,11,0.12)', color: t.warning, fontWeight: 700 }}>
                {proposed.length}
              </span>
              {proposed.length > 1 && (() => {
                const div = computeMissionDiversity(proposed);
                const c = div.score >= 70 ? '#10B981' : div.score >= 40 ? '#F59E0B' : '#EF4444';
                return (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: c }}
                    title="Çeşitlilik skoru — öneri setinin format/açı çeşitliliği">
                    Çeşitlilik {div.score}%
                  </span>
                );
              })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proposed.map(m => (
                <ProposedCard
                  key={m.id}
                  mission={m}
                  workspaceId={wsId}
                  onApprove={(id) => approveMutation.mutate(id)}
                  onReject={(id) => rejectMutation.mutate(id)}
                  isPending={approveMutation.isPending && approveMutation.variables === m.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Failed completed missions ── */}
        {failedCompleted.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444',
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Hatalı Tamamlandı</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: 'rgba(239,68,68,0.10)', color: '#EF4444', fontWeight: 700 }}>
                {failedCompleted.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failedCompleted.map(m => (
                <InFlightCard key={m.id} mission={m} workspaceId={wsId}
                  detailOpen={detailMission?.id === m.id}
                  onCancel={() => {}}
                  onRestart={(id) => restartMutation.mutate(id)}
                  onKickFeedProduction={(id) => kickFeedMutation.mutate(id)}
                  isRestarting={restartMutation.isPending && restartMutation.variables === m.id}
                  isKickingFeed={kickFeedMutation.isPending && kickFeedMutation.variables === m.id}
                  onTapCompleted={() => setDetailMission(m)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Active ── */}
        {active.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.live,
                animation: 'liveGlow 2s infinite', boxShadow: `0 0 8px ${t.live}` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>{operatorMode ? 'Aktif Kampanyalar' : 'Üretimde'}</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: 'rgba(16,185,129,0.10)', color: t.live, fontWeight: 700 }}>
                {active.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {active.map(m => (
                <InFlightCard
                  key={m.id}
                  mission={m}
                  workspaceId={wsId}
                  detailOpen={detailMission?.id === m.id}
                  onCancel={(id) => cancelMutation.mutate(id)}
                  onRestart={(id) => restartMutation.mutate(id)}
                  onKickFeedProduction={(id) => kickFeedMutation.mutate(id)}
                  isRestarting={restartMutation.isPending && restartMutation.variables === m.id}
                  isKickingFeed={kickFeedMutation.isPending && kickFeedMutation.variables === m.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Completed ── */}
        {completed.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tamamlananlar</span>
            </div>
            <div style={{ borderRadius: 16, overflow: 'hidden',
              background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
              border: `0.5px solid ${t.separator}`,
              padding: '0 14px' }}>
              {completed.map((m, i) => (
                <div key={m.id} style={{ borderBottom: i < completed.length - 1 ? undefined : 'none' }}>
                  <CompletedRow mission={m} onTap={() => setDetailMission(m)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import type { T } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '../auth-store';
import { apiClient, type WorkspaceUsageSummary } from '@/lib/api-client';
import { TokenWalletCard } from '../TokenWalletCard';
import type { MissionSummary, MissionProgress, MissionNodeProgress } from '@/types';
import { BRS_PROPOSE_THRESHOLD, type BrandReadinessResult } from '@/lib/brand-readiness';
import { parseProductionIdeas } from '@/lib/production-idea-parse';
import { computeIdeaContractScore } from '@/types/production-idea';
import type { SignalRecord } from '@/lib/context-signals';
import { computeMissionDiversity, buildDiversityDirective } from '@/lib/mission-diversity';
import { isMobileOperatorMode } from '../mobile-client-config';
import {
  buildProductionPackageDirective,
  getMissionProductionPackage,
  missionProductionPackageLabel,
  setMissionProductionPackage,
  type MissionProductionPackage,
} from '@/lib/mission-production-prefs';
import {
  summarizeMissionFeedPackage,
  formatMissionFeedPackageLabel,
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
import {
  buildWeeklySelectionFromMissionNodes,
  filterFeedPublishableArtifacts,
  formatWeeklyPackageSummary,
  type WeeklyPublishSelection,
} from '@/lib/weekly-publish-package';
import { parseArtifactMissionId } from '@/lib/mission-feed-package';
import {
  collectMissionPreviewArtifacts,
  MissionFeedPreviewGrid,
} from '../MissionFeedPreviewGrid';
import type { OutputArtifact } from '@/types';
import { useMobileArtifacts } from '../../_hooks/use-mobile-artifacts';
import { mobileArtifactsQueryKey } from '../../_lib/mobile-artifacts';
import { mobileQueryDefaults } from '../../_lib/mobile-query';

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

const USD_TRY = 32;
const CATEGORY_LABELS: Record<string, string> = {
  auto_produce: 'İçerik fabrikası',
  mission_propose: 'Strateji',
  content_ideation: 'İçerik fikri',
  market_intelligence: 'Pazar zekası',
  gallery_match: 'Galeri eşleştirme',
  other: 'Diğer',
};

// ── Task type → customer-facing label + icon ──────────────────────────────────
const TASK_META: Record<string, { label: string; icon: string; color: string; resultNoun: string }> = {
  content_strategy:        { label: 'Haftalık İçerik Stratejisi',  icon: '🗺',  color: '#8B5CF6', resultNoun: 'strateji' },
  content_ideation:        { label: 'İçerik Fikirleri',            icon: '💡',  color: '#F59E0B', resultNoun: 'fikir' },
  content_calendar:        { label: 'Yayın Takvimi',               icon: '📅',  color: '#10B981', resultNoun: 'plan' },
  visual_design_cards:     { label: 'Görsel Tasarım Önerileri',    icon: '🎨',  color: '#EC4899', resultNoun: 'tasarım' },
  review_analysis:         { label: 'Yorum Analizi',               icon: '⭐',  color: '#F59E0B', resultNoun: 'analiz' },
  single_review_response:  { label: 'Yorum Yanıtları',             icon: '💬',  color: '#10B981', resultNoun: 'yanıt' },
  traffic_analysis:        { label: 'Trafik Analizi',              icon: '📊',  color: '#3B82F6', resultNoun: 'rapor' },
  conversion_report:       { label: 'Dönüşüm Raporu',              icon: '📈',  color: '#10B981', resultNoun: 'rapor' },
  weekly_performance:      { label: 'Haftalık Performans',         icon: '📉',  color: '#8B5CF6', resultNoun: 'rapor' },
  campaign_analysis:       { label: 'Kampanya Analizi',            icon: '🎯',  color: '#F59E0B', resultNoun: 'analiz' },
  ad_creative_generation:  { label: 'Reklam Metinleri',            icon: '📢',  color: '#EF4444', resultNoun: 'reklam' },
  auto_budget_optimize:    { label: 'Bütçe Optimizasyonu',         icon: '💰',  color: '#10B981', resultNoun: 'öneri' },
  ads_budget_optimization: { label: 'Reklam Bütçesi',              icon: '💰',  color: '#10B981', resultNoun: 'öneri' },
  mission_planning:        { label: 'Misyon Planlaması',            icon: '🚀',  color: '#8B5CF6', resultNoun: 'plan' },
  workspace_intelligence:  { label: 'İş Zekâsı Raporu',           icon: '🧠',  color: '#3B82F6', resultNoun: 'rapor' },
  feed_cohesion_review:    { label: 'Feed uyumu ve slot planı',      icon: '🎬',  color: '#10B981', resultNoun: 'rapor' },
  product_scene_brief:     { label: 'Ürün Sahne Yönetmeni',        icon: '📸',  color: '#8B5CF6', resultNoun: 'brief' },
};

function taskMeta(taskType: string) {
  return TASK_META[taskType] ?? { label: taskType.replace(/_/g, ' '), icon: '✦', color: '#8B5CF6', resultNoun: 'çıktı' };
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
function countNodeResults(node: MissionNodeProgress): number | null {
  if (!node.output_summary) return null;
  const ideas = parseProductionIdeas(node.output_summary);
  if (ideas.length > 0) return ideas.length;
  try {
    const json = JSON.parse(node.output_summary.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim());
    if (Array.isArray(json)) return json.length;
    if (Array.isArray(json?.ideas)) return json.ideas.length;
    if (Array.isArray(json?.responses)) return json.responses.length;
  } catch { /* ok */ }
  return null;
}

/**
 * Idea Contract Score (ICS) for a content_ideation node — average per-idea
 * completeness (0..100). Surfaces parse loss / missing fields right in the Hub.
 * Returns null when the node has no parseable ideas.
 */
function computeNodeIcs(outputSummary: string | null): number | null {
  const ideas = parseProductionIdeas(outputSummary);
  if (ideas.length === 0) return null;
  const total = ideas.reduce((sum, idea) => sum + computeIdeaContractScore(idea).score, 0);
  return Math.round(total / ideas.length);
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
  medium:   '#A78BFA',
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
  if (msg.includes('insufficient_quota') || msg.includes('429'))
    return '⚡ OpenAI kotası doldu — platform.openai.com/billing';
  if (msg.includes('timed out') || msg.includes('TimeoutError'))
    return '⏱ Zaman aşımı — daha sonra tekrar dene';
  if (msg.includes('API_KEY') || msg.includes('api_key'))
    return '🔑 API anahtarı eksik';
  return msg.slice(0, 100) || 'Bilinmeyen hata';
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

// ── InFlightCard — polls /progress every 5s ───────────────────────────────────

function InFlightCard({ mission, workspaceId, onCancel, onRestart, onTapCompleted }: {
  mission: MissionSummary;
  workspaceId: string;
  onCancel: (id: string) => void;
  onRestart: (id: string) => void;
  onTapCompleted?: () => void;
}) {
  const { t } = useTheme();
  const pColor = PRIORITY_COLOR[mission.priority] ?? t.accent;

  // Poll every 15s — balances responsiveness with battery & backend load
  const { data: prog } = useQuery({
    queryKey: ['mission-progress', mission.id],
    queryFn: () => apiClient.getMissionProgress(workspaceId, mission.id),
    refetchInterval: 15_000,
    staleTime: 10_000,
    refetchIntervalInBackground: false,
  });

  const pct      = prog?.completion_pct ?? mission.completion_pct;
  const nodes    = prog?.nodes ?? [];
  const running  = nodes.filter(n => n.status === 'running').length;
  const failed   = nodes.filter(n => n.status === 'failed').length;
  const done     = prog?.completed_nodes ?? mission.completed_nodes;
  const total    = prog?.total_nodes ?? mission.total_nodes;
  const hasError = failed > 0 && running === 0;
  const isWaiting = mission.status === 'approved' && running === 0 && done === 0 && !hasError;

  const ringColor = hasError ? '#EF4444' : pColor;
  const statusLabel = hasError
    ? '✕ Hata'
    : mission.status === 'in_flight' && running > 0
      ? `▶ ${running} görev çalışıyor`
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
            <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 3 }}>
              {done}/{total} görev tamamlandı
              {mission.timeline_days ? ` · ${mission.timeline_days} gün` : ''}
            </div>
          </div>

          {mission.status !== 'completed' && (
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              {(hasError || pct === 0) && (
                <button onClick={() => onRestart(mission.id)} style={{
                  padding: '6px 11px', borderRadius: 30, cursor: 'pointer',
                  background: 'rgba(99,102,241,0.08)', border: '0.5px solid rgba(99,102,241,0.22)',
                  color: '#818cf8', fontSize: 11, fontWeight: 600,
                }}>↺ Yeniden</button>
              )}
              <button onClick={() => onCancel(mission.id)} style={{
                padding: '6px 11px', borderRadius: 30, cursor: 'pointer',
                background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)',
                color: t.danger, fontSize: 11, fontWeight: 600,
              }}>İptal</button>
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
            Executor başlatılıyor... 5 dakika içinde görevler otomatik atanacak
          </div>
        )}

        {/* ── Node rows with names + status ── */}
        {nodes.length > 0 ? (
          <NodeRows nodes={nodes} />
        ) : (
          /* No progress data yet — show placeholder rows from mission summary */
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
        )}
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
  const raw = node.output_summary ?? '';
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
  const raw = node.output_summary ?? '';
  let obj: Record<string, unknown> = {};
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    obj = JSON.parse(cleaned);
  } catch { /* use empty */ }

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
function CalendarItemsView({ items, t, onGoToFeed }: {
  items: unknown[];
  t: ReturnType<typeof useTheme>['t'];
  onGoToFeed?: () => void;
}) {
  const FMT_COLORS: Record<string, { bg: string; color: string; icon: string }> = {
    story:    { bg: 'rgba(139,92,246,0.15)', color: '#8B5CF6', icon: '◉' },
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
        <div style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>
          📅 {items.length} yayın planı hazır
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

        return (
          <div key={i} style={{ borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            border: `0.5px solid ${t.separator}`, overflow: 'hidden' }}>

            {/* Card header: format + type + priority */}
            <div style={{ padding: '9px 12px', borderBottom: `0.5px solid ${t.separator}`,
              display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 20,
                background: fmtCfg.bg, color: fmtCfg.color }}>
                {fmtCfg.icon} {fmt.toUpperCase()}
              </span>
              {type && (
                <span style={{ fontSize: 10, color: t.textMuted }}>
                  {TYPE_LABELS[type] || type.replace(/_/g, ' ')}
                </span>
              )}
              {priority && (
                <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                  color: PRIORITY_COLORS[priority] ?? t.textMuted,
                  textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {priority === 'recommended' ? '✓ Önerilen' : priority === 'high' ? '🔴 Yüksek' : priority}
                </span>
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

function ContentIdeasView({ signal, t, onGoToFeed }: {
  signal: ArtifactSignal;
  t: ReturnType<typeof useTheme>['t'];
  onGoToFeed?: () => void;
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

  const FMT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
    post:            { icon: '□', label: 'Post',    color: '#3B82F6' },
    instagram_post:  { icon: '□', label: 'Post',    color: '#3B82F6' },
    story:           { icon: '◉', label: 'Story',   color: '#8B5CF6' },
    instagram_story: { icon: '◉', label: 'Story',   color: '#8B5CF6' },
    reel:            { icon: '▶', label: 'Reel',    color: '#EC4899' },
    instagram_reel:  { icon: '▶', label: 'Reel',    color: '#EC4899' },
    carousel:        { icon: '⊞', label: 'Carousel',color: '#F59E0B' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Lead summary */}
      <div style={{ padding: '10px 12px', borderRadius: 12, marginBottom: 4,
        background: 'rgba(16,185,129,0.08)', border: '0.5px solid rgba(16,185,129,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, color: '#10B981', fontWeight: 700 }}>
            {items.length} içerik fikri Feed'e eklendi
          </div>
          {/* Story/Remotion indicator */}
          {items.some((idea: any) => {
            const t = String((idea as any)?.visual_production_spec?.treatment || '').toLowerCase();
            return t === 'story_event' || t === 'event_announcement' || t === 'campaign_offer';
          }) && (
            <div style={{ fontSize: 10, color: '#8B5CF6', marginTop: 2 }}>
              ▶ Remotion story'leri arka planda render ediliyor — Feed story bar'ında görünür
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

      {items.slice(0, 8).map((idea, i) => {
        const ia       = idea as any;
        const headline = ia.headline ?? ia.conceptTitle ?? ia.concept_title ?? `Fikir ${i + 1}`;
        const caption  = ia.caption ?? ia.captionDraft ?? ia.caption_draft ?? '';
        const hashtags = Array.isArray(ia.hashtags) ? ia.hashtags.slice(0, 4) : [];
        const mood     = ia.mood ?? ia.tone ?? '';
        const postTime = ia.posting_time_suggestion ?? ia.postingTime ?? '';
        const fmt      = (ia.contentType ?? ia.contentKind ?? ia.content_type ?? 'post') as string;
        const fmtCfg   = FMT_CONFIG[fmt.toLowerCase()] ?? FMT_CONFIG['post']!;
        const isCalendar = 'day' in idea || ('theme' in ia && !ia.headline);

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
              borderBottom: `0.5px solid ${t.separator}` }}>
              <span style={{ fontSize: 10, fontWeight: 800,
                padding: '3px 9px', borderRadius: 20,
                background: fmtCfg.color + '18',
                color: fmtCfg.color, letterSpacing: '0.04em' }}>
                {fmtCfg.icon} {fmtCfg.label}
              </span>
              {mood && (
                <span style={{ fontSize: 10, color: t.textMuted, fontStyle: 'italic' }}>
                  {String(mood).slice(0, 30)}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: t.textMuted }}>
                #{i + 1}
              </span>
            </div>

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

/** Extract raw JSON array or object from mixed text+JSON output */
function extractJsonArray(raw: string): unknown[] | null {
  try {
    // Find first [ ... ] block
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1) return null;
    const arr = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
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
              background: 'rgba(99,102,241,0.08)', border: '0.5px solid rgba(99,102,241,0.2)' }}>
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
function FeedCohesionOutputView({ node, t }: { node: MissionNodeProgress; t: ReturnType<typeof useTheme>['t'] }) {
  const raw = node.output_summary ?? '';
  let report: Record<string, unknown> = {};
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    report = JSON.parse(cleaned);
  } catch { return null; }

  const feedScore = typeof report.feed_score === 'number' ? report.feed_score : null;
  const dist = (report.format_distribution ?? {}) as Record<string, number>;
  const notes = Array.isArray(report.cohesion_notes) ? report.cohesion_notes as string[] : [];
  const verdict = String(report.art_director_verdict ?? '');
  const schedule = (report.publish_schedule ?? {}) as Record<string, unknown[]>;
  const assignments = Array.isArray(report.production_assignments)
    ? report.production_assignments as Array<Record<string, unknown>>
    : [];
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
    paid_ad_creative: 'Reklam',
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
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
                  padding: '6px 10px', borderRadius: 8,
                  background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                  <span style={{ fontWeight: 800, color: t.textMuted, minWidth: 20 }}>#{typeof idx === 'number' ? idx : i}</span>
                  <span style={{ fontWeight: 700, color: t.textPrimary, flex: 1 }}>
                    {ROLE_TR[role] ?? role}
                  </span>
                  <span style={{ fontSize: 9, color: t.textMuted }}>{String(a.pipeline ?? '')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Format distribution */}
      {Object.keys(dist).length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Format Dağılımı
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['post', 'story', 'reel', 'carousel'] as const).map(fmt => {
              const count = dist[fmt] ?? 0;
              const fmtColors: Record<string, string> = { post: '#3B82F6', story: '#8B5CF6', reel: '#EC4899', carousel: '#F59E0B' };
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
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            Yayın Takvimi
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

function NodeOutputView({ node, onGoToFeed }: { node: MissionNodeProgress; t?: unknown; onGoToFeed?: () => void }) {
  const { t } = useTheme();

  if (!node.output_summary) {
    return (
      <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', padding: '8px 0',
        textAlign: 'center' }}>
        Çıktı henüz kaydedilmedi — eski çalıştırma
      </div>
    );
  }

  // feed_cohesion_review — art director report with score + schedule
  if (node.task_type === 'feed_cohesion_review') {
    return <FeedCohesionOutputView node={node} t={t} />;
  }

  // content_strategy — custom structured view
  if (node.task_type === 'content_strategy') {
    return <ContentStrategyView node={node} t={t} />;
  }

  // Analytics tasks — KPI cards + insights
  if (['traffic_analysis', 'conversion_report', 'weekly_performance'].includes(node.task_type)) {
    const data = tryParseJson(node.output_summary ?? '');
    if (data) return <AnalyticsOutputView data={data} t={t} />;
  }

  // Review tasks
  if (['review_analysis', 'single_review_response'].includes(node.task_type)) {
    const data = tryParseJson(node.output_summary ?? '');
    if (data) return <ReviewOutputView data={data} t={t} />;
  }

  // Campaign / ads analysis
  if (['campaign_analysis', 'ads_budget_optimization', 'auto_budget_optimize'].includes(node.task_type)) {
    const data = tryParseJson(node.output_summary ?? '');
    if (data) return <CampaignOutputView data={data} t={t} />;
  }

  // For all other tasks: convert to ArtifactSignal and render
  const signal = nodeToSignal(node);

  // Ad creative
  if (node.task_type === 'ad_creative_generation') {
    // Direct array parse (output often starts with prose before JSON array)
    const adItems = extractJsonArray(node.output_summary ?? '');
    if (adItems && adItems.length > 0) {
      return <AdCreativeDirectView items={adItems} t={t} />;
    }
    if (signal) return <AdCreativeView signal={signal} t={t} />;
  }

  // Content ideation / calendar / visual design
  // content_calendar — dedicated calendar card view
  if (node.task_type === 'content_calendar') {
    const calItems = extractJsonArray(node.output_summary ?? '');
    if (calItems && calItems.length > 0) {
      return <CalendarItemsView items={calItems} t={t} onGoToFeed={onGoToFeed} />;
    }
  }

  // content_ideation — try direct array parse first (preserves all agent fields)
  if (['content_ideation', 'visual_design_cards'].includes(node.task_type)) {
    const ideaItems = extractJsonArray(node.output_summary ?? '');
    if (ideaItems && ideaItems.length > 0) {
      // Feed into ContentIdeasView via a synthetic signal
      const syntheticSignal = { ideas: ideaItems.map(item => {
        const it = item as Record<string, unknown>;
        return {
          headline:    it.headline ?? it.concept_title ?? it.title ?? '',
          caption:     it.caption_draft ?? it.caption ?? '',
          cta:         it.cta ?? '',
          contentType: it.content_type ?? it.content_kind ?? 'post',
          hashtags:    it.hashtags ?? [],
          mood:        it.mood ?? it.tone ?? '',
          posting_time_suggestion: it.posting_time_suggestion ?? '',
          ...it,
        };
      }) } as any;
      return <ContentIdeasView signal={syntheticSignal} t={t} onGoToFeed={onGoToFeed} />;
    }
    if (signal) return <ContentIdeasView signal={signal} t={t} onGoToFeed={onGoToFeed} />;
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
  const anyData = tryParseJson(node.output_summary ?? '');
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
      {(node.output_summary ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim().slice(0, 1000)}
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

function MissionSlotChecklistPanel({
  checklist,
  workspaceId,
  isLoading,
  onGoToFeed,
  onRefresh,
  t,
}: {
  checklist: MissionSlotChecklist | null;
  workspaceId: string;
  isLoading: boolean;
  onGoToFeed: () => void;
  onRefresh: () => void;
  t: T;
}) {
  const [retryingId, setRetryingId] = useState<string | null>(null);

  if (isLoading && !checklist) {
    return (
      <div style={{ padding: '12px 14px', borderRadius: 14, marginBottom: 16,
        background: t.isDark ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.05)',
        border: '0.5px solid rgba(59,130,246,0.2)' }}>
        <div style={{ fontSize: 12, color: t.textMuted }}>Üretim manifesti kontrol ediliyor…</div>
      </div>
    );
  }
  if (!checklist || checklist.items.length === 0) return null;

  const summary = formatSlotChecklistSummary(checklist);
  const pct = checklist.coveragePct;
  const hasIssue = checklist.failedCount > 0 || checklist.renderingCount > 0
    || checklist.readyRequired < checklist.requiredTotal;

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
      {(checklist.failedCount > 0 || checklist.renderingCount > 0) && (
        <button
          type="button"
          onClick={onGoToFeed}
          style={{
            marginTop: 12, width: '100%', padding: '10px', borderRadius: 10, border: 'none',
            cursor: 'pointer', fontSize: 12, fontWeight: 700,
            background: 'rgba(59,130,246,0.12)', color: '#3B82F6',
          }}>
          Feed&apos;de incele →
        </button>
      )}
    </div>
  );
}

function MissionPublishPackageCard({
  pkg,
  selection,
  previewArtifacts,
  onPreviewArtifact,
  isLoading,
  onGoToFeed,
  t,
}: {
  pkg: MissionFeedPackage | null;
  selection: WeeklyPublishSelection | null;
  previewArtifacts: OutputArtifact[];
  onPreviewArtifact: (artifactId: string) => void;
  isLoading: boolean;
  onGoToFeed: () => void;
  t: T;
}) {
  if (isLoading && previewArtifacts.length === 0) {
    return (
      <div style={{ padding: '12px 14px', borderRadius: 14, marginBottom: 16,
        background: t.isDark ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.06)',
        border: '0.5px solid rgba(139,92,246,0.25)' }}>
        <div style={{ fontSize: 12, color: t.textMuted }}>Feed paketi yükleniyor…</div>
      </div>
    );
  }
  if (!pkg && previewArtifacts.length === 0) return null;

  const hasContent = (pkg?.totalPublishable ?? 0) > 0 || previewArtifacts.length > 0;
  const label = pkg ? formatMissionFeedPackageLabel(pkg) : '';
  const selectionLabel = selection ? formatWeeklyPackageSummary(selection) : label;

  return (
    <div style={{
      padding: '16px', borderRadius: 16, marginBottom: 16,
      background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(201,169,110,0.08))',
      border: '0.5px solid rgba(139,92,246,0.35)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#8B5CF6', letterSpacing: '0.06em',
        textTransform: 'uppercase', marginBottom: 8 }}>
        Haftalık Yayın Paketi
        {selection?.selectionSource === 'feed_art_director' && isMobileOperatorMode() && (
          <span style={{ marginLeft: 6, color: '#10B981', fontWeight: 700 }}>· Art Director</span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 6 }}>
        {hasContent ? selectionLabel : 'Video story\'ler hazırlanıyor…'}
      </div>
      <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5, marginBottom: 14 }}>
        {hasContent && pkg
          ? pkg.pendingReview > 0
            ? `${pkg.pendingReview} içerik Feed'de onayınızı bekliyor.${pkg.backupCount > 0 ? ` (+${pkg.backupCount} ek üretim önerilen paket dışında)` : ''}`
            : `${pkg.approved} içerik onaylandı · Feed\'de yayın geçmişini kontrol edin.`
          : previewArtifacts.length > 0
            ? `${previewArtifacts.length} içerik önizlenebilir · render devam edebilir.`
            : 'Auto-produce ve Remotion render arka planda çalışıyor (1–3 dk). Biraz sonra Feed\'i yenileyin.'}
      </div>
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
              background: 'rgba(139,92,246,0.12)', color: '#A78BFA' }}>
              Story {pkg.storyStills}
            </span>
          )}
          {pkg.storyMotion > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
              background: 'rgba(124,58,237,0.15)', color: '#C4B5FD' }}>
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
      {previewArtifacts.length > 0 && (
        <MissionFeedPreviewGrid
          artifacts={previewArtifacts}
          onPreview={onPreviewArtifact}
          t={t}
          title="Üretilen içerikler"
        />
      )}
      <button
        onClick={onGoToFeed}
        style={{
          width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: hasContent && (pkg?.pendingReview ?? 0) > 0
            ? 'linear-gradient(135deg, #7c3aed, #8B5CF6)'
            : (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
          color: hasContent && (pkg?.pendingReview ?? 0) > 0 ? '#fff' : t.textSecondary,
          fontSize: 14, fontWeight: 800,
          boxShadow: hasContent && (pkg?.pendingReview ?? 0) > 0 ? '0 4px 20px rgba(124,58,237,0.35)' : 'none',
        }}>
        {(pkg?.pendingReview ?? 0) > 0
          ? `Feed'e Git → ${pkg!.pendingReview} içerik onay bekliyor`
          : hasContent ? 'Feed\'de Görüntüle' : 'Feed\'e Git'}
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
  const { openMissionFactory, navigate, openFeedForMission, openPlatformPreview } = useMobileStore();
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const { data: prog, isLoading } = useQuery({
    queryKey: ['mission-progress', mission.id],
    queryFn: () => apiClient.getMissionProgress(workspaceId, mission.id),
    staleTime: 30_000,
  });

  const isCompleted = mission.status === 'completed';
  const showFeedPackage = isCompleted || mission.status === 'in_flight';
  const missionInFlight = mission.status === 'in_flight' || mission.status === 'approved';
  const { data: feedArtifacts, isLoading: feedPkgLoading, refetch: refetchMissionArtifacts } = useMobileArtifacts({
    params: { missionId: mission.id, limit: 80 },
    subscribeOnly: true,
    enabled: showFeedPackage,
  });

  useEffect(() => {
    if (!showFeedPackage || !missionInFlight) return;
    const id = setInterval(() => { void refetchMissionArtifacts(); }, 20_000);
    return () => clearInterval(id);
  }, [showFeedPackage, missionInFlight, refetchMissionArtifacts]);
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

  const slotChecklist = useMemo(() => {
    if (!feedArtifacts?.length) return null;
    return buildMissionSlotChecklist({
      missionId: mission.id,
      missionType: mission.type,
      missionTitle: mission.title,
      assignments: fdReport?.production_assignments,
      artifacts: feedArtifacts,
      missionInFlight: mission.status === 'in_flight' || mission.status === 'approved',
    });
  }, [feedArtifacts, mission.id, mission.type, mission.title, mission.status, fdReport]);

  const queryClient = useQueryClient();
  const refreshFeedPackage = () => {
    void queryClient.invalidateQueries({
      queryKey: mobileArtifactsQueryKey({ missionId: mission.id, limit: 80 }),
    });
    void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
  };

  const goToFeed = () => {
    onClose();
    openFeedForMission(mission.id);
  };

  const completedNodes = (prog?.nodes ?? []).filter(n => n.status === 'completed');
  const rate = mission.total_nodes > 0
    ? Math.round((mission.completed_nodes / mission.total_nodes) * 100)
    : 0;

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
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
            {mission.completed_nodes}/{mission.total_nodes} görev · {timeAgo(mission.completed_at)}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%',
                border: `3px solid ${t.separator}`, borderTop: `3px solid ${t.accent}`,
                animation: 'spinSlow 1s linear infinite', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 13, color: t.textMuted }}>Çıktılar yükleniyor...</div>
            </div>
          )}

          {/* Mission results summary banner */}
          {!isLoading && completedNodes.length > 0 && (
            <div style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 16,
              background: rate >= 80
                ? 'rgba(16,185,129,0.08)'
                : 'rgba(245,158,11,0.08)',
              border: `0.5px solid ${rate >= 80 ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{rate >= 80 ? '✅' : '⏳'}</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary }}>
                  {rate >= 80 ? 'Misyon başarıyla tamamlandı' : `%${rate} tamamlandı`}
                </div>
              </div>
              {/* Per-node result chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
            </div>
          )}

          {(isCompleted || mission.status === 'in_flight') && (
            <MissionSlotChecklistPanel
              checklist={slotChecklist}
              workspaceId={workspaceId}
              isLoading={feedPkgLoading}
              onGoToFeed={goToFeed}
              onRefresh={refreshFeedPackage}
              t={t}
            />
          )}

          {isCompleted && previewArtifacts.length === 0 && (() => {
            const productionError = prog?.performance_summary?.production_error;
            const errMsg = String(productionError?.message ?? '').toLowerCase();
            const isStillProcessing =
              errMsg.includes('disconnected') ||
              errMsg.includes('server') ||
              errMsg.includes('timeout') ||
              errMsg.includes('connection');
            const isBudget = productionError?.status_code === 429
              || errMsg.includes('bütçe') || errMsg.includes('budget') || errMsg.includes('limit');
            const ideationNode = prog?.nodes?.find(n => n.task_type === 'content_ideation' && n.status === 'completed');

            return (
              <div style={{
                padding: '14px 16px', borderRadius: 14, marginBottom: 16,
                background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>
                  {isStillProcessing ? 'Görseller hazırlanıyor' : 'İçerik henüz hazır değil'}
                </div>
                <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>
                  {isStillProcessing
                    ? 'Reel ve story videoları arka planda üretiliyor. Bu işlem 3-5 dakika sürebilir — bir süre sonra İçerik ekranını açın.'
                    : isBudget
                      ? 'Bugünkü içerik üretimi tamamlandı. Yarın otomatik devam edecek veya aşağıdan manuel başlatabilirsiniz.'
                      : 'Kampanya tamamlandı fakat görseller oluşturulamadı. Aşağıdan tekrar başlatabilirsiniz.'}
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
                  {!isStillProcessing && ideationNode && (
                    <button
                      type="button"
                      onClick={() => openMissionFactory(mission.id, ideationNode.node_key)}
                      style={{
                        padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                        background: t.accent, border: 'none',
                        color: '#fff', fontSize: 12, fontWeight: 700,
                      }}
                    >
                      İçerikleri Üret →
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {showFeedPackage && (previewArtifacts.length > 0 || isCompleted) && (
            <MissionPublishPackageCard
              pkg={feedPackage}
              selection={weeklySelection}
              previewArtifacts={previewArtifacts}
              onPreviewArtifact={openPlatformPreview}
              isLoading={feedPkgLoading && !feedPackage?.totalPublishable && previewArtifacts.length === 0}
              onGoToFeed={goToFeed}
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
            const hasOutput = Boolean(node.output_summary);
            const meta = taskMeta(node.task_type);
            const resultCount = hasOutput ? countNodeResults(node) : null;
            const ics = node.task_type === 'content_ideation' && hasOutput
              ? computeNodeIcs(node.output_summary)
              : null;
            const icsColor = ics == null ? t.textMuted
              : ics >= 90 ? '#10B981' : ics >= 70 ? '#F59E0B' : '#EF4444';
            const isContentNode = ['content_ideation','content_calendar','visual_design_cards'].includes(node.task_type);

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
                    <div style={{ fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {hasOutput && resultCount != null ? (
                        <span style={{ color: meta.color, fontWeight: 600 }}>
                          {resultCount} {meta.resultNoun} üretildi
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
                      onGoToFeed={isContentNode ? goToFeed : undefined}
                    />

                    {/* Per-node action buttons */}
                    {isContentNode && node.output_summary && (
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
  onComplete,
  onFix,
}: {
  t: T;
  readiness: BrandReadinessResult;
  onComplete: (fix?: string) => void;
  onFix?: (fix: string) => void;
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
              onClick={() => (c.fix && onFix ? onFix(c.fix) : onComplete(c.fix))}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                width: '100%',
                padding: 0,
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
                {operatorMode && (
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1, lineHeight: 1.4 }}>
                    {c.action}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => onComplete(missing[0]?.fix)}
        style={{
          marginTop: 12, width: '100%', padding: '9px 14px', borderRadius: 10,
          border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff',
          background: `linear-gradient(135deg, ${accent}dd, ${accent}99)`,
        }}>
        Markayı Tamamla →
      </button>
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

function UsageCostCard({ data }: { data: WorkspaceUsageSummary }) {
  const { t } = useTheme();
  if (!data) return null;

  if (data.token_wallet?.enabled) {
    return (
      <div style={{ margin: '12px 22px 0' }}>
        <TokenWalletCard wallet={data.token_wallet} t={t} />
      </div>
    );
  }

  const spent = data.spent_today_usd;
  const cap = data.daily_budget_usd;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const atCap = data.remaining_today_usd <= 0.001;
  const topCategories = Object.entries(data.category_totals || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div style={{
      margin: '12px 22px 0',
      padding: '14px 16px',
      borderRadius: 16,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${atCap ? 'rgba(239,68,68,0.35)' : t.separator}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            API maliyeti
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary, marginTop: 4, letterSpacing: '-0.02em' }}>
            ${data.week_cost_usd.toFixed(2)}
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted, marginLeft: 6 }}>
              / hafta
            </span>
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            ≈ {(data.week_cost_usd * USD_TRY).toFixed(0)} ₺ · {data.week_artifact_count} içerik · {data.week_mission_count} mission
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: t.textMuted }}>Bugün</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: atCap ? '#EF4444' : t.accent }}>
            ${spent.toFixed(2)} / ${cap.toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
            {atCap ? 'Bütçe doldu' : `$${data.remaining_today_usd.toFixed(2)} kaldı`}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 12, height: 6, borderRadius: 3, overflow: 'hidden',
        background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: atCap
            ? 'linear-gradient(90deg, #EF4444, #F87171)'
            : `linear-gradient(90deg, ${t.accent}cc, ${t.accent})`,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {topCategories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {topCategories.map(([key, val]) => (
            <span key={key} style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
              background: t.accentDim, color: t.accent,
            }}>
              {CATEGORY_LABELS[key] ?? key} ${val.toFixed(2)}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 8, lineHeight: 1.4 }}>
        Tahmini API maliyeti (USD). Otonom üretim günlük ${cap.toFixed(2)} ile sınırlı.
      </div>
    </div>
  );
}

export function MissionHub() {
  const { t } = useTheme();
  const operatorMode = isMobileOperatorMode();
  const { navigate, goBack, openBrand, openStoryTemplates } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [detailMission, setDetailMission] = useState<MissionSummary | null>(null);
  const [productionPackage, setProductionPackageState] = useState<MissionProductionPackage>('weekly_content');

  const wsId = tenantId;

  useEffect(() => {
    if (!wsId) return;
    setProductionPackageState(getMissionProductionPackage(wsId));
  }, [wsId]);

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ['missions', wsId],
    queryFn: () => apiClient.listMissions(wsId),
    refetchInterval: 15_000,
    staleTime: 8_000,
    enabled: Boolean(wsId),
    ...mobileQueryDefaults,
  });

  const { data: brandCtx } = useQuery({
    queryKey: ['brand-context-data', wsId],
    queryFn: () => apiClient.getBrandContextData(wsId),
    staleTime: 30_000, // kısa tut — location/description sonradan doldurulabilir
    enabled: Boolean(wsId),
  });

  const { data: usageCost } = useQuery({
    queryKey: ['usage-cost', wsId],
    queryFn: () => apiClient.getWorkspaceUsageCost(wsId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: Boolean(wsId),
    ...mobileQueryDefaults,
  });

  // Brand readiness gate (Sprint 1) — missions cannot be proposed until BRS >= 80.
  const { data: readiness } = useQuery<BrandReadinessResult>({
    queryKey: ['brand-readiness', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/brand-readiness/${wsId}`);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: 30_000,
    enabled: Boolean(wsId),
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
    enabled: Boolean(wsId),
  });

  // Context signals (Sprint 6) — deterministic season/full-moon/holiday/sector
  // triggers; the promptBlock is injected into the Strategist at propose time.
  const { data: contextSignals } = useQuery<ContextSignalsData>({
    queryKey: ['context-signals', wsId],
    queryFn: async () => {
      const res = await fetch(`/api/context-signals/${wsId}`);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: 60_000,
    enabled: Boolean(wsId),
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
    enabled: Boolean(wsId),
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
      const res = await fetch(`/api/gallery-intelligence/${wsId}`);
      if (!res.ok) throw new Error(res.statusText);
      return res.json();
    },
    staleTime: 60_000,
    enabled: Boolean(wsId),
  });

  const readinessScore = readiness?.score ?? null;
  const gisScore = typeof gis?.score === 'number' ? gis.score : null;
  const brsBlocks =
    readiness != null && Array.isArray(readiness.checks) && readiness.checks.length > 0
      ? readiness.canProposeMissions === false
      : false;
  const gisBlocks = gisScore != null ? gisScore < 70 : false;
  const readinessBlocks = brsBlocks || gisBlocks;

  // Auto-run gallery vision analysis when photos exist but GIS is below gate.
  const coverageJobStarted = useRef(false);
  useEffect(() => {
    if (!wsId || coverageJobStarted.current || gisScore == null || gisScore >= 70) return;
    coverageJobStarted.current = true;
    fetch(`/api/gallery-intelligence/${wsId}/analyze-coverage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxImages: 20, tier: 'standard' }),
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['gallery-intelligence', wsId] });
        queryClient.invalidateQueries({ queryKey: ['brand-readiness', wsId] });
      })
      .catch(() => {
        coverageJobStarted.current = false;
      });
  }, [wsId, gisScore, queryClient]);

  const budgetExhausted = usageCost != null && (
    usageCost.remaining_today_usd <= 0.001
    || (usageCost.token_wallet?.enabled === true
      && (usageCost.token_wallet.remaining_tokens ?? 0) <= 0)
  );

  const proposed  = missions.filter(m => m.status === 'proposed');
  const active    = missions.filter(m => ['approved','in_flight'].includes(m.status));
  const hasBlockingMissions = proposed.length > 0 || active.length > 0;
  // Completed with errors (failed_nodes > 0) shown in active section so errors are visible
  const failedCompleted = missions.filter(m => m.status === 'completed' && m.failed_nodes > 0);
  const completed = missions.filter(m => m.status === 'completed' && m.failed_nodes === 0).slice(0, 5);

  const productionPackageOptions: MissionProductionPackage[] = [
    'weekly_content',
    'campaign',
    'event',
  ];

  const handleProductionPackageChange = (pkg: MissionProductionPackage) => {
    setProductionPackageState(pkg);
    if (wsId) setMissionProductionPackage(wsId, pkg);
  };

  const proposeMutation = useMutation({
    mutationFn: () => {
      // Brief enrichment: context signals + diversity + Hub production package.
      const directive = buildDiversityDirective(missions);
      const pkgDirective = buildProductionPackageDirective(productionPackage);
      const block = [contextSignals?.promptBlock, pkgDirective, directive].filter(Boolean).join('\n\n');
      return apiClient.proposeMissions(wsId, block || undefined);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
      queryClient.invalidateQueries({ queryKey: ['usage-cost', wsId] });
      setProposeError(null);
      if (data.proposals_created === 0) {
        setProposeError(
          data.message?.trim()
            || 'Yeni öneri üretilemedi. StrategistAgent geçerli misyon çıkaramadı — birkaç dakika sonra tekrar deneyin.',
        );
      }
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missions', wsId] }),
  });

  const isEmpty = !isLoading && proposed.length === 0 && active.length === 0 && completed.length === 0 && failedCompleted.length === 0;

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
      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top,0px) + 14px) 22px 0',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={goBack} style={{ ...t.backBtn, cursor: 'pointer',
          width: 34, height: 34, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.textPrimary,
            letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            {operatorMode ? 'Mission Hub' : 'Kampanyalar'}
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>
            {operatorMode ? 'Otonom kampanya yönetimi' : 'AI önerileri ve onay akışı'}
          </div>
        </div>
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
                  ? 'Günlük API bütçesi doldu'
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
          ) : <><span>✦</span>{operatorMode ? 'Yeni Öneri' : 'Yeni Kampanya'}</>}
        </button>
      </div>

      {operatorMode && usageCost ? <UsageCostCard data={usageCost} /> : null}

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
          {!budgetExhausted && hasBlockingMissions && (operatorMode
            ? 'Aktif veya bekleyen misyon var — önce tamamlayın veya reddedin.'
            : 'Önce mevcut kampanyayı onaylayın veya tamamlayın.')}
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
                  <> Öncelik: <strong>{readiness.missing[0].label}</strong>.</>
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
          onComplete={(fix) => openBrand(fix)}
          onFix={(fix) => openBrand(fix)}
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

        const allFilled = missingFields.length === 0;
        const errLower = proposeError.toLowerCase();
        const isQuotaError =
          errLower.includes('kota') ||
          errLower.includes('quota') ||
          errLower.includes('429') ||
          errLower.includes('openai');
        const cardTitle = !allFilled
          ? 'Marka verisi eksik'
          : isQuotaError
            ? 'OpenAI kotası / API hatası'
            : 'Öneri oluşturulamadı';
        const cardSubtitle = !allFilled
          ? `${missingFields.length} alan eksik, strateji üretilemiyor`
          : proposeError;
        const accent = !allFilled ? '#F59E0B' : isQuotaError ? '#EF4444' : '#F59E0B';

        return (
          <div style={{ margin: '12px 22px 0', borderRadius: 16, overflow: 'hidden',
            background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            border: `0.5px solid ${!allFilled ? 'rgba(245,158,11,0.25)' : isQuotaError ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
            <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: allFilled ? 'none' : `0.5px solid ${t.separator}` }}>
              <div style={{ width: 28, height: 28, borderRadius: 8,
                background: !allFilled ? 'rgba(245,158,11,0.1)' : isQuotaError ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                border: `0.5px solid ${!allFilled ? 'rgba(245,158,11,0.25)' : isQuotaError ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
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

            {!allFilled && (
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
              {!allFilled && (
                <button onClick={() => openBrand()} style={{
                  flex: 1, padding: '10px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(167,139,250,0.12)', border: '0.5px solid rgba(167,139,250,0.3)',
                  fontSize: 12, fontWeight: 700, color: t.accent,
                }}>
                  Marka Hub'ını Doldur →
                </button>
              )}
              <button onClick={() => {
                if (hasBlockingMissions || budgetExhausted || readinessBlocks) return;
                setProposeError(null);
                queryClient.invalidateQueries({ queryKey: ['brand-context-data', wsId] });
                setTimeout(() => proposeMutation.mutate(), 300);
              }} disabled={hasBlockingMissions || budgetExhausted || readinessBlocks} style={{
                flex: allFilled ? 1 : 0, padding: '10px 14px', borderRadius: 12,
                cursor: (hasBlockingMissions || budgetExhausted || readinessBlocks) ? 'default' : 'pointer',
                opacity: (hasBlockingMissions || budgetExhausted || readinessBlocks) ? 0.45 : 1,
                background: allFilled ? 'rgba(167,139,250,0.12)' : 'transparent',
                border: allFilled ? '0.5px solid rgba(167,139,250,0.3)' : `0.5px solid ${t.separator}`,
                fontSize: 12, fontWeight: allFilled ? 700 : 400,
                color: allFilled ? t.accent : t.textMuted,
              }}>
                {hasBlockingMissions ? 'Önce bekleyen misyonları bitirin' : 'Yeniden Dene →'}
              </button>
            </div>
          </div>
        );
      })()}

      <div style={{ padding: '24px 22px 0' }}>

        {/* ── Loading ── */}
        {isLoading && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%',
              border: `3px solid ${t.separator}`, borderTop: `3px solid ${t.accent}`,
              animation: 'spinSlow 1s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 14, color: t.textMuted }}>Kampanyalar yükleniyor...</div>
          </div>
        )}

        {/* ── Empty state ── */}
        {isEmpty && !isLoading && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              Henüz kampanya yok
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 28, maxWidth: 280, margin: '0 auto 28px' }}>
              "Yeni Öneri" butonuna basarak StrategistAgent'ın tüm sinyal verilerini
              analiz etmesini ve kampanya önerileri üretmesini sağla.
            </div>
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
                  onCancel={() => {}}
                  onRestart={(id) => restartMutation.mutate(id)}
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
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Aktif Kampanyalar</span>
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
                  onCancel={(id) => cancelMutation.mutate(id)}
                  onRestart={(id) => restartMutation.mutate(id)}
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
